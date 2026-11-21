import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

interface SecretFile {
  version: 2
  secrets?: Record<string, string>
  /** legacy single HA token */
  encryptedToken?: string
}

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json')
}

function readFile(): SecretFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(secretsPath(), 'utf8')) as SecretFile
    if (parsed.version === 2 || parsed.version === 1) return parsed
  } catch {
    // ignore
  }
  return { version: 2, secrets: {} }
}

function writeFile(data: SecretFile): void {
  fs.mkdirSync(path.dirname(secretsPath()), { recursive: true })
  fs.writeFileSync(secretsPath(), JSON.stringify({ ...data, version: 2 }), 'utf8')
}

function assertAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this system.')
  }
}

export function saveSecret(key: string, value: string): void {
  assertAvailable()
  const data = readFile()
  data.secrets = { ...(data.secrets ?? {}), [key]: safeStorage.encryptString(value).toString('base64') }
  writeFile(data)
}

export function getSecret(key: string): string | null {
  const data = readFile()
  const encrypted = data.secrets?.[key]
  if (!encrypted) return null
  assertAvailable()
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

export function deleteSecret(key: string): void {
  const data = readFile()
  if (data.secrets) {
    delete data.secrets[key]
    writeFile(data)
  }
}

export function hasSecret(key: string): boolean {
  return !!readFile().secrets?.[key]
}

// Home Assistant compatibility helpers
const HA_TOKEN_KEY = 'ha.token'

export function saveHaToken(token: string): void {
  saveSecret(HA_TOKEN_KEY, token)
}

export function getHaToken(): string | null {
  return getSecret(HA_TOKEN_KEY)
}

export function clearHaToken(): void {
  deleteSecret(HA_TOKEN_KEY)
}

export function hasHaToken(): boolean {
  return hasSecret(HA_TOKEN_KEY)
}
