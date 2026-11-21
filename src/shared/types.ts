export * from './device'
export * from './ha'

import type { ProviderId, DeviceCommand, Room, Scene } from './device'

export type ThemeMode = 'dark' | 'light' | 'system'

export interface ShortcutSettings {
  toggleLight: string
  openDashboard: string
  activateGamingScene: string
}

export interface AppSettings {
  theme: ThemeMode
  launchOnStartup: boolean
  minimizeToTray: boolean
  globalShortcutsEnabled: boolean
  notificationsEnabled: boolean
  shortcuts: ShortcutSettings
  discoveryInterfaces: string[]
  discoveryTimeoutMs: number
  selectedLightId?: string | null
}

export interface WizConfig {
  manualHosts: string[]
  pollIntervalMs: number
}

export interface HaConfig {
  url: string
  hasToken?: boolean
}

export interface MqttConfig {
  url: string
  username?: string
  clientId?: string
  baseTopic?: string
}

export type IntegrationConfig = WizConfig | HaConfig | MqttConfig

export interface IntegrationSaveInput {
  provider: ProviderId
  config: Record<string, unknown>
  secret?: string
}

export interface DeviceUpdateInput {
  name?: string
  roomId?: string | null
  favorite?: boolean
}

export interface DeviceExecuteInput {
  deviceId: string
  command: DeviceCommand
}

export interface RoomCreateInput {
  name: string
  icon?: string
}

export interface RoomUpdateInput {
  id: string
  name?: string
  icon?: string
  sortOrder?: number
}

export interface SceneCreateInput {
  name: string
  icon?: string
  actions: Scene['actions']
}

export interface SceneUpdateInput {
  id: string
  name?: string
  icon?: string
  actions?: Scene['actions']
}

export interface IntegrationDiscoveryResult {
  devices: import('./device').DiscoveredDevice[]
  status: import('./device').IntegrationStatus
}

export interface HaTestResult {
  ok: boolean
  message: string
  version?: string
}

export const IPC = {
  DEVICES_LIST: 'devices:list',
  DEVICES_GET: 'devices:get',
  DEVICES_EXECUTE: 'devices:execute',
  DEVICES_UPDATE: 'devices:update',
  DEVICES_REMOVE: 'devices:remove',
  DEVICES_REFRESH: 'devices:refresh',
  DEVICES_STATE: 'devices:state',
  ROOMS_LIST: 'rooms:list',
  ROOMS_CREATE: 'rooms:create',
  ROOMS_UPDATE: 'rooms:update',
  ROOMS_DELETE: 'rooms:delete',
  SCENES_LIST: 'scenes:list',
  SCENES_CREATE: 'scenes:create',
  SCENES_UPDATE: 'scenes:update',
  SCENES_DELETE: 'scenes:delete',
  SCENES_ACTIVATE: 'scenes:activate',
  INTEGRATIONS_LIST: 'integrations:list',
  INTEGRATIONS_STATUS: 'integrations:status',
  INTEGRATIONS_DISCOVER: 'integrations:discover',
  INTEGRATIONS_ADD_DEVICE: 'integrations:add-device',
  INTEGRATIONS_CONNECT: 'integrations:connect',
  INTEGRATIONS_DISCONNECT: 'integrations:disconnect',
  INTEGRATIONS_SAVE_CONFIG: 'integrations:save-config',
  INTEGRATIONS_GET_CONFIG: 'integrations:get-config',
  INTEGRATIONS_TEST: 'integrations:test',
  INTEGRATIONS_REMOVE: 'integrations:remove',
  INTEGRATIONS_STATUS_UPDATE: 'integrations:status-update',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  NETWORK_INTERFACES: 'network:interfaces',
  APP_NOTIFY: 'app:notify',
  WOL_SEND: 'wol:send',
  NAVIGATE: 'app:navigate',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export type { Device, DeviceState, DeviceCommand, ProviderId, Room, Scene } from './device'
