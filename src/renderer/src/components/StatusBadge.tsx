import type { Device, IntegrationStatus } from '@shared/types'
import { Badge } from './ui/badge'
import { cn } from '@renderer/lib/utils'

export function DeviceStatusBadge({ device }: { device: Device }) {
  if (!device.state.online) return <Badge variant="secondary">Offline</Badge>
  if (device.state.power) return <Badge variant="success">On</Badge>
  return <Badge variant="outline">Off</Badge>
}

export function IntegrationStatusBadge({ status }: { status?: IntegrationStatus }) {
  if (!status) return <Badge variant="secondary">Not configured</Badge>
  const variant =
    status.state === 'connected' ? 'success' : status.state === 'error' ? 'destructive' : status.state === 'connecting' ? 'warning' : 'secondary'
  return (
    <Badge variant={variant} className="capitalize">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status.state === 'connected' ? 'bg-[hsl(var(--ok))]' : status.state === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
        )}
      />
      {status.state}
    </Badge>
  )
}
