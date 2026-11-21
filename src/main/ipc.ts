import { BrowserWindow, ipcMain } from 'electron'
import {
  IPC,
  type AppSettings,
  type Capability,
  type DeviceCommand,
  type DeviceExecuteInput,
  type DeviceUpdateInput,
  type DiscoveredDevice,
  type IntegrationSaveInput,
  type ProviderId,
  type RoomCreateInput,
  type RoomUpdateInput,
  type SceneAction,
  type SceneCreateInput,
  type SceneUpdateInput
} from '@shared/types'
import { integrationManager } from './integrations/manager'
import { listNetworkInterfaces } from './network'
import { getSettings, updateSettings } from './settings'
import { applyStartupSetting } from './startup'
import { registerShortcuts } from './shortcuts'
import { notify } from './notifications'
import { sendWakeOnLan } from './wol'
import {
  createRoom,
  createScene,
  deleteRoom,
  deleteScene,
  listRooms,
  listScenes,
  updateRoom,
  updateScene
} from './repositories'

const KNOWN_PROVIDERS = new Set<ProviderId>([
  'wiz',
  'ha',
  'mqtt',
  'hue',
  'shelly',
  'matter',
  'kasa',
  'tuya'
])

const CAPABILITIES = new Set<Capability>([
  'power',
  'brightness',
  'rgb',
  'color_temperature',
  'temperature',
  'setpoint',
  'humidity',
  'energy',
  'motion',
  'media',
  'position',
  'scene'
])

const THEMES = new Set(['dark', 'light', 'system'])

function requireString(value: unknown, label: string, maxLength = 256): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

function requireOptionalString(value: unknown, label: string, maxLength = 256): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`Invalid ${label}.`)
  return value
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`)
  }
  return value as Record<string, unknown>
}

function requireProvider(value: unknown): ProviderId {
  if (typeof value !== 'string' || !KNOWN_PROVIDERS.has(value as ProviderId)) {
    throw new Error('Invalid integration provider.')
  }
  return value as ProviderId
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}.`)
  return value
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}.`)
  return value
}

function requireCommand(value: unknown): DeviceCommand {
  const command = requireRecord(value, 'command')
  switch (command.type) {
    case 'power':
      return { type: 'power', value: requireBoolean(command.value, 'power value') }
    case 'toggle':
      return { type: 'toggle' }
    case 'brightness':
      return { type: 'brightness', value: requireNumber(command.value, 'brightness value') }
    case 'color_temperature':
      return { type: 'color_temperature', value: requireNumber(command.value, 'colour temperature value') }
    case 'setpoint':
      return { type: 'setpoint', value: requireNumber(command.value, 'setpoint value') }
    case 'position':
      return { type: 'position', value: requireNumber(command.value, 'position value') }
    case 'scene':
      return { type: 'scene', value: requireNumber(command.value, 'scene id') }
    case 'rgb': {
      if (
        !Array.isArray(command.value) ||
        command.value.length !== 3 ||
        command.value.some((channel) => typeof channel !== 'number' || !Number.isFinite(channel))
      ) {
        throw new Error('Invalid RGB value.')
      }
      return { type: 'rgb', value: command.value as [number, number, number] }
    }
    case 'raw':
      return { type: 'raw', value: requireRecord(command.value, 'raw command') }
    default:
      throw new Error('Unsupported device command.')
  }
}

function requireDevicePatch(value: unknown): DeviceUpdateInput {
  const patch = requireRecord(value, 'device update')
  const result: DeviceUpdateInput = {}
  if (patch.name !== undefined) result.name = requireString(patch.name, 'device name', 128)
  if (patch.roomId !== undefined) {
    result.roomId = patch.roomId === null ? null : requireString(patch.roomId, 'room id')
  }
  if (patch.favorite !== undefined) result.favorite = requireBoolean(patch.favorite, 'favourite flag')
  return result
}

function requireDiscoveredDevice(value: unknown): DiscoveredDevice {
  const device = requireRecord(value, 'discovered device')
  const provider = requireProvider(device.provider)
  const providerDeviceId = requireString(device.providerDeviceId, 'provider device id')
  const name = requireString(device.name, 'device name', 128)
  if (!Array.isArray(device.capabilities)) throw new Error('Invalid device capabilities.')
  const capabilities = device.capabilities.map((capability) => {
    if (typeof capability !== 'string' || !CAPABILITIES.has(capability as Capability)) {
      throw new Error('Invalid device capability.')
    }
    return capability as Capability
  })
  const address = requireOptionalString(device.address, 'device address')
  return {
    provider,
    providerDeviceId,
    name,
    manufacturer: requireOptionalString(device.manufacturer, 'manufacturer', 128),
    model: requireOptionalString(device.model, 'model', 128),
    category: (device.category as DiscoveredDevice['category']) ?? 'other',
    capabilities,
    address,
    state: device.state as DiscoveredDevice['state']
  }
}

function requireSceneActions(value: unknown): SceneAction[] {
  if (!Array.isArray(value)) throw new Error('Invalid scene actions.')
  return value.map((entry) => {
    const action = requireRecord(entry, 'scene action')
    return {
      deviceId: requireString(action.deviceId, 'scene device id'),
      command: requireCommand(action.command)
    }
  })
}

function requireSettingsPatch(value: unknown): Partial<AppSettings> {
  const patch = requireRecord(value, 'settings update')
  const result: Partial<AppSettings> = {}

  if (patch.theme !== undefined) {
    if (typeof patch.theme !== 'string' || !THEMES.has(patch.theme)) throw new Error('Invalid theme.')
    result.theme = patch.theme as AppSettings['theme']
  }
  for (const key of [
    'launchOnStartup',
    'minimizeToTray',
    'globalShortcutsEnabled',
    'notificationsEnabled'
  ] as const) {
    if (patch[key] !== undefined) result[key] = requireBoolean(patch[key], key)
  }
  if (patch.discoveryInterfaces !== undefined) {
    if (!Array.isArray(patch.discoveryInterfaces) || patch.discoveryInterfaces.some((item) => typeof item !== 'string')) {
      throw new Error('Invalid discovery interfaces.')
    }
    result.discoveryInterfaces = patch.discoveryInterfaces as string[]
  }
  if (patch.discoveryTimeoutMs !== undefined) {
    result.discoveryTimeoutMs = Math.min(30000, Math.max(500, requireNumber(patch.discoveryTimeoutMs, 'discovery timeout')))
  }
  if (patch.selectedLightId !== undefined) {
    result.selectedLightId =
      patch.selectedLightId === null ? null : requireString(patch.selectedLightId, 'selected light id')
  }
  if (patch.shortcuts !== undefined) {
    const shortcuts = requireRecord(patch.shortcuts, 'shortcuts')
    result.shortcuts = {
      toggleLight: requireOptionalString(shortcuts.toggleLight, 'toggle light shortcut', 64) ?? '',
      openDashboard: requireOptionalString(shortcuts.openDashboard, 'dashboard shortcut', 64) ?? '',
      activateGamingScene: requireOptionalString(shortcuts.activateGamingScene, 'scene shortcut', 64) ?? ''
    }
  }
  return result
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc(): void {
  integrationManager.on('devices', (devices) => broadcast(IPC.DEVICES_STATE, devices))
  integrationManager.on('status', (statuses) => broadcast(IPC.INTEGRATIONS_STATUS_UPDATE, statuses))

  ipcMain.handle(IPC.DEVICES_LIST, () => integrationManager.getDevices())
  ipcMain.handle(IPC.DEVICES_GET, (_e, id: unknown) => integrationManager.getDevice(requireString(id, 'device id')))
  ipcMain.handle(IPC.DEVICES_EXECUTE, (_e, input: unknown) => {
    const payload = requireRecord(input, 'device command input') as Partial<DeviceExecuteInput>
    return integrationManager.execute(
      requireString(payload.deviceId, 'device id'),
      requireCommand(payload.command)
    )
  })
  ipcMain.handle(IPC.DEVICES_UPDATE, (_e, id: unknown, patch: unknown) =>
    integrationManager.updateDevice(requireString(id, 'device id'), requireDevicePatch(patch))
  )
  ipcMain.handle(IPC.DEVICES_REMOVE, (_e, id: unknown) =>
    integrationManager.removeDevice(requireString(id, 'device id'))
  )
  ipcMain.handle(IPC.DEVICES_REFRESH, () => integrationManager.refreshAll())

  ipcMain.handle(IPC.ROOMS_LIST, () => listRooms())
  ipcMain.handle(IPC.ROOMS_CREATE, (_e, input: unknown) => {
    const payload = requireRecord(input, 'room input') as Partial<RoomCreateInput>
    return createRoom({
      name: requireString(payload.name, 'room name', 80),
      icon: requireOptionalString(payload.icon, 'room icon', 8)
    })
  })
  ipcMain.handle(IPC.ROOMS_UPDATE, (_e, input: unknown) => {
    const payload = requireRecord(input, 'room update') as Partial<RoomUpdateInput>
    const id = requireString(payload.id, 'room id')
    return updateRoom(id, {
      name: payload.name === undefined ? undefined : requireString(payload.name, 'room name', 80),
      icon: payload.icon === undefined ? undefined : requireOptionalString(payload.icon, 'room icon', 8),
      sortOrder:
        payload.sortOrder === undefined ? undefined : Math.trunc(requireNumber(payload.sortOrder, 'sort order'))
    })
  })
  ipcMain.handle(IPC.ROOMS_DELETE, (_e, id: unknown) => deleteRoom(requireString(id, 'room id')))

  ipcMain.handle(IPC.SCENES_LIST, () => listScenes())
  ipcMain.handle(IPC.SCENES_CREATE, (_e, input: unknown) => {
    const payload = requireRecord(input, 'scene input') as Partial<SceneCreateInput>
    return createScene({
      name: requireString(payload.name, 'scene name', 80),
      icon: requireOptionalString(payload.icon, 'scene icon', 8),
      actions: requireSceneActions(payload.actions)
    })
  })
  ipcMain.handle(IPC.SCENES_UPDATE, (_e, input: unknown) => {
    const payload = requireRecord(input, 'scene update') as Partial<SceneUpdateInput>
    const id = requireString(payload.id, 'scene id')
    return updateScene(id, {
      name: payload.name === undefined ? undefined : requireString(payload.name, 'scene name', 80),
      icon: payload.icon === undefined ? undefined : requireOptionalString(payload.icon, 'scene icon', 8),
      actions: payload.actions === undefined ? undefined : requireSceneActions(payload.actions)
    })
  })
  ipcMain.handle(IPC.SCENES_DELETE, (_e, id: unknown) => deleteScene(requireString(id, 'scene id')))
  ipcMain.handle(IPC.SCENES_ACTIVATE, (_e, id: unknown) =>
    integrationManager.activateScene(requireString(id, 'scene id'))
  )

  ipcMain.handle(IPC.INTEGRATIONS_LIST, () => integrationManager.listIntegrations())
  ipcMain.handle(IPC.INTEGRATIONS_STATUS, () => integrationManager.getStatuses())
  ipcMain.handle(IPC.INTEGRATIONS_DISCOVER, (_e, provider: unknown) =>
    integrationManager.discover(requireProvider(provider))
  )
  ipcMain.handle(IPC.INTEGRATIONS_ADD_DEVICE, (_e, device: unknown) =>
    integrationManager.addDevice(requireDiscoveredDevice(device))
  )
  ipcMain.handle(IPC.INTEGRATIONS_CONNECT, (_e, provider: unknown) =>
    integrationManager.connectIntegration(requireProvider(provider))
  )
  ipcMain.handle(IPC.INTEGRATIONS_DISCONNECT, (_e, provider: unknown) =>
    integrationManager.disconnectIntegration(requireProvider(provider))
  )
  ipcMain.handle(IPC.INTEGRATIONS_SAVE_CONFIG, (_e, input: unknown) => {
    const payload = requireRecord(input, 'integration configuration') as Partial<IntegrationSaveInput>
    const secret = requireOptionalString(payload.secret, 'integration secret', 4096)
    return integrationManager.saveIntegrationConfig({
      provider: requireProvider(payload.provider),
      config: requireRecord(payload.config, 'integration config'),
      secret
    })
  })
  ipcMain.handle(IPC.INTEGRATIONS_GET_CONFIG, (_e, provider: unknown) =>
    integrationManager.getIntegrationConfig(requireProvider(provider))
  )
  ipcMain.handle(IPC.INTEGRATIONS_TEST, (_e, input: unknown) => {
    const payload = requireRecord(input, 'integration test input')
    return integrationManager.testIntegration(
      requireProvider(payload.provider),
      requireRecord(payload.config, 'integration config'),
      requireOptionalString(payload.secret, 'integration secret', 4096)
    )
  })
  ipcMain.handle(IPC.INTEGRATIONS_REMOVE, (_e, provider: unknown) =>
    integrationManager.removeIntegration(requireProvider(provider))
  )

  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())
  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, patch: unknown) => {
    const validated = requireSettingsPatch(patch)
    const next = await updateSettings(validated)
    await applyStartupSetting()
    await registerShortcuts()
    if (validated.discoveryInterfaces !== undefined || validated.discoveryTimeoutMs !== undefined) {
      await integrationManager.applySettings(next)
    }
    return next
  })

  ipcMain.handle(IPC.NETWORK_INTERFACES, () => listNetworkInterfaces())

  ipcMain.handle(IPC.APP_NOTIFY, async (_e, input: unknown) => {
    const payload = requireRecord(input, 'notification')
    await notify(
      requireString(payload.title, 'notification title', 120),
      requireString(payload.body, 'notification body', 500)
    )
    return { ok: true }
  })

  ipcMain.handle(IPC.WOL_SEND, async (_e, input: unknown) => {
    const payload = requireRecord(input, 'wake-on-LAN input')
    await sendWakeOnLan(requireString(payload.mac, 'MAC address', 32))
    return { ok: true }
  })

  ipcMain.on(IPC.WINDOW_MINIMIZE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.WINDOW_MAXIMIZE, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.WINDOW_CLOSE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
