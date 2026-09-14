import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { STUDIO_KEY, parseConfig, sampleConfig, serializeConfig, validateConfig } from './config'

type AnyRecord = Record<string, any>

describe('GOST config adapter', () => {
  it('serializes the friendly editor model to native GOST YAML', () => {
    const yaml = serializeConfig(sampleConfig)

    expect(yaml).toContain('handler:')
    expect(yaml).toContain('listener:')
    expect(yaml).toContain('hops:')
    expect(yaml).toContain('connector:')
    expect(yaml).not.toContain('address:')
  })

  it('round-trips every service, including the ones switched off', () => {
    const restored = parseConfig(serializeConfig(sampleConfig))

    expect(restored.services.map((service) => service.name)).toEqual(['edge-http', 'private-socks', 'dns-forward'])
    expect(restored.services.map((service) => service.enabled)).toEqual([true, true, false])
    expect(restored.services[1]?.chain).toBe('relay-east')
    expect(restored.chains[1]?.nodes[0]?.addr).toBe('198.51.100.12:443')
    expect(restored.bypasses[0]?.matchers).toContain('localhost')
    expect(restored.admissions[0]?.whitelist).toBe(true)
    expect(restored.resolvers[0]?.nameservers[0]).toBe('udp://1.1.1.1:53')
    expect(restored.hosts[0]?.entries[0]?.hostname).toBe('localhost')
    expect(restored.limiters[0]?.limits[0]).toBe('10MB')
    expect(restored.recorders[0]?.target).toBe('./logs/gost.log')
    expect(restored.metrics.enabled).toBe(true)
  })

  it('keeps a switched-off service out of the native services list', () => {
    const native = parse(serializeConfig(sampleConfig)) as AnyRecord

    expect(native.services.map((service: AnyRecord) => service.name)).toEqual(['edge-http', 'private-socks'])
    expect(native[STUDIO_KEY].disabledServices.map((service: AnyRecord) => service.name)).toEqual(['dns-forward'])
  })

  it('omits the editor block entirely when nothing editor-only needs storing', () => {
    const plain = {
      ...sampleConfig,
      services: sampleConfig.services.filter((service) => service.enabled),
    }

    expect(parse(serializeConfig(plain)) as AnyRecord).not.toHaveProperty(STUDIO_KEY)
  })

  it('remembers canvas coordinates without writing them into GOST nodes', () => {
    const positioned = {
      ...sampleConfig,
      chains: sampleConfig.chains.map((chain, index) =>
        index === 0 ? { ...chain, nodes: chain.nodes.map((node) => ({ ...node, position: { x: 240, y: 96 } })) } : chain,
      ),
    }

    const yaml = serializeConfig(positioned)
    const native = parse(yaml) as AnyRecord

    expect(native.chains[0].hops[0].nodes[0].position).toBeUndefined()
    expect(parseConfig(yaml).chains[0]?.nodes[0]?.position).toEqual({ x: 240, y: 96 })
  })

  it('keeps the API address after the listener is switched off', () => {
    const off = { ...sampleConfig, api: { ...sampleConfig.api, enabled: false } }

    const restored = parseConfig(serializeConfig(off))

    expect(restored.api.enabled).toBe(false)
    expect(restored.api.address).toBe(sampleConfig.api.address)
    expect(parse(serializeConfig(off)) as AnyRecord).not.toHaveProperty('api')
  })

  it('derives api and metrics state from presence, not from an invented flag', () => {
    const restored = parseConfig('services: []\n')

    expect(restored.api.enabled).toBe(false)
    expect(restored.metrics.enabled).toBe(false)
  })

  it('does not inherit template components when a section is absent', () => {
    const restored = parseConfig('services: []\n')

    expect(restored.chains).toEqual([])
    expect(restored.bypasses).toEqual([])
    expect(restored.recorders).toEqual([])
  })

  it('keeps root-level fields unknown to the friendly editor', () => {
    const restored = parseConfig(`
services:
  - name: edge
    addr: :8080
    handler:
      type: http
    listener:
      type: tcp
chains: []
experimental:
  featureFlag: true
`)

    expect(restored.raw?.experimental).toEqual({ featureFlag: true })
    expect(serializeConfig(restored)).toContain('featureFlag: true')
    expect(serializeConfig(restored)).toContain('chains: []')
  })

  it('preserves unknown fields nested in edited services and nodes', () => {
    const restored = parseConfig(`
services:
  - name: edge
    addr: :8080
    handler:
      type: http
      metadata:
        futureOption: true
    listener:
      type: tcp
      metadata:
        platformHint: arm64
chains:
  - name: relay
    hops:
      - name: hop-0
        selector:
          strategy: round
        nodes:
          - name: node-0
            addr: 127.0.0.1:8080
            connector:
              type: http
              futureConnectorOption: true
            dialer:
              type: tcp
`)

    const yaml = serializeConfig(restored)
    expect(yaml).toContain('futureOption: true')
    expect(yaml).toContain('platformHint: arm64')
    expect(yaml).toContain('futureConnectorOption: true')
  })

  it('preserves unknown fields on a service that is toggled off and on again', () => {
    const restored = parseConfig(`
services:
  - name: edge
    addr: :8080
    handler:
      type: http
      metadata:
        futureOption: true
    listener:
      type: tcp
`)

    const off = { ...restored, services: restored.services.map((service) => ({ ...service, enabled: false })) }
    const backOn = parseConfig(serializeConfig(off))
    const restoredOn = { ...backOn, services: backOn.services.map((service) => ({ ...service, enabled: true })) }

    expect(serializeConfig(restoredOn)).toContain('futureOption: true')
  })

  it('reports duplicate services and missing chain references', () => {
    const issues = validateConfig({
      ...sampleConfig,
      services: [
        { ...sampleConfig.services[0], name: 'duplicate', chain: 'missing' },
        { ...sampleConfig.services[1], name: 'duplicate' },
      ],
    })

    expect(issues.some((issue) => issue.level === 'error' && issue.path.endsWith('.name'))).toBe(true)
    expect(issues.some((issue) => issue.level === 'warning' && issue.path.endsWith('.chain'))).toBe(true)
  })

  it('reports a service pointing at an auther that does not exist', () => {
    const issues = validateConfig({
      ...sampleConfig,
      services: [{ ...sampleConfig.services[0], auther: 'ghost' }],
    })

    expect(issues.some((issue) => issue.level === 'error' && issue.path.endsWith('.auther'))).toBe(true)
  })

  it('warns about an auther user left without a password', () => {
    const issues = validateConfig({
      ...sampleConfig,
      authers: [{ name: 'edge-users', users: [{ username: 'user', password: '' }] }],
    })

    expect(issues.some((issue) => issue.level === 'warning' && issue.path.includes('authers'))).toBe(true)
  })
})
