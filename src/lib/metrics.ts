import type { GostConfig } from '../types'

export interface MetricsSnapshot {
  available: boolean
  services: number
  requests: number
  inputBytes: number
  outputBytes: number
  checkedAt: string
  error?: string
}

export async function fetchMetrics(config: GostConfig['metrics']): Promise<MetricsSnapshot> {
  const checkedAt = new Date().toISOString()
  if (!config.enabled || !config.address) {
    return { available: false, services: 0, requests: 0, inputBytes: 0, outputBytes: 0, checkedAt, error: 'Metrics 未启用' }
  }

  try {
    const base = config.address.startsWith('http://') || config.address.startsWith('https://') ? config.address : `http://${config.address}`
    const path = config.path.startsWith('/') ? config.path : `/${config.path}`
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    return {
      available: true,
      services: sumMetric(text, 'gost_services'),
      requests: sumMetric(text, 'gost_service_requests_total'),
      inputBytes: sumMetric(text, 'gost_service_transfer_input_bytes_total'),
      outputBytes: sumMetric(text, 'gost_service_transfer_output_bytes_total'),
      checkedAt,
    }
  } catch (error) {
    return {
      available: false,
      services: 0,
      requests: 0,
      inputBytes: 0,
      outputBytes: 0,
      checkedAt,
      error: error instanceof Error ? error.message : 'Metrics 不可用',
    }
  }
}

function sumMetric(text: string, metricName: string): number {
  const pattern = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`)
  return text.split('\n').reduce((total, line) => {
    if (!line.startsWith(metricName) || line.startsWith(`${metricName}_`)) return total
    const match = line.match(pattern)
    const value = Number(match?.[1])
    return Number.isFinite(value) ? total + value : total
  }, 0)
}
