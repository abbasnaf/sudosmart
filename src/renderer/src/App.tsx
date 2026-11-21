import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Clapperboard,
  DoorOpen,
  Home,
  LayoutDashboard,
  Lightbulb,
  Minus,
  PlugZap,
  Settings,
  Square,
  X
} from 'lucide-react'
import { DeviceProvider, useDevices } from './context/DeviceContext'
import OverviewScreen from './screens/OverviewScreen'
import RoomsScreen from './screens/RoomsScreen'
import DevicesScreen from './screens/DevicesScreen'
import DeviceDetailScreen from './screens/DeviceDetailScreen'
import LightingScreen from './screens/LightingScreen'
import ScenesScreen from './screens/ScenesScreen'
import IntegrationsScreen from './screens/IntegrationsScreen'
import MonitoringScreen from './screens/MonitoringScreen'
import SettingsScreen from './screens/SettingsScreen'
import { cn } from './lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/rooms', label: 'Rooms', icon: DoorOpen },
  { to: '/devices', label: 'Devices', icon: PlugZap },
  { to: '/lighting', label: 'Lighting', icon: Lightbulb },
  { to: '/scenes', label: 'Scenes', icon: Clapperboard },
  { to: '/integrations', label: 'Integrations', icon: Activity },
  { to: '/monitoring', label: 'Monitoring', icon: Activity }
]

function ThemeSync() {
  const { settings } = useDevices()
  useEffect(() => {
    const theme = settings?.theme ?? 'dark'
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.setAttribute('data-theme', resolved)
    }
    apply()
    if (theme !== 'system') return
    const onChange = () => apply()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [settings?.theme])
  return null
}

function NavigationListener() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!window.api) return
    return window.api.app.onNavigate((path) => navigate(path))
  }, [navigate])
  return null
}

function TitleBar() {
  const { statuses } = useDevices()
  const wiz = statuses.find((s) => s.provider === 'wiz')
  const ha = statuses.find((s) => s.provider === 'ha')
  return (
    <header className="drag flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Home className="h-3.5 w-3.5" />
          SudoSmart Control Centre
        </div>
        <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
          <StatusDot label="WiZ" state={wiz?.state} />
          <StatusDot label="HA" state={ha?.state} />
        </div>
      </div>
      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          onClick={() => window.api.window.minimize()}
          className="flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => window.api.window.maximize()}
          className="flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Maximize"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.api.window.close()}
          className="flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

function StatusDot({ label, state }: { label: string; state?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state === 'connected'
            ? 'bg-[hsl(var(--ok))]'
            : state === 'error'
              ? 'bg-destructive'
              : state === 'connecting'
                ? 'animate-pulse-soft bg-[hsl(var(--warn))]'
                : 'bg-muted-foreground/50'
        )}
      />
      {label}
    </span>
  )
}

function Sidebar() {
  const { statuses, devices } = useDevices()
  const online = devices.filter((d) => d.state.online).length
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-border/70 bg-card/40 px-3 py-4">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-300 text-white shadow-lg shadow-primary/20">
          <Home className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">SudoSmart</div>
          <div className="text-[11px] text-muted-foreground">Control Centre</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
                isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
        <div className="rounded-lg bg-secondary/40 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Devices online</span>
            <span className="font-semibold">{online}/{devices.length}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: devices.length ? `${(online / devices.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
              isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
            )
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
        <div className="px-1 text-[10px] text-muted-foreground/70">
          {statuses.filter((s) => s.state === 'connected').length} integration(s) connected
        </div>
      </div>
    </aside>
  )
}

function ErrorToast() {
  const { error } = useDevices()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (error) setVisible(true)
  }, [error])
  if (!error || !visible) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-soft backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex-1">{error}</div>
        <button type="button" onClick={() => setVisible(false)} className="text-destructive/70 hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <div className="text-sm">Loading control centre…</div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="h-full animate-fade-in overflow-auto scrollbar-thin px-6 py-6 lg:px-8">
      <Routes>
        <Route path="/" element={<OverviewScreen />} />
        <Route path="/rooms" element={<RoomsScreen />} />
        <Route path="/rooms/:roomId" element={<RoomsScreen />} />
        <Route path="/devices" element={<DevicesScreen />} />
        <Route path="/devices/:deviceId" element={<DeviceDetailScreen />} />
        <Route path="/lighting" element={<LightingScreen />} />
        <Route path="/scenes" element={<ScenesScreen />} />
        <Route path="/integrations" element={<IntegrationsScreen />} />
        <Route path="/monitoring" element={<MonitoringScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </div>
  )
}

function Shell() {
  const { loading } = useDevices()
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        {loading ? <LoadingScreen /> : <AppRoutes />}
      </div>
      <ErrorToast />
    </div>
  )
}

export default function App() {
  return (
    <DeviceProvider>
      <ThemeSync />
      <NavigationListener />
      <Shell />
    </DeviceProvider>
  )
}
