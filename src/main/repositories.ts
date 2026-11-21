import { randomUUID } from 'crypto'
import { execute, queryAll, queryOne } from './db'
import type {
  Capability,
  DeviceCategory,
  ProviderId,
  Room,
  Scene,
  SceneAction
} from '@shared/types'

export interface DeviceRecord {
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
  config: Record<string, unknown>
  address?: string
  lastSeen?: string
  createdAt: string
}

interface DeviceRow {
  id: string
  provider: ProviderId
  provider_device_id: string
  name: string
  manufacturer: string | null
  model: string | null
  category: DeviceCategory
  room_id: string | null
  favorite: number
  capabilities: string
  config: string
  address: string | null
  last_seen: string | null
  created_at: string
}

function mapDevice(row: DeviceRow): DeviceRecord {
  let capabilities: Capability[] = []
  let config: Record<string, unknown> = {}
  try { capabilities = JSON.parse(row.capabilities) } catch { /* ignore */ }
  try { config = JSON.parse(row.config) } catch { /* ignore */ }
  return {
    id: row.id,
    provider: row.provider,
    providerDeviceId: row.provider_device_id,
    name: row.name,
    manufacturer: row.manufacturer ?? undefined,
    model: row.model ?? undefined,
    category: row.category,
    roomId: row.room_id,
    favorite: !!row.favorite,
    capabilities,
    config,
    address: row.address ?? undefined,
    lastSeen: row.last_seen ?? undefined,
    createdAt: row.created_at
  }
}

export async function listDeviceRecords(): Promise<DeviceRecord[]> {
  const rows = await queryAll<DeviceRow>('SELECT * FROM devices ORDER BY name COLLATE NOCASE')
  return rows.map(mapDevice)
}

export async function getDeviceRecord(id: string): Promise<DeviceRecord | undefined> {
  const row = await queryOne<DeviceRow>('SELECT * FROM devices WHERE id = ?', [id])
  return row ? mapDevice(row) : undefined
}

export async function upsertDeviceRecord(input: {
  provider: ProviderId
  providerDeviceId: string
  name: string
  manufacturer?: string
  model?: string
  category: DeviceCategory
  capabilities: Capability[]
  address?: string
  config?: Record<string, unknown>
  state?: Record<string, unknown>
}): Promise<DeviceRecord> {
  const existing = await queryOne<DeviceRow>(
    'SELECT * FROM devices WHERE provider = ? AND provider_device_id = ?',
    [input.provider, input.providerDeviceId]
  )
  const now = new Date().toISOString()
  if (existing) {
    await execute(
      `UPDATE devices SET manufacturer = ?, model = ?, category = ?, capabilities = ?, address = ?, last_seen = ?, config = ? WHERE id = ?`,
      [
        input.manufacturer ?? existing.manufacturer,
        input.model ?? existing.model,
        input.category,
        JSON.stringify(input.capabilities),
        input.address ?? existing.address,
        now,
        JSON.stringify({ ...JSON.parse(existing.config || '{}'), ...(input.config ?? {}) }),
        existing.id
      ]
    )
    return (await getDeviceRecord(existing.id))!
  }
  const id = `${input.provider}:${input.providerDeviceId}`
  await execute(
    `INSERT INTO devices (id, provider, provider_device_id, name, manufacturer, model, category, room_id, favorite, capabilities, config, address, last_seen, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?)`,
    [
      id,
      input.provider,
      input.providerDeviceId,
      input.name,
      input.manufacturer ?? null,
      input.model ?? null,
      input.category,
      JSON.stringify(input.capabilities),
      JSON.stringify(input.config ?? {}),
      input.address ?? null,
      now,
      now
    ]
  )
  return (await getDeviceRecord(id))!
}

export async function updateDeviceRecord(
  id: string,
  patch: { name?: string; roomId?: string | null; favorite?: boolean }
): Promise<DeviceRecord | undefined> {
  const existing = await getDeviceRecord(id)
  if (!existing) return undefined
  await execute('UPDATE devices SET name = ?, room_id = ?, favorite = ? WHERE id = ?', [
    patch.name ?? existing.name,
    patch.roomId !== undefined ? patch.roomId : existing.roomId ?? null,
    patch.favorite !== undefined ? (patch.favorite ? 1 : 0) : existing.favorite ? 1 : 0,
    id
  ])
  return getDeviceRecord(id)
}

export async function markDeviceSeen(id: string): Promise<void> {
  await execute('UPDATE devices SET last_seen = ? WHERE id = ?', [new Date().toISOString(), id])
}

export async function deleteDeviceRecord(id: string): Promise<void> {
  await execute('DELETE FROM devices WHERE id = ?', [id])
}

export async function listRooms(): Promise<Room[]> {
  const rows = await queryAll<{ id: string; name: string; icon: string | null; sort_order: number }>(
    'SELECT id, name, icon, sort_order FROM rooms ORDER BY sort_order, name COLLATE NOCASE'
  )
  return rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon ?? undefined, sortOrder: r.sort_order }))
}

export async function createRoom(input: { name: string; icon?: string }): Promise<Room> {
  const id = randomUUID()
  const sortOrder = (await queryOne<{ max: number }>('SELECT COALESCE(MAX(sort_order), 0) AS max FROM rooms'))?.max ?? 0
  await execute('INSERT INTO rooms (id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [
    id, input.name, input.icon ?? null, sortOrder + 1, new Date().toISOString()
  ])
  return { id, name: input.name, icon: input.icon, sortOrder: sortOrder + 1 }
}

export async function updateRoom(id: string, patch: { name?: string; icon?: string; sortOrder?: number }): Promise<void> {
  const existing = await queryOne<{ name: string; icon: string | null; sort_order: number }>(
    'SELECT name, icon, sort_order FROM rooms WHERE id = ?',
    [id]
  )
  if (!existing) return
  await execute('UPDATE rooms SET name = ?, icon = ?, sort_order = ? WHERE id = ?', [
    patch.name ?? existing.name,
    patch.icon ?? existing.icon,
    patch.sortOrder ?? existing.sort_order,
    id
  ])
}

export async function deleteRoom(id: string): Promise<void> {
  await execute('UPDATE devices SET room_id = NULL WHERE room_id = ?', [id])
  await execute('DELETE FROM rooms WHERE id = ?', [id])
}

export async function listScenes(): Promise<Scene[]> {
  const rows = await queryAll<{ id: string; name: string; icon: string | null; actions: string; created_at: string }>(
    'SELECT id, name, icon, actions, created_at FROM scenes ORDER BY name COLLATE NOCASE'
  )
  return rows.map((r) => {
    let actions: SceneAction[] = []
    try { actions = JSON.parse(r.actions) } catch { /* ignore */ }
    return { id: r.id, name: r.name, icon: r.icon ?? undefined, actions, createdAt: r.created_at }
  })
}

export async function getScene(id: string): Promise<Scene | undefined> {
  return (await listScenes()).find((s) => s.id === id)
}

export async function createScene(input: { name: string; icon?: string; actions: SceneAction[] }): Promise<Scene> {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  await execute('INSERT INTO scenes (id, name, icon, actions, created_at) VALUES (?, ?, ?, ?, ?)', [
    id, input.name, input.icon ?? null, JSON.stringify(input.actions), createdAt
  ])
  return { id, name: input.name, icon: input.icon, actions: input.actions, createdAt }
}

export async function updateScene(id: string, patch: { name?: string; icon?: string; actions?: SceneAction[] }): Promise<void> {
  const existing = await getScene(id)
  if (!existing) return
  await execute('UPDATE scenes SET name = ?, icon = ?, actions = ? WHERE id = ?', [
    patch.name ?? existing.name,
    patch.icon ?? existing.icon,
    JSON.stringify(patch.actions ?? existing.actions),
    id
  ])
}

export async function deleteScene(id: string): Promise<void> {
  await execute('DELETE FROM scenes WHERE id = ?', [id])
}

export interface IntegrationRecord {
  provider: ProviderId
  name: string
  enabled: boolean
  config: Record<string, unknown>
}

export async function listIntegrationRecords(): Promise<IntegrationRecord[]> {
  const rows = await queryAll<{ provider: ProviderId; name: string; enabled: number; config: string }>(
    'SELECT provider, name, enabled, config FROM integrations ORDER BY name'
  )
  return rows.map((r) => {
    let config: Record<string, unknown> = {}
    try { config = JSON.parse(r.config) } catch { /* ignore */ }
    return { provider: r.provider, name: r.name, enabled: !!r.enabled, config }
  })
}

export async function getIntegrationRecord(provider: ProviderId): Promise<IntegrationRecord | undefined> {
  return (await listIntegrationRecords()).find((r) => r.provider === provider)
}

export async function upsertIntegrationRecord(input: {
  provider: ProviderId
  name: string
  config: Record<string, unknown>
  enabled?: boolean
}): Promise<void> {
  const existing = await getIntegrationRecord(input.provider)
  if (existing) {
    await execute('UPDATE integrations SET name = ?, config = ?, enabled = ? WHERE provider = ?', [
      input.name,
      JSON.stringify(input.config),
      input.enabled === false ? 0 : 1,
      input.provider
    ])
  } else {
    await execute('INSERT INTO integrations (id, provider, name, enabled, config, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      randomUUID(),
      input.provider,
      input.name,
      input.enabled === false ? 0 : 1,
      JSON.stringify(input.config),
      new Date().toISOString()
    ])
  }
}

export async function deleteIntegrationRecord(provider: ProviderId): Promise<void> {
  await execute('DELETE FROM integrations WHERE provider = ?', [provider])
}
