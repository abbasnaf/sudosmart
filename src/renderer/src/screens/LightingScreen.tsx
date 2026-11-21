import { useMemo, useState } from 'react'
import { Lightbulb, Power, Search } from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { LightCard } from '@renderer/components/LightCard'
import { EmptyState } from '@renderer/components/EmptyState'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export default function LightingScreen() {
  const { devices, rooms, execute } = useDevices()
  const [filter, setFilter] = useState('')
  const lights = useMemo(() => devices.filter((d) => d.category === 'light'), [devices])
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return lights
    return lights.filter((light) => {
      const room = rooms.find((r) => r.id === light.roomId)?.name ?? ''
      return `${light.name} ${room}`.toLowerCase().includes(query)
    })
  }, [lights, rooms, filter])

  const lightsOn = lights.filter((l) => l.state.power).length

  const setAll = async (value: boolean) => {
    await Promise.allSettled(
      filtered.filter((light) => light.state.online).map((light) => execute(light.id, { type: 'power', value }))
    )
  }

  return (
    <div>
      <PageHeader
        title="Lighting"
        description={`${lights.length} light(s) · ${lightsOn} on. Power, brightness, colour and temperature.`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-[220px] pl-9"
                placeholder="Filter lights…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void setAll(false)}>
              <Power className="h-3.5 w-3.5" /> All off
            </Button>
            <Button size="sm" onClick={() => void setAll(true)}>
              <Lightbulb className="h-3.5 w-3.5" /> All on
            </Button>
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={lights.length === 0 ? 'No lights yet' : 'No matching lights'}
          description={
            lights.length === 0
              ? 'Discover WiZ bulbs on your local network or connect Home Assistant to bring in your lights.'
              : 'Try a different search term.'
          }
          icon={<Lightbulb className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((light) => (
            <LightCard key={light.id} device={light} room={rooms.find((r) => r.id === light.roomId)} />
          ))}
        </div>
      )}
    </div>
  )
}
