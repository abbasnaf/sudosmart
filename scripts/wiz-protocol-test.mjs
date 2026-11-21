#!/usr/bin/env node
/**
 * TEST-ONLY WiZ UDP protocol harness.
 *
 * This script starts a fake WiZ responder on the loopback interface and exercises the
 * exact JSON/UDP messages used by src/main/integrations/wiz/provider.ts:
 *   - getPilot
 *   - getSystemConfig
 *   - setPilot (state, dimming, r/g/b, temp, sceneId)
 *
 * It does NOT add mock devices to the application. It only verifies wire-format
 * correctness so that real-hardware testing starts from a known-good baseline.
 *
 * Usage: node scripts/wiz-protocol-test.mjs
 */

import dgram from 'node:dgram'

const PORT = 38899
const HOST = '127.0.0.1'
const TIMEOUT = 1200

const device = {
  state: false,
  dimming: 40,
  temp: 2700,
  r: 255,
  g: 200,
  b: 120,
  sceneId: 0,
  speed: 100,
  rssi: -55,
  mac: 'a8bb50abcdef',
  moduleName: 'ESP01_SHRGB_03',
  fwVersion: '1.31.0'
}

let passed = 0
let failed = 0

function assert(condition, message, detail) {
  if (condition) {
    passed += 1
    console.log(`  PASS  ${message}`)
  } else {
    failed += 1
    console.error(`  FAIL  ${message}${detail ? ` — ${detail}` : ''}`)
  }
}

function respond(socket, rinfo, payload) {
  const buffer = Buffer.from(JSON.stringify(payload))
  socket.send(buffer, rinfo.port, rinfo.address)
}

function createResponder() {
  const socket = dgram.createSocket('udp4')
  socket.on('message', (message, rinfo) => {
    let request
    try {
      request = JSON.parse(message.toString())
    } catch {
      return respond(socket, rinfo, { method: 'error', error: { code: -1, message: 'invalid json' } })
    }

    switch (request.method) {
      case 'getPilot':
        return respond(socket, rinfo, {
          method: 'getPilot',
          result: {
            state: device.state,
            dimming: device.dimming,
            temp: device.temp,
            r: device.r,
            g: device.g,
            b: device.b,
            sceneId: device.sceneId,
            speed: device.speed,
            rssi: device.rssi,
            mac: device.mac
          }
        })
      case 'getSystemConfig':
        return respond(socket, rinfo, {
          method: 'getSystemConfig',
          result: {
            mac: device.mac,
            moduleName: device.moduleName,
            fwVersion: device.fwVersion,
            homeId: 1,
            roomId: 1
          }
        })
      case 'setPilot': {
        const params = request.params ?? {}
        if (params.state !== undefined) device.state = params.state === true
        if (params.dimming !== undefined) device.dimming = Number(params.dimming)
        if (params.temp !== undefined) device.temp = Number(params.temp)
        if (params.r !== undefined) device.r = Number(params.r)
        if (params.g !== undefined) device.g = Number(params.g)
        if (params.b !== undefined) device.b = Number(params.b)
        if (params.sceneId !== undefined) device.sceneId = Number(params.sceneId)
        return respond(socket, rinfo, { method: 'setPilot', result: { success: true } })
      }
      default:
        return respond(socket, rinfo, {
          method: request.method,
          error: { code: -32601, message: `unknown method ${request.method}` }
        })
    }
  })
  return socket
}

function request(payload, timeout = TIMEOUT) {
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
    const timer = setTimeout(() => finish(new Error(`no response within ${timeout}ms`)), timeout)
    socket.on('message', (message) => {
      try {
        finish(null, JSON.parse(message.toString()))
      } catch (error) {
        finish(error)
      }
    })
    socket.on('error', (error) => finish(error))
    socket.send(Buffer.from(JSON.stringify(payload)), PORT, HOST, (error) => {
      if (error) finish(error)
    })
  })
}

async function main() {
  const responder = createResponder()
  await new Promise((resolve, reject) => {
    responder.once('error', reject)
    responder.bind(PORT, HOST, resolve)
  })
  console.log(`Test-only WiZ responder listening on ${HOST}:${PORT}`)
  console.log('')

  try {
    console.log('getPilot')
    const pilot = await request({ method: 'getPilot', params: {} })
    assert(pilot.method === 'getPilot', 'response method is getPilot')
    assert(pilot.result?.mac === device.mac, 'response includes MAC used as provider device id')
    assert(pilot.result?.state === false, 'initial power state is off')
    assert(typeof pilot.result?.dimming === 'number', 'brightness (dimming) is numeric')

    console.log('getSystemConfig')
    const system = await request({ method: 'getSystemConfig', params: {} })
    assert(system.result?.moduleName === device.moduleName, 'module name is returned for capability detection')
    assert(system.result?.mac === device.mac, 'system config MAC matches pilot MAC')

    console.log('setPilot: power on + brightness')
    const power = await request({ method: 'setPilot', params: { state: true, dimming: 75 } })
    assert(power.result?.success === true, 'setPilot acknowledges success')
    const afterPower = await request({ method: 'getPilot', params: {} })
    assert(afterPower.result?.state === true, 'power state persisted')
    assert(afterPower.result?.dimming === 75, 'brightness persisted', String(afterPower.result?.dimming))

    console.log('setPilot: RGB colour')
    await request({ method: 'setPilot', params: { state: true, r: 10, g: 20, b: 240 } })
    const afterRgb = await request({ method: 'getPilot', params: {} })
    assert(
      afterRgb.result?.r === 10 && afterRgb.result?.g === 20 && afterRgb.result?.b === 240,
      'RGB values persisted',
      JSON.stringify([afterRgb.result?.r, afterRgb.result?.g, afterRgb.result?.b])
    )

    console.log('setPilot: colour temperature')
    await request({ method: 'setPilot', params: { state: true, temp: 4000 } })
    const afterTemp = await request({ method: 'getPilot', params: {} })
    assert(afterTemp.result?.temp === 4000, 'colour temperature persisted', String(afterTemp.result?.temp))

    console.log('setPilot: scene')
    await request({ method: 'setPilot', params: { state: true, sceneId: 4 } })
    const afterScene = await request({ method: 'getPilot', params: {} })
    assert(afterScene.result?.sceneId === 4, 'scene id persisted', String(afterScene.result?.sceneId))

    console.log('setPilot: power off')
    await request({ method: 'setPilot', params: { state: false } })
    const afterOff = await request({ method: 'getPilot', params: {} })
    assert(afterOff.result?.state === false, 'power off persisted')

    console.log('unknown method')
    const unknown = await request({ method: 'notARealMethod', params: {} })
    assert(unknown.error?.code === -32601, 'unknown methods return an error object')
  } finally {
    responder.close()
  }

  console.log('')
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

if (process.argv.includes('--serve')) {
  // Serve mode is used by the end-to-end test. It keeps the test-only responder alive
  // so the real application can discover and control it over loopback.
  const responder = createResponder()
  responder.bind(PORT, HOST, () => {
    console.log(`READY ${device.mac}`)
  })
  const shutdown = () => {
    try {
      responder.close()
    } catch {
      // ignore
    }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} else {
  main().catch((error) => {
    console.error('Protocol harness error:', error)
    process.exit(1)
  })
}
