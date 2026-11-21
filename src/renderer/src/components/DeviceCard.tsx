import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import type { Device, Room } from '@shared/types'
import { Badge } from './ui/badge'
import { Card, CardContent } from './ui/card'
import { ControlSlider } from './ControlSlider'
import { Switch } from './ui/switch'
import { DeviceIcon } from './DeviceIcon'
import { cn, timeAgo } from '@renderer/lib/utils'
import { useDevices } from '@renderer/context/DeviceContext'

const providerLabels: Record<string, string> = {
  wiz: 'WiZ',
  ha: 'Home Assistant',
  mqtt: 'MQTT',
  hue: 'Hue',
  shelly: 'Shelly',
  matter: 'Matter',
  kasa: 'Kasa',
  tuya: 'Tuya'
}

export function DeviceCard({ device, room }: { device: Device; room?: Room }) {
  const navigate = useNavigate()
  const { execute } = useDevices()
  const online = device.state.online
  const power = !!device.state.power
  const brightness = device.state.brightness ?? 0
  const [displayBrightness, setDisplayBrightness] = useState(brightness)

  useEffect(() => {
    setDisplayBrightness(brightness)
  }, [brightness])

  const canPower = device.capabilities.includes('power')
  const canBrightness = device.category === 'light' && device.capabilities.includes('brightness')
  const minBrightness = device.provider === 'wiz' ? 10 : 1

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-glow',
        !online && 'opacity-70'
      )}
      onClick={() => navigate(`/devices/${encodeURIComponent(device.id)}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                power
                  ? 'border-primary/25 bg-primary/15 text-primary'
                  : 'border-border bg-secondary text-muted-foreground'
              )}
            >
              <DeviceIcon category={device.category} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{device.name}</span>
                {device.favorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-[hsl(var(--warn))] text-[hsl(var(--warn))]" /> : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {room?.name ?? 'Unassigned'} · {providerLabels[device.provider] ?? device.provider}
              </div>
            </div>
          </div>
          <Badge variant={online ? 'success' : 'secondary'} className="shrink-0">
            {online ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {canBrightness ? (
          <div className="mt-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Brightness</span>
              <span>{power ? Math.round(displayBrightness) : 0}%</span>
            </div>
            <ControlSlider
              value={Math.max(minBrightness, brightness || minBrightness)}
              min={minBrightness}
              max={100}
              step={1}
              disabled={!online}
              trackClassName="h-2"
              rangeClassName="bg-gradient-to-r from-amber-500/80 to-yellow-300"
              onValueChange={setDisplayBrightness}
              onValueCommit={(value) => void execute(device.id, { type: 'brightness', value })}
            />
          </div>
        ) : null}

        {device.category === 'sensor' ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {device.state.temperature !== undefined ? (
              <div className="rounded-lg bg-secondary/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Temperature</div>
                <div className="font-semibold">{device.state.temperature}°C</div>
              </div>
            ) : null}
            {device.state.humidity !== undefined ? (
              <div className="rounded-lg bg-secondary/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Humidity</div>
                <div className="font-semibold">{device.state.humidity}%</div>
              </div>
            ) : null}
            {device.state.temperature === undefined && device.state.humidity === undefined ? (
              <div className="text-xs text-muted-foreground">Sensor online</div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {online ? `Seen ${timeAgo(device.lastSeen)}` : 'Unavailable'}
          </span>
          {canPower ? (
            <div onClick={(event) => event.stopPropagation()}>
              <Switch
                checked={power}
                disabled={!online}
                onCheckedChange={(value) => void execute(device.id, { type: 'power', value })}
              />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
