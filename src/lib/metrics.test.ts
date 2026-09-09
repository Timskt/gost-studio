import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMetrics } from './metrics'

afterEach(() => vi.unstubAllGlobals())

describe('metrics adapter', () => {
  it('reads the GOST Prometheus counters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'gost_services 2',
      'gost_service_requests_total{service="one"} 4',
      'gost_service_requests_total{service="two"} 6',
      'gost_service_transfer_input_bytes_total 1024',
      'gost_service_transfer_output_bytes_total 2048',
    ].join('\n'), { status: 200 })))

    const snapshot = await fetchMetrics({ enabled: true, address: '127.0.0.1:9000', path: '/metrics' })

    expect(snapshot.available).toBe(true)
    expect(snapshot.services).toBe(2)
    expect(snapshot.requests).toBe(10)
    expect(snapshot.inputBytes).toBe(1024)
    expect(snapshot.outputBytes).toBe(2048)
  })

  it('fails soft when Metrics is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    const snapshot = await fetchMetrics({ enabled: true, address: '127.0.0.1:9000', path: '/metrics' })

    expect(snapshot.available).toBe(false)
    expect(snapshot.error).toBe('offline')
  })
})
