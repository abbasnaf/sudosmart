import { useEffect, useMemo, useState } from 'react'
import { Sun } from 'lucide-react'
import type { Device, Room } from '@shared/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ControlSlider } from './ControlSlider'
import { Switch } from './ui/switch'
import { Select } from './ui/select'
import { Badge } from './ui/badge'
import { DeviceIcon } from './DeviceIcon'
import { cn, hexToRgb, rgbToHex } from '@renderer/lib/utils'
import { useThrottledCallback } from '@renderer/lib/useThrottledCallback'
import { useDevices } from '@renderer/context/DeviceContext'

const COLOR_PRESETS: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: 'Warm', rgb: [255, 190, 120] },
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

function providerLabel(provider: Device['provider']): string {
  if (provider === 'wiz') return 'WiZ'
  if (provider === 'ha') return 'Home Assistant'
  return provider
}

export function LightCard({ device, room }: { device: Device; room?: Room }) {
  const { execute } = useDevices()
  const online = device.state.online
  const power = !!device.state.power
  const brightness = device.state.brightness ?? 0
  const rgb = device.state.rgb
  const colorTempK = device.state.colorTempK
  const colorMode = device.state.colorMode
  const supportsBrightness = device.capabilities.includes('brightness')
  const supportsRgb = device.capabilities.includes('rgb')
  const supportsTemp = device.capabilities.includes('color_temperature')
  const supportsScene = device.capabilities.includes('scene') && device.provider === 'wiz'
  const minBrightness = device.provider === 'wiz' ? 10 : 1

  const [displayBrightness, setDisplayBrightness] = useState(brightness)
  const [displayTemp, setDisplayTemp] = useState(colorTempK ?? 3200)

  useEffect(() => {
    setDisplayBrightness(brightness)
  }, [brightness])
  useEffect(() => {
    if (colorTempK) setDisplayTemp(colorTempK)
  }, [colorTempK])

  const tempRange = useMemo(() => ({ min: 2200, max: 6500 }), [])
  const sendColor = useThrottledCallback(
    (value: [number, number, number]) => void execute(device.id, { type: 'rgb', value }),
    180
  )

  const activeColor = rgb ? `rgb(${rgb.join(',')})` : undefined

  return (
    <Card className={cn('overflow-hidden transition-all duration-200', power && online && 'border-primary/25 shadow-glow')}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
              power && online
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-border bg-secondary text-muted-foreground'
            )}
            style={power && online && activeColor && colorMode === 'rgb' ? { color: activeColor, borderColor: `${activeColor}55`, backgroundColor: `${activeColor}22` } : undefined}
          >
            <DeviceIcon category="light" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{device.name}</CardTitle>
            <CardDescription className="truncate">
              {room?.name ?? 'Unassigned'} · {providerLabel(device.provider)}
            </CardDescription>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={online ? 'success' : 'secondary'}>{online ? 'Online' : 'Offline'}</Badge>
          <Switch
            checked={power}
            disabled={!online}
            onCheckedChange={(value) => void execute(device.id, { type: 'power', value })}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {supportsBrightness ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Sun className="h-3.5 w-3.5" /> Brightness</span>
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

        {supportsTemp ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Color temperature</span>
              <span>{Math.round(displayTemp)}K</span>
            </div>
            <ControlSlider
              value={Math.max(tempRange.min, Math.min(tempRange.max, colorTempK ?? 3200))}
              min={tempRange.min}
              max={tempRange.max}
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
                    Math.abs((colorTempK ?? 0) - preset.kelvin) < 150
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
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Color</span>
              <span className="inline-flex items-center gap-1.5">
                {activeColor ? (
                  <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: activeColor }} />
                ) : null}
                {colorMode === 'rgb' ? 'RGB' : 'Presets'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  disabled={!online}
                  className="h-7 w-7 rounded-full border border-white/20 shadow-sm transition-transform hover:scale-110 disabled:opacity-40"
                  style={{ backgroundColor: `rgb(${preset.rgb.join(',')})` }}
                  onClick={() => void execute(device.id, { type: 'rgb', value: preset.rgb })}
                />
              ))}
              <label className="ml-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 text-[11px] text-muted-foreground hover:text-foreground">
                <input
                  type="color"
                  className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                  value={rgbToHex(rgb)}
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
            <div className="mb-1.5 text-xs text-muted-foreground">WiZ scene</div>
            <Select
              value=""
              disabled={!online}
              onChange={(event) => {
                const sceneId = Number(event.target.value)
                if (sceneId) void execute(device.id, { type: 'scene', value: sceneId })
              }}
            >
              <option value="">Select a scene…</option>
              {WIZ_SCENES.map((name, index) => (
                <option key={`${name}-${index}`} value={index + 1}>{name}</option>
              ))}
            </Select>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
