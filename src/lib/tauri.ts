import { invoke } from '@tauri-apps/api/core'
import type { RuntimeState } from '../types'

const tauriAvailable = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const fallbackState: RuntimeState = {
  status: 'stopped',
  version: 'v3.3.1',
  source: 'master',
  binaryPath: '',
}

export function isTauriRuntime(): boolean {
  return tauriAvailable
}

export async function getRuntimeState(): Promise<RuntimeState> {
  if (!tauriAvailable) return fallbackState
  return invoke<RuntimeState>('get_runtime_state')
}

export async function startGost(binaryPath: string, configPath: string): Promise<RuntimeState> {
  if (!tauriAvailable) {
    return { ...fallbackState, status: 'running', binaryPath }
  }
  return invoke<RuntimeState>('start_gost', { binaryPath, configPath })
}

export async function stopGost(): Promise<RuntimeState> {
  if (!tauriAvailable) return { ...fallbackState, status: 'stopped' }
  return invoke<RuntimeState>('stop_gost')
}
