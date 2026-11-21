import type React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  DoorOpen,
  Lightbulb,
  MonitorSmartphone,
  RefreshCw,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { DeviceCard } from '@renderer/components/DeviceCard'
import { LightCard } from '@renderer/components/LightCard'
import { EmptyState } from '@renderer/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { IntegrationStatusBadge } from '@renderer/components/StatusBadge'
import { cn } from '@renderer/lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  tone
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone?: 'primary' | 'ok' | 'warn'
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            tone === 'ok'
              ? 'bg-[hsl(var(--ok)/0.14)] text-[hsl(var(--ok))]'
              : tone === 'warn'
                ? 'bg-[hsl(var(--warn)/0.14)] text-[hsl(var(--warn))]'
                : 'bg-primary/15 text-primary'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function OverviewScreen() {
  const navigate = useNavigate()
  const { devices, rooms, statuses, refreshDevices } = useDevices()
  const lights = devices.filter((d) => d.category === 'light')
  const online = devices.filter((d) => d.state.online)
  const lightsOn = lights.filter((d) => d.state.power)
  const favorites = devices.filter((d) => d.favorite)
  const quickLights = [...lights].sort((a, b) => Number(b.state.power) - Number(a.state.power)).slice(0, 4)

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Your smart home at a glance — local first, cloud optional."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refreshDevices()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={() => navigate('/integrations')}>
              <Sparkles className="h-3.5 w-3.5" /> Discover devices
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Devices" value={devices.length} icon={MonitorSmartphone} />
        <StatCard label="Online" value={online.length} icon={Wifi} tone="ok" />
        <StatCard label="Lights on" value={lightsOn.length} icon={Lightbulb} tone="warn" />
        <StatCard label="Rooms" value={rooms.length} icon={DoorOpen} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {statuses.map((status) => (
          <Card key={status.provider} className="border-border/70">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{status.name}</span>
                  <IntegrationStatusBadge status={status} />
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {status.message ?? `${status.deviceCount ?? 0} device(s)`}
                </div>
              </div>
              <Link to="/integrations" className="text-xs text-primary hover:underline">
                Manage
              </Link>
            </CardContent>
          </Card>
        ))}
        {statuses.length === 0 ? (
          <Card className="xl:col-span-3">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WifiOff className="h-4 w-4" /> No integrations are active yet.
              </div>
              <Link to="/integrations" className="text-xs text-primary hover:underline">Add an integration</Link>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Favourites</h2>
        <Link to="/devices" className="text-xs text-muted-foreground hover:text-foreground">View all devices</Link>
      </div>
      <div className="mt-3">
        {favorites.length === 0 ? (
          <EmptyState
            title="No favourites yet"
            description="Mark devices as favourites to pin them here for quick access."
            icon={<Sparkles className="h-5 w-5" />}
            action={<Button size="sm" variant="outline" onClick={() => navigate('/devices')}>Browse devices</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {favorites.slice(0, 6).map((device) => (
              <DeviceCard key={device.id} device={device} room={rooms.find((r) => r.id === device.roomId)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rooms</h2>
        <Link to="/rooms" className="text-xs text-muted-foreground hover:text-foreground">Manage rooms</Link>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState
              title="No rooms yet"
              description="Create rooms to organise devices and control them together."
              icon={<DoorOpen className="h-5 w-5" />}
              action={<Button size="sm" onClick={() => navigate('/rooms')}>Create a room</Button>}
            />
          </div>
        ) : (
          rooms.map((room) => {
            const roomDevices = devices.filter((d) => d.roomId === room.id)
            const roomOnline = roomDevices.filter((d) => d.state.online).length
            const roomLightsOn = roomDevices.filter((d) => d.category === 'light' && d.state.power).length
            return (
              <Card
                key={room.id}
                className="cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/30"
                onClick={() => navigate(`/rooms/${room.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{room.name}</CardTitle>
                    <Badge variant={roomOnline > 0 ? 'success' : 'secondary'}>{roomOnline}/{roomDevices.length} online</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" /> {roomDevices.length} devices
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" /> {roomLightsOn} lights on
                  </span>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quick lighting</h2>
        <Link to="/lighting" className="text-xs text-muted-foreground hover:text-foreground">All lighting controls</Link>
      </div>
      <div className="mt-3">
        {quickLights.length === 0 ? (
          <EmptyState
            title="No lights found"
            description="Discover WiZ bulbs on your local network or connect Home Assistant to bring in your lights."
            icon={<Lightbulb className="h-5 w-5" />}
            action={<Button size="sm" onClick={() => navigate('/integrations')}>Discover lights</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            {quickLights.map((light) => (
              <LightCard key={light.id} device={light} room={rooms.find((r) => r.id === light.roomId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
