import type {
  Capability,
  DeviceCategory,
  DeviceCommand,
  DeviceState,
  DiscoveredDevice,
  HAEntity,
  IntegrationStatus
} from '@shared/types'
import type { DeviceProvider, ProviderContext, TestResult } from '../types'
import { haClient } from '../../ha/client'
import { saveHaConfig } from '../../ha/config'
import { getHaToken } from '../../secureStore'

interface HaProviderConfig {
  url?: string
}

function entityCategory(entityId: string): DeviceCategory {
  const domain = entityId.split('.')[0]
  switch (domain) {
    case 'light': return 'light'
    case 'switch': return 'switch'
    case 'fan': return 'switch'
    case 'cover': return 'cover'
    case 'climate': return 'climate'
    case 'media_player': return 'media_player'
    case 'sensor':
    case 'binary_sensor':
      return 'sensor'
    default:
      return 'other'
  }
}

function isSupportedEntity(entityId: string): boolean {
  return ['light', 'switch', 'fan', 'cover', 'climate', 'media_player', 'sensor', 'binary_sensor'].includes(
    entityId.split('.')[0]
  )
}

function mapEntityState(entity: HAEntity): Partial<DeviceState> {
  const attrs = entity.attributes
  const state: Partial<DeviceState> = {
    online: entity.state !== 'unavailable' && entity.state !== 'unknown',
    power: entity.state === 'on'
  }

  if (entity.entity_id.startsWith('light.')) {
    if (typeof attrs.brightness === 'number') {
      state.brightness = Math.round((attrs.brightness / 255) * 100)
    }
    if (Array.isArray(attrs.rgb_color) && attrs.rgb_color.length === 3) {
      state.rgb = attrs.rgb_color as [number, number, number]
    }
    if (typeof attrs.color_temp_kelvin === 'number') {
      state.colorTempK = attrs.color_temp_kelvin
    } else if (typeof attrs.color_temp === 'number' && attrs.color_temp > 0) {
      state.colorTempK = Math.round(1000000 / attrs.color_temp)
    }
    if (typeof attrs.color_mode === 'string') {
      state.colorMode = attrs.color_mode === 'color_temp' ? 'temp' : attrs.color_mode === 'hs' || attrs.color_mode === 'rgb' || attrs.color_mode === 'xy' ? 'rgb' : undefined
    }
  }

  if (entity.entity_id.startsWith('climate.')) {
    state.power = entity.state !== 'off' && entity.state !== 'unavailable' && entity.state !== 'unknown'
    if (typeof attrs.current_temperature === 'number') state.temperature = attrs.current_temperature
    if (typeof attrs.temperature === 'number') state.targetTemperature = attrs.temperature
  }

  if (entity.entity_id.startsWith('cover.')) {
    state.power = entity.state === 'open' || entity.state === 'opening'
    if (typeof attrs.current_position === 'number') state.position = attrs.current_position
  }

  if (entity.entity_id.startsWith('media_player.')) {
    state.power = entity.state !== 'off' && entity.state !== 'unavailable' && entity.state !== 'unknown'
    state.mediaState = entity.state
  }

  if (entity.entity_id.startsWith('sensor.')) {
    const deviceClass = attrs.device_class
    if (deviceClass === 'temperature' && typeof entity.state === 'string') {
      const value = Number(entity.state)
      if (!Number.isNaN(value)) state.temperature = value
    }
    if (deviceClass === 'humidity' && typeof entity.state === 'string') {
      const value = Number(entity.state)
      if (!Number.isNaN(value)) state.humidity = value
    }
    if (deviceClass === 'energy' && typeof entity.state === 'string') {
      const value = Number(entity.state)
      if (!Number.isNaN(value)) state.energy = value
    }
  }

  if (entity.entity_id.startsWith('binary_sensor.')) {
    state.motion = entity.state === 'on'
  }

  return state
}

function capabilitiesFor(entity: HAEntity): Capability[] {
  const domain = entity.entity_id.split('.')[0]
  const attrs = entity.attributes
  const capabilities: Capability[] = []

  if (domain === 'light') {
    capabilities.push('power', 'brightness')
    const modes = Array.isArray(attrs.supported_color_modes) ? (attrs.supported_color_modes as string[]) : []
    if (modes.some((m) => ['hs', 'rgb', 'xy'].includes(m))) capabilities.push('rgb')
    if (modes.some((m) => ['color_temp'].includes(m)) || typeof attrs.color_temp_kelvin === 'number') {
      capabilities.push('color_temperature')
    }
  } else if (domain === 'switch' || domain === 'fan') {
    capabilities.push('power')
  } else if (domain === 'cover') {
    capabilities.push('power', 'position')
  } else if (domain === 'climate') {
    capabilities.push('power', 'temperature', 'setpoint')
  } else if (domain === 'sensor') {
    const deviceClass = attrs.device_class
    if (deviceClass === 'temperature') capabilities.push('temperature')
    if (deviceClass === 'humidity') capabilities.push('humidity')
    if (deviceClass === 'energy') capabilities.push('energy')
  } else if (domain === 'binary_sensor') {
    capabilities.push('motion')
  } else if (domain === 'media_player') {
    capabilities.push('power', 'media')
  }

  return [...new Set(capabilities)]
}

function toDiscovered(entity: HAEntity): DiscoveredDevice {
  const attrs = entity.attributes
  return {
    provider: 'ha',
    providerDeviceId: entity.entity_id,
    name: (attrs.friendly_name as string) || entity.entity_id,
    manufacturer: 'Home Assistant',
    model: entity.entity_id.split('.')[0],
    category: entityCategory(entity.entity_id),
    capabilities: capabilitiesFor(entity),
    state: mapEntityState(entity)
  }
}

export class HaProvider implements DeviceProvider {
  readonly id = 'ha' as const
  readonly name = 'Home Assistant'
  readonly configurable = true
  readonly pollIntervalMs = 0

  private ctx: ProviderContext | null = null
  private config: HaProviderConfig = {}
  private currentStatus: IntegrationStatus = {
    provider: 'ha',
    name: 'Home Assistant',
    state: 'disconnected',
    configurable: true
  }

  status(): IntegrationStatus {
    return this.currentStatus
  }

  private setStatus(patch: Partial<IntegrationStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...patch }
    this.ctx?.emitStatus(this.currentStatus)
  }

  async start(ctx: ProviderContext, config: Record<string, unknown>, secret?: string | null): Promise<void> {
    this.ctx = ctx
    this.config = config as HaProviderConfig
    const url = typeof this.config.url === 'string' ? this.config.url : ''
    if (!url) {
      this.setStatus({ state: 'disconnected', message: 'Home Assistant is not configured.' })
      return
    }

    this.setStatus({ state: 'connecting', message: 'Connecting to Home Assistant...' })
    try {
      await saveHaConfig({ url, token: secret || undefined })
      await haClient.connect()
      const state = haClient.getState()
      this.setStatus({
        state: state.status === 'connected' ? 'connected' : state.status === 'error' ? 'error' : 'connecting',
        message: state.message,
        lastConnectedAt: state.lastConnectedAt
      })
      if (state.status === 'connected') {
        this.attachListeners()
        for (const entity of haClient.getEntities()) {
          if (isSupportedEntity(entity.entity_id)) {
            this.ctx?.emitState(entity.entity_id, mapEntityState(entity))
          }
        }
      }
    } catch (error) {
      this.setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  private attachListeners(): void {
    haClient.removeAllListeners('entities')
    haClient.removeAllListeners('connection-state')
    haClient.on('entities', (entities) => {
      for (const entity of entities) {
        if (isSupportedEntity(entity.entity_id)) {
          this.ctx?.emitState(entity.entity_id, mapEntityState(entity))
        }
      }
    })
    haClient.on('connection-state', (state) => {
      this.setStatus({
        state: state.status === 'connected' ? 'connected' : state.status === 'error' ? 'error' : state.status === 'reconnecting' ? 'connecting' : 'disconnected',
        message: state.message,
        lastConnectedAt: state.lastConnectedAt
      })
    })
  }

  async stop(): Promise<void> {
    haClient.removeAllListeners('entities')
    haClient.removeAllListeners('connection-state')
    await haClient.disconnect()
    this.setStatus({ state: 'disconnected', message: 'Disconnected.' })
  }

  async discover(): Promise<DiscoveredDevice[]> {
    const entities = haClient.getEntities()
    return entities.filter((e) => isSupportedEntity(e.entity_id)).map(toDiscovered)
  }

  async getState(providerDeviceId: string): Promise<Partial<DeviceState>> {
    const entity = haClient.getEntities().find((e) => e.entity_id === providerDeviceId)
    if (!entity) return { online: false }
    return mapEntityState(entity)
  }

  async execute(providerDeviceId: string, command: DeviceCommand): Promise<void> {
    const domain = providerDeviceId.split('.')[0]

    switch (command.type) {
      case 'power': {
        if (domain === 'cover') {
          await haClient.callService({
            domain: 'cover',
            service: command.value ? 'open_cover' : 'close_cover',
            target: { entity_id: providerDeviceId }
          })
        } else {
          await haClient.callService({
            domain,
            service: command.value ? 'turn_on' : 'turn_off',
            target: { entity_id: providerDeviceId }
          })
        }
        return
      }
      case 'toggle':
        await haClient.callService({ domain: 'homeassistant', service: 'toggle', target: { entity_id: providerDeviceId } })
        return
      case 'brightness':
        await haClient.callService({
          domain: 'light',
          service: 'turn_on',
          target: { entity_id: providerDeviceId },
          service_data: { brightness_pct: Math.round(command.value) }
        })
        return
      case 'rgb':
        await haClient.callService({
          domain: 'light',
          service: 'turn_on',
          target: { entity_id: providerDeviceId },
          service_data: { rgb_color: command.value }
        })
        return
      case 'color_temperature':
        await haClient.callService({
          domain: 'light',
          service: 'turn_on',
          target: { entity_id: providerDeviceId },
          service_data: { color_temp_kelvin: Math.round(command.value) }
        })
        return
      case 'setpoint':
        await haClient.callService({
          domain: 'climate',
          service: 'set_temperature',
          target: { entity_id: providerDeviceId },
          service_data: { temperature: command.value }
        })
        return
      case 'position':
        await haClient.callService({
          domain: 'cover',
          service: 'set_cover_position',
          target: { entity_id: providerDeviceId },
          service_data: { position: Math.max(0, Math.min(100, Math.round(command.value))) }
        })
        return
      case 'raw': {
        const value = command.value
        if (typeof value.domain !== 'string' || typeof value.service !== 'string') {
          throw new Error('Raw Home Assistant commands require "domain" and "service" strings.')
        }
        await haClient.callService({
          domain: value.domain,
          service: value.service,
          service_data: value.service_data as Record<string, unknown> | undefined,
          target: value.target as { entity_id?: string | string[]; area_id?: string | string[] } | undefined
        })
        return
      }
      case 'scene':
        return
    }
  }

  async test(config: Record<string, unknown>, secret?: string | null): Promise<TestResult> {
    const url = typeof config.url === 'string' ? config.url : ''
    const token = secret || getHaToken() || ''
    if (!url) return { ok: false, message: 'Home Assistant URL is required.' }
    if (!token) return { ok: false, message: 'A long-lived access token is required.' }
    return haClient.testConnection(url, token)
  }
}
