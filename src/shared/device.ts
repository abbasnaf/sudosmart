export type ProviderId = 'wiz' | 'ha' | 'mqtt' | 'hue' | 'shelly' | 'matter' | 'kasa' | 'tuya'

export type DeviceCategory =
  | 'light'
  | 'switch'
  | 'sensor'
  | 'cover'
  | 'climate'
  | 'media_player'
  | 'other'

export type Capability =
  | 'power'
  | 'brightness'
  | 'rgb'
  | 'color_temperature'
  | 'temperature'
  | 'setpoint'
  | 'humidity'
  | 'energy'
  | 'motion'
  | 'media'
  | 'position'
  | 'scene'

export interface DeviceState {
  online: boolean
  power?: boolean
  brightness?: number
  rgb?: [number, number, number]
  colorTempK?: number
  colorMode?: 'rgb' | 'temp' | 'scene'
  sceneId?: number
  temperature?: number
  targetTemperature?: number
  humidity?: number
  energy?: number
  motion?: boolean
  mediaState?: string
  position?: number
  rssi?: number
  [key: string]: unknown
}

export interface Device {
  id: string
  provider: ProviderId
  providerDeviceId: string
  name: string
  manufacturer?: string
  model?: string
  category: DeviceCategory
  roomId?: string | null
  favorite: boolean
  capabilities: Capability[]
  state: DeviceState
  lastSeen?: string
  address?: string
  config?: Record<string, unknown>
}

export interface DiscoveredDevice {
  provider: ProviderId
  providerDeviceId: string
  name: string
  manufacturer?: string
  model?: string
  category: DeviceCategory
  capabilities: Capability[]
  address?: string
  state?: Partial<DeviceState>
  alreadyAdded?: boolean
}

export type DeviceCommand =
  | { type: 'power'; value: boolean }
  | { type: 'toggle' }
  | { type: 'brightness'; value: number }
  | { type: 'rgb'; value: [number, number, number] }
  | { type: 'color_temperature'; value: number }
  | { type: 'setpoint'; value: number }
  | { type: 'position'; value: number }
  | { type: 'scene'; value: number }
  | { type: 'raw'; value: Record<string, unknown> }

export interface IntegrationStatus {
  provider: ProviderId
  name: string
  state: 'connected' | 'disconnected' | 'connecting' | 'error'
  message?: string
  lastConnectedAt?: string
  deviceCount?: number
  configurable: boolean
}

export interface Room {
  id: string
  name: string
  icon?: string
  sortOrder: number
}

export interface SceneAction {
  deviceId: string
  command: DeviceCommand
}

export interface Scene {
  id: string
  name: string
  icon?: string
  actions: SceneAction[]
  createdAt: string
}

export interface NetworkInterfaceInfo {
  name: string
  address: string
  netmask: string
  mac: string
  internal: boolean
}

export interface IntegrationInfo {
  provider: ProviderId
  name: string
  description: string
  configurable: boolean
  configured: boolean
  available: boolean
}
