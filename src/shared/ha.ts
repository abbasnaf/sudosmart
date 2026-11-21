export interface HAEntity {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

export interface HAArea {
  area_id: string
  name: string
  picture?: string | null
}

export interface HADevice {
  id: string
  name: string
  area_id?: string | null
  manufacturer?: string | null
  model?: string | null
  identifiers?: Array<[string, string]>
}

export interface HAEntityRegistryEntry {
  entity_id: string
  device_id?: string | null
  area_id?: string | null
  platform?: string
  disabled_by?: string | null
  hidden_by?: string | null
  name?: string | null
  original_name?: string | null
}

export interface HAConnectionConfig {
  url: string
  hasToken: boolean
}

export interface HAConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  message?: string
  url?: string
  lastConnectedAt?: string
}

export interface ServiceCall {
  domain: string
  service: string
  service_data?: Record<string, unknown>
  target?: { entity_id?: string | string[]; area_id?: string | string[] }
}
