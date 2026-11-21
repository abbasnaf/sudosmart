import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppSettings,
  Device,
  DeviceCommand,
  DeviceUpdateInput,
  DiscoveredDevice,
  IntegrationInfo,
  IntegrationSaveInput,
  IntegrationStatus,
  NetworkInterfaceInfo,
  ProviderId,
  Room,
  RoomCreateInput,
  RoomUpdateInput,
  Scene,
  SceneCreateInput,
  SceneUpdateInput
} from '@shared/types'

interface DeviceContextValue {
  devices: Device[]
  rooms: Room[]
  scenes: Scene[]
  integrations: IntegrationInfo[]
  statuses: IntegrationStatus[]
  settings: AppSettings | null
  networkInterfaces: NetworkInterfaceInfo[]
  loading: boolean
  error: string | null
  selectedDeviceId: string | null
  setSelectedDeviceId: (id: string | null) => void
  refreshAll: () => Promise<void>
  refreshDevices: () => Promise<void>
  execute: (deviceId: string, command: DeviceCommand) => Promise<void>
  updateDevice: (id: string, patch: DeviceUpdateInput) => Promise<void>
  removeDevice: (id: string) => Promise<void>
  createRoom: (input: RoomCreateInput) => Promise<void>
  updateRoom: (input: RoomUpdateInput) => Promise<void>
  removeRoom: (id: string) => Promise<void>
  createScene: (input: SceneCreateInput) => Promise<void>
  updateScene: (input: SceneUpdateInput) => Promise<void>
  removeScene: (id: string) => Promise<void>
  activateScene: (id: string) => Promise<{ ok: boolean; errors: string[] }>
  discover: (provider: ProviderId) => Promise<{ devices: DiscoveredDevice[]; status: IntegrationStatus }>
  addDiscoveredDevice: (device: DiscoveredDevice) => Promise<void>
  connectIntegration: (provider: ProviderId) => Promise<void>
  disconnectIntegration: (provider: ProviderId) => Promise<void>
  saveIntegrationConfig: (input: IntegrationSaveInput) => Promise<void>
  getIntegrationConfig: (provider: ProviderId) => Promise<{ config: Record<string, unknown>; hasSecret: boolean }>
  testIntegration: (input: { provider: ProviderId; config: Record<string, unknown>; secret?: string }) => Promise<{ ok: boolean; message: string; version?: string }>
  removeIntegration: (provider: ProviderId) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  refreshInterfaces: () => Promise<void>
}

function optimisticState(state: Device['state'], command: DeviceCommand): Device['state'] {
  switch (command.type) {
    case 'power':
      return { ...state, power: command.value }
    case 'toggle':
      return { ...state, power: !state.power }
    case 'brightness':
      return { ...state, power: true, brightness: command.value }
    case 'rgb':
      return { ...state, power: true, rgb: command.value, colorMode: 'rgb' }
    case 'color_temperature':
      return { ...state, power: true, colorTempK: command.value, colorMode: 'temp' }
    case 'setpoint':
      return { ...state, targetTemperature: command.value }
    case 'position':
      return { ...state, position: command.value }
    case 'scene':
      return { ...state, power: true, sceneId: command.value, colorMode: 'scene' }
    default:
      return state
  }
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([])
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterfaceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const devicesRef = useRef<Device[]>([])

  useEffect(() => {
    devicesRef.current = devices
  }, [devices])

  const refreshAll = useCallback(async () => {
    if (!window.api) return
    setError(null)
    try {
      const [deviceList, roomList, sceneList, integrationList, statusList, appSettings, interfaces] = await Promise.all([
        window.api.devices.list(),
        window.api.rooms.list(),
        window.api.scenes.list(),
        window.api.integrations.list(),
        window.api.integrations.status(),
        window.api.settings.get(),
        window.api.network.interfaces()
      ])
      setDevices(deviceList)
      setRooms(roomList)
      setScenes(sceneList)
      setIntegrations(integrationList)
      setStatuses(statusList)
      setSettings(appSettings)
      setNetworkInterfaces(interfaces)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void refreshAll().finally(() => {
      if (mounted) setLoading(false)
    })

    const unsubs: Array<() => void> = []
    if (window.api) {
      unsubs.push(window.api.devices.onState((next) => setDevices(next)))
      unsubs.push(window.api.integrations.onStatus((next) => setStatuses(next)))
    }
    return () => {
      mounted = false
      unsubs.forEach((unsub) => unsub())
    }
  }, [refreshAll])

  const refreshDevices = useCallback(async () => {
    if (!window.api) return
    const next = await window.api.devices.refresh()
    setDevices(next)
  }, [])

  const execute = useCallback(
    async (deviceId: string, command: DeviceCommand) => {
      if (!window.api) return
      const current = devicesRef.current.find((device) => device.id === deviceId)
      if (current) {
        setDevices((prev) =>
          prev.map((device) =>
            device.id === deviceId
              ? { ...device, state: optimisticState(device.state, command) }
              : device
          )
        )
      }

      try {
        const updated = await window.api.devices.execute({ deviceId, command })
        if (updated) {
          setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
          if (updated.category === 'light') {
            setSelectedDeviceId(updated.id)
            const next = await window.api.settings.update({ selectedLightId: updated.id })
            setSettings(next)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        void refreshDevices()
      }
    },
    [refreshDevices]
  )

  const updateDevice = useCallback(async (id: string, patch: DeviceUpdateInput) => {
    if (!window.api) return
    const updated = await window.api.devices.update(id, patch)
    if (updated) setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
  }, [])

  const removeDevice = useCallback(async (id: string) => {
    if (!window.api) return
    await window.api.devices.remove(id)
    setDevices((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const createRoom = useCallback(async (input: RoomCreateInput) => {
    if (!window.api) return
    await window.api.rooms.create(input)
    setRooms(await window.api.rooms.list())
  }, [])

  const updateRoom = useCallback(async (input: RoomUpdateInput) => {
    if (!window.api) return
    await window.api.rooms.update(input)
    setRooms(await window.api.rooms.list())
  }, [])

  const removeRoom = useCallback(async (id: string) => {
    if (!window.api) return
    await window.api.rooms.remove(id)
    setRooms(await window.api.rooms.list())
    setDevices(await window.api.devices.list())
  }, [])

  const createScene = useCallback(async (input: SceneCreateInput) => {
    if (!window.api) return
    await window.api.scenes.create(input)
    setScenes(await window.api.scenes.list())
  }, [])

  const updateScene = useCallback(async (input: SceneUpdateInput) => {
    if (!window.api) return
    await window.api.scenes.update(input)
    setScenes(await window.api.scenes.list())
  }, [])

  const removeScene = useCallback(async (id: string) => {
    if (!window.api) return
    await window.api.scenes.remove(id)
    setScenes(await window.api.scenes.list())
  }, [])

  const activateScene = useCallback(async (id: string) => {
    if (!window.api) return { ok: false, errors: ['API unavailable'] }
    const result = await window.api.scenes.activate(id)
    setDevices(await window.api.devices.list())
    return result
  }, [])

  const discover = useCallback(async (provider: ProviderId) => {
    if (!window.api) throw new Error('API unavailable')
    return window.api.integrations.discover(provider)
  }, [])

  const addDiscoveredDevice = useCallback(async (device: DiscoveredDevice) => {
    if (!window.api) return
    await window.api.integrations.addDevice(device)
    setDevices(await window.api.devices.list())
    setStatuses(await window.api.integrations.status())
  }, [])

  const connectIntegration = useCallback(async (provider: ProviderId) => {
    if (!window.api) return
    const status = await window.api.integrations.connect(provider)
    setStatuses((prev) => {
      const next = prev.filter((s) => s.provider !== provider)
      return [...next, status]
    })
    setDevices(await window.api.devices.list())
  }, [])

  const disconnectIntegration = useCallback(async (provider: ProviderId) => {
    if (!window.api) return
    const status = await window.api.integrations.disconnect(provider)
    setStatuses((prev) => prev.map((s) => (s.provider === provider ? status : s)))
    setDevices(await window.api.devices.list())
  }, [])

  const saveIntegrationConfig = useCallback(async (input: IntegrationSaveInput) => {
    if (!window.api) return
    const status = await window.api.integrations.saveConfig(input)
    setStatuses((prev) => {
      const next = prev.filter((s) => s.provider !== input.provider)
      return [...next, status]
    })
    setIntegrations(await window.api.integrations.list())
    setDevices(await window.api.devices.list())
  }, [])

  const getIntegrationConfig = useCallback(async (provider: ProviderId) => {
    if (!window.api) return { config: {}, hasSecret: false }
    return window.api.integrations.getConfig(provider)
  }, [])

  const testIntegration = useCallback(
    async (input: { provider: ProviderId; config: Record<string, unknown>; secret?: string }) => {
      if (!window.api) return { ok: false, message: 'API unavailable' }
      return window.api.integrations.test(input)
    },
    []
  )

  const removeIntegration = useCallback(async (provider: ProviderId) => {
    if (!window.api) return
    await window.api.integrations.remove(provider)
    setDevices(await window.api.devices.list())
    setStatuses(await window.api.integrations.status())
    setIntegrations(await window.api.integrations.list())
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    if (!window.api) return
    const next = await window.api.settings.update(patch)
    setSettings(next)
  }, [])

  const refreshInterfaces = useCallback(async () => {
    if (!window.api) return
    setNetworkInterfaces(await window.api.network.interfaces())
  }, [])

  const value = useMemo<DeviceContextValue>(
    () => ({
      devices,
      rooms,
      scenes,
      integrations,
      statuses,
      settings,
      networkInterfaces,
      loading,
      error,
      selectedDeviceId,
      setSelectedDeviceId,
      refreshAll,
      refreshDevices,
      execute,
      updateDevice,
      removeDevice,
      createRoom,
      updateRoom,
      removeRoom,
      createScene,
      updateScene,
      removeScene,
      activateScene,
      discover,
      addDiscoveredDevice,
      connectIntegration,
      disconnectIntegration,
      saveIntegrationConfig,
      getIntegrationConfig,
      testIntegration,
      removeIntegration,
      updateSettings,
      refreshInterfaces
    }),
    [
      devices, rooms, scenes, integrations, statuses, settings, networkInterfaces, loading, error, selectedDeviceId,
      refreshAll, refreshDevices, execute, updateDevice, removeDevice, createRoom, updateRoom, removeRoom, createScene,
      updateScene, removeScene, activateScene, discover, addDiscoveredDevice, connectIntegration, disconnectIntegration,
      saveIntegrationConfig, getIntegrationConfig, testIntegration, removeIntegration, updateSettings, refreshInterfaces
    ]
  )

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevices(): DeviceContextValue {
  const ctx = useContext(DeviceContext)
  if (!ctx) throw new Error('useDevices must be used within DeviceProvider')
  return ctx
}
