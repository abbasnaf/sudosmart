import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  Cpu,
  Lightbulb,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Trash2,
  Wifi
} from 'lucide-react'
import type { DiscoveredDevice, IntegrationInfo, ProviderId } from '@shared/types'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { IntegrationStatusBadge } from '@renderer/components/StatusBadge'
import { EmptyState } from '@renderer/components/EmptyState'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
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

const PROVIDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  wiz: Lightbulb,
  ha: Server,
  mqtt: Radio,
  hue: Lightbulb,
  shelly: Cpu,
  matter: Cpu,
  kasa: Wifi,
  tuya: Wifi
}

export default function IntegrationsScreen() {
  const {
    integrations,
    statuses,
    devices,
    networkInterfaces,
    settings,
    discover,
    addDiscoveredDevice,
    saveIntegrationConfig,
    connectIntegration,
    disconnectIntegration,
    getIntegrationConfig,
    testIntegration,
    removeIntegration,
    updateSettings
  } = useDevices()

  const [wizOpen, setWizOpen] = useState(false)
  const [wizHosts, setWizHosts] = useState('')
  const [wizPollInterval, setWizPollInterval] = useState('5000')
  const [wizInterfaces, setWizInterfaces] = useState<string[]>([])
  const [wizDiscoveryOpen, setWizDiscoveryOpen] = useState(false)
  const [wizDiscovery, setWizDiscovery] = useState<DiscoveredDevice[]>([])
  const [discoveringWiz, setDiscoveringWiz] = useState(false)
  const [wizMessage, setWizMessage] = useState<string | null>(null)

  const [haOpen, setHaOpen] = useState(false)
  const [haUrl, setHaUrl] = useState('')
  const [haToken, setHaToken] = useState('')
  const [haHasSecret, setHaHasSecret] = useState(false)
  const [haTest, setHaTest] = useState<{ ok: boolean; message: string; version?: string } | null>(null)
  const [haSaving, setHaSaving] = useState(false)
  const [haDiscoveryOpen, setHaDiscoveryOpen] = useState(false)
  const [haDiscovery, setHaDiscovery] = useState<DiscoveredDevice[]>([])
  const [discoveringHa, setDiscoveringHa] = useState(false)
  const [addingAllHa, setAddingAllHa] = useState(false)
  const [haMessage, setHaMessage] = useState<string | null>(null)

  const [removeProvider, setRemoveProvider] = useState<ProviderId | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  const availableInterfaces = useMemo(() => networkInterfaces.filter((i) => !i.internal), [networkInterfaces])

  useEffect(() => {
    if (settings?.discoveryInterfaces?.length) setWizInterfaces(settings.discoveryInterfaces)
  }, [settings?.discoveryInterfaces])

  const openWizSettings = async () => {
    const { config } = await getIntegrationConfig('wiz')
    setWizHosts(Array.isArray(config.manualHosts) ? (config.manualHosts as string[]).join('\n') : '')
    setWizPollInterval(String(config.pollIntervalMs ?? 5000))
    setWizInterfaces(
      Array.isArray(config.discoveryInterfaces) && (config.discoveryInterfaces as string[]).length
        ? (config.discoveryInterfaces as string[])
        : settings?.discoveryInterfaces ?? []
    )
    setWizMessage(null)
    setWizOpen(true)
  }

  const saveWizSettings = async () => {
    const manualHosts = wizHosts.split('\n').map((line) => line.trim()).filter(Boolean)
    const invalidHost = manualHosts.find((host) => !/^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+)$/.test(host))
    if (invalidHost) {
      setWizMessage(`Invalid manual host: "${invalidHost}". Use an IPv4 address or hostname.`)
      return
    }
    const pollIntervalMs = Math.max(2000, Number(wizPollInterval) || 5000)
    await saveIntegrationConfig({
      provider: 'wiz',
      config: { manualHosts, pollIntervalMs, discoveryInterfaces: wizInterfaces }
    })
    await updateSettings({ discoveryInterfaces: wizInterfaces })
    setWizMessage('WiZ settings saved.')
    setWizOpen(false)
  }

  const runWizDiscovery = async () => {
    setDiscoveringWiz(true)
    setWizMessage(null)
    try {
      const result = await discover('wiz')
      setWizDiscovery(result.devices)
      setWizDiscoveryOpen(true)
      if (result.status.state !== 'connected') {
        setWizMessage('WiZ is disconnected. Reconnect the integration and try again.')
      } else if (result.devices.length === 0) {
        setWizMessage('No WiZ devices responded. Check that the bulb is on the same LAN and try a manual IP.')
      }
    } catch (error) {
      setWizMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setDiscoveringWiz(false)
    }
  }

  const addWizDevice = async (device: DiscoveredDevice) => {
    setAddingId(device.providerDeviceId)
    try {
      await addDiscoveredDevice(device)
      setWizDiscovery((prev) =>
        prev.map((d) => (d.providerDeviceId === device.providerDeviceId ? { ...d, alreadyAdded: true } : d))
      )
    } finally {
      setAddingId(null)
    }
  }

  const openHaSettings = async () => {
    const { config, hasSecret } = await getIntegrationConfig('ha')
    setHaUrl(typeof config.url === 'string' ? config.url : '')
    setHaToken('')
    setHaHasSecret(hasSecret)
    setHaTest(null)
    setHaMessage(null)
    setHaOpen(true)
  }

  const saveHaSettings = async () => {
    if (!haUrl.trim()) return
    setHaSaving(true)
    setHaMessage(null)
    const providedToken = haToken.trim().length > 0
    try {
      await saveIntegrationConfig({
        provider: 'ha',
        config: { url: haUrl.trim().replace(/\/+$/, '') },
        secret: providedToken ? haToken.trim() : undefined
      })
      setHaHasSecret((previous) => previous || providedToken)
      setHaToken('')
      setHaMessage('Home Assistant settings saved.')
      setHaOpen(false)
    } finally {
      setHaSaving(false)
    }
  }

  const runHaTest = async () => {
    setHaTest(null)
    const result = await testIntegration({ provider: 'ha', config: { url: haUrl.trim() }, secret: haToken.trim() || undefined })
    setHaTest(result)
  }

  const runHaDiscovery = async () => {
    setDiscoveringHa(true)
    setHaMessage(null)
    try {
      const result = await discover('ha')
      setHaDiscovery(result.devices)
      setHaDiscoveryOpen(true)
      if (result.devices.length === 0) setHaMessage('No entities returned. Check the Home Assistant connection.')
    } catch (error) {
      setHaMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setDiscoveringHa(false)
    }
  }

  const addHaDevice = async (device: DiscoveredDevice) => {
    setAddingId(device.providerDeviceId)
    try {
      await addDiscoveredDevice(device)
      setHaDiscovery((prev) =>
        prev.map((d) => (d.providerDeviceId === device.providerDeviceId ? { ...d, alreadyAdded: true } : d))
      )
    } finally {
      setAddingId(null)
    }
  }

  const addAllHaDevices = async () => {
    setAddingAllHa(true)
    try {
      for (const device of haDiscovery.filter((d) => !d.alreadyAdded)) {
        try {
          await addDiscoveredDevice(device)
          setHaDiscovery((prev) =>
            prev.map((d) => (d.providerDeviceId === device.providerDeviceId ? { ...d, alreadyAdded: true } : d))
          )
        } catch {
          // continue adding remaining devices
        }
      }
    } finally {
      setAddingAllHa(false)
    }
  }

  const confirmRemove = async () => {
    if (!removeProvider) return
    await removeIntegration(removeProvider)
    setRemoveProvider(null)
  }

  const renderIntegration = (integration: IntegrationInfo) => {
    const status = statuses.find((s) => s.provider === integration.provider)
    const Icon = PROVIDER_ICONS[integration.provider] ?? Activity
    const count = devices.filter((d) => d.provider === integration.provider).length
    const connected = status?.state === 'connected'
    const isWiz = integration.provider === 'wiz'
    const isHa = integration.provider === 'ha'

    return (
      <Card key={integration.provider} className={cn('flex flex-col', !integration.available && 'opacity-60')}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl border', connected ? 'border-primary/25 bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground')}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">{integration.name}</CardTitle>
                <CardDescription className="mt-0.5">{count} device(s)</CardDescription>
              </div>
            </div>
            {integration.available ? <IntegrationStatusBadge status={status} /> : <Badge variant="outline">Planned</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{integration.description}</p>
            {status?.message ? <p className="mt-2 text-xs text-muted-foreground/80">{status.message}</p> : null}
          </div>
          {integration.available ? (
            <div className="flex flex-wrap items-center gap-2">
              {isWiz ? (
                <>
                  {connected ? (
                    <Button size="sm" onClick={() => void runWizDiscovery()} disabled={discoveringWiz}>
                      <RefreshCw className={cn('h-3.5 w-3.5', discoveringWiz && 'animate-spin')} /> {discoveringWiz ? 'Scanning…' : 'Discover'}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void connectIntegration('wiz')}>
                      <RefreshCw className="h-3.5 w-3.5" /> Reconnect
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void openWizSettings()}>
                    <Settings className="h-3.5 w-3.5" /> Settings
                  </Button>
                </>
              ) : null}
              {isHa ? (
                <>
                  <Button size="sm" onClick={() => void openHaSettings()}>
                    <Settings className="h-3.5 w-3.5" /> Configure
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void runHaDiscovery()} disabled={!connected || discoveringHa}>
                    <RefreshCw className={cn('h-3.5 w-3.5', discoveringHa && 'animate-spin')} /> Discover
                  </Button>
                  {connected ? (
                    <Button size="sm" variant="outline" onClick={() => void disconnectIntegration('ha')}>Disconnect</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void connectIntegration('ha')}>Connect</Button>
                  )}
                </>
              ) : null}
              {isWiz ? (
                <Badge variant="outline">Built-in</Badge>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRemoveProvider(integration.provider)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">This integration is part of the roadmap and is not enabled in this build.</div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Local-first device integrations. Home Assistant is optional; WiZ works directly over your LAN."
        actions={
          <Button size="sm" variant="outline" onClick={() => void runWizDiscovery()} disabled={discoveringWiz}>
            <RefreshCw className={cn('h-3.5 w-3.5', discoveringWiz && 'animate-spin')} /> Scan for WiZ bulbs
          </Button>
        }
      />

      {wizMessage ? (
        <div className="mb-4 rounded-lg border border-border bg-card/60 px-4 py-2 text-sm text-muted-foreground">{wizMessage}</div>
      ) : null}
      {haMessage ? (
        <div className="mb-4 rounded-lg border border-border bg-card/60 px-4 py-2 text-sm text-muted-foreground">{haMessage}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map(renderIntegration)}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">How discovery works</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground"><Wifi className="h-4 w-4 text-primary" /> Local network only</div>
              Discovery is limited to the interfaces you select. SudoSmart does not scan arbitrary external ranges.
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground"><Check className="h-4 w-4 text-primary" /> Real hardware</div>
              Devices are controlled through their local protocols. There are no mock devices in production paths.
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground"><Plus className="h-4 w-4 text-primary" /> Manual fallback</div>
              If multicast or discovery is blocked, add a WiZ bulb by IP address in the WiZ settings.
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={wizOpen} onOpenChange={setWizOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Philips WiZ settings</DialogTitle>
            <DialogDescription>Configure discovery interfaces, manual IPs and polling.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Discovery interfaces</Label>
              <div className="space-y-1.5">
                {availableInterfaces.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No external IPv4 interfaces found.</div>
                ) : (
                  availableInterfaces.map((iface) => (
                    <label key={`${iface.name}-${iface.address}`} className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/40">
                      <span>
                        <span className="font-medium">{iface.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{iface.address}</span>
                      </span>
                      <Switch
                        checked={wizInterfaces.includes(iface.address) || wizInterfaces.includes(iface.name)}
                        onCheckedChange={(value) =>
                          setWizInterfaces((prev) => value ? [...prev, iface.address] : prev.filter((v) => v !== iface.address && v !== iface.name))
                        }
                      />
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">Leave all disabled to use every non-internal IPv4 interface.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-hosts">Manual IP addresses (one per line)</Label>
              <textarea
                id="wiz-hosts"
                className="min-h-[80px] w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={wizHosts}
                onChange={(event) => setWizHosts(event.target.value)}
                placeholder="192.168.1.50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-poll">Poll interval (ms)</Label>
              <Input id="wiz-poll" type="number" min={2000} step={500} value={wizPollInterval} onChange={(event) => setWizPollInterval(event.target.value)} />
              <p className="text-xs text-muted-foreground">WiZ state is refreshed over UDP. Lower values update faster but use more network traffic.</p>
            </div>
            {wizMessage ? <div className="text-xs text-muted-foreground">{wizMessage}</div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWizOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveWizSettings()}>Save settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wizDiscoveryOpen} onOpenChange={setWizDiscoveryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Discovered WiZ devices</DialogTitle>
            <DialogDescription>Add bulbs to SudoSmart. You can rename and assign rooms afterwards.</DialogDescription>
          </DialogHeader>
          {wizDiscovery.length === 0 ? (
            <EmptyState title="No bulbs found" description="Check the bulb is powered on and on the same network, or add its IP manually in WiZ settings." icon={<Lightbulb className="h-5 w-5" />} />
          ) : (
            <div className="max-h-[380px] space-y-2 overflow-auto scrollbar-thin pr-1">
              {wizDiscovery.map((device) => (
                <div key={device.providerDeviceId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Lightbulb className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{device.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{device.model} · {device.address ?? 'unknown IP'} · {device.providerDeviceId}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {device.capabilities.map((cap) => <Badge key={cap} variant="outline" className="text-[10px] capitalize">{cap.replace('_', ' ')}</Badge>)}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" disabled={device.alreadyAdded || addingId === device.providerDeviceId} onClick={() => void addWizDevice(device)}>
                    {device.alreadyAdded ? <><Check className="h-3.5 w-3.5" /> Added</> : addingId === device.providerDeviceId ? 'Adding…' : <><Plus className="h-3.5 w-3.5" /> Add</>}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWizDiscoveryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={haOpen} onOpenChange={setHaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Home Assistant connection</DialogTitle>
            <DialogDescription>Optional. Connect to a local Home Assistant instance to bring in entities and advanced automations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ha-url">Home Assistant URL</Label>
              <Input id="ha-url" value={haUrl} onChange={(event) => setHaUrl(event.target.value)} placeholder="http://homeassistant.local:8123" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ha-token">Long-lived access token {haHasSecret ? <Badge variant="success" className="ml-2">Saved</Badge> : null}</Label>
              <Input id="ha-token" type="password" value={haToken} onChange={(event) => setHaToken(event.target.value)} placeholder={haHasSecret ? 'Enter a new token to replace the saved one' : 'Paste token'} />
              <p className="text-xs text-muted-foreground">Tokens are encrypted with Windows secure storage in the Electron main process. They are never sent to the UI.</p>
            </div>
            {haTest ? (
              <div className={cn('rounded-lg border px-3 py-2 text-sm', haTest.ok ? 'border-[hsl(var(--ok)/0.3)] bg-[hsl(var(--ok)/0.08)] text-[hsl(var(--ok))]' : 'border-destructive/30 bg-destructive/10 text-destructive')}>
                {haTest.ok ? 'Connected' : 'Failed'} — {haTest.message}{haTest.version ? ` (HA ${haTest.version})` : ''}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => void runHaTest()} disabled={!haUrl.trim() || (!haToken.trim() && !haHasSecret)}>Test connection</Button>
            <Button onClick={() => void saveHaSettings()} disabled={haSaving || !haUrl.trim()}>{haSaving ? 'Saving…' : 'Save & connect'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={haDiscoveryOpen} onOpenChange={setHaDiscoveryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Home Assistant entities</DialogTitle>
            <DialogDescription>Choose the entities to add to SudoSmart. Scenes and automations stay in Home Assistant.</DialogDescription>
          </DialogHeader>
          {haDiscovery.length === 0 ? (
            <EmptyState title="No entities found" description="Make sure Home Assistant is connected and exposes lights, switches or sensors." icon={<Server className="h-5 w-5" />} />
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-auto scrollbar-thin pr-1">
              {haDiscovery.map((device) => (
                <div key={device.providerDeviceId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Server className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{device.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{device.providerDeviceId} · {device.category}</div>
                    </div>
                  </div>
                  <Button size="sm" disabled={device.alreadyAdded || addingId === device.providerDeviceId} onClick={() => void addHaDevice(device)}>
                    {device.alreadyAdded ? <><Check className="h-3.5 w-3.5" /> Added</> : addingId === device.providerDeviceId ? 'Adding…' : <><Plus className="h-3.5 w-3.5" /> Add</>}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHaDiscoveryOpen(false)}>Close</Button>
            <Button onClick={() => void addAllHaDevices()} disabled={haDiscovery.length === 0 || addingAllHa}>
              {addingAllHa ? 'Adding…' : 'Add all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeProvider} onOpenChange={(open) => !open && setRemoveProvider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove integration?</DialogTitle>
            <DialogDescription>
              Removing this integration deletes its saved configuration and removes its devices from SudoSmart. The devices themselves are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveProvider(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmRemove()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
