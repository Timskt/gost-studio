import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const lockPath = resolve(root, 'compatibility/gost.lock.json')
const token = process.env.GITHUB_TOKEN

async function github(path) {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'gost-studio-sync',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`)
  return response.json()
}

const [gost, implementation] = await Promise.all([
  github('repos/go-gost/gost/commits/master'),
  github('repos/go-gost/x/commits/master'),
])
const current = JSON.parse(await readFile(lockPath, 'utf8'))
const now = new Date().toISOString()
const gostChanged = current.upstream.commit !== gost.sha
const implementationChanged = current.implementation.commit !== implementation.sha
const next = {
  ...current,
  upstream: {
    ...current.upstream,
    commit: gost.sha,
    ...(gostChanged ? { observedAt: now, message: gost.commit?.message?.split('\n')[0] ?? '' } : {}),
  },
  implementation: {
    ...current.implementation,
    commit: implementation.sha,
    ...(implementationChanged ? { observedAt: now, message: implementation.commit?.message?.split('\n')[0] ?? '' } : {}),
  },
}

await writeFile(lockPath, `${JSON.stringify(next, null, 2)}\n`)
console.log(`GOST: ${current.upstream.commit.slice(0, 8)} → ${next.upstream.commit.slice(0, 8)}`)
console.log(`x:    ${current.implementation.commit.slice(0, 8)} → ${next.implementation.commit.slice(0, 8)}`)
