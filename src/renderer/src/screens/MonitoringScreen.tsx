import { useMemo } from 'react'
import { Activity, Clock, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { IntegrationStatusBadge } from '@renderer/components/StatusBadge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { timeAgo } from '@renderer/lib/utils'

export default function MonitoringScreen() {
  const { devices, statuses, refreshDevices } = useDevices()
  const online = useMemo(() => devices.filter((d) => d.state.online), [devices])
  const offline = useMemo(() => devices.filter((d) => !d.state.online), [devices])

  return (
    <div>
      <PageHeader
        title="Monitoring"
        description="Connection health, integration status and device availability."
        actions={<Button size="sm" variant="outline" onClick={() => void refreshDevices()}><RefreshCw className="h-3.5 w-3.5" /> Refresh all</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">Online devices</div><div className="mt-1 text-2xl font-semibold text-[hsl(var(--ok))]">{online.length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">Offline devices</div><div className="mt-1 text-2xl font-semibold text-destructive">{offline.length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">Connected integrations</div><div className="mt-1 text-2xl font-semibold">{statuses.filter((s) => s.state === 'connected').length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">Total devices</div><div className="mt-1 text-2xl font-semibold">{devices.length}</div></CardContent></Card>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Integration health</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {statuses.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState title="No integrations" description="Add WiZ or Home Assistant to begin monitoring devices." icon={<Server className="h-5 w-5" />} />
            </div>
          ) : (
            statuses.map((status) => (
              <Card key={status.provider}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        {status.state === 'connected' ? <Wifi className="h-4 w-4 text-[hsl(var(--ok))]" /> : <WifiOff className="h-4 w-4" />}
                      </div>
                      <div>
                        <CardTitle className="text-base">{status.name}</CardTitle>
                        <CardDescription>{status.deviceCount ?? 0} device(s)</CardDescription>
                      </div>
                    </div>
                    <IntegrationStatusBadge status={status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Activity className="h-3.5 w-3.5" /> Message</span>
                    <span className="max-w-[60%] truncate text-right text-muted-foreground">{status.message ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Last connected</span>
                    <span className="text-muted-foreground">{status.lastConnectedAt ? new Date(status.lastConnectedAt).toLocaleString() : '—'}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Unavailable devices</h2>
        <div className="mt-3">
          {offline.length === 0 ? (
            <EmptyState title="All devices are available" description="Every configured device is reporting online." icon={<Wifi className="h-5 w-5" />} />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {offline.map((device) => (
                  <div key={device.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{device.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {device.provider === 'wiz' ? 'WiZ' : device.provider === 'ha' ? 'Home Assistant' : device.provider}
                        {device.lastSeen ? ` · last seen ${timeAgo(device.lastSeen)}` : ''}
                      </div>
                    </div>
                    <Badge variant="destructive">Offline</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
