import { parse, stringify } from 'yaml'
import type { GostConfig } from '../types'
import type { NativeRecord } from './native'
import { fromNativeConfig } from './config-from-native'
import { toNativeConfig } from './config-to-native'

export { STUDIO_KEY } from './config-studio'
export { DEFAULT_API, DEFAULT_LOG, DEFAULT_METRICS, sampleConfig } from './config-sample'
export { validateConfig } from './config-validate'

/** Indent and width chosen to match the YAML style of the configs shipped with GOST. */
const YAML_INDENT = 2
const YAML_LINE_WIDTH = 100

export function serializeConfig(config: GostConfig): string {
  return stringify(toNativeConfig(config), { indent: YAML_INDENT, lineWidth: YAML_LINE_WIDTH })
}

export function parseConfig(source: string): GostConfig {
  const parsed = parse(source) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置必须是一个 YAML 对象')
  }
  return fromNativeConfig(parsed as NativeRecord)
}
