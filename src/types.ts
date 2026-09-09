export type ViewKey = 'overview' | 'services' | 'chains' | 'routing' | 'advanced' | 'runtime' | 'logs'

export interface AuthConfig {
  username: string
  password: string
}

export interface NodeConfig {
  name: string
  addr: string
  connector: string
  dialer: string
  health: 'healthy' | 'degraded' | 'offline'
  latency: number
}

export interface ChainConfig {
  name: string
  strategy: 'round' | 'random' | 'fifo' | 'hash'
  nodes: NodeConfig[]
  enabled: boolean
}

export interface ServiceConfig {
  name: string
  type: 'http' | 'socks5' | 'tcp' | 'udp' | 'auto'
  listener: 'tcp' | 'udp' | 'tls' | 'ws' | 'http2' | 'quic'
  address: string
  chain: string
  auth: boolean
  enabled: boolean
  requests: number
  traffic: string
  status: 'running' | 'stopped' | 'warning'
}

export interface BypassRule {
  name: string
  whitelist: boolean
  matchers: string[]
}

export interface AdmissionRule {
  name: string
  whitelist: boolean
  matchers: string[]
}

export interface ResolverRule {
  name: string
  nameservers: string[]
  prefer: 'ipv4' | 'ipv6' | 'none'
}

export interface GostConfig {
  services: ServiceConfig[]
  chains: ChainConfig[]
  bypasses: BypassRule[]
  admissions: AdmissionRule[]
  resolvers: ResolverRule[]
  log: {
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace'
    format: 'text' | 'json'
  }
  api: {
    enabled: boolean
    address: string
    pathPrefix: string
  }
  metrics: {
    enabled: boolean
    address: string
    path: string
  }
  raw?: Record<string, unknown>
}

export interface RuntimeLog {
  stream: 'stdout' | 'stderr'
  message: string
  timestamp: string
}

export interface RuntimeUpdateState {
  status: 'checking' | 'available' | 'up-to-date' | 'offline'
  checkedAt: string
  currentGostCommit: string
  latestGostCommit: string
  currentXCommit: string
  latestXCommit: string
  gostMessage?: string
  xMessage?: string
  studioRelease?: string
  studioReleaseUrl?: string
  error?: string
}

export interface RuntimeState {
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error'
  version: string
  source: string
  binaryPath: string
  pid?: number
  startedAt?: string
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  path: string
  message: string
}
