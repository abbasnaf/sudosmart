import { useMemo, useState } from 'react'
import { Clapperboard, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import type { Device, DeviceCommand, Scene, SceneAction } from '@shared/types'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Slider } from '@renderer/components/ui/slider'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { hexToRgb, rgbToHex } from '@renderer/lib/utils'

type CommandKind = 'power_on' | 'power_off' | 'toggle' | 'brightness' | 'color_temperature' | 'rgb'

function commandKind(command: DeviceCommand): CommandKind {
  if (command.type === 'power') return command.value ? 'power_on' : 'power_off'
  if (command.type === 'toggle') return 'toggle'
  if (command.type === 'brightness') return 'brightness'
  if (command.type === 'color_temperature') return 'color_temperature'
  if (command.type === 'rgb') return 'rgb'
  return 'power_on'
}

function supportedKinds(device?: Device): CommandKind[] {
  if (!device) return ['power_on', 'power_off']
  const kinds: CommandKind[] = []
  if (device.capabilities.includes('power')) kinds.push('power_on', 'power_off', 'toggle')
  if (device.capabilities.includes('brightness')) kinds.push('brightness')
  if (device.capabilities.includes('color_temperature')) kinds.push('color_temperature')
  if (device.capabilities.includes('rgb')) kinds.push('rgb')
  return kinds.length > 0 ? kinds : ['power_on', 'power_off']
}

function commandForKind(kind: CommandKind, previous?: DeviceCommand): DeviceCommand {
  switch (kind) {
    case 'power_on':
      return { type: 'power', value: true }
    case 'power_off':
      return { type: 'power', value: false }
    case 'toggle':
      return { type: 'toggle' }
    case 'brightness':
      return { type: 'brightness', value: previous?.type === 'brightness' ? previous.value : 80 }
    case 'color_temperature':
      return { type: 'color_temperature', value: previous?.type === 'color_temperature' ? previous.value : 3000 }
    case 'rgb':
      return { type: 'rgb', value: previous?.type === 'rgb' ? previous.value : [255, 190, 120] }
  }
}

function actionSummary(action: SceneAction, devices: Device[]): string {
  const device = devices.find((d) => d.id === action.deviceId)
  const name = device?.name ?? action.deviceId
  switch (action.command.type) {
    case 'power':
      return `${name} → ${action.command.value ? 'on' : 'off'}`
    case 'brightness':
      return `${name} → ${action.command.value}%`
    case 'color_temperature':
      return `${name} → ${action.command.value}K`
    case 'rgb':
      return `${name} → colour`
    case 'scene':
      return `${name} → scene ${action.command.value}`
    case 'toggle':
      return `${name} → toggle`
    default:
      return name
  }
}

export default function ScenesScreen() {
  const { devices, scenes, createScene, updateScene, removeScene, activateScene } = useDevices()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Scene | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [actions, setActions] = useState<SceneAction[]>([])
  const [activating, setActivating] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const controllableDevices = useMemo(() => devices.filter((d) => d.capabilities.includes('power') || d.category === 'light'), [devices])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setIcon('')
    setActions([])
    setOpen(true)
  }

  const openEdit = (scene: Scene) => {
    setEditing(scene)
    setName(scene.name)
    setIcon(scene.icon ?? '')
    setActions(scene.actions.map(normalizeAction))
    setOpen(true)
  }

  const normalizeAction = (action: SceneAction): SceneAction => {
    const device = controllableDevices.find((d) => d.id === action.deviceId) ?? devices.find((d) => d.id === action.deviceId)
    const kinds = supportedKinds(device)
    const kind = commandKind(action.command)
    const nextKind = kinds.includes(kind) ? kind : kinds[0]
    return { ...action, command: commandForKind(nextKind, action.command) }
  }

  const addAction = () => {
    if (controllableDevices.length === 0) return
    const device = controllableDevices[0]
    const kinds = supportedKinds(device)
    setActions((prev) => [...prev, { deviceId: device.id, command: commandForKind(kinds[0], undefined) }])
  }

  const updateAction = (index: number, next: SceneAction) => {
    setActions((prev) => prev.map((action, i) => (i === index ? next : action)))
  }

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index))
  }

  const onSave = async () => {
    if (!name.trim()) return
    const cleanActions = actions.filter((action) => action.deviceId).map(normalizeAction)
    if (editing) {
      await updateScene({ id: editing.id, name: name.trim(), icon: icon.trim() || undefined, actions: cleanActions })
    } else {
      await createScene({ name: name.trim(), icon: icon.trim() || undefined, actions: cleanActions })
    }
    setOpen(false)
  }

  const onActivate = async (scene: Scene) => {
    setActivating(scene.id)
    setMessage(null)
    try {
      const result = await activateScene(scene.id)
      setMessage(result.ok ? `Activated “${scene.name}”.` : `Activated with ${result.errors.length} error(s): ${result.errors[0]}`)
    } finally {
      setActivating(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Scenes"
        description="Create local scenes that group device actions and activate them with one click."
        actions={<Button size="sm" onClick={openCreate} disabled={controllableDevices.length === 0}><Plus className="h-4 w-4" /> New scene</Button>}
      />

      {message ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      {scenes.length === 0 ? (
        <EmptyState
          title="No scenes yet"
          description="Build a scene to set multiple lights and devices at once — for movie night, gaming, or bedtime."
          icon={<Clapperboard className="h-5 w-5" />}
          action={
            <Button size="sm" onClick={openCreate} disabled={controllableDevices.length === 0}>
              Create your first scene
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene) => (
            <Card key={scene.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{scene.icon ? `${scene.icon} ` : ''}{scene.name}</CardTitle>
                    <CardDescription>{scene.actions.length} action(s)</CardDescription>
                  </div>
                  <Badge variant="secondary">Local</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {scene.actions.slice(0, 4).map((action, index) => (
                    <div key={index} className="truncate">• {actionSummary(action, devices)}</div>
                  ))}
                  {scene.actions.length > 4 ? <div>+{scene.actions.length - 4} more</div> : null}
                  {scene.actions.length === 0 ? <div>No actions configured.</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="flex-1" onClick={() => void onActivate(scene)} disabled={activating === scene.id || scene.actions.length === 0}>
                    <Play className="h-3.5 w-3.5" /> {activating === scene.id ? 'Activating…' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(scene)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => void removeScene(scene.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit scene' : 'Create scene'}</DialogTitle>
            <DialogDescription>Group actions across your devices. Scenes run locally through SudoSmart.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div className="space-y-1.5">
                <Label htmlFor="scene-name">Name</Label>
                <Input id="scene-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Movie night" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scene-icon">Icon</Label>
                <Input id="scene-icon" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="🎬" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Actions</Label>
                <Button size="sm" variant="outline" onClick={addAction} disabled={controllableDevices.length === 0}>
                  <Plus className="h-3.5 w-3.5" /> Add action
                </Button>
              </div>
              {actions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Add at least one action to make this scene useful.
                </div>
              ) : (
                <div className="max-h-[320px] space-y-2 overflow-auto scrollbar-thin pr-1">
                  {actions.map((action, index) => {
                    const kind = commandKind(action.command)
                    const device = controllableDevices.find((d) => d.id === action.deviceId)
                    const kinds = supportedKinds(device)
                    const activeKind = kinds.includes(kind) ? kind : kinds[0]
                    return (
                      <div key={index} className="rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            className="min-w-[180px] flex-1"
                            value={action.deviceId}
                            onChange={(event) => {
                              const nextDevice = controllableDevices.find((d) => d.id === event.target.value)
                              const nextKinds = supportedKinds(nextDevice)
                              const nextKind = nextKinds.includes(kind) ? kind : nextKinds[0]
                              updateAction(index, { deviceId: event.target.value, command: commandForKind(nextKind, action.command) })
                            }}
                          >
                            {controllableDevices.map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </Select>
                          <Select
                            className="w-[170px]"
                            value={activeKind}
                            onChange={(event) => updateAction(index, { ...action, command: commandForKind(event.target.value as CommandKind, action.command) })}
                          >
                            {kinds.includes('power_on') ? <option value="power_on">Turn on</option> : null}
                            {kinds.includes('power_off') ? <option value="power_off">Turn off</option> : null}
                            {kinds.includes('toggle') ? <option value="toggle">Toggle</option> : null}
                            {kinds.includes('brightness') ? <option value="brightness">Brightness</option> : null}
                            {kinds.includes('color_temperature') ? <option value="color_temperature">Colour temp</option> : null}
                            {kinds.includes('rgb') ? <option value="rgb">Colour</option> : null}
                          </Select>
                          <Button size="sm" variant="ghost" onClick={() => removeAction(index)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                        {kind === 'brightness' ? (
                          <div className="mt-3 flex items-center gap-3">
                            <Slider
                              value={[action.command.type === 'brightness' ? action.command.value : 80]}
                              min={1}
                              max={100}
                              step={1}
                              onValueChange={([value]) => updateAction(index, { ...action, command: { type: 'brightness', value } })}
                            />
                            <span className="w-10 text-right text-xs text-muted-foreground">
                              {action.command.type === 'brightness' ? action.command.value : 80}%
                            </span>
                          </div>
                        ) : null}
                        {kind === 'color_temperature' ? (
                          <div className="mt-3 flex items-center gap-3">
                            <Slider
                              value={[action.command.type === 'color_temperature' ? action.command.value : 3000]}
                              min={2200}
                              max={6500}
                              step={100}
                              onValueChange={([value]) => updateAction(index, { ...action, command: { type: 'color_temperature', value } })}
                            />
                            <span className="w-14 text-right text-xs text-muted-foreground">
                              {action.command.type === 'color_temperature' ? action.command.value : 3000}K
                            </span>
                          </div>
                        ) : null}
                        {kind === 'rgb' ? (
                          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                            <input
                              type="color"
                              className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                              value={rgbToHex(action.command.type === 'rgb' ? action.command.value : [255, 190, 120])}
                              onChange={(event) => updateAction(index, { ...action, command: { type: 'rgb', value: hexToRgb(event.target.value) } })}
                            />
                            Choose a colour
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void onSave()} disabled={!name.trim()}>{editing ? 'Save scene' : 'Create scene'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
