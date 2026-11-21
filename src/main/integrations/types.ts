import type {
  DeviceCommand,
  DeviceState,
  DiscoveredDevice,
  IntegrationStatus,
  ProviderId
} from '@shared/types'

export interface ProviderContext {
  emitState(providerDeviceId: string, state: Partial<DeviceState>): void
  emitDevicesChanged(): void
  emitStatus(status: IntegrationStatus): void
  getDeviceConfig(providerDeviceId: string): Record<string, unknown> | undefined
  getAllDeviceConfigs(): Array<{ providerDeviceId: string; config: Record<string, unknown> }>
}

export interface TestResult {
  ok: boolean
  message: string
  version?: string
}

export interface DeviceProvider {
  readonly id: ProviderId
  readonly name: string
  readonly configurable: boolean
  readonly pollIntervalMs: number
  status(): IntegrationStatus
  start(ctx: ProviderContext, config: Record<string, unknown>, secret?: string | null): Promise<void>
  stop(): Promise<void>
  discover(ctx: ProviderContext): Promise<DiscoveredDevice[]>
  getState(providerDeviceId: string, config: Record<string, unknown>): Promise<Partial<DeviceState>>
  execute(providerDeviceId: string, command: DeviceCommand, config: Record<string, unknown>): Promise<void>
  test(config: Record<string, unknown>, secret?: string | null): Promise<TestResult>
}

export function disconnectedStatus(id: ProviderId, name: string, message?: string): IntegrationStatus {
  return { provider: id, name, state: 'disconnected', message, configurable: true }
}
