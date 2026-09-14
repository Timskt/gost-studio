import type { ApiConfig, GostConfig, LogConfig, MetricsConfig } from '../types'

export const DEFAULT_LOG: LogConfig = { level: 'info', format: 'text' }

export const DEFAULT_API: ApiConfig = { enabled: false, address: '127.0.0.1:18080', pathPrefix: '/api' }

export const DEFAULT_METRICS: MetricsConfig = { enabled: false, address: '127.0.0.1:9000', path: '/metrics' }

/**
 * The starter config offered when no file has been opened yet. It carries no credentials on
 * purpose: an example password would be written verbatim into a config the user then runs.
 */
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
      auther: '',
      enabled: true,
    },
    {
      name: 'private-socks',
      type: 'socks5',
      listener: 'tcp',
      address: '127.0.0.1:1080',
      chain: 'relay-east',
      auth: false,
      authUsername: '',
      authPassword: '',
      auther: '',
      enabled: true,
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
      auther: '',
      enabled: false,
    },
  ],
  chains: [
    {
      name: 'direct',
      strategy: 'fifo',
      enabled: true,
      nodes: [{ name: 'local', addr: 'direct', connector: 'direct', dialer: 'direct' }],
    },
    {
      name: 'relay-east',
      strategy: 'round',
      enabled: true,
      nodes: [
        { name: 'gateway-01', addr: '198.51.100.12:443', connector: 'http2', dialer: 'tls' },
        { name: 'gateway-02', addr: '203.0.113.48:443', connector: 'http2', dialer: 'tls' },
      ],
    },
  ],
  bypasses: [{ name: 'private-direct', whitelist: false, matchers: ['localhost', '127.0.0.1', '192.168.0.0/16'] }],
  admissions: [{ name: 'local-only', whitelist: true, matchers: ['127.0.0.1', '::1'] }],
  resolvers: [{ name: 'system-dns', nameservers: ['udp://1.1.1.1:53'], prefer: 'ipv4' }],
  authers: [],
  hosts: [{ name: 'local-hosts', entries: [{ ip: '127.0.0.1', hostname: 'localhost', aliases: [] }] }],
  limiters: [{ name: 'office-limit', limits: ['10MB'] }],
  recorders: [{ name: 'audit-file', type: 'file', target: './logs/gost.log' }],
  log: DEFAULT_LOG,
  api: { ...DEFAULT_API, enabled: true },
  metrics: { ...DEFAULT_METRICS, enabled: true },
  raw: {},
}
