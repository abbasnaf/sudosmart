import { useEffect, useState } from 'react'
import { Keyboard, Monitor, Network, Power, Save, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useDevices } from '@renderer/context/DeviceContext'
import { PageHeader } from '@renderer/components/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Badge } from '@renderer/components/ui/badge'
import { Separator } from '@renderer/components/ui/separator'

export default function SettingsScreen() {
  const { settings, updateSettings, networkInterfaces, refreshInterfaces, devices, rooms, scenes } = useDevices()
  const [wolMac, setWolMac] = useState('')
  const [wolMessage, setWolMessage] = useState<string | null>(null)
  const [discoveryTimeout, setDiscoveryTimeout] = useState('3000')
  const [shortcutToggle, setShortcutToggle] = useState('')
  const [shortcutDashboard, setShortcutDashboard] = useState('')
  const [shortcutScene, setShortcutScene] = useState('')

  useEffect(() => {
    if (!settings) return
    setDiscoveryTimeout(String(settings.discoveryTimeoutMs))
    setShortcutToggle(settings.shortcuts.toggleLight)
    setShortcutDashboard(settings.shortcuts.openDashboard)
    setShortcutScene(settings.shortcuts.activateGamingScene)
  }, [settings])

  if (!settings) {
    return <div className="text-sm text-muted-foreground">Loading settings…</div>
  }

  const externalInterfaces = networkInterfaces.filter((i) => !i.internal)
  const selectedInterfaces = settings.discoveryInterfaces

  const toggleInterface = (address: string) => {
    const next = selectedInterfaces.includes(address)
      ? selectedInterfaces.filter((value) => value !== address)
      : [...selectedInterfaces, address]
    void updateSettings({ discoveryInterfaces: next })
  }

  const saveShortcuts = async () => {
    await updateSettings({
      shortcuts: {
        toggleLight: shortcutToggle.trim(),
        openDashboard: shortcutDashboard.trim(),
        activateGamingScene: shortcutScene.trim()
      }
    })
  }

  const saveDiscovery = async () => {
    await updateSettings({ discoveryTimeoutMs: Math.max(500, Number(discoveryTimeout) || 3000) })
  }

  const sendWol = async () => {
    setWolMessage(null)
    try {
      await window.api.app.wakeOnLan({ mac: wolMac })
      setWolMessage('Magic packet sent.')
    } catch (error) {
      setWolMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Application preferences, Windows integration and local network discovery."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              <CardTitle>Appearance</CardTitle>
            </div>
            <CardDescription>Dark by default, with light and system themes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="theme">Theme</Label>
              <Select id="theme" value={settings.theme} onChange={(event) => void updateSettings({ theme: event.target.value as 'dark' | 'light' | 'system' })}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">Follow Windows</option>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Launch on Windows startup</div>
                <div className="text-xs text-muted-foreground">Start SudoSmart when you sign in.</div>
              </div>
              <Switch checked={settings.launchOnStartup} onCheckedChange={(value) => void updateSettings({ launchOnStartup: value })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Minimise to tray on close</div>
                <div className="text-xs text-muted-foreground">Keep running in the system tray.</div>
              </div>
              <Switch checked={settings.minimizeToTray} onCheckedChange={(value) => void updateSettings({ minimizeToTray: value })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Windows notifications</div>
                <div className="text-xs text-muted-foreground">Allow native notifications for app events.</div>
              </div>
              <Switch checked={settings.notificationsEnabled} onCheckedChange={(value) => void updateSettings({ notificationsEnabled: value })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Global shortcuts</div>
                <div className="text-xs text-muted-foreground">Enable system-wide keyboard shortcuts.</div>
              </div>
              <Switch checked={settings.globalShortcutsEnabled} onCheckedChange={(value) => void updateSettings({ globalShortcutsEnabled: value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              <CardTitle>Global shortcuts</CardTitle>
            </div>
            <CardDescription>Electron accelerator syntax, e.g. CommandOrControl+Alt+L.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-toggle">Toggle selected light</Label>
              <Input id="shortcut-toggle" value={shortcutToggle} onChange={(event) => setShortcutToggle(event.target.value)} onBlur={() => void saveShortcuts()} placeholder="CommandOrControl+Alt+L" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-dashboard">Open dashboard</Label>
              <Input id="shortcut-dashboard" value={shortcutDashboard} onChange={(event) => setShortcutDashboard(event.target.value)} onBlur={() => void saveShortcuts()} placeholder="CommandOrControl+Alt+D" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-scene">Activate “Gaming” scene</Label>
              <Input id="shortcut-scene" value={shortcutScene} onChange={(event) => setShortcutScene(event.target.value)} onBlur={() => void saveShortcuts()} placeholder="CommandOrControl+Alt+G" />
            </div>
            <p className="text-xs text-muted-foreground">Shortcuts are registered only while global shortcuts are enabled. Conflicting shortcuts are ignored.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              <CardTitle>Network discovery</CardTitle>
            </div>
            <CardDescription>Limit discovery to selected local interfaces. No external ranges are scanned.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Interfaces</Label>
              {externalInterfaces.length === 0 ? (
                <div className="text-sm text-muted-foreground">No external IPv4 interfaces found.</div>
              ) : (
                externalInterfaces.map((iface) => (
                  <label key={`${iface.name}-${iface.address}`} className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/40">
                    <span>
                      <span className="font-medium">{iface.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{iface.address}</span>
                    </span>
                    <Switch checked={selectedInterfaces.includes(iface.address)} onCheckedChange={() => toggleInterface(iface.address)} />
                  </label>
                ))
              )}
              <p className="text-xs text-muted-foreground">If none are selected, all non-internal interfaces are used.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discovery-timeout">Discovery timeout (ms)</Label>
              <div className="flex gap-2">
                <Input id="discovery-timeout" type="number" min={500} step={500} value={discoveryTimeout} onChange={(event) => setDiscoveryTimeout(event.target.value)} />
                <Button variant="outline" onClick={() => void saveDiscovery()}><Save className="h-3.5 w-3.5" /> Save</Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshInterfaces()}>
              <Zap className="h-3.5 w-3.5" /> Refresh interfaces
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-primary" />
              <CardTitle>Wake-on-LAN</CardTitle>
            </div>
            <CardDescription>Send a magic packet to a device on your local network.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wol-mac">MAC address</Label>
              <div className="flex gap-2">
                <Input id="wol-mac" value={wolMac} onChange={(event) => setWolMac(event.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
                <Button onClick={() => void sendWol()} disabled={!wolMac.trim()}>Send</Button>
              </div>
            </div>
            {wolMessage ? <div className="text-xs text-muted-foreground">{wolMessage}</div> : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <CardTitle>About & security</CardTitle>
            </div>
            <CardDescription>Local-first architecture with no mandatory cloud dependency.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-secondary/40 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Devices</div>
                <div className="mt-1 text-2xl font-semibold">{devices.length}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Rooms</div>
                <div className="mt-1 text-2xl font-semibold">{rooms.length}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Scenes</div>
                <div className="mt-1 text-2xl font-semibold">{scenes.length}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline"><Sparkles className="mr-1 h-3 w-3" /> SudoSmart 0.1.0</Badge>
              <Badge variant="outline">Electron + React + TypeScript</Badge>
              <Badge variant="outline">SQLite preferences</Badge>
              <Badge variant="outline">Secure token storage</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Device credentials and tokens stay in the Electron main process. The renderer communicates through a validated
              preload bridge with context isolation enabled. Local protocols are used wherever supported; Home Assistant is optional.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
