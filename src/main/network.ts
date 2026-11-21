import os from 'os'
import type { NetworkInterfaceInfo } from '@shared/types'

export function listNetworkInterfaces(): NetworkInterfaceInfo[] {
  const result: NetworkInterfaceInfo[] = []
  const interfaces = os.networkInterfaces()
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const addr of addresses ?? []) {
      if (addr.family !== 'IPv4') continue
      result.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        mac: addr.mac,
        internal: addr.internal
      })
    }
  }
  return result
}

export function broadcastAddress(address: string, netmask: string): string {
  const a = address.split('.').map(Number)
  const m = netmask.split('.').map(Number)
  if (a.length !== 4 || m.length !== 4) return '255.255.255.255'
  return a.map((value, index) => ((value & m[index]) | (~m[index] & 255)) >>> 0).join('.')
}

export function privateInterfaces(): NetworkInterfaceInfo[] {
  return listNetworkInterfaces().filter((i) => !i.internal)
}
