import { parse, stringify } from 'yaml'
import type { AdmissionRule, BypassRule, ChainConfig, GostConfig, NodeConfig, ResolverRule, ServiceConfig, ValidationIssue } from '../types'

type NativeRecord = Record<string, unknown>

export const sampleConfig: GostConfig = {
  services: [
    {
      name: 'edge-http',
      type: 'http',
      listener: 'tcp',
      address: ':8080',
      chain: 'direct',
      auth: false,
      authUsername: '',
      authPassword: '',
      enabled: true,
      requests: 1248,
      traffic: '18.4 GB',
      status: 'running',
    },
    {
      name: 'private-socks',
      type: 'socks5',
      listener: 'tcp',
      address: '127.0.0.1:1080',
      chain: 'relay-east',
      auth: true,
      authUsername: 'user',
      authPassword: 'change-me',
      enabled: true,
      requests: 846,
      traffic: '6.8 GB',
      status: 'running',
    },
    {
      name: 'dns-forward',
      type: 'udp',
      listener: 'udp',
      address: ':5353',
      chain: 'relay-east',
      auth: false,
      authUsername: '',
      authPassword: '',
      enabled: false,
      requests: 0,
      traffic: '—',
      status: 'stopped',
    },
  ],
  chains: [
    {
      name: 'direct',
      strategy: 'fifo',
      enabled: true,
      nodes: [
        {
          name: 'local',
          addr: 'direct',
          connector: 'direct',
          dialer: 'direct',
          health: 'healthy',
          latency: 2,
        },
      ],
    },
    {
      name: 'relay-east',
      strategy: 'round',
      enabled: true,
      nodes: [
        {
          name: 'gateway-01',
          addr: '198.51.100.12:443',
          connector: 'http2',
          dialer: 'tls',
          health: 'healthy',
          latency: 86,
        },
        {
          name: 'gateway-02',
          addr: '203.0.113.48:443',
          connector: 'http2',
          dialer: 'tls',
          health: 'degraded',
          latency: 142,
        },
      ],
    },
  ],
  bypasses: [
    { name: 'private-direct', whitelist: false, matchers: ['localhost', '127.0.0.1', '192.168.0.0/16'] },
  ],
  admissions: [
    { name: 'local-only', whitelist: true, matchers: ['127.0.0.1', '::1'] },
  ],
  resolvers: [
    { name: 'system-dns', nameservers: ['udp://1.1.1.1:53'], prefer: 'ipv4' },
  ],
  log: {
    level: 'info',
    format: 'text',
  },
  api: {
    enabled: true,
    address: '127.0.0.1:18080',
    pathPrefix: '/api',
  },
  metrics: {
    enabled: true,
    address: '127.0.0.1:9000',
    path: '/metrics',
  },
  raw: {},
}

export function serializeConfig(config: GostConfig): string {
  const native = toNativeConfig(config)
  return stringify(native, { indent: 2, lineWidth: 100 })
}

export function parseConfig(source: string): GostConfig {
  const parsed = parse(source) as NativeRecord | null
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置必须是一个 YAML 对象')
  }

  const services = Array.isArray(parsed.services) ? parsed.services.map((service, index) => fromNativeService(service, index)) : []
  const chains = Array.isArray(parsed.chains) ? parsed.chains.map((chain, index) => fromNativeChain(chain, index)) : []
  const raw = { ...parsed }

  const log = asRecord(parsed.log)
  const api = asRecord(parsed.api)
  const metrics = asRecord(parsed.metrics)

  return {
    ...sampleConfig,
    services,
    chains,
    bypasses: Array.isArray(parsed.bypasses) ? parsed.bypasses.map((value, index) => fromNativeRule<BypassRule>(value, index, 'bypass')) : [],
    admissions: Array.isArray(parsed.admissions) ? parsed.admissions.map((value, index) => fromNativeRule<AdmissionRule>(value, index, 'admission')) : [],
    resolvers: Array.isArray(parsed.resolvers) ? parsed.resolvers.map((value, index) => fromNativeResolver(value, index)) : [],
    log: {
      level: asString(log.level, sampleConfig.log.level) as GostConfig['log']['level'],
      format: asString(log.format, sampleConfig.log.format) as GostConfig['log']['format'],
    },
    api: {
      enabled: api.enabled !== false,
      address: asString(api.addr, sampleConfig.api.address),
      pathPrefix: asString(api.pathPrefix, sampleConfig.api.pathPrefix),
    },
    metrics: {
      enabled: Boolean(parsed.metrics),
      address: asString(metrics.addr, sampleConfig.metrics.address),
      path: asString(metrics.path, sampleConfig.metrics.path),
    },
    raw,
  }
}

export function validateConfig(config: GostConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const serviceNames = new Set<string>()
  const chainNames = new Set(config.chains.map((chain) => chain.name))

  if (config.services.length === 0) {
    issues.push({ level: 'warning', path: 'services', message: '没有配置任何服务' })
  }

  config.services.forEach((service, index) => {
    const path = `services[${index}]`
    if (!service.name.trim()) {
      issues.push({ level: 'error', path: `${path}.name`, message: '服务名称不能为空' })
    } else if (serviceNames.has(service.name)) {
      issues.push({ level: 'error', path: `${path}.name`, message: `服务名称重复：${service.name}` })
    }
    serviceNames.add(service.name)

    if (!service.address.trim()) {
      issues.push({ level: 'error', path: `${path}.address`, message: '监听地址不能为空' })
    }
    if (service.chain && !chainNames.has(service.chain)) {
      issues.push({ level: 'warning', path: `${path}.chain`, message: `引用的转发链不存在：${service.chain}` })
    }
    if (service.auth && (!service.authUsername.trim() || !service.authPassword.trim())) {
      issues.push({ level: 'error', path: `${path}.auth`, message: '已启用认证，但用户名或密码为空' })
    }
  })

  config.chains.forEach((chain, index) => {
    const path = `chains[${index}]`
    if (!chain.name.trim()) {
      issues.push({ level: 'error', path: `${path}.name`, message: '转发链名称不能为空' })
    }
    if (chain.nodes.length === 0) {
      issues.push({ level: 'warning', path: `${path}.nodes`, message: '转发链没有节点，运行时不会产生有效路径' })
    }
    chain.nodes.forEach((node, nodeIndex) => {
      if (!node.addr.trim()) {
        issues.push({ level: 'error', path: `${path}.nodes[${nodeIndex}].addr`, message: '节点地址不能为空' })
      }
    })
  })

  validateRules(issues, config.bypasses, 'bypasses')
  validateRules(issues, config.admissions, 'admissions')
  config.resolvers.forEach((resolver, index) => {
    if (!resolver.name.trim()) issues.push({ level: 'error', path: `resolvers[${index}].name`, message: '解析器名称不能为空' })
    if (resolver.nameservers.length === 0) issues.push({ level: 'warning', path: `resolvers[${index}].nameservers`, message: '解析器没有配置 nameserver' })
  })

  if (config.api.enabled && !config.api.address.trim()) {
    issues.push({ level: 'error', path: 'api.address', message: 'API 已启用，但没有监听地址' })
  }
  if (config.metrics.enabled && !config.metrics.address.trim()) {
    issues.push({ level: 'error', path: 'metrics.address', message: 'Metrics 已启用，但没有监听地址' })
  }

  return issues
}

function toNativeConfig(config: GostConfig): NativeRecord {
  const native: NativeRecord = {
    ...(config.raw ?? {}),
    services: config.services.filter((service) => service.enabled).map((service) => {
      const original = findNamedRecord(config.raw?.services, service.name)
      const originalHandler = asRecord(original.handler)
      const originalListener = asRecord(original.listener)
      const handler: NativeRecord = {
        ...originalHandler,
        type: service.type,
        ...(service.chain ? { chain: service.chain } : {}),
      }
      if (service.auth && service.authUsername && service.authPassword) {
        handler.auth = { username: service.authUsername, password: service.authPassword }
      } else {
        delete handler.auth
        delete handler.auther
      }
      return {
        ...original,
        name: service.name,
        addr: service.address,
        handler,
        listener: { ...originalListener, type: service.listener },
      }
    }),
    chains: config.chains.map((chain) => {
      const original = findNamedRecord(config.raw?.chains, chain.name)
      const originalHops = Array.isArray(original.hops) ? original.hops : []
      const originalFirstHop = asRecord(originalHops[0])
      const firstHop = {
        ...originalFirstHop,
        name: asString(originalFirstHop.name, `${chain.name}-hop-0`),
        selector: { ...asRecord(originalFirstHop.selector), strategy: chain.strategy },
        nodes: chain.nodes.map((node) => {
          const originalNode = findNamedRecord(originalFirstHop.nodes, node.name)
          return {
            ...originalNode,
            name: node.name,
            addr: node.addr,
            connector: { ...asRecord(originalNode.connector), type: node.connector },
            dialer: { ...asRecord(originalNode.dialer), type: node.dialer },
          }
        }),
      }
      return { ...original, name: chain.name, hops: [firstHop, ...originalHops.slice(1)] }
    }),
    bypasses: config.bypasses.map((rule) => ({ ...findNamedRecord(config.raw?.bypasses, rule.name), name: rule.name, whitelist: rule.whitelist, matchers: rule.matchers })),
    admissions: config.admissions.map((rule) => ({ ...findNamedRecord(config.raw?.admissions, rule.name), name: rule.name, whitelist: rule.whitelist, matchers: rule.matchers })),
    resolvers: config.resolvers.map((resolver) => ({ ...findNamedRecord(config.raw?.resolvers, resolver.name), name: resolver.name, nameservers: resolver.nameservers.map((addr) => ({ addr })), prefer: resolver.prefer })),
    log: { ...asRecord(config.raw?.log), ...config.log },
  }

  if (config.api.enabled) {
    native.api = { addr: config.api.address, pathPrefix: config.api.pathPrefix }
  } else {
    delete native.api
  }
  if (config.metrics.enabled) {
    native.metrics = { addr: config.metrics.address, path: config.metrics.path }
  } else {
    delete native.metrics
  }
  return native
}

function fromNativeService(value: unknown, index: number): ServiceConfig {
  const service = asRecord(value)
  const handler = asRecord(service.handler)
  const listener = asRecord(service.listener)
  const type = asString(handler.type, 'auto') as ServiceConfig['type']
  return {
    name: asString(service.name, `service-${index + 1}`),
    type,
    listener: asString(listener.type, 'tcp') as ServiceConfig['listener'],
    address: asString(service.addr, ':8080'),
    chain: asString(handler.chain, ''),
    auth: Boolean(handler.auth || handler.auther),
    authUsername: asString(asRecord(handler.auth).username, ''),
    authPassword: asString(asRecord(handler.auth).password, ''),
    enabled: true,
    requests: 0,
    traffic: '—',
    status: 'stopped',
  }
}

function fromNativeChain(value: unknown, index: number): ChainConfig {
  const chain = asRecord(value)
  const hops = Array.isArray(chain.hops) ? chain.hops : []
  const firstHop = asRecord(hops[0])
  const selector = asRecord(firstHop.selector || chain.selector)
  const nodes = Array.isArray(firstHop.nodes) ? firstHop.nodes : []
  return {
    name: asString(chain.name, `chain-${index}`),
    strategy: asString(selector.strategy, 'round') as ChainConfig['strategy'],
    enabled: true,
    nodes: nodes.map((value, nodeIndex) => {
      const node = asRecord(value)
      const connector = asRecord(node.connector)
      const dialer = asRecord(node.dialer)
      return {
        name: asString(node.name, `node-${nodeIndex + 1}`),
        addr: asString(node.addr, ''),
        connector: asString(connector.type, 'direct'),
        dialer: asString(dialer.type, 'tcp'),
        health: 'healthy',
        latency: 0,
      }
    }),
  }
}

function findNamedRecord(value: unknown, name: string): NativeRecord {
  if (!Array.isArray(value)) return {}
  const found = value.find((item) => asRecord(item).name === name)
  return asRecord(found)
}

function validateRules(issues: ValidationIssue[], rules: Array<{ name: string; matchers: string[] }>, section: string) {
  const names = new Set<string>()
  rules.forEach((rule, index) => {
    if (!rule.name.trim()) issues.push({ level: 'error', path: `${section}[${index}].name`, message: '规则名称不能为空' })
    if (names.has(rule.name)) issues.push({ level: 'error', path: `${section}[${index}].name`, message: `规则名称重复：${rule.name}` })
    names.add(rule.name)
    if (rule.matchers.length === 0) issues.push({ level: 'warning', path: `${section}[${index}].matchers`, message: '规则没有匹配项' })
  })
}

function fromNativeRule<T extends BypassRule | AdmissionRule>(value: unknown, index: number, prefix: string): T {
  const rule = asRecord(value)
  return {
    name: asString(rule.name, `${prefix}-${index + 1}`),
    whitelist: rule.whitelist === true,
    matchers: Array.isArray(rule.matchers) ? rule.matchers.filter((item): item is string => typeof item === 'string') : [],
  } as T
}

function fromNativeResolver(value: unknown, index: number): ResolverRule {
  const resolver = asRecord(value)
  const nameservers = Array.isArray(resolver.nameservers) ? resolver.nameservers.map((item) => {
    if (typeof item === 'string') return item
    return asString(asRecord(item).addr, '')
  }).filter(Boolean) : []
  return {
    name: asString(resolver.name, `resolver-${index + 1}`),
    nameservers,
    prefer: asString(resolver.prefer, 'ipv4') as ResolverRule['prefer'],
  }
}

function asRecord(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as NativeRecord : {}
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
