/**
 * Coercion helpers for reading YAML that GOST accepts but we cannot fully type.
 * Every function is total: unexpected shapes degrade to an empty value instead of throwing,
 * so a hand-edited config never crashes the editor.
 */

export type NativeRecord = Record<string, unknown>

export function asRecord(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as NativeRecord) : {}
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string')
}

/** Finds an entry of a GOST named list (`services`, `chains`, `bypasses`, …) by its `name`. */
export function findNamedRecord(value: unknown, name: string): NativeRecord {
  const found = asArray(value).find((item) => asRecord(item).name === name)
  return asRecord(found)
}

export function isEmptyRecord(value: NativeRecord): boolean {
  return Object.keys(value).length === 0
}
