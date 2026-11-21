import { execute, queryOne } from '../db'
import { clearHaToken, getHaToken, hasHaToken, saveHaToken } from '../secureStore'
import type { HAConnectionConfig } from '@shared/types'

export async function getHaConfig(): Promise<HAConnectionConfig> {
  const row = await queryOne<{ url: string }>('SELECT url FROM ha_config WHERE id = 1')
  return { url: row?.url ?? '', hasToken: hasHaToken() }
}

export async function saveHaConfig(input: { url: string; token?: string }): Promise<HAConnectionConfig> {
  const url = input.url.trim().replace(/\/+$/, '')
  await execute("UPDATE ha_config SET url = ?, updated_at = datetime('now') WHERE id = 1", [url])
  if (typeof input.token === 'string') {
    const token = input.token.trim()
    if (token) saveHaToken(token)
    else clearHaToken()
  }
  return getHaConfig()
}

export async function getHaCredentialsAsync(): Promise<{ url: string; token: string } | null> {
  const cfg = await getHaConfig()
  const token = getHaToken()
  if (!cfg.url || !token) return null
  return { url: cfg.url, token }
}
