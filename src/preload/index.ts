import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppSettings,
  type Device,
  type DeviceCommand,
  type DeviceExecuteInput,
  type DeviceUpdateInput,
  type DiscoveredDevice,
  type IntegrationInfo,
  type IntegrationSaveInput,
  type IntegrationStatus,
  type NetworkInterfaceInfo,
  type ProviderId,
  type Room,
  type RoomCreateInput,
  type RoomUpdateInput,
  type Scene,
  type SceneCreateInput,
  type SceneUpdateInput
} from '@shared/types'

type Unsub = () => void

function on<T>(channel: string, handler: (payload: T) => void): Unsub {
  const listener = (_: unknown, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  devices: {
    list: (): Promise<Device[]> => ipcRenderer.invoke(IPC.DEVICES_LIST),
    get: (id: string): Promise<Device | undefined> => ipcRenderer.invoke(IPC.DEVICES_GET, id),
    execute: (input: DeviceExecuteInput): Promise<Device | undefined> => ipcRenderer.invoke(IPC.DEVICES_EXECUTE, input),
    update: (id: string, patch: DeviceUpdateInput): Promise<Device | undefined> =>
      ipcRenderer.invoke(IPC.DEVICES_UPDATE, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DEVICES_REMOVE, id),
    refresh: (): Promise<Device[]> => ipcRenderer.invoke(IPC.DEVICES_REFRESH),
    onState: (handler: (devices: Device[]) => void): Unsub => on(IPC.DEVICES_STATE, handler)
  },
  rooms: {
    list: (): Promise<Room[]> => ipcRenderer.invoke(IPC.ROOMS_LIST),
    create: (input: RoomCreateInput): Promise<Room> => ipcRenderer.invoke(IPC.ROOMS_CREATE, input),
    update: (input: RoomUpdateInput): Promise<void> => ipcRenderer.invoke(IPC.ROOMS_UPDATE, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ROOMS_DELETE, id)
  },
  scenes: {
    list: (): Promise<Scene[]> => ipcRenderer.invoke(IPC.SCENES_LIST),
    create: (input: SceneCreateInput): Promise<Scene> => ipcRenderer.invoke(IPC.SCENES_CREATE, input),
    update: (input: SceneUpdateInput): Promise<void> => ipcRenderer.invoke(IPC.SCENES_UPDATE, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SCENES_DELETE, id),
    activate: (id: string): Promise<{ ok: boolean; errors: string[] }> => ipcRenderer.invoke(IPC.SCENES_ACTIVATE, id)
  },
  integrations: {
    list: (): Promise<IntegrationInfo[]> => ipcRenderer.invoke(IPC.INTEGRATIONS_LIST),
    status: (): Promise<IntegrationStatus[]> => ipcRenderer.invoke(IPC.INTEGRATIONS_STATUS),
    discover: (provider: ProviderId): Promise<{ devices: DiscoveredDevice[]; status: IntegrationStatus }> =>
      ipcRenderer.invoke(IPC.INTEGRATIONS_DISCOVER, provider),
    addDevice: (device: DiscoveredDevice): Promise<Device> => ipcRenderer.invoke(IPC.INTEGRATIONS_ADD_DEVICE, device),
    connect: (provider: ProviderId): Promise<IntegrationStatus> => ipcRenderer.invoke(IPC.INTEGRATIONS_CONNECT, provider),
    disconnect: (provider: ProviderId): Promise<IntegrationStatus> =>
      ipcRenderer.invoke(IPC.INTEGRATIONS_DISCONNECT, provider),
    saveConfig: (input: IntegrationSaveInput): Promise<IntegrationStatus> =>
      ipcRenderer.invoke(IPC.INTEGRATIONS_SAVE_CONFIG, input),
    getConfig: (provider: ProviderId): Promise<{ config: Record<string, unknown>; hasSecret: boolean }> =>
      ipcRenderer.invoke(IPC.INTEGRATIONS_GET_CONFIG, provider),
    test: (input: { provider: ProviderId; config: Record<string, unknown>; secret?: string }): Promise<{ ok: boolean; message: string; version?: string }> =>
      ipcRenderer.invoke(IPC.INTEGRATIONS_TEST, input),
    remove: (provider: ProviderId): Promise<void> => ipcRenderer.invoke(IPC.INTEGRATIONS_REMOVE, provider),
    onStatus: (handler: (statuses: IntegrationStatus[]) => void): Unsub => on(IPC.INTEGRATIONS_STATUS_UPDATE, handler)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_UPDATE, patch)
  },
  network: {
    interfaces: (): Promise<NetworkInterfaceInfo[]> => ipcRenderer.invoke(IPC.NETWORK_INTERFACES)
  },
  app: {
    notify: (input: { title: string; body: string }): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.APP_NOTIFY, input),
    wakeOnLan: (input: { mac: string }): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.WOL_SEND, input),
    onNavigate: (handler: (path: string) => void): Unsub => on(IPC.NAVIGATE, handler)
  },
  window: {
    minimize: (): void => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
    maximize: (): void => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
    close: (): void => ipcRenderer.send(IPC.WINDOW_CLOSE)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
