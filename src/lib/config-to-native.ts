import type { ChainConfig, GostConfig, NodeConfig, RecorderRule, ServiceConfig } from '../types'
import { asRecord, findNamedRecord, isEmptyRecord, type NativeRecord } from './native'
import { STUDIO_KEY, packStudio, readStudio, type StudioBlock, type StudioDraft } from './config-studio'

/** Root keys this module writes itself; everything else in `raw` is passed through untouched. */
const MANAGED_KEYS = [
  'services',
  'chains',
  'bypasses',
  'admissions',
  'resolvers',
  'authers',
  'hosts',
  'limiters',
  'recorders',
  'log',
  'api',
  'metrics',
  STUDIO_KEY,
] as const

const RECORDER_FIELDS: Record<RecorderRule['type'], string> = {
  file: 'path',
  http: 'url',
  tcp: 'addr',
  redis: 'addr',
}

export function toNativeConfig(config: GostConfig): NativeRecord {
  const raw = asRecord(config.raw)
  const studio = readStudio(raw)
  const native = passthrough(raw)

  const services = config.services.map((service) => ({ service, record: toNativeService(service, originalService(raw, studio, service.name)) }))
  const chains = config.chains.map((chain) => ({ chain, record: toNativeChain(chain, originalChain(raw, studio, chain.name)) }))

  const draft: StudioDraft = {
    disabledServices: services.filter(({ service }) => !service.enabled).map(({ record }) => record),
    disabledChains: chains.filter(({ chain }) => !chain.enabled).map(({ record }) => record),
  }

  writeSection(native, raw, 'services', services.filter(({ service }) => service.enabled).map(({ record }) => record))
  writeSection(native, raw, 'chains', chains.filter(({ chain }) => chain.enabled).map(({ record }) => record))
  writeSection(native, raw, 'bypasses', config.bypasses.map((rule) => ({ ...findNamedRecord(raw.bypasses, rule.name), name: rule.name, whitelist: rule.whitelist, matchers: rule.matchers })))
  writeSection(native, raw, 'admissions', config.admissions.map((rule) => ({ ...findNamedRecord(raw.admissions, rule.name), name: rule.name, whitelist: rule.whitelist, matchers: rule.matchers })))
  writeSection(native, raw, 'resolvers', config.resolvers.map((resolver) => ({ ...findNamedRecord(raw.resolvers, resolver.name), name: resolver.name, nameservers: resolver.nameservers.map((addr) => ({ addr })), prefer: resolver.prefer })))
  writeSection(native, raw, 'authers', config.authers.map((auther) => ({ ...findNamedRecord(raw.authers, auther.name), name: auther.name, auths: auther.users.map((user) => ({ username: user.username, password: user.password })) })))
  writeSection(native, raw, 'hosts', config.hosts.map((group) => ({ ...findNamedRecord(raw.hosts, group.name), name: group.name, mappings: group.entries.map((entry) => ({ ip: entry.ip, hostname: entry.hostname, aliases: entry.aliases })) })))
  writeSection(native, raw, 'limiters', config.limiters.map((limiter) => ({ ...findNamedRecord(raw.limiters, limiter.name), name: limiter.name, limits: limiter.limits })))
  writeSection(native, raw, 'recorders', config.recorders.map((recorder) => toNativeRecorder(recorder, findNamedRecord(raw.recorders, recorder.name))))

  native.log = { ...asRecord(raw.log), ...config.log }

  applyListener(native, draft, 'api', config.api.enabled, {
    ...(studio.api ?? asRecord(raw.api)),
    addr: config.api.address,
    pathPrefix: config.api.pathPrefix,
  })
  applyListener(native, draft, 'metrics', config.metrics.enabled, {
    ...(studio.metrics ?? asRecord(raw.metrics)),
    addr: config.metrics.address,
    path: config.metrics.path,
  })

  const block = packStudio(config, draft)
  if (block) native[STUDIO_KEY] = block

  return native
}

/** Copies the keys the editor does not model, so unknown config survives a save. */
function passthrough(raw: NativeRecord): NativeRecord {
  const managed = new Set<string>(MANAGED_KEYS)
  return Object.entries(raw).reduce<NativeRecord>(
    (record, [key, value]) => (managed.has(key) ? record : { ...record, [key]: value }),
    {},
  )
}

/**
 * Writes a section when it has entries, or when the source file already had the key — an explicit
 * `chains: []` stays in the file, while a section the user never used is not invented.
 */
function writeSection(native: NativeRecord, raw: NativeRecord, key: string, entries: NativeRecord[]) {
  if (entries.length > 0 || key in raw) native[key] = entries
}

function applyListener(native: NativeRecord, draft: StudioDraft, key: 'api' | 'metrics', enabled: boolean, record: NativeRecord) {
  if (enabled) native[key] = record
  else draft[key] = record
}

function toNativeService(service: ServiceConfig, original: NativeRecord): NativeRecord {
  const handler: NativeRecord = {
    ...asRecord(original.handler),
    type: service.type,
    ...(service.chain ? { chain: service.chain } : {}),
  }
  delete handler.auth
  delete handler.auther
  if (service.auther) handler.auther = service.auther
  else if (service.auth && service.authUsername) handler.auth = { username: service.authUsername, password: service.authPassword }

  return {
    ...original,
    name: service.name,
    addr: service.address,
    handler,
    listener: { ...asRecord(original.listener), type: service.listener },
  }
}

function toNativeChain(chain: ChainConfig, original: NativeRecord): NativeRecord {
  const hops = Array.isArray(original.hops) ? original.hops : []
  const firstHop = asRecord(hops[0])
  return {
    ...original,
    name: chain.name,
    hops: [
      {
        ...firstHop,
        name: typeof firstHop.name === 'string' && firstHop.name ? firstHop.name : `${chain.name}-hop-0`,
        selector: { ...asRecord(firstHop.selector), strategy: chain.strategy },
        nodes: chain.nodes.map((node) => toNativeNode(node, findNamedRecord(firstHop.nodes, node.name))),
      },
      ...hops.slice(1),
    ],
  }
}

/** Canvas coordinates are deliberately left out: they live in the editor block, not in a GOST node. */
function toNativeNode(node: NodeConfig, original: NativeRecord): NativeRecord {
  const record: NativeRecord = {
    ...original,
    name: node.name,
    addr: node.addr,
    connector: { ...asRecord(original.connector), type: node.connector },
    dialer: { ...asRecord(original.dialer), type: node.dialer },
  }
  delete record.position
  return record
}

function toNativeRecorder(recorder: RecorderRule, original: NativeRecord): NativeRecord {
  const field = RECORDER_FIELDS[recorder.type]
  return {
    ...original,
    name: recorder.name,
    [recorder.type]: { ...asRecord(original[recorder.type]), [field]: recorder.target },
  }
}

/** A switched-off entry is absent from the native section, so its last known shape is in the editor block. */
function originalService(raw: NativeRecord, studio: StudioBlock, name: string): NativeRecord {
  const active = findNamedRecord(raw.services, name)
  return isEmptyRecord(active) ? findNamedRecord(studio.disabledServices, name) : active
}

function originalChain(raw: NativeRecord, studio: StudioBlock, name: string): NativeRecord {
  const active = findNamedRecord(raw.chains, name)
  return isEmptyRecord(active) ? findNamedRecord(studio.disabledChains, name) : active
}
