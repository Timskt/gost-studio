import type { GostConfig, NodeConfig } from '../types'
import { asArray, asRecord, asString, asStringArray, isEmptyRecord, type NativeRecord } from './native'

/**
 * GOST unmarshals its config through viper without the `ErrorUnused` option, so unknown root keys
 * are ignored rather than rejected. That makes one reserved key a safe place for state the editor
 * needs but GOST has no field for: which entries are switched off, canvas coordinates, and the
 * address of a listener the user disabled but will probably re-enable.
 */
export const STUDIO_KEY = 'x-gost-studio'

type NodePosition = NonNullable<NodeConfig['position']>

export type PositionMap = Record<string, Record<string, NodePosition>>

export interface StudioBlock {
  disabledServices: NativeRecord[]
  disabledChains: NativeRecord[]
  serviceOrder: string[]
  chainOrder: string[]
  nodePositions: PositionMap
  api?: NativeRecord
  metrics?: NativeRecord
}

/** Editor-only state gathered for one save. */
export interface StudioDraft {
  disabledServices: NativeRecord[]
  disabledChains: NativeRecord[]
  /** The api block as it would have been written, kept only while the listener is switched off. */
  api?: NativeRecord
  metrics?: NativeRecord
}

export function readStudio(raw: NativeRecord): StudioBlock {
  const block = asRecord(raw[STUDIO_KEY])
  return {
    disabledServices: asArray(block.disabledServices).map(asRecord),
    disabledChains: asArray(block.disabledChains).map(asRecord),
    serviceOrder: asStringArray(block.serviceOrder),
    chainOrder: asStringArray(block.chainOrder),
    nodePositions: readPositions(block.nodePositions),
    api: readListener(block.api),
    metrics: readListener(block.metrics),
  }
}

/**
 * Builds the editor block, or `null` when there is nothing to remember — a config that uses no
 * editor-only feature then stays byte-for-byte native GOST.
 */
export function packStudio(config: GostConfig, draft: StudioDraft): NativeRecord | null {
  const block: NativeRecord = {}

  if (draft.disabledServices.length > 0) {
    block.disabledServices = draft.disabledServices
    block.serviceOrder = config.services.map((service) => service.name)
  }
  if (draft.disabledChains.length > 0) {
    block.disabledChains = draft.disabledChains
    block.chainOrder = config.chains.map((chain) => chain.name)
  }

  const nodePositions = collectPositions(config)
  if (Object.keys(nodePositions).length > 0) block.nodePositions = nodePositions

  if (hasAddr(draft.api)) block.api = draft.api
  if (hasAddr(draft.metrics)) block.metrics = draft.metrics

  return isEmptyRecord(block) ? null : block
}

/**
 * Restores the order recorded at save time. Names missing from `order` keep their relative order
 * and land at the end, so a config edited by hand outside Studio still loads sensibly.
 */
export function orderByName<T extends { name: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items
  const rank = new Map(order.map((name, index) => [name, index]))
  const fallback = order.length
  return items
    .map((item, index) => ({ item, index, rank: rank.get(item.name) ?? fallback }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ item }) => item)
}

function hasAddr(record: NativeRecord | undefined): record is NativeRecord {
  return Boolean(record) && asString(record?.addr, '').length > 0
}

function collectPositions(config: GostConfig): PositionMap {
  return config.chains.reduce<PositionMap>((map, chain) => {
    const placed = chain.nodes.filter((node) => node.position)
    if (placed.length === 0) return map
    const positions = placed.reduce<Record<string, NodePosition>>(
      (nodes, node) => ({ ...nodes, [node.name]: node.position as NodePosition }),
      {},
    )
    return { ...map, [chain.name]: positions }
  }, {})
}

function readPositions(value: unknown): PositionMap {
  return Object.entries(asRecord(value)).reduce<PositionMap>((map, [chainName, nodes]) => {
    const positions = Object.entries(asRecord(nodes)).reduce<Record<string, NodePosition>>((acc, [nodeName, point]) => {
      const position = asPosition(point)
      return position ? { ...acc, [nodeName]: position } : acc
    }, {})
    return Object.keys(positions).length === 0 ? map : { ...map, [chainName]: positions }
  }, {})
}

function asPosition(value: unknown): NodePosition | null {
  const point = asRecord(value)
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  return { x: point.x as number, y: point.y as number }
}

function readListener(value: unknown): NativeRecord | undefined {
  const record = asRecord(value)
  return isEmptyRecord(record) ? undefined : record
}
