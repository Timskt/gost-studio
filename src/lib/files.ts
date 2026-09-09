import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

const tauriAvailable = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function chooseConfigFile(): Promise<string | null> {
  if (!tauriAvailable) return null
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'GOST config', extensions: ['yml', 'yaml', 'json'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function chooseBinaryFile(): Promise<string | null> {
  if (!tauriAvailable) return null
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'GOST binary', extensions: ['*'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function chooseSavePath(defaultPath = 'gost.yml'): Promise<string | null> {
  if (!tauriAvailable) return defaultPath
  return save({
    defaultPath,
    filters: [{ name: 'GOST config', extensions: ['yml', 'yaml', 'json'] }],
  })
}

export async function readTextFile(path: string): Promise<string> {
  if (!tauriAvailable) {
    throw new Error('浏览器模式无法读取本地文件，请在桌面版中打开配置')
  }
  return invoke<string>('read_text_file', { path })
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  if (!tauriAvailable) {
    const blob = new Blob([contents], { type: 'text/yaml;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = path.split('/').pop() || 'gost.yml'
    link.click()
    URL.revokeObjectURL(href)
    return
  }
  await invoke('write_text_file', { path, contents })
}
