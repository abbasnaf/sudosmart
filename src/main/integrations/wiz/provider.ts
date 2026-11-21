import dgram from 'dgram'
import type {
  Capability,
  DeviceCommand,
  DeviceState,
  DiscoveredDevice,
  IntegrationStatus,
  NetworkInterfaceInfo
} from '@shared/types'
import type { DeviceProvider, ProviderContext, TestResult } from '../types'
import { broadcastAddress, listNetworkInterfaces } from '../../network'

const WIZ_PORT = 38899
const SYNC_PORT = 38900
const DEFAULT_DISCOVERY_TIMEOUT = 3000
const DEFAULT_REQUEST_TIMEOUT = 1500

interface WizPilot {
  state?: boolean
  dimming?: number
  temp?: number
  r?: number
  g?: number
  b?: number
  c?: number
  w?: number
  sceneId?: number
  speed?: number
  ratio?: number
  mac?: string
  rssi?: number
  [key: string]: unknown
}

interface WizSystemConfig {
  mac?: string
  moduleName?: string
  fwVersion?: string
  homeId?: number
  roomId?: number
  rgn?: string
  [key: string]: unknown
}

interface WizProviderConfig {
  manualHosts?: string[]
  discoveryInterfaces?: string[]
  discoveryTimeoutMs?: number
  pollIntervalMs?: number
}

interface WizResponse {
  method?: string
  result?: Record<string, unknown>
  error?: { code?: number; message?: string }
}

function normalizeMac(value: string): string {
  return value.toLowerCase().replace(/[^a-f0-9]/g, '')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mapPilot(pilot: WizPilot): Partial<DeviceState> {
  const state: Partial<DeviceState> = {
    online: true,
    power: pilot.state === true,
    brightness: typeof pilot.dimming === 'number' ? clamp(pilot.dimming, 0, 100) : undefined,
    sceneId: typeof pilot.sceneId === 'number' && pilot.sceneId > 0 ? pilot.sceneId : undefined,
    rssi: typeof pilot.rssi === 'number' ? pilot.rssi : undefined
  }

  if (typeof pilot.temp === 'number' && pilot.temp > 0) {
    state.colorTempK = pilot.temp
    state.colorMode = 'temp'
  } else if (typeof pilot.r === 'number' || typeof pilot.g === 'number' || typeof pilot.b === 'number') {
    state.rgb = [pilot.r ?? 0, pilot.g ?? 0, pilot.b ?? 0]
    state.colorMode = 'rgb'
  }

  if (state.sceneId) state.colorMode = 'scene'
  return state
}

function deriveCapabilities(pilot: WizPilot, system?: WizSystemConfig): Capability[] {
  const capabilities: Capability[] = ['power']
  const moduleName = system?.moduleName ?? ''
  const hasModuleInfo = moduleName.length > 0

  capabilities.push('brightness')

  const supportsRgb = hasModuleInfo
    ? /RGB/i.test(moduleName)
    : pilot.r !== undefined || pilot.g !== undefined || pilot.b !== undefined
  const supportsTemp = hasModuleInfo
    ? /TW|RGB/i.test(moduleName)
    : typeof pilot.temp === 'number' && pilot.temp > 0

  if (supportsRgb) capabilities.push('rgb')
  if (supportsTemp) capabilities.push('color_temperature')
  capabilities.push('scene')
  return [...new Set(capabilities)]
}

export class WizProvider implements DeviceProvider {
  readonly id = 'wiz' as const
  readonly name = 'Philips WiZ'
  readonly configurable = true

  private config: WizProviderConfig = {}

  get pollIntervalMs(): number {
    const configured = this.config.pollIntervalMs
    return typeof configured === 'number' && configured >= 2000 ? configured : 5000
  }
  private ctx: ProviderContext | null = null
  private currentStatus: IntegrationStatus = {
    provider: 'wiz',
    name: 'Philips WiZ',
    state: 'disconnected',
    configurable: true
  }
  private syncSocket: dgram.Socket | null = null

  status(): IntegrationStatus {
    return this.currentStatus
  }

  private setStatus(patch: Partial<IntegrationStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...patch }
    this.ctx?.emitStatus(this.currentStatus)
  }

  async start(ctx: ProviderContext, config: Record<string, unknown>): Promise<void> {
    this.ctx = ctx
    this.config = config as WizProviderConfig
    this.startSyncListener()
    this.setStatus({
      state: 'connected',
      message: 'Local WiZ discovery and polling active.',
      lastConnectedAt: new Date().toISOString()
    })
  }

  async stop(): Promise<void> {
    if (this.syncSocket) {
      try {
        this.syncSocket.close()
      } catch {
        // ignore
      }
      this.syncSocket = null
    }
    this.setStatus({ state: 'disconnected', message: 'Stopped.' })
  }

  async test(): Promise<TestResult> {
    return {
      ok: true,
      message: 'WiZ uses UDP on port 38899. Use Discover to find bulbs on the local network.'
    }
  }

  private selectedInterfaces(): NetworkInterfaceInfo[] {
    const all = listNetworkInterfaces().filter((i) => !i.internal)
    const selected = this.config.discoveryInterfaces
    if (!selected || selected.length === 0) return all
    return all.filter((i) => selected.includes(i.address) || selected.includes(i.name))
  }

  private async request(host: string, payload: Record<string, unknown>, timeout = DEFAULT_REQUEST_TIMEOUT): Promise<WizResponse> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4')
      let settled = false
      const finish = (error: Error | null, data?: WizResponse) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          socket.close()
        } catch {
          // ignore
        }
        if (error) reject(error)
        else resolve(data as WizResponse)
      }
      const timer = setTimeout(() => finish(new Error(`WiZ device ${host} did not respond.`)), timeout)
      socket.on('message', (message) => {
        try {
          finish(null, JSON.parse(message.toString()) as WizResponse)
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })
      socket.on('error', (error) => finish(error))
      socket.send(Buffer.from(JSON.stringify(payload)), WIZ_PORT, host, (error) => {
        if (error) finish(error)
      })
    })
  }

  private async getPilot(host: string): Promise<WizPilot> {
    const response = await this.request(host, { method: 'getPilot', params: {} })
    if (!response.result) throw new Error('WiZ getPilot returned no result.')
    return response.result as WizPilot
  }

  private async getSystemConfig(host: string): Promise<WizSystemConfig | undefined> {
    try {
      const response = await this.request(host, { method: 'getSystemConfig', params: {} }, 1200)
      return (response.result as WizSystemConfig) ?? undefined
    } catch {
      return undefined
    }
  }

  private async discoverInterface(iface: NetworkInterfaceInfo, timeout: number): Promise<Array<{ address: string; pilot: WizPilot }>> {
    return new Promise((resolve) => {
      const results: Array<{ address: string; pilot: WizPilot }> = []
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        try {
          socket.close()
        } catch {
          // ignore
        }
        resolve(results)
      }
      socket.on('message', (message, rinfo) => {
        try {
          const data = JSON.parse(message.toString()) as WizResponse
          if (data.method === 'getPilot' && data.result) {
            results.push({ address: rinfo.address, pilot: data.result as WizPilot })
          }
        } catch {
          // ignore malformed packets
        }
      })
      socket.on('error', () => finish())
      socket.bind({ address: iface.address, port: 0 }, () => {
        try {
          socket.setBroadcast(true)
        } catch {
          // ignore
        }
        const payload = Buffer.from(JSON.stringify({ method: 'getPilot', params: {} }))
        const broadcast = broadcastAddress(iface.address, iface.netmask)
        socket.send(payload, WIZ_PORT, broadcast, (error) => {
          if (error) finish()
        })
        socket.send(payload, WIZ_PORT, '255.255.255.255', (error) => {
          if (error) finish()
        })
      })
      setTimeout(finish, timeout)
    })
  }

  async discover(): Promise<DiscoveredDevice[]> {
    const timeout = this.config.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT
    const interfaces = this.selectedInterfaces()
    const found = new Map<string, { address: string; pilot: WizPilot }>()

    const results = await Promise.all(interfaces.map((iface) => this.discoverInterface(iface, timeout)))
    for (const batch of results) {
      for (const entry of batch) {
        if (!entry.pilot.mac) continue
        found.set(normalizeMac(entry.pilot.mac), entry)
      }
    }

    for (const host of this.config.manualHosts ?? []) {
      const trimmed = host.trim()
      if (!trimmed) continue
      try {
        const pilot = await this.getPilot(trimmed)
        if (pilot.mac) found.set(normalizeMac(pilot.mac), { address: trimmed, pilot })
      } catch {
        // unreachable manual host
      }
    }

    const devices = await Promise.all(
      Array.from(found.entries()).map(async ([mac, entry]) => {
        const system = await this.getSystemConfig(entry.address)
        const model = system?.moduleName ?? 'WiZ device'
        const discovered: DiscoveredDevice = {
          provider: 'wiz',
          providerDeviceId: mac,
          name: `WiZ Light ${mac.slice(-4).toUpperCase()}`,
          manufacturer: 'Philips WiZ',
          model,
          category: 'light',
          capabilities: deriveCapabilities(entry.pilot, system),
          address: entry.address,
          state: { ...mapPilot(entry.pilot), online: true }
        }
        return discovered
      })
    )

    return devices
  }

  async getState(_providerDeviceId: string, config: Record<string, unknown>): Promise<Partial<DeviceState>> {
    const address = typeof config.address === 'string' ? config.address : ''
    if (!address) return { online: false }
    try {
      const pilot = await this.getPilot(address)
      return { ...mapPilot(pilot), online: true }
    } catch {
      return { online: false }
    }
  }

  async execute(_providerDeviceId: string, command: DeviceCommand, config: Record<string, unknown>): Promise<void> {
    const address = typeof config.address === 'string' ? config.address : ''
    if (!address) throw new Error('WiZ device address is missing. Re-discover the device.')

    const params: Record<string, unknown> = {}

    switch (command.type) {
      case 'power':
        params.state = command.value
        break
      case 'toggle': {
        const pilot = await this.getPilot(address)
        params.state = !pilot.state
        break
      }
      case 'brightness':
        params.state = true
        params.dimming = clamp(Math.round(command.value), 10, 100)
        break
      case 'rgb':
        params.state = true
        params.r = clamp(Math.round(command.value[0]), 0, 255)
        params.g = clamp(Math.round(command.value[1]), 0, 255)
        params.b = clamp(Math.round(command.value[2]), 0, 255)
        break
      case 'color_temperature':
        params.state = true
        params.temp = clamp(Math.round(command.value), 2200, 6500)
        break
      case 'scene':
        params.state = true
        params.sceneId = Math.round(command.value)
        break
      case 'raw':
        Object.assign(params, command.value)
        break
    }

    if (Object.keys(params).length === 0) return

    const response = await this.request(address, { method: 'setPilot', params }, 2000)
    if (response.error) {
      throw new Error(response.error.message || 'WiZ command failed.')
    }
    if (response.result && response.result.success === false) {
      throw new Error('WiZ device rejected the command.')
    }

    await delay(120)
    // The manager refreshes state after execute; no need to wait for a second response here.
  }

  private startSyncListener(): void {
    if (this.syncSocket) return
    try {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString()) as WizResponse
          if (data.method === 'syncPilot' && data.result) {
            const pilot = data.result as WizPilot
            if (pilot.mac) {
              this.ctx?.emitState(normalizeMac(pilot.mac), { ...mapPilot(pilot), online: true })
            }
          }
        } catch {
          // ignore
        }
      })
      socket.on('error', () => {
        // syncPilot is an optimization; polling remains active
      })
      socket.bind(SYNC_PORT, () => {
        try {
          socket.setBroadcast(true)
        } catch {
          // ignore
        }
      })
      this.syncSocket = socket
    } catch {
      // ignore
    }
  }
}
