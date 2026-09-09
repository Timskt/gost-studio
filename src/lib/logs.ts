import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { RuntimeLog } from '../types'

const tauriAvailable = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function subscribeRuntimeLogs(onLog: (log: RuntimeLog) => void): Promise<UnlistenFn> {
  if (!tauriAvailable) return () => undefined
  return listen<RuntimeLog>('gost-log', (event) => onLog(event.payload))
}
