import type {
  AdmissionRule,
  ApiConfig,
  AuthGroup,
  BypassRule,
  ChainConfig,
  GostConfig,
  HostGroup,
  LimiterRule,
  LogConfig,
  MetricsConfig,
  NodeConfig,
  RecorderRule,
  ResolverRule,
  ServiceConfig,
} from '../types'
import { asArray, asRecord, asString, asStringArray, type NativeRecord } from './native'
import { DEFAULT_API, DEFAULT_LOG, DEFAULT_METRICS } from './config-sample'
import { orderByName, readStudio, type PositionMap } from './config-studio'

const RECORDER_TYPES = ['file', 'tcp', 'http', 'redis'] as const

/**
 * Reads a parsed GOST config into the editor model. Entries the user switched off live in the
 * editor block rather than in the native sections, so they are merged back here and the order
 * recorded at save time is restored.
 */
export function fromNativeConfig(parsed: NativeRecord): GostConfig {
  const studio = readStudio(parsed)
  const active = asArray(parsed.services)
  const activeChains = asArray(parsed.chains)

  return {
    services: orderByName(
      [
        ...active.map((value, index) => fromNativeService(value, index, true)),
        ...studio.disabledServices.map((value, index) => fromNativeService(value, active.length + index, false)),
      ],
      studio.serviceOrder,
    ),
    chains: orderByName(
      [
        ...activeChains.map((value, index) => fromNativeChain(value, index, studio.nodePositions, true)),
        ...studio.disabledChains.map((value, index) =>
          fromNativeChain(value, activeChains.length + index, studio.nodePositions, false),
        ),
      ],
      studio.chainOrder,
    ),
    bypasses: asArray(parsed.bypasses).map((value, index) => fromNativeRule<BypassRule>(value, index, 'bypass')),
    admissions: asArray(parsed.admissions).map((value, index) => fromNativeRule<AdmissionRule>(value, index, 'admission')),
    resolvers: asArray(parsed.resolvers).map(fromNativeResolver),
    authers: asArray(parsed.authers).map(fromNativeAuther),
    hosts: asArray(parsed.hosts).map(fromNativeHosts),
    limiters: asArray(parsed.limiters).map(fromNativeLimiter),
    recorders: asArray(parsed.recorders).map(fromNativeRecorder),
    log: fromNativeLog(parsed.log),
    api: fromNativeApi(parsed, studio.api),
    metrics: fromNativeMetrics(parsed, studio.metrics),
    raw: { ...parsed },
  }
}

function fromNativeService(value: unknown, index: number, enabled: boolean): ServiceConfig {
  const service = asRecord(value)
  const handler = asRecord(service.handler)
  const auth = asRecord(handler.auth)
  return {
    name: asString(service.name, `service-${index + 1}`),
    type: asString(handler.type, 'auto'),
    listener: asString(asRecord(service.listener).type, 'tcp'),
    address: asString(service.addr, ''),
    chain: asString(handler.chain, ''),
    auth: Boolean(handler.auth),
    authUsername: asString(auth.username, ''),
    authPassword: asString(auth.password, ''),
    auther: asString(handler.auther, ''),
    enabled,
  }
}

function fromNativeChain(value: unknown, index: number, positions: PositionMap, enabled: boolean): ChainConfig {
  const chain = asRecord(value)
  const name = asString(chain.name, `chain-${index + 1}`)
  const firstHop = asRecord(asArray(chain.hops)[0])
  const selector = asRecord(firstHop.selector ?? chain.selector)
  const placed = positions[name] ?? {}
  return {
    name,
    strategy: asString(selector.strategy, 'round') as ChainConfig['strategy'],
    enabled,
    nodes: asArray(firstHop.nodes).map((node, nodeIndex) => fromNativeNode(node, nodeIndex, placed)),
  }
}

function fromNativeNode(value: unknown, index: number, placed: PositionMap[string]): NodeConfig {
  const node = asRecord(value)
  const name = asString(node.name, `node-${index + 1}`)
  const position = placed[name]
  return {
    name,
    addr: asString(node.addr, ''),
    connector: asString(asRecord(node.connector).type, 'direct'),
    dialer: asString(asRecord(node.dialer).type, 'tcp'),
    ...(position ? { position } : {}),
  }
}

function fromNativeRule<T extends BypassRule | AdmissionRule>(value: unknown, index: number, prefix: string): T {
  const rule = asRecord(value)
  return {
    name: asString(rule.name, `${prefix}-${index + 1}`),
    whitelist: rule.whitelist === true,
    matchers: asStringArray(rule.matchers),
  } as T
}

function fromNativeResolver(value: unknown, index: number): ResolverRule {
  const resolver = asRecord(value)
  const nameservers = asArray(resolver.nameservers)
    .map((item) => (typeof item === 'string' ? item : asString(asRecord(item).addr, '')))
    .filter((addr) => addr.length > 0)
  return {
    name: asString(resolver.name, `resolver-${index + 1}`),
    nameservers,
    prefer: asString(resolver.prefer, 'ipv4') as ResolverRule['prefer'],
  }
}

function fromNativeAuther(value: unknown, index: number): AuthGroup {
  const auther = asRecord(value)
  return {
    name: asString(auther.name, `auther-${index + 1}`),
    users: asArray(auther.auths)
      .map(asRecord)
      .map((user) => ({ username: asString(user.username, ''), password: asString(user.password, '') })),
  }
}

function fromNativeHosts(value: unknown, index: number): HostGroup {
  const hosts = asRecord(value)
  return {
    name: asString(hosts.name, `hosts-${index + 1}`),
    entries: asArray(hosts.mappings)
      .map(asRecord)
      .map((entry) => ({
        ip: asString(entry.ip, ''),
        hostname: asString(entry.hostname, ''),
        aliases: asStringArray(entry.aliases),
      })),
  }
}

function fromNativeLimiter(value: unknown, index: number): LimiterRule {
  const limiter = asRecord(value)
  return { name: asString(limiter.name, `limiter-${index + 1}`), limits: asStringArray(limiter.limits) }
}

function fromNativeRecorder(value: unknown, index: number): RecorderRule {
  const recorder = asRecord(value)
  const type = RECORDER_TYPES.find((candidate) => recorder[candidate]) ?? 'file'
  const backend = asRecord(recorder[type])
  const field = type === 'file' ? 'path' : type === 'http' ? 'url' : 'addr'
  return { name: asString(recorder.name, `recorder-${index + 1}`), type, target: asString(backend[field], '') }
}

function fromNativeLog(value: unknown): LogConfig {
  const log = asRecord(value)
  return {
    level: asString(log.level, DEFAULT_LOG.level) as LogConfig['level'],
    format: asString(log.format, DEFAULT_LOG.format) as LogConfig['format'],
  }
}

/**
 * A listener is on when GOST would actually start it, which means the key is present — there is no
 * `enabled` field upstream. The address of a switched-off listener is recovered from the editor
 * block so toggling it back on does not lose what the user typed.
 */
function fromNativeApi(parsed: NativeRecord, stored: NativeRecord | undefined): ApiConfig {
  const enabled = Boolean(parsed.api)
  const source = enabled ? asRecord(parsed.api) : (stored ?? {})
  return {
    enabled,
    address: asString(source.addr, DEFAULT_API.address),
    pathPrefix: asString(source.pathPrefix, DEFAULT_API.pathPrefix),
  }
}

function fromNativeMetrics(parsed: NativeRecord, stored: NativeRecord | undefined): MetricsConfig {
  const enabled = Boolean(parsed.metrics)
  const source = enabled ? asRecord(parsed.metrics) : (stored ?? {})
  return {
    enabled,
    address: asString(source.addr, DEFAULT_METRICS.address),
    path: asString(source.path, DEFAULT_METRICS.path),
  }
}
