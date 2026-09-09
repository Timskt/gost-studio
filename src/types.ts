export type ViewKey = 'overview' | 'services' | 'chains' | 'routing' | 'advanced' | 'runtime'

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

export interface GostConfig {
  services: ServiceConfig[]
  chains: ChainConfig[]
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
