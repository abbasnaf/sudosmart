# SudoSmart Control Centre

A production-oriented Windows smart home control centre built with **Electron**, **React**, **TypeScript**, **Vite**, and a local **Node.js** backend. SudoSmart is **standalone-first** and **local-network-first**: it can control supported devices directly over your LAN without requiring Home Assistant, cloud accounts, or an internet connection for local integrations.

> **Status:** active development. The Electron foundation and Philips WiZ local integration are implemented. Real WiZ hardware validation is required before moving to the next integration phase.

## Core Principles

- **No mandatory Home Assistant.** Home Assistant is an optional integration, not a dependency.
- **Local device control first.** Use manufacturer/local protocols wherever supported.
- **No mock devices in production paths.** Device cards, commands, and state come from real integrations.
- **Provider-based architecture.** The renderer talks to a unified device model; protocol details stay in main-process providers.
- **Secure by default.** Tokens/credentials stay in the Electron main process and are stored via OS-backed secure storage.
- **Graceful degradation.** The app should remain usable when an individual integration is unavailable.

## Current Features

### Application foundation

- Electron desktop shell with frameless window, custom title bar, and window controls.
- Secure preload bridge using `contextBridge`; renderer Node integration disabled and context isolation enabled.
- Typed IPC channels with main-process input validation.
- SQLite persistence via `sql.js` (stored in Electron user data).
- Windows integration: system tray, minimise-to-tray, launch on startup, native notifications, global shortcuts, Wake-on-LAN.

### Unified device model

- Common device shape: id, name, manufacturer, model, provider, category, room, favourite, capabilities, state, last-seen, address/config.
- Capability-driven UI: controls are only shown when a device reports support (power, brightness, RGB, colour temperature, scene, etc.).
- Rooms, favourites, and local scenes persisted in SQLite.

### Philips WiZ (Phase 1, local LAN)

- Direct local UDP communication on port **38899**.
- Discovery via `getPilot` broadcast on selected local IPv4 interfaces, plus `255.255.255.255` and optional manual IPs.
- Power, brightness, RGB colour, colour temperature, and WiZ scene commands via `setPilot`.
- Device identification/capability hints via `getSystemConfig` and pilot fields.
- Live state updates via polling (configurable interval, default 5s) and best-effort `syncPilot` listener on port **38900**.
- No cloud dependency.

### Home Assistant (optional)

- Optional local Home Assistant connection with long-lived access token.
- REST connection test and WebSocket real-time entity subscription.
- Supported HA entities mapped into the unified device model: lights, switches, fans, covers, climate, media players, sensors, binary sensors.
- HA can be connected/disconnected/removed without affecting direct WiZ devices.

### UI screens

- **Overview** - device/room/integration summary, favourites, quick lighting.
- **Rooms** - create/edit/delete rooms, assign devices, room power controls.
- **Devices** - searchable/filterable device grid and device detail controls.
- **Lighting** - dedicated lighting controls and room/light grouping.
- **Scenes** - local SudoSmart scenes (actions across devices).
- **Integrations** - configure/discover/connect integrations; planned integrations shown as disabled roadmap items.
- **Monitoring** - integration/device availability status.
- **Settings** - theme, startup/tray/notifications, shortcuts, discovery interfaces/timeout, Wake-on-LAN.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Renderer | React 18, TypeScript, Vite |
| Styling/UI | Tailwind CSS, shadcn/ui-style primitives, Radix UI, Lucide icons |
| Main process | Node.js, TypeScript |
| Local database | SQLite via `sql.js` (WASM) |
| Secure secrets | Electron `safeStorage` |
| HA integration | `home-assistant-js-websocket`, REST fetch, WebSocket |
| WiZ integration | Node `dgram` UDP (local LAN) |

## Project Structure

```text
resources/                 # Tray/app icons
scripts/
  wiz-probe.mjs            # Real-hardware WiZ probe (LAN only, opt-in commands)
  wiz-protocol-test.mjs    # Test-only UDP protocol harness (no app mock devices)
src/
  main/
    db.ts                  # sql.js init/persistence
    ipc.ts                 # Validated IPC handlers
    repositories.ts        # SQLite CRUD for devices/rooms/scenes/integrations
    secureStore.ts         # safeStorage-backed secret storage
    settings.ts            # App settings persistence
    integrations/
      manager.ts           # Provider lifecycle, state cache, polling, scenes
      types.ts             # Provider contract
      wiz/provider.ts      # Philips WiZ UDP provider
      ha/provider.ts       # Optional Home Assistant provider
    ha/                    # HA client/config helpers
  preload/
    index.ts               # contextBridge API exposed as window.api
    index.d.ts             # Renderer API typings
  renderer/
    src/
      components/          # UI primitives and device cards
      context/             # DeviceContext (renderer state/actions)
      screens/             # App screens
      styles/global.css    # Tailwind + theme tokens
  shared/
    device.ts              # Unified device/capability/command types
    ha.ts                  # HA types
    types.ts               # App settings, IPC channels, shared exports
```

## Getting Started

### Prerequisites

- Windows 10/11
- Node.js 20+ (Node 22/24 also work; native modules are avoided)
- For WiZ: at least one Philips WiZ bulb on the same local network
- For Home Assistant (optional): a running HA instance and a long-lived access token

### Install

```powershell
npm install --ignore-scripts --no-audit --no-fund
```

> `--ignore-scripts` is recommended in constrained environments because `electron-builder install-app-deps` may attempt native operations. This project uses `sql.js` (WASM) specifically to avoid native SQLite build tool requirements.

If the Electron binary is missing after install, download it explicitly:

```powershell
node node_modules/electron/install.js
```

### Development

```powershell
npm run dev
```

### Typecheck

```powershell
npm run typecheck
# or individually:
npm run typecheck:node
npm run typecheck:web
```

### Build

```powershell
npm run build
```

### Package for Windows

```powershell
npm run dist
```

## Philips WiZ Setup & Validation

SudoSmart discovers WiZ devices by sending `getPilot` over UDP to the broadcast address of selected local IPv4 interfaces. Discovery is limited to explicitly selected interfaces (or all non-internal IPv4 interfaces if none are selected). It does **not** scan arbitrary external IP ranges.

### In the app

1. Open **Integrations**.
2. In **Philips WiZ**, click **Settings**.
3. Select the network interface(s) used for discovery, or leave all unselected to use all non-internal IPv4 interfaces.
4. Optionally add manual bulb IP addresses (one per line) for networks where broadcast/multicast is restricted.
5. Click **Discover** and add the bulb.
6. Open the device or Lighting screen to test power, brightness, RGB, colour temperature, and scenes.

### Real-hardware probe (recommended before UI validation)

The probe talks directly to a real bulb; it does not modify app state.

```powershell
# Discover bulbs on local interfaces
npm run wiz:probe -- --discover

# Inspect a specific bulb
npm run wiz:probe -- 192.168.1.50

# Dry-run a command (prints payload, does not send setPilot)
npm run wiz:probe -- 192.168.1.50 --set "state=true,dimming=50"

# Actually send the command to the real bulb
npm run wiz:probe -- 192.168.1.50 --set "state=true,dimming=50" --apply

# Toggle power (real command)
npm run wiz:probe -- 192.168.1.50 --toggle --apply
```

### Test-only protocol harness

This verifies the WiZ UDP wire format against a local test responder. It is **test-only** and does not add mock devices to the application:

```powershell
npm run wiz:protocol-test
```

## Home Assistant Setup (Optional)

1. Open **Integrations** → **Home Assistant** → **Configure**.
2. Enter your Home Assistant URL, e.g. `http://homeassistant.local:8123`.
3. Create a long-lived access token in Home Assistant: Profile → Security → Long-Lived Access Tokens.
4. Paste the token, test, then save/connect.
5. Use **Discover** to import supported entities into SudoSmart.

The token is encrypted using Electron `safeStorage` and is never exposed to the renderer.

## Security Notes

- Renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
- All device/integration operations go through validated IPC handlers in the main process.
- Credentials/tokens are stored via Electron `safeStorage` (OS-backed encryption) in the app user data directory.
- The renderer receives only configuration metadata (e.g., whether a token exists), never raw secrets.
- Network discovery is limited to selected local interfaces; no arbitrary external IP scanning.
- Wake-on-LAN, notifications, and integration actions are explicit user-triggered operations.

## Data & Configuration

- **User data:** `%APPDATA%\sudosmart` (Electron `userData`).
- **SQLite DB:** `sudosmart.db` in user data; stores settings, rooms, devices, scenes, integration configs.
- **Secrets:** encrypted in `secrets.json` via `safeStorage`.
- **Isolated profile:** set `SUDOSMART_USER_DATA` to use a custom user-data directory (useful for testing/portable runs).

## Known Limitations / Current Scope

- **Real WiZ hardware has not been validated in this development environment.** The protocol harness and app smoke tests pass, but physical bulb behaviour (firmware quirks, network latency, broadcast restrictions, colour/temp modes) must be confirmed on real hardware.
- **WiZ syncPilot is best-effort.** Some networks/devices may not deliver push updates; polling provides the baseline.
- **HA scenes/automations are not yet mapped as first-class SudoSmart scene controls.** Local scenes are implemented; HA entity coverage is focused on controllable/readable devices.
- **No installer code signing/updater configuration yet.** Packaging scripts exist, but release signing/updater hardening is future work.
- **Planned integrations are visible but disabled:** MQTT, Hue, Shelly, Matter, Kasa, Tuya.

## Roadmap

1. **Validate WiZ on real hardware** - discovery, control, reconnects, state sync, network edge cases.
2. **Harden WiZ** - improve capability detection, colour-mode handling, and error reporting from real-device feedback.
3. **MQTT integration** - broker config, topic mapping, retained state, TLS/auth.
4. **Philips Hue integration** - bridge discovery, pairing, lights/groups/scenes.
5. **Shelly integration** - local discovery/control, power monitoring where available.
6. **Home Assistant expansion** - richer entity coverage, areas/devices, HA scenes/services where appropriate.
7. **Matter / Kasa / Tuya** - evaluate local control feasibility; Matter requires controller/commissioning infrastructure.
8. **Production readiness** - automated tests, hardware test matrix, security review, performance profiling, signed installer, auto-update.

## Development Notes

- Prefer `npm run typecheck` before committing changes.
- `npm run wiz:protocol-test` is safe to run locally; it uses a loopback UDP responder and does not touch real devices.
- Use `npm run wiz:probe -- --discover` on a real LAN to confirm bulb visibility before debugging UI issues.
- Do not add mock devices to production code paths. Test-only scripts must be clearly labelled.

## License

MIT (see `package.json`). Add a `LICENSE` file before public distribution if needed.
