export type ViewKey = 'overview' | 'services' | 'chains' | 'routing' | 'components' | 'advanced' | 'runtime' | 'logs'

export interface AuthConfig {
  username: string
  password: string
}

/** One GOST chain node: the dialer opens the transport, the connector speaks the protocol. */
export interface NodeConfig {
  name: string
  addr: string
  connector: string
  dialer: string
  /** Canvas coordinates, persisted so a hand-arranged chain keeps its layout. */
  position?: { x: number; y: number }
}

export interface ChainConfig {
  name: string
  strategy: 'round' | 'random' | 'fifo' | 'hash'
  nodes: NodeConfig[]
  enabled: boolean
}

export interface ServiceConfig {
  name: string
  /** GOST handler type. Free-form: upstream registers far more handlers than we can enumerate. */
  type: string
  /** GOST listener type. Free-form for the same reason. */
  listener: string
  address: string
  chain: string
  auth: boolean
  authUsername: string
  authPassword: string
  /** Name of an auther component, an alternative to inline credentials. */
  auther: string
  enabled: boolean
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

export interface AuthGroup {
  name: string
  users: AuthConfig[]
}

export interface HostGroup {
  name: string
  entries: Array<{ ip: string; hostname: string; aliases: string[] }>
}

export interface LimiterRule {
  name: string
  limits: string[]
}

export interface RecorderRule {
  name: string
  type: 'file' | 'tcp' | 'http' | 'redis'
  target: string
}

export interface LogConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace'
  format: 'text' | 'json'
}

export interface ListenerToggle {
  enabled: boolean
  address: string
}

export interface ApiConfig extends ListenerToggle {
  pathPrefix: string
}

export interface MetricsConfig extends ListenerToggle {
  path: string
}

export interface GostConfig {
  services: ServiceConfig[]
  chains: ChainConfig[]
  bypasses: BypassRule[]
  admissions: AdmissionRule[]
  resolvers: ResolverRule[]
  authers: AuthGroup[]
  hosts: HostGroup[]
  limiters: LimiterRule[]
  recorders: RecorderRule[]
  log: LogConfig
  api: ApiConfig
  metrics: MetricsConfig
  /** Verbatim parse of the source YAML, so fields the editor does not model survive a save. */
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

export type RuntimeStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error'

export type DebugLevel = 'off' | 'debug' | 'trace'

export interface RuntimeState {
  status: RuntimeStatus
  /** Reported by `gost -V`; empty until a binary has been probed. */
  version: string
  binaryPath: string
  configPath: string
  pid?: number
  startedAt?: string
  lastError?: string
}

export interface RuntimeLaunchOptions {
  binaryPath: string
  configPath: string
  debugLevel: DebugLevel
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  path: string
  message: string
}
