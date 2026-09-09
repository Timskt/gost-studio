import { parse, stringify } from 'yaml'
import type { ChainConfig, GostConfig, NodeConfig, ServiceConfig, ValidationIssue } from '../types'

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
  delete raw.services
  delete raw.chains
  delete raw.log
  delete raw.api
  delete raw.metrics

  const log = asRecord(parsed.log)
  const api = asRecord(parsed.api)
  const metrics = asRecord(parsed.metrics)

  return {
    ...sampleConfig,
    services,
    chains,
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
    services: config.services.map((service) => ({
      name: service.name,
      addr: service.address,
      handler: {
        type: service.type,
        ...(service.chain ? { chain: service.chain } : {}),
      },
      listener: { type: service.listener },
    })),
    chains: config.chains.map((chain) => ({
      name: chain.name,
      hops: [{
        name: `${chain.name}-hop-0`,
        selector: { strategy: chain.strategy },
        nodes: chain.nodes.map((node) => ({
          name: node.name,
          addr: node.addr,
          connector: { type: node.connector },
          dialer: { type: node.dialer },
        })),
      }],
    })),
    log: config.log,
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

function asRecord(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as NativeRecord : {}
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
