import WebSocket from 'ws'
import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService as haCallService,
  type Connection,
  type HassEntities,
  type UnsubscribeFunc,
  type HaWebSocket
} from 'home-assistant-js-websocket'
import { EventEmitter } from 'events'
import type {
  HAConnectionState,
  HAArea,
  HADevice,
  HAEntity,
  HAEntityRegistryEntry,
  ServiceCall
} from '@shared/types'
import { getHaCredentialsAsync } from './config'

interface HaEvents {
  'connection-state': [HAConnectionState]
  'entities': [HAEntity[]]
}

export class HaClient extends EventEmitter<HaEvents> {
  private conn: Connection | null = null
  private unsubEntities: UnsubscribeFunc | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private manualDisconnect = false
  private state: HAConnectionState = { status: 'disconnected' }
  private entities: Record<string, HAEntity> = {}

  getState(): HAConnectionState {
    return this.state
  }

  getEntities(): HAEntity[] {
    return Object.values(this.entities)
  }

  private setState(patch: Partial<HAConnectionState>): void {
    this.state = { ...this.state, ...patch }
    this.emit('connection-state', this.state)
  }

  async connect(): Promise<void> {
    const creds = await getHaCredentialsAsync()
    if (!creds) {
      this.setState({ status: 'error', message: 'Home Assistant URL and token are required.' })
      return
    }
    this.manualDisconnect = false
    this.clearReconnect()
    await this.open(creds.url, creds.token)
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true
    this.clearReconnect()
    if (this.unsubEntities) {
      try {
        this.unsubEntities()
      } catch {
        // ignore
      }
      this.unsubEntities = null
    }
    if (this.conn) {
      try {
        this.conn.close()
      } catch {
        // ignore
      }
      this.conn = null
    }
    this.entities = {}
    this.setState({ status: 'disconnected', message: 'Disconnected' })
  }

  private async open(url: string, token: string): Promise<void> {
    if (this.conn) {
      await this.disconnect().catch(() => {})
      this.manualDisconnect = false
    }
    this.setState({ status: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting', url, message: undefined })

    try {
      const auth = createLongLivedTokenAuth(url, token)
      const conn = await createConnection({
        auth,
        createSocket: async (options) =>
          new Promise<HaWebSocket>((resolve, reject) => {
            const wsUrl = options.auth?.wsUrl
            if (!wsUrl) {
              reject(new Error('Missing Home Assistant websocket URL'))
              return
            }
            const ws = new WebSocket(wsUrl)
            const wrapperMap = new WeakMap<(...args: any[]) => void, (...args: any[]) => void>()
            const socket = ws as unknown as HaWebSocket
            ;(socket as any).addEventListener = (type: string, handler: (ev: any) => void) => {
              const wrapped = (a: any, b: any) => {
                if (type === 'message') handler({ data: typeof a === 'string' ? a : a?.toString?.() ?? String(a) })
                else if (type === 'close') handler({ code: a, reason: b?.toString?.() ?? '' })
                else if (type === 'error') handler(a)
                else handler(a ?? {})
              }
              wrapperMap.set(handler, wrapped)
              ws.on(type as any, wrapped)
            }
            ;(socket as any).removeEventListener = (type: string, handler: (ev: any) => void) => {
              const wrapped = wrapperMap.get(handler)
              if (wrapped) ws.off(type as any, wrapped)
            }
            ws.on('open', () => resolve(socket))
            ws.on('error', (err) => reject(err))
            ws.on('close', (code, reason) => {
              if (!this.manualDisconnect) this.handleClose(code, reason?.toString())
            })
          })
      })

      this.conn = conn
      this.reconnectAttempt = 0
      this.setState({ status: 'connected', url, message: undefined, lastConnectedAt: new Date().toISOString() })

      conn.addEventListener('disconnected', () => {
        if (!this.manualDisconnect) this.handleClose(0, 'disconnected')
      })
      conn.addEventListener('reconnect-error', () => {
        if (!this.manualDisconnect) this.setState({ status: 'reconnecting', message: 'Reconnecting...' })
      })

      this.unsubEntities = subscribeEntities(conn, (entities: HassEntities) => {
        const list: HAEntity[] = Object.values(entities).map((e) => ({
          entity_id: e.entity_id,
          state: e.state,
          attributes: e.attributes as Record<string, unknown>,
          last_changed: e.last_changed,
          last_updated: e.last_updated
        }))
        this.entities = Object.fromEntries(list.map((e) => [e.entity_id, e]))
        this.emit('entities', list)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setState({ status: 'error', message })
      this.scheduleReconnect()
    }
  }

  private handleClose(_code: number, reason?: string): void {
    if (this.manualDisconnect) return
    this.conn = null
    this.unsubEntities = null
    this.setState({ status: 'reconnecting', message: reason || 'Connection lost. Reconnecting...' })
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect) return
    this.clearReconnect()
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.reconnectAttempt, 5))
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      void this.connect()
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private requireConnection(): Connection {
    if (!this.conn) throw new Error('Not connected to Home Assistant')
    return this.conn
  }

  async getAreas(): Promise<HAArea[]> {
    const conn = this.requireConnection()
    return conn.sendMessagePromise<HAArea[]>({ type: 'config/area_registry/list' })
  }

  async getDevices(): Promise<HADevice[]> {
    const conn = this.requireConnection()
    return conn.sendMessagePromise<HADevice[]>({ type: 'config/device_registry/list' })
  }

  async getEntityRegistry(): Promise<HAEntityRegistryEntry[]> {
    const conn = this.requireConnection()
    return conn.sendMessagePromise<HAEntityRegistryEntry[]>({ type: 'config/entity_registry/list' })
  }

  async callService(call: ServiceCall): Promise<void> {
    const conn = this.requireConnection()
    await haCallService(conn, call.domain, call.service, call.service_data, call.target)
  }

  async testConnection(url: string, token: string): Promise<{ ok: boolean; message: string; version?: string }> {
    const trimmed = url.trim().replace(/\/+$/, '')
    try {
      const res = await fetch(`${trimmed}/api/`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        return { ok: false, message: `HTTP ${res.status}: ${res.statusText}` }
      }
      const data = (await res.json()) as { message?: string; version?: string }
      // also try config for version
      let version = data.version
      try {
        const cfgRes = await fetch(`${trimmed}/api/config`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        })
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as { version?: string }
          version = cfg.version ?? version
        }
      } catch {
        // ignore
      }
      return { ok: true, message: data.message || 'Connected', version }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }
}

export const haClient = new HaClient()
