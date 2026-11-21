#!/usr/bin/env node
/**
 * Real-hardware Philips WiZ probe.
 *
 * Use this on the same LAN as your WiZ bulbs to validate discovery and control
 * before trusting the desktop UI. It talks directly to the bulbs over UDP; no
 * application state or database is touched.
 *
 * Usage:
 *   node scripts/wiz-probe.mjs --discover
 *   node scripts/wiz-probe.mjs 192.168.1.50
 *   node scripts/wiz-probe.mjs 192.168.1.50 --toggle --apply
 *   node scripts/wiz-probe.mjs 192.168.1.50 --set "state=true,dimming=50,r=255,g=0,b=0" --apply
 *
 * Flags:
 *   --discover            Broadcast getPilot on local IPv4 interfaces.
 *   --iface <name|ip>     Limit discovery to one interface.
 *   --timeout <ms>        Discovery/request timeout (default 2500).
 *   --set <k=v,...>       Build a setPilot command. Booleans/numbers are coerced.
 *   --toggle              Flip the current power state.
 *   --apply               Actually send setPilot. Without it, the command is only printed.
 *   --json                Print raw JSON responses.
 *
 * The probe never scans arbitrary external IP ranges. Discovery uses only the
 * subnet broadcast address of local IPv4 interfaces plus 255.255.255.255.
 */

import dgram from 'node:dgram'
import os from 'node:os'

const WIZ_PORT = 38899
const REQUEST_TIMEOUT = 1500

function parseArgs(argv) {
  const args = { positional: [], flags: new Set(), values: {} }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      args.positional.push(token)
      continue
    }
    const name = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args.values[name] = next
      i += 1
    } else {
      args.flags.add(name)
    }
  }
  return args
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function broadcastAddress(address, netmask) {
  const a = address.split('.').map(Number)
  const m = netmask.split('.').map(Number)
  if (a.length !== 4 || m.length !== 4) return '255.255.255.255'
  return a.map((value, index) => ((value & m[index]) | (~m[index] & 255)) >>> 0).join('.')
}

function externalInterfaces() {
  const result = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        result.push({ name, address: address.address, netmask: address.netmask })
      }
    }
  }
  return result
}

function request(host, payload, timeout = REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    let settled = false
    const finish = (error, data) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // ignore
      }
      if (error) reject(error)
      else resolve(data)
    }
    const timer = setTimeout(() => finish(new Error(`No response from ${host} within ${timeout}ms`)), timeout)
    socket.on('message', (message) => {
      try {
        finish(null, JSON.parse(message.toString()))
      } catch (error) {
        finish(error)
      }
    })
    socket.on('error', (error) => finish(error))
    socket.send(Buffer.from(JSON.stringify(payload)), WIZ_PORT, host, (error) => {
      if (error) finish(error)
    })
  })
}

function normalizeMac(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-f0-9]/g, '')
}

async function discover({ iface, timeout, json }) {
  const all = externalInterfaces()
  const selected = iface
    ? all.filter((entry) => entry.name === iface || entry.address === iface)
    : all
  if (selected.length === 0) {
    console.error(`No external IPv4 interfaces found${iface ? ` matching "${iface}"` : ''}.`)
    process.exit(1)
  }

  const found = new Map()

  await Promise.all(
    selected.map(
      (entry) =>
        new Promise((resolve) => {
          const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
          const finish = () => {
            try {
              socket.close()
            } catch {
              // ignore
            }
            resolve()
          }
          socket.on('message', (message, rinfo) => {
            try {
              const data = JSON.parse(message.toString())
              if (data.method === 'getPilot' && data.result) {
                const mac = normalizeMac(data.result.mac)
                const key = mac || rinfo.address
                found.set(key, { address: rinfo.address, pilot: data.result })
              }
            } catch {
              // ignore malformed packets
            }
          })
          socket.on('error', (error) => {
            console.error(`Interface ${entry.name} (${entry.address}): ${error.message}`)
            finish()
          })
          socket.bind({ address: entry.address, port: 0 }, () => {
            try {
              socket.setBroadcast(true)
            } catch {
              // ignore
            }
            const payload = Buffer.from(JSON.stringify({ method: 'getPilot', params: {} }))
            const targets = new Set([broadcastAddress(entry.address, entry.netmask), '255.255.255.255'])
            for (const target of targets) {
              socket.send(payload, WIZ_PORT, target, (error) => {
                if (error) console.error(`Send to ${target} via ${entry.name} failed: ${error.message}`)
              })
            }
            setTimeout(finish, timeout)
          })
        })
    )
  )

  if (found.size === 0) {
    console.log('No WiZ devices responded.')
    console.log('Checks: bulb powered on, same LAN/VLAN, Windows firewall allows UDP, try a manual IP.')
    return
  }

  console.log(`Found ${found.size} WiZ device(s):`)
  for (const { address, pilot } of found.values()) {
    if (json) {
      console.log(JSON.stringify({ address, pilot }, null, 2))
      continue
    }
    console.log('')
    console.log(`  Address:  ${address}`)
    console.log(`  MAC:      ${pilot.mac ?? 'unknown'}`)
    console.log(`  Power:    ${pilot.state ? 'on' : 'off'}`)
    console.log(`  Bright:   ${pilot.dimming ?? '?'}%`)
    if (typeof pilot.temp === 'number' && pilot.temp > 0) console.log(`  Temp:     ${pilot.temp}K`)
    if (pilot.r !== undefined) console.log(`  RGB:      ${pilot.r},${pilot.g},${pilot.b}`)
    if (pilot.sceneId) console.log(`  Scene:    ${pilot.sceneId}`)
    if (pilot.rssi !== undefined) console.log(`  Signal:   ${pilot.rssi} dBm`)
  }
}

function coerce(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  const number = Number(value)
  return Number.isNaN(number) ? value : number
}

function parseSet(value) {
  const params = {}
  for (const pair of String(value).split(',')) {
    const [key, raw] = pair.split('=').map((part) => part.trim())
    if (!key || raw === undefined) continue
    params[key] = coerce(raw)
  }
  return params
}

async function probe(host, { set, toggle, apply, json }) {
  console.log(`Probing ${host} on UDP ${WIZ_PORT}...`)
  console.log('')

  const system = await request(host, { method: 'getSystemConfig', params: {} }).catch((error) => ({
    error: { message: error.message }
  }))
  const pilot = await request(host, { method: 'getPilot', params: {} }).catch((error) => ({
    error: { message: error.message }
  }))

  if (json) {
    console.log(JSON.stringify({ system, pilot }, null, 2))
  } else {
    if (pilot.error) {
      console.error(`getPilot failed: ${pilot.error.message}`)
    } else {
      console.log('getPilot:')
      console.log(JSON.stringify(pilot.result, null, 2))
    }
    if (system.error) {
      console.log(`getSystemConfig unavailable: ${system.error.message}`)
    } else {
      console.log('')
      console.log('getSystemConfig:')
      console.log(JSON.stringify(system.result, null, 2))
    }
  }

  if (pilot.error && !set && !toggle) return

  let params = set ? parseSet(set) : null
  if (toggle) {
    const current = pilot.result?.state === true
    params = { ...(params ?? {}), state: !current }
  }
  if (!params) return

  console.log('')
  console.log(`setPilot payload: ${JSON.stringify(params)}`)
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to send this command to the real device.')
    return
  }

  const response = await request(host, { method: 'setPilot', params }, 2000)
  console.log(`setPilot response: ${JSON.stringify(response)}`)

  await delay(250)
  const after = await request(host, { method: 'getPilot', params: {} })
  console.log('State after command:')
  console.log(JSON.stringify(after.result, null, 2))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const timeout = Number(args.values.timeout) || 2500
  const json = args.flags.has('json')

  if (args.flags.has('discover')) {
    await discover({ iface: args.values.iface, timeout, json })
    return
  }

  const host = args.positional[0]
  if (!host) {
    console.error('Usage: node scripts/wiz-probe.mjs <device-ip> [--set "state=true,dimming=50"] [--apply]')
    console.error('       node scripts/wiz-probe.mjs --discover [--iface <name|ip>]')
    process.exit(1)
  }

  await probe(host, {
    set: args.values.set,
    toggle: args.flags.has('toggle'),
    apply: args.flags.has('apply'),
    json
  })
}

main().catch((error) => {
  console.error('Probe error:', error.message ?? error)
  process.exit(1)
})
