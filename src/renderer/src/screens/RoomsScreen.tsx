import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, DoorOpen, Lightbulb, Pencil, Plus, Power, Trash2, Users } from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { DeviceCard } from '@renderer/components/DeviceCard'
import { EmptyState } from '@renderer/components/EmptyState'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'

export default function RoomsScreen() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const { rooms, devices, createRoom, updateRoom, removeRoom, updateDevice, execute } = useDevices()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSelection, setAssignSelection] = useState<Record<string, boolean>>({})
  const [deleteOpen, setDeleteOpen] = useState(false)

  const selectedRoom = rooms.find((r) => r.id === roomId)
  const roomDevices = useMemo(() => devices.filter((d) => d.roomId === roomId), [devices, roomId])
  const roomLights = roomDevices.filter((d) => d.category === 'light')
  const roomSwitches = roomDevices.filter((d) => d.category === 'switch' || d.category === 'light')
  const lightsOn = roomLights.filter((d) => d.state.power).length

  const onCreate = async () => {
    if (!newName.trim()) return
    await createRoom({ name: newName.trim(), icon: newIcon.trim() || undefined })
    setNewName('')
    setNewIcon('')
    setCreateOpen(false)
  }

  const openEdit = () => {
    if (!selectedRoom) return
    setEditName(selectedRoom.name)
    setEditIcon(selectedRoom.icon ?? '')
    setEditOpen(true)
  }

  const onEdit = async () => {
    if (!selectedRoom || !editName.trim()) return
    await updateRoom({ id: selectedRoom.id, name: editName.trim(), icon: editIcon.trim() || undefined })
    setEditOpen(false)
  }

  const openAssign = () => {
    const selection: Record<string, boolean> = {}
    for (const device of devices) selection[device.id] = device.roomId === roomId
    setAssignSelection(selection)
    setAssignOpen(true)
  }

  const onAssign = async () => {
    if (!roomId) return
    for (const device of devices) {
      const shouldBeInRoom = !!assignSelection[device.id]
      const isInRoom = device.roomId === roomId
      if (shouldBeInRoom && !isInRoom) await updateDevice(device.id, { roomId })
      if (!shouldBeInRoom && isInRoom) await updateDevice(device.id, { roomId: null })
    }
    setAssignOpen(false)
  }

  const onDelete = async () => {
    if (!selectedRoom) return
    await removeRoom(selectedRoom.id)
    setDeleteOpen(false)
    navigate('/rooms')
  }

  const setRoomPower = async (value: boolean) => {
    await Promise.allSettled(
      roomSwitches.filter((device) => device.state.online).map((device) => execute(device.id, { type: 'power', value }))
    )
  }

  if (!roomId) {
    return (
      <div>
        <PageHeader
          title="Rooms"
          description="Organise devices by room and control them together."
          actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New room</Button>}
        />
        {rooms.length === 0 ? (
          <EmptyState
            title="No rooms yet"
            description="Create your first room to group lights and devices."
            icon={<DoorOpen className="h-5 w-5" />}
            action={<Button size="sm" onClick={() => setCreateOpen(true)}>Create room</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => {
              const devicesInRoom = devices.filter((d) => d.roomId === room.id)
              const online = devicesInRoom.filter((d) => d.state.online).length
              const on = devicesInRoom.filter((d) => d.category === 'light' && d.state.power).length
              return (
                <Card
                  key={room.id}
                  className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/30"
                  onClick={() => navigate(`/rooms/${room.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{room.icon ? `${room.icon} ` : ''}{room.name}</CardTitle>
                      <Badge variant={online > 0 ? 'success' : 'secondary'}>{online}/{devicesInRoom.length} online</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {devicesInRoom.length} devices</span>
                    <span className="inline-flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> {on} lights on</span>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        <RoomDialogs
          createOpen={createOpen}
          setCreateOpen={setCreateOpen}
          newName={newName}
          setNewName={setNewName}
          newIcon={newIcon}
          setNewIcon={setNewIcon}
          onCreate={onCreate}
        />
      </div>
    )
  }

  if (!selectedRoom) {
    return (
      <div>
        <PageHeader title="Room not found" description="This room may have been deleted." />
        <EmptyState title="Room not found" action={<Button size="sm" onClick={() => navigate('/rooms')}>Back to rooms</Button>} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/rooms')}>
          <ArrowLeft className="h-4 w-4" /> All rooms
        </Button>
      </div>
      <PageHeader
        title={`${selectedRoom.icon ? `${selectedRoom.icon} ` : ''}${selectedRoom.name}`}
        description={`${roomDevices.length} device(s) · ${roomLights.length} light(s) · ${lightsOn} on`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={openAssign}><Users className="h-3.5 w-3.5" /> Assign devices</Button>
            <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card/40 p-3">
        <div className="flex items-center gap-2 text-sm">
          <Power className="h-4 w-4 text-muted-foreground" />
          Room power
        </div>
        <Button size="sm" variant="outline" onClick={() => void setRoomPower(false)}>All off</Button>
        <Button size="sm" onClick={() => void setRoomPower(true)}>All on</Button>
        <span className="text-xs text-muted-foreground">{roomSwitches.length} controllable device(s)</span>
      </div>

      {roomDevices.length === 0 ? (
        <EmptyState
          title="No devices in this room"
          description="Assign devices to this room to control them together."
          icon={<DoorOpen className="h-5 w-5" />}
          action={<Button size="sm" onClick={openAssign}>Assign devices</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roomDevices.map((device) => (
            <DeviceCard key={device.id} device={device} room={selectedRoom} />
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
            <DialogDescription>Update the room name and optional icon.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="edit-room-name">Name</Label><Input id="edit-room-name" value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="edit-room-icon">Icon (emoji)</Label><Input id="edit-room-icon" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} placeholder="e.g. 🛋️" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => void onEdit()} disabled={!editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign devices</DialogTitle>
            <DialogDescription>Select the devices that belong in {selectedRoom.name}.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[360px] space-y-1 overflow-auto scrollbar-thin pr-1">
            {devices.map((device) => (
              <label
                key={device.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 hover:bg-secondary/50',
                  assignSelection[device.id] && 'border-primary/20 bg-primary/5'
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{device.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {device.provider === 'wiz' ? 'Philips WiZ' : 'Home Assistant'} · {rooms.find((r) => r.id === device.roomId)?.name ?? 'Unassigned'}
                  </div>
                </div>
                <Switch
                  checked={!!assignSelection[device.id]}
                  onCheckedChange={(value) => setAssignSelection((prev) => ({ ...prev, [device.id]: value }))}
                />
              </label>
            ))}
            {devices.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No devices available.</div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => void onAssign()}>Save assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedRoom.name}?</DialogTitle>
            <DialogDescription>Devices will be unassigned but not removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void onDelete()}>Delete room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RoomDialogs
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        newName={newName}
        setNewName={setNewName}
        newIcon={newIcon}
        setNewIcon={setNewIcon}
        onCreate={onCreate}
      />
    </div>
  )
}

function RoomDialogs({
  createOpen,
  setCreateOpen,
  newName,
  setNewName,
  newIcon,
  setNewIcon,
  onCreate
}: {
  createOpen: boolean
  setCreateOpen: (open: boolean) => void
  newName: string
  setNewName: (value: string) => void
  newIcon: string
  setNewIcon: (value: string) => void
  onCreate: () => Promise<void>
}) {
  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create room</DialogTitle>
          <DialogDescription>Group devices into a room for quick control.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="room-name">Name</Label>
            <Input id="room-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Living Room" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-icon">Icon (emoji)</Label>
            <Input id="room-icon" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} placeholder="e.g. 🛋️" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={() => void onCreate()} disabled={!newName.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
