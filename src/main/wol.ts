import dgram from 'dgram'

export async function sendWakeOnLan(mac: string): Promise<void> {
  const clean = mac.replace(/[^a-fA-F0-9]/g, '')
  if (clean.length !== 12) throw new Error('Invalid MAC address')
  const macBuf = Buffer.from(clean, 'hex')
  const packet = Buffer.alloc(6 + 16 * 6, 0xff)
  for (let i = 0; i < 16; i++) macBuf.copy(packet, 6 + i * 6)

  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', (err) => {
      socket.close()
      reject(err)
    })
    socket.bind(() => {
      socket.setBroadcast(true)
      socket.send(packet, 9, '255.255.255.255', (err) => {
        socket.close()
        if (err) reject(err)
        else resolve()
      })
    })
  })
}
