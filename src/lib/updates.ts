import lock from '../../compatibility/gost.lock.json'
import type { RuntimeUpdateState } from '../types'

const CACHE_KEY = 'gost-studio.update-check'
const CACHE_TTL = 6 * 60 * 60 * 1000

interface GitHubCommit {
  sha: string
  commit?: { message?: string }
}

interface GitHubRelease {
  tag_name?: string
  html_url?: string
  name?: string
}

interface CachedUpdate {
  checkedAt: string
  state: RuntimeUpdateState
}

export async function checkForUpdates(force = false): Promise<RuntimeUpdateState> {
  const cached = readCached()
  if (!force && cached && Date.now() - Date.parse(cached.checkedAt) < CACHE_TTL) return cached.state

  try {
    const [gost, implementation, studio] = await Promise.all([
      github<GitHubCommit>('repos/go-gost/gost/commits/master'),
      github<GitHubCommit>('repos/go-gost/x/commits/master'),
      github<GitHubRelease>('repos/Timskt/gost-studio/releases/latest', true),
    ])
    const gostAhead = !gost.sha.startsWith(lock.upstream.commit)
    const xAhead = !implementation.sha.startsWith(lock.implementation.commit)
    const state: RuntimeUpdateState = {
      status: gostAhead || xAhead ? 'available' : 'up-to-date',
      checkedAt: new Date().toISOString(),
      currentGostCommit: lock.upstream.commit,
      latestGostCommit: gost.sha,
      currentXCommit: lock.implementation.commit,
      latestXCommit: implementation.sha,
      gostMessage: gost.commit?.message?.split('\n')[0] ?? '',
      xMessage: implementation.commit?.message?.split('\n')[0] ?? '',
      studioRelease: studio.tag_name,
      studioReleaseUrl: studio.html_url,
    }
    writeCached(state)
    return state
  } catch (error) {
    const state: RuntimeUpdateState = {
      status: 'offline',
      checkedAt: new Date().toISOString(),
      currentGostCommit: lock.upstream.commit,
      latestGostCommit: lock.upstream.commit,
      currentXCommit: lock.implementation.commit,
      latestXCommit: lock.implementation.commit,
      error: error instanceof Error ? error.message : '无法连接 GitHub',
    }
    writeCached(state)
    return state
  }
}

async function github<T>(path: string, optional = false): Promise<T> {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gost-studio' },
  })
  if (!response.ok) {
    if (optional && response.status === 404) return {} as T
    throw new Error(`GitHub API ${response.status}`)
  }
  return response.json() as Promise<T>
}

function readCached(): CachedUpdate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) as CachedUpdate : null
  } catch {
    return null
  }
}

function writeCached(state: RuntimeUpdateState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: state.checkedAt, state } satisfies CachedUpdate))
  } catch {
    // Storage is optional in restricted browser contexts.
  }
}
