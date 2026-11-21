import { EventEmitter } from 'events'
import type {
  Device,
  DeviceCommand,
  DeviceState,
  DiscoveredDevice,
  IntegrationInfo,
  IntegrationStatus,
  ProviderId
} from '@shared/types'
import type { DeviceProvider, ProviderContext } from './types'
import { WizProvider } from './wiz/provider'
import { HaProvider } from './ha/provider'
import {
  deleteDeviceRecord,
  deleteIntegrationRecord,
  getDeviceRecord,
  getIntegrationRecord,
  getScene,
  listDeviceRecords,
  listIntegrationRecords,
  listScenes,
  markDeviceSeen,
  updateDeviceRecord,
  upsertDeviceRecord,
  upsertIntegrationRecord,
  type DeviceRecord
} from '../repositories'
import { getSettings } from '../settings'
import { deleteSecret, getHaToken, getSecret, hasHaToken, hasSecret, saveHaToken, saveSecret } from '../secureStore'
import { saveHaConfig } from '../ha/config'

const MANAGED_PROVIDERS: ProviderId[] = ['wiz', 'ha']

function secretKey(provider: ProviderId): string {
  return `${provider}.secret`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class IntegrationManager extends EventEmitter<{ devices: [Device[]]; status: [IntegrationStatus[]] }> {
  private providers = new Map<ProviderId, DeviceProvider>()
  private contexts = new Map<ProviderId, ProviderContext>()
  private stateCache = new Map<string, DeviceState>()
  private statuses = new Map<ProviderId, IntegrationStatus>()
  private pollTimers = new Map<ProviderId, NodeJS.Timeout>()
  private deviceCounts = new Map<ProviderId, number>()
  private deviceConfigs = new Map<string, Record<string, unknown>>()
  private lastSeenWrite = new Map<string, number>()
  private emitTimer: NodeJS.Timeout | null = null
  private initialized = false

  constructor() {
    super()
    this.providers.set('wiz', new WizProvider())
    this.providers.set('ha', new HaProvider())
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    const wizRecord = await getIntegrationRecord('wiz')
    if (!wizRecord) {
      await upsertIntegrationRecord({
        provider: 'wiz',
        name: 'Philips WiZ',
        config: { manualHosts: [], pollIntervalMs: 5000 },
        enabled: true
      })
    }

    const records = await listIntegrationRecords()
    for (const provider of this.providers.values()) {
      const record = records.find((r) => r.provider === provider.id)
      const ctx = this.createContext(provider.id)
      this.contexts.set(provider.id, ctx)
      this.statuses.set(provider.id, provider.status())

      if (provider.id === 'wiz') {
        const config = await this.resolveConfig('wiz', record?.config ?? {})
        try {
          await provider.start(ctx, config)
          await this.refreshProvider('wiz')
          this.startPolling('wiz')
        } catch (error) {
          this.statuses.set('wiz', {
            provider: 'wiz',
            name: 'Philips WiZ',
            state: 'error',
            message: error instanceof Error ? error.message : String(error),
            configurable: true
          })
        }
      } else if (provider.id === 'ha') {
        const url = typeof record?.config?.url === 'string' ? record.config.url : ''
        const token = getHaToken()
        if (record && record.enabled !== false && url && token) {
          try {
            await provider.start(ctx, record.config, token)
            await this.refreshProvider('ha')
          } catch (error) {
            this.statuses.set('ha', {
              provider: 'ha',
              name: 'Home Assistant',
              state: 'error',
              message: error instanceof Error ? error.message : String(error),
              configurable: true
            })
          }
        } else {
          this.statuses.set('ha', {
            provider: 'ha',
            name: 'Home Assistant',
            state: 'disconnected',
            message: url ? 'Access token is not configured.' : 'Not configured. Home Assistant is optional.',
            configurable: true
          })
        }
      }
    }

    await this.getDevices()
    this.scheduleEmit()
  }

  private createContext(providerId: ProviderId): ProviderContext {
    return {
      emitState: (providerDeviceId, patch) => {
        this.applyState(`${providerId}:${providerDeviceId}`, patch)
        this.scheduleEmit()
      },
      emitDevicesChanged: () => this.scheduleEmit(),
      emitStatus: (status) => {
        this.statuses.set(providerId, status)
        this.emit('status', this.getStatuses())
      },
      getDeviceConfig: (providerDeviceId) => this.deviceConfigs.get(`${providerId}:${providerDeviceId}`) ?? {},
      getAllDeviceConfigs: () => {
        const prefix = `${providerId}:`
        return Array.from(this.deviceConfigs.entries())
          .filter(([id]) => id.startsWith(prefix))
          .map(([id, config]) => ({ providerDeviceId: id.slice(prefix.length), config }))
      }
    }
  }

  private applyState(deviceId: string, patch: Partial<DeviceState>): void {
    const current = this.stateCache.get(deviceId) ?? { online: false }
    const next = { ...current, ...patch }
    this.stateCache.set(deviceId, next)
    if (next.online) this.markSeenThrottled(deviceId)
  }

  private markSeenThrottled(deviceId: string): void {
    const now = Date.now()
    const last = this.lastSeenWrite.get(deviceId) ?? 0
    if (now - last < 60000) return
    this.lastSeenWrite.set(deviceId, now)
    void markDeviceSeen(deviceId)
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      void this.emitDevices()
    }, 120)
  }

  private async emitDevices(): Promise<void> {
    const devices = await this.getDevices()
    this.emit('devices', devices)
  }

  async getDevices(): Promise<Device[]> {
    const records = await listDeviceRecords()
    const counts = new Map<ProviderId, number>()
    const devices = records.map((record) => {
      counts.set(record.provider, (counts.get(record.provider) ?? 0) + 1)
      this.deviceConfigs.set(record.id, record.config)
      const status = this.statuses.get(record.provider)
      const cached = this.stateCache.get(record.id) ?? { online: false }
      const state: DeviceState = { ...cached }
      if (status && status.state !== 'connected') state.online = false
      return {
        id: record.id,
        provider: record.provider,
        providerDeviceId: record.providerDeviceId,
        name: record.name,
        manufacturer: record.manufacturer,
        model: record.model,
        category: record.category,
        roomId: record.roomId,
        favorite: record.favorite,
        capabilities: record.capabilities,
        state,
        lastSeen: record.lastSeen,
        address: record.address,
        config: record.config
      } satisfies Device
    })
    this.deviceCounts = counts
    return devices
  }

  async getDevice(id: string): Promise<Device | undefined> {
    return (await this.getDevices()).find((d) => d.id === id)
  }

  async refreshProvider(providerId: ProviderId): Promise<void> {
    const provider = this.providers.get(providerId)
    if (!provider) return
    const status = this.statuses.get(providerId)
    if (status && status.state !== 'connected') return
    const records = (await listDeviceRecords()).filter((r) => r.provider === providerId)
    await Promise.allSettled(
      records.map(async (record) => {
        this.deviceConfigs.set(record.id, record.config)
        try {
          const patch = await provider.getState(record.providerDeviceId, record.config)
          this.applyState(record.id, patch)
        } catch {
          this.applyState(record.id, { online: false })
        }
      })
    )
    this.scheduleEmit()
  }

  async refreshDevice(record: DeviceRecord): Promise<void> {
    const provider = this.providers.get(record.provider)
    if (!provider) return
    try {
      const patch = await provider.getState(record.providerDeviceId, record.config)
      this.applyState(record.id, patch)
    } catch {
      this.applyState(record.id, { online: false })
    }
    this.scheduleEmit()
  }

  private startPolling(providerId: ProviderId): void {
    const provider = this.providers.get(providerId)
    if (!provider || provider.pollIntervalMs <= 0) return
    this.stopPolling(providerId)
    const timer = setInterval(() => {
      void this.refreshProvider(providerId)
    }, provider.pollIntervalMs)
    timer.unref?.()
    this.pollTimers.set(providerId, timer)
  }

  private stopPolling(providerId: ProviderId): void {
    const timer = this.pollTimers.get(providerId)
    if (timer) {
      clearInterval(timer)
      this.pollTimers.delete(providerId)
    }
  }

  async execute(deviceId: string, command: DeviceCommand): Promise<Device | undefined> {
    const record = await getDeviceRecord(deviceId)
    if (!record) throw new Error('Device not found.')
    const provider = this.providers.get(record.provider)
    if (!provider) throw new Error(`No provider available for ${record.provider}.`)
    const status = this.statuses.get(record.provider)
    if (status && status.state !== 'connected') {
      throw new Error(`${provider.name} is not connected.`)
    }

    await provider.execute(record.providerDeviceId, command, record.config)
    await delay(140)
    await this.refreshDevice(record)
    return this.getDevice(deviceId)
  }

  async updateDevice(id: string, patch: { name?: string; roomId?: string | null; favorite?: boolean }): Promise<Device | undefined> {
    await updateDeviceRecord(id, patch)
    this.scheduleEmit()
    return this.getDevice(id)
  }

  async removeDevice(id: string): Promise<void> {
    await deleteDeviceRecord(id)
    this.stateCache.delete(id)
    this.deviceConfigs.delete(id)
    this.scheduleEmit()
  }

  async discover(providerId: ProviderId): Promise<{ devices: DiscoveredDevice[]; status: IntegrationStatus }> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error('Integration is not available.')
    const status = this.statuses.get(providerId) ?? provider.status()
    if (status.state !== 'connected') {
      return { devices: [], status }
    }
    const ctx = this.contexts.get(providerId) ?? this.createContext(providerId)
    const discovered = await provider.discover(ctx)
    const records = await listDeviceRecords()
    return {
      devices: discovered.map((device) => ({
        ...device,
        alreadyAdded: records.some((r) => r.provider === device.provider && r.providerDeviceId === device.providerDeviceId)
      })),
      status
    }
  }

  async addDevice(discovered: DiscoveredDevice): Promise<Device> {
    const config = discovered.provider === 'wiz' && discovered.address ? { address: discovered.address } : {}
    const record = await upsertDeviceRecord({
      provider: discovered.provider,
      providerDeviceId: discovered.providerDeviceId,
      name: discovered.name,
      manufacturer: discovered.manufacturer,
      model: discovered.model,
      category: discovered.category,
      capabilities: discovered.capabilities,
      address: discovered.address,
      config
    })
    this.deviceConfigs.set(record.id, record.config)
    if (discovered.state) {
      this.applyState(record.id, { ...discovered.state, online: true })
    }
    const provider = this.providers.get(discovered.provider)
    if (provider) {
      try {
        const patch = await provider.getState(record.providerDeviceId, record.config)
        this.applyState(record.id, patch)
      } catch {
        // discovery state remains
      }
    }
    this.scheduleEmit()
    return (await this.getDevice(record.id))!
  }

  listIntegrations(): IntegrationInfo[] {
    const wizRecord = this.statuses.get('wiz')
    return [
      {
        provider: 'wiz',
        name: 'Philips WiZ',
        description: 'Direct local Wi-Fi control over UDP. No cloud dependency.',
        configurable: true,
        configured: !!wizRecord,
        available: true
      },
      {
        provider: 'ha',
        name: 'Home Assistant',
        description: 'Optional local Home Assistant server for entities and advanced automations.',
        configurable: true,
        configured: this.statuses.get('ha')?.state === 'connected',
        available: true
      },
      {
        provider: 'mqtt',
        name: 'MQTT',
        description: 'Connect to a local MQTT broker with configurable topic mappings.',
        configurable: true,
        configured: false,
        available: false
      },
      {
        provider: 'hue',
        name: 'Philips Hue',
        description: 'Local Hue Bridge discovery and pairing.',
        configurable: true,
        configured: false,
        available: false
      },
      {
        provider: 'shelly',
        name: 'Shelly',
        description: 'Local Shelly relay and energy monitoring.',
        configurable: true,
        configured: false,
        available: false
      },
      {
        provider: 'matter',
        name: 'Matter',
        description: 'Requires a local Matter controller and commissioning infrastructure.',
        configurable: true,
        configured: false,
        available: false
      },
      {
        provider: 'kasa',
        name: 'TP-Link / Kasa',
        description: 'Local Kasa device control.',
        configurable: true,
        configured: false,
        available: false
      },
      {
        provider: 'tuya',
        name: 'Tuya',
        description: 'Local or cloud-assisted Tuya control.',
        configurable: true,
        configured: false,
        available: false
      }
    ]
  }

  getStatuses(): IntegrationStatus[] {
    return Array.from(this.statuses.values()).map((status) => ({
      ...status,
      deviceCount: this.deviceCounts.get(status.provider) ?? 0
    }))
  }

  async getIntegrationConfig(providerId: ProviderId): Promise<{ config: Record<string, unknown>; hasSecret: boolean }> {
    const record = await getIntegrationRecord(providerId)
    return {
      config: record?.config ?? {},
      hasSecret: providerId === 'ha' ? hasHaToken() : hasSecret(secretKey(providerId))
    }
  }

  async saveIntegrationConfig(input: {
    provider: ProviderId
    config: Record<string, unknown>
    secret?: string
  }): Promise<IntegrationStatus> {
    const provider = this.providers.get(input.provider)
    if (!provider) throw new Error('Integration is not available.')

    await upsertIntegrationRecord({
      provider: input.provider,
      name: provider.name,
      config: input.config
    })

    if (input.secret !== undefined) {
      if (input.provider === 'ha') {
        if (input.secret) saveHaToken(input.secret)
      } else if (input.secret) {
        saveSecret(secretKey(input.provider), input.secret)
      } else {
        deleteSecret(secretKey(input.provider))
      }
    }

    if (input.provider === 'ha' && typeof input.config.url === 'string') {
      await saveHaConfig({ url: input.config.url, token: input.secret })
    }

    await this.restartProvider(input.provider)
    return this.statuses.get(input.provider) ?? provider.status()
  }

  async connectIntegration(providerId: ProviderId): Promise<IntegrationStatus> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error('Integration is not available.')
    let record = await getIntegrationRecord(providerId)
    if (!record) {
      await upsertIntegrationRecord({
        provider: providerId,
        name: provider.name,
        config: providerId === 'wiz' ? { manualHosts: [], pollIntervalMs: 5000 } : {}
      })
      record = await getIntegrationRecord(providerId)
    }
    const config = await this.resolveConfig(providerId, record?.config ?? {})
    const secret = providerId === 'ha' ? getHaToken() : getSecret(secretKey(providerId))
    const ctx = this.contexts.get(providerId) ?? this.createContext(providerId)
    this.contexts.set(providerId, ctx)
    await provider.start(ctx, config, secret)
    await this.refreshProvider(providerId)
    this.startPolling(providerId)
    this.scheduleEmit()
    return this.statuses.get(providerId) ?? provider.status()
  }

  async disconnectIntegration(providerId: ProviderId): Promise<IntegrationStatus> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error('Integration is not available.')
    this.stopPolling(providerId)
    await provider.stop()
    for (const [deviceId] of this.stateCache) {
      if (deviceId.startsWith(`${providerId}:`)) {
        this.applyState(deviceId, { online: false })
      }
    }
    this.scheduleEmit()
    return this.statuses.get(providerId) ?? provider.status()
  }

  async testIntegration(providerId: ProviderId, config: Record<string, unknown>, secret?: string): Promise<{ ok: boolean; message: string; version?: string }> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error('Integration is not available.')
    return provider.test(config, secret)
  }

  async removeIntegration(providerId: ProviderId): Promise<void> {
    const provider = this.providers.get(providerId)
    if (provider) {
      this.stopPolling(providerId)
      await provider.stop()
    }
    const records = (await listDeviceRecords()).filter((r) => r.provider === providerId)
    for (const record of records) {
      await deleteDeviceRecord(record.id)
      this.stateCache.delete(record.id)
      this.deviceConfigs.delete(record.id)
    }
    await deleteIntegrationRecord(providerId)
    if (providerId === 'ha') {
      deleteSecret('ha.token')
    } else {
      deleteSecret(secretKey(providerId))
    }
    this.statuses.set(providerId, {
      provider: providerId,
      name: provider?.name ?? providerId,
      state: 'disconnected',
      message: 'Removed.',
      configurable: true
    })
    this.scheduleEmit()
    this.emit('status', this.getStatuses())
  }

  async refreshAll(): Promise<Device[]> {
    for (const providerId of this.providers.keys()) {
      await this.refreshProvider(providerId)
    }
    return this.getDevices()
  }

  async activateScene(sceneId: string): Promise<{ ok: boolean; errors: string[] }> {
    const scene = await getScene(sceneId)
    if (!scene) throw new Error('Scene not found.')
    const errors: string[] = []
    for (const action of scene.actions) {
      try {
        await this.execute(action.deviceId, action.command)
      } catch (error) {
        errors.push(`${action.deviceId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return { ok: errors.length === 0, errors }
  }

  async activateSceneByName(name: string): Promise<boolean> {
    const scenes = await listScenes()
    const scene = scenes.find((s) => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!scene) return false
    await this.activateScene(scene.id)
    return true
  }

  async applySettings(settings: {
    discoveryInterfaces: string[]
    discoveryTimeoutMs: number
  }): Promise<void> {
    const record = await getIntegrationRecord('wiz')
    const config = {
      ...(record?.config ?? {}),
      discoveryInterfaces: settings.discoveryInterfaces,
      discoveryTimeoutMs: settings.discoveryTimeoutMs
    }
    await upsertIntegrationRecord({ provider: 'wiz', name: 'Philips WiZ', config })
    await this.restartProvider('wiz')
  }

  private async restartProvider(providerId: ProviderId): Promise<void> {
    const provider = this.providers.get(providerId)
    if (!provider) return
    this.stopPolling(providerId)
    try {
      await provider.stop()
    } catch {
      // ignore
    }
    const record = await getIntegrationRecord(providerId)
    if (!record || record.enabled === false) return
    if (providerId === 'ha' && !getHaToken()) {
      this.statuses.set('ha', {
        provider: 'ha',
        name: 'Home Assistant',
        state: 'disconnected',
        message: 'Access token is not configured.',
        configurable: true
      })
      this.emit('status', this.getStatuses())
      return
    }
    const ctx = this.contexts.get(providerId) ?? this.createContext(providerId)
    this.contexts.set(providerId, ctx)
    const secret = providerId === 'ha' ? getHaToken() : getSecret(secretKey(providerId))
    await provider.start(ctx, await this.resolveConfig(providerId, record.config), secret)
    await this.refreshProvider(providerId)
    this.startPolling(providerId)
    this.scheduleEmit()
  }

  private async resolveConfig(
    providerId: ProviderId,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (providerId !== 'wiz') return config
    const settings = await getSettings()
    return {
      ...config,
      discoveryInterfaces: settings.discoveryInterfaces,
      discoveryTimeoutMs: settings.discoveryTimeoutMs,
      pollIntervalMs: typeof config.pollIntervalMs === 'number' ? config.pollIntervalMs : 5000
    }
  }

  async shutdown(): Promise<void> {
    for (const providerId of this.pollTimers.keys()) this.stopPolling(providerId)
    for (const provider of this.providers.values()) {
      try {
        await provider.stop()
      } catch {
        // ignore
      }
    }
    if (this.emitTimer) clearTimeout(this.emitTimer)
    this.emitTimer = null
  }
}

export const integrationManager = new IntegrationManager()
export { MANAGED_PROVIDERS }
