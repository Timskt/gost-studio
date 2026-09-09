import { describe, expect, it } from 'vitest'
import { parseConfig, sampleConfig, serializeConfig, validateConfig } from './config'

describe('GOST config adapter', () => {
  it('serializes the friendly editor model to native GOST YAML', () => {
    const yaml = serializeConfig(sampleConfig)

    expect(yaml).toContain('handler:')
    expect(yaml).toContain('listener:')
    expect(yaml).toContain('hops:')
    expect(yaml).toContain('connector:')
    expect(yaml).not.toContain('address:')
  })

  it('round-trips services and chains through native YAML', () => {
    const restored = parseConfig(serializeConfig(sampleConfig))

    expect(restored.services.map((service) => service.name)).toEqual(['edge-http', 'private-socks'])
    expect(restored.services[1]?.chain).toBe('relay-east')
    expect(restored.services[1]?.authUsername).toBe('user')
    expect(restored.chains[1]?.nodes[0]?.addr).toBe('198.51.100.12:443')
    expect(restored.metrics.enabled).toBe(true)
    expect(restored.bypasses[0]?.matchers).toContain('localhost')
    expect(restored.admissions[0]?.whitelist).toBe(true)
    expect(restored.resolvers[0]?.nameservers[0]).toBe('udp://1.1.1.1:53')
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
})
