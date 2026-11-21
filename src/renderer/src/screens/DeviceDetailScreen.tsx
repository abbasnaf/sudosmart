import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Cable,
  Clock,
  Cpu,
  Hash,
  Lightbulb,
  Power,
  Save,
  Star,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { DeviceIcon } from '@renderer/components/DeviceIcon'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { ControlSlider } from '@renderer/components/ControlSlider'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn, hexToRgb, rgbToHex, timeAgo } from '@renderer/lib/utils'
import { useThrottledCallback } from '@renderer/lib/useThrottledCallback'

const COLOR_PRESETS: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: 'Warm white', rgb: [255, 190, 120] },
  { name: 'Daylight', rgb: [255, 245, 225] },
  { name: 'Red', rgb: [255, 60, 60] },
  { name: 'Green', rgb: [60, 220, 120] },
  { name: 'Blue', rgb: [70, 130, 255] },
  { name: 'Purple', rgb: [170, 90, 255] },
  { name: 'Pink', rgb: [255, 90, 180] },
  { name: 'Orange', rgb: [255, 140, 40] }
]

const WIZ_SCENES = [
  'Ocean', 'Romance', 'Sunset', 'Party', 'Fireplace', 'Cozy', 'Forest', 'Pastel',
  'Wake up', 'Bedtime', 'Warm white', 'Daylight', 'Cool white', 'Night light', 'Focus', 'Relax',
  'True colors', 'TV time', 'Plant growth', 'Spring', 'Summer', 'Fall', 'Winter', 'Diwali',
  'Ramadan', 'Halloween', 'Christmas', 'New Year', 'Easter', 'Birthday', 'Valentine', 'Party'
]

const TEMP_PRESETS: Array<{ name: string; kelvin: number }> = [
  { name: 'Warm', kelvin: 2700 },
  { name: 'Soft', kelvin: 3000 },
  { name: 'Neutral', kelvin: 4000 },
  { name: 'Cool', kelvin: 5000 },
  { name: 'Daylight', kelvin: 6500 }
]

export default function DeviceDetailScreen() {
  const navigate = useNavigate()
  const { deviceId } = useParams()
  const { devices, rooms, execute, updateDevice, removeDevice } = useDevices()
  const device = devices.find((d) => d.id === deviceId)

  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [displayBrightness, setDisplayBrightness] = useState(0)
  const [displayTemp, setDisplayTemp] = useState(3200)
  const [displaySetpoint, setDisplaySetpoint] = useState(21)
  const [displayPosition, setDisplayPosition] = useState(0)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (device) {
      setName(device.name)
      setRoomId(device.roomId ?? '')
      setDisplayBrightness(device.state.brightness ?? 0)
      setDisplayTemp(device.state.colorTempK ?? 3200)
      setDisplaySetpoint(device.state.targetTemperature ?? 21)
      setDisplayPosition(device.state.position ?? 0)
    }
  }, [device?.id, device?.name, device?.roomId, device?.state.brightness, device?.state.colorTempK, device?.state.targetTemperature, device?.state.position])

  const capabilities = useMemo(() => device?.capabilities ?? [], [device])
  const sendColor = useThrottledCallback((value: [number, number, number]) => {
    if (device) void execute(device.id, { type: 'rgb', value })
  }, 180)

  if (!device) {
    return (
      <div>
        <PageHeader title="Device not found" description="This device may have been removed." />
        <EmptyState
          title="Device not found"
          description="It may have been removed from the control centre or the integration is disconnected."
          action={<Button size="sm" onClick={() => navigate('/devices')}>Back to devices</Button>}
        />
      </div>
    )
  }

  const online = device.state.online
  const power = !!device.state.power
  const brightness = device.state.brightness ?? 0
  const supportsPower = capabilities.includes('power')
  const supportsBrightness = capabilities.includes('brightness')
  const supportsRgb = capabilities.includes('rgb')
  const supportsTemp = capabilities.includes('color_temperature')
  const supportsSetpoint = capabilities.includes('setpoint')
  const supportsPosition = capabilities.includes('position')
  const supportsScene = capabilities.includes('scene') && device.provider === 'wiz'
  const minBrightness = device.provider === 'wiz' ? 10 : 1
  const room = rooms.find((r) => r.id === device.roomId)

  const onSave = async () => {
    try {
      await updateDevice(device.id, { name: name.trim() || device.name, roomId: roomId || null })
      setSaveMessage('Saved')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save')
    }
    setTimeout(() => setSaveMessage(null), 1800)
  }

  const onDelete = async () => {
    await removeDevice(device.id)
    setDeleteOpen(false)
    navigate('/devices')
  }

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <PageHeader
        title={device.name}
        description={`${room?.name ?? 'Unassigned'} · ${device.provider === 'wiz' ? 'Philips WiZ' : 'Home Assistant'}`}
        actions={
          <>
            <Badge variant={online ? 'success' : 'secondary'} className="gap-1.5">
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? 'Online' : 'Offline'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void updateDevice(device.id, { favorite: !device.favorite })}
            >
              <Star className={cn('h-3.5 w-3.5', device.favorite && 'fill-[hsl(var(--warn))] text-[hsl(var(--warn))]')} />
              {device.favorite ? 'Favourite' : 'Add favourite'}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl border',
                    power && online ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'
                  )}
                >
                  <DeviceIcon category={device.category} className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle>Controls</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {device.category === 'light' ? 'Lighting controls' : device.category === 'sensor' ? 'Sensor readings' : 'Device controls'}
                  </div>
                </div>
              </div>
              {supportsPower ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{power ? 'On' : 'Off'}</span>
                  <Switch
                    checked={power}
                    disabled={!online}
                    onCheckedChange={(value) => void execute(device.id, { type: 'power', value })}
                  />
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-5">
              {device.category === 'sensor' || device.category === 'climate' || device.category === 'cover' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {device.state.temperature !== undefined ? (
                    <div className="rounded-lg bg-secondary/60 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Temperature</div>
                      <div className="mt-1 text-2xl font-semibold">{device.state.temperature}°C</div>
                    </div>
                  ) : null}
                  {device.state.targetTemperature !== undefined ? (
                    <div className="rounded-lg bg-secondary/60 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Target</div>
                      <div className="mt-1 text-2xl font-semibold">{device.state.targetTemperature}°</div>
                    </div>
                  ) : null}
                  {device.state.humidity !== undefined ? (
                    <div className="rounded-lg bg-secondary/60 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Humidity</div>
                      <div className="mt-1 text-2xl font-semibold">{device.state.humidity}%</div>
                    </div>
                  ) : null}
                  {device.state.energy !== undefined ? (
                    <div className="rounded-lg bg-secondary/60 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Energy</div>
                      <div className="mt-1 text-2xl font-semibold">{device.state.energy}</div>
                    </div>
                  ) : null}
                  {device.state.position !== undefined ? (
                    <div className="rounded-lg bg-secondary/60 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Position</div>
                      <div className="mt-1 text-2xl font-semibold">{device.state.position}%</div>
                    </div>
                  ) : null}
                  {device.category === 'sensor' && device.state.temperature === undefined && device.state.humidity === undefined && device.state.energy === undefined ? (
                    <div className="text-sm text-muted-foreground">No numeric readings available for this sensor.</div>
                  ) : null}
                </div>
              ) : null}

              {supportsBrightness ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Brightness</span>
                    <span className="font-medium">{power ? Math.round(displayBrightness) : 0}%</span>
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

              {supportsTemp ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Color temperature</span>
                    <span className="font-medium">{Math.round(displayTemp)}K</span>
                  </div>
                  <ControlSlider
                    value={Math.max(2200, Math.min(6500, device.state.colorTempK ?? 3200))}
                    min={2200}
                    max={6500}
                    step={100}
                    disabled={!online}
                    trackClassName="h-2 bg-[linear-gradient(90deg,#ffb347_0%,#ffd89b_30%,#fff4e5_55%,#d7ebff_100%)]"
                    rangeClassName="bg-transparent"
                    className="[&_[role=slider]]:border-white/70"
                    onValueChange={setDisplayTemp}
                    onValueCommit={(value) => void execute(device.id, { type: 'color_temperature', value })}
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>Warm</span>
                    <span>Cool</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TEMP_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        disabled={!online}
                        onClick={() => {
                          setDisplayTemp(preset.kelvin)
                          void execute(device.id, { type: 'color_temperature', value: preset.kelvin })
                        }}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40',
                          Math.abs((device.state.colorTempK ?? 0) - preset.kelvin) < 150
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {supportsRgb ? (
                <div>
                  <div className="mb-2 text-sm text-muted-foreground">Colour</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        title={preset.name}
                        disabled={!online}
                        className="h-8 w-8 rounded-full border border-white/20 shadow-sm transition-transform hover:scale-110 disabled:opacity-40"
                        style={{ backgroundColor: `rgb(${preset.rgb.join(',')})` }}
                        onClick={() => void execute(device.id, { type: 'rgb', value: preset.rgb })}
                      />
                    ))}
                    <label className="ml-1 flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border bg-secondary px-3 text-xs text-muted-foreground">
                      <input
                        type="color"
                        className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                        value={rgbToHex(device.state.rgb)}
                        disabled={!online}
                        onChange={(event) => sendColor(hexToRgb(event.target.value))}
                      />
                      Custom
                    </label>
                  </div>
                </div>
              ) : null}

              {supportsScene ? (
                <div>
                  <div className="mb-2 text-sm text-muted-foreground">WiZ scene</div>
                  <Select
                    value=""
                    disabled={!online}
                    onChange={(event) => {
                      const sceneId = Number(event.target.value)
                      if (sceneId) void execute(device.id, { type: 'scene', value: sceneId })
                    }}
                  >
                    <option value="">Select a scene…</option>
                    {WIZ_SCENES.map((scene, index) => (
                      <option key={scene + index} value={index + 1}>{scene}</option>
                    ))}
                  </Select>
                </div>
              ) : null}

              {supportsSetpoint ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Target temperature</span>
                    <span className="font-medium">{Math.round(displaySetpoint)}°</span>
                  </div>
                  <ControlSlider
                    value={Math.max(5, Math.min(35, device.state.targetTemperature ?? 21))}
                    min={5}
                    max={35}
                    step={0.5}
                    disabled={!online}
                    onValueChange={setDisplaySetpoint}
                    onValueCommit={(value) => void execute(device.id, { type: 'setpoint', value })}
                  />
                </div>
              ) : null}

              {supportsPosition ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Position</span>
                    <span className="font-medium">{Math.round(displayPosition)}%</span>
                  </div>
                  <ControlSlider
                    value={Math.max(0, Math.min(100, device.state.position ?? 0))}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!online}
                    onValueChange={setDisplayPosition}
                    onValueCommit={(value) => void execute(device.id, { type: 'position', value })}
                  />
                </div>
              ) : null}

              {!supportsPower && !supportsBrightness && !supportsRgb && !supportsTemp && !supportsSetpoint && !supportsPosition && device.category !== 'sensor' ? (
                <div className="text-sm text-muted-foreground">No controls are exposed for this device yet.</div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="device-name">Name</Label>
                  <Input id="device-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="device-room">Room</Label>
                  <Select id="device-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void onSave()}>
                    <Save className="h-3.5 w-3.5" /> Save changes
                  </Button>
                  {saveMessage ? <span className="text-xs text-muted-foreground">{saveMessage}</span> : null}
                </div>
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove device
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Device information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={Cable} label="Provider" value={device.provider === 'wiz' ? 'Philips WiZ' : device.provider === 'ha' ? 'Home Assistant' : device.provider} />
              <InfoRow icon={Cpu} label="Model" value={device.model ?? 'Unknown'} />
              <InfoRow icon={Hash} label="Device ID" value={device.id} mono />
              <InfoRow icon={device.state.online ? Wifi : WifiOff} label="Connection" value={device.state.online ? 'Online' : 'Offline'} />
              <InfoRow icon={Clock} label="Last seen" value={timeAgo(device.lastSeen)} />
              {device.address ? <InfoRow icon={Hash} label="Address" value={device.address} mono /> : null}
              {device.state.rssi !== undefined ? <InfoRow icon={Wifi} label="Signal" value={`${device.state.rssi} dBm`} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capabilities</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {capabilities.length === 0 ? (
                <span className="text-sm text-muted-foreground">No capabilities reported.</span>
              ) : (
                capabilities.map((capability) => (
                  <Badge key={capability} variant="secondary" className="capitalize">
                    {capability.replace('_', ' ')}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-primary/5">
            <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                {device.provider === 'wiz'
                  ? 'WiZ devices are controlled directly over your local network. Commands stay on your LAN and do not require the cloud.'
                  : 'This device is exposed through Home Assistant. Commands are sent to your local Home Assistant server.'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {device.name}?</DialogTitle>
            <DialogDescription>
              This removes the device from SudoSmart. It will not be removed from the device itself or Home Assistant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void onDelete()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn('max-w-[60%] text-right', mono && 'font-mono text-xs')}>{value}</div>
    </div>
  )
}
