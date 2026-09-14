import { invoke } from '@tauri-apps/api/core'
import type { RuntimeLaunchOptions, RuntimeState } from '../types'

const tauriAvailable = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * What the editor knows about the runtime before any binary has been probed. Nothing here is
 * invented: in a plain browser tab there is no process, so the state is genuinely empty.
 */
const IDLE_STATE: RuntimeState = {
  status: 'stopped',
  version: '',
  binaryPath: '',
  configPath: '',
}

const NO_RUNTIME = '运行时控制只在桌面应用中可用，浏览器预览无法启动进程'

export function isTauriRuntime(): boolean {
  return tauriAvailable
}

export async function getRuntimeState(): Promise<RuntimeState> {
  if (!tauriAvailable) return IDLE_STATE
  return invoke<RuntimeState>('get_runtime_state')
}

export async function startGost(options: RuntimeLaunchOptions): Promise<RuntimeState> {
  if (!tauriAvailable) throw new Error(NO_RUNTIME)
  return invoke<RuntimeState>('start_gost', {
    binaryPath: options.binaryPath,
    configPath: options.configPath,
    debugLevel: options.debugLevel,
  })
}

export async function stopGost(): Promise<RuntimeState> {
  if (!tauriAvailable) throw new Error(NO_RUNTIME)
  return invoke<RuntimeState>('stop_gost')
}

/** Asks GOST to reload its config in place (SIGHUP), so open connections survive an edit. */
export async function reloadGost(): Promise<RuntimeState> {
  if (!tauriAvailable) throw new Error(NO_RUNTIME)
  return invoke<RuntimeState>('reload_gost')
}

/** Runs `gost -V` so the reported version comes from the binary instead of a constant. */
export async function probeGostVersion(binaryPath: string): Promise<string> {
  if (!tauriAvailable) return ''
  return invoke<string>('probe_gost_version', { binaryPath })
}
