import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Filter, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { DeviceCard } from '@renderer/components/DeviceCard'
import { EmptyState } from '@renderer/components/EmptyState'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { cn } from '@renderer/lib/utils'

export default function DevicesScreen() {
  const navigate = useNavigate()
  const { devices, rooms, refreshDevices } = useDevices()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [provider, setProvider] = useState('all')
  const [onlineOnly, setOnlineOnly] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return devices.filter((device) => {
      if (onlineOnly && !device.state.online) return false
      if (category !== 'all' && device.category !== category) return false
      if (provider !== 'all' && device.provider !== provider) return false
      if (!query) return true
      const room = rooms.find((r) => r.id === device.roomId)?.name ?? ''
      return `${device.name} ${device.provider} ${device.model ?? ''} ${room}`.toLowerCase().includes(query)
    })
  }, [devices, rooms, search, category, provider, onlineOnly])

  const providers = Array.from(new Set(devices.map((d) => d.provider)))

  return (
    <div>
      <PageHeader
        title="Devices"
        description="All discovered and manually added devices across your integrations."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refreshDevices()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={() => navigate('/integrations')}>
              <Search className="h-3.5 w-3.5" /> Discover
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card/40 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search devices, rooms, models…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select className="w-[140px]" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            <option value="light">Lights</option>
            <option value="switch">Switches</option>
            <option value="sensor">Sensors</option>
            <option value="cover">Covers</option>
            <option value="climate">Climate</option>
            <option value="media_player">Media</option>
            <option value="other">Other</option>
          </Select>
          <Select className="w-[150px]" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="all">All providers</option>
            {providers.map((id) => (
              <option key={id} value={id}>{id === 'ha' ? 'Home Assistant' : id === 'wiz' ? 'Philips WiZ' : id}</option>
            ))}
          </Select>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="online-only" className="cursor-pointer text-xs">Online only</Label>
            <Switch id="online-only" checked={onlineOnly} onCheckedChange={setOnlineOnly} />
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} device(s)</span>
        <span className={cn(filtered.length !== devices.length && 'text-primary')}>
          {devices.filter((d) => d.state.online).length} online
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={devices.length === 0 ? 'No devices yet' : 'No matching devices'}
          description={
            devices.length === 0
              ? 'Discover WiZ bulbs on your local network or connect Home Assistant to add devices.'
              : 'Try changing your search or filters.'
          }
          action={
            devices.length === 0 ? (
              <Button size="sm" onClick={() => navigate('/integrations')}>Open integrations</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => { setSearch(''); setCategory('all'); setProvider('all'); setOnlineOnly(false) }}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((device) => (
            <DeviceCard key={device.id} device={device} room={rooms.find((r) => r.id === device.roomId)} />
          ))}
        </div>
      )}
    </div>
  )
}
