import type { AdmissionRule, BypassRule, GostConfig, ValidationIssue } from '../types'

interface Named {
  name: string
}

/**
 * Checks the editor model for problems GOST would only report at startup, plus a few the runtime
 * accepts silently but the user almost certainly did not intend (a dangling reference, a user
 * without a password). Errors block a save-and-run; warnings are advisory.
 */
export function validateConfig(config: GostConfig): ValidationIssue[] {
  return [
    ...validateServices(config),
    ...validateChains(config),
    ...validateRules(config.bypasses, 'bypasses'),
    ...validateRules(config.admissions, 'admissions'),
    ...validateResolvers(config),
    ...validateAuthers(config),
    ...validateNames(config.hosts, 'hosts'),
    ...validateNames(config.limiters, 'limiters'),
    ...validateNames(config.recorders, 'recorders'),
    ...validateListeners(config),
  ]
}

function validateServices(config: GostConfig): ValidationIssue[] {
  if (config.services.length === 0) {
    return [{ level: 'warning', path: 'services', message: '没有配置任何服务' }]
  }

  const chainNames = new Set(config.chains.map((chain) => chain.name))
  const autherNames = new Set(config.authers.map((auther) => auther.name))
  const seen = new Set<string>()

  return config.services.flatMap((service, index) => {
    const path = `services[${index}]`
    const issues: ValidationIssue[] = [...duplicateName(service, seen, path, '服务名称')]

    if (!service.address.trim()) {
      issues.push({ level: 'error', path: `${path}.address`, message: '监听地址不能为空' })
    }
    if (service.chain && !chainNames.has(service.chain)) {
      issues.push({ level: 'warning', path: `${path}.chain`, message: `引用的转发链不存在：${service.chain}` })
    }
    if (service.auther && !autherNames.has(service.auther)) {
      issues.push({ level: 'error', path: `${path}.auther`, message: `引用的认证器不存在：${service.auther}` })
    }
    if (!service.auther && service.auth && (!service.authUsername.trim() || !service.authPassword.trim())) {
      issues.push({ level: 'error', path: `${path}.auth`, message: '已启用认证，但用户名或密码为空' })
    }
    return issues
  })
}

function validateChains(config: GostConfig): ValidationIssue[] {
  const seen = new Set<string>()
  return config.chains.flatMap((chain, index) => {
    const path = `chains[${index}]`
    const issues: ValidationIssue[] = [...duplicateName(chain, seen, path, '转发链名称')]

    if (chain.nodes.length === 0) {
      issues.push({ level: 'warning', path: `${path}.nodes`, message: '转发链没有节点，运行时不会产生有效路径' })
    }
    chain.nodes.forEach((node, nodeIndex) => {
      if (!node.addr.trim()) {
        issues.push({ level: 'error', path: `${path}.nodes[${nodeIndex}].addr`, message: '节点地址不能为空' })
      }
    })
    return issues
  })
}

function validateResolvers(config: GostConfig): ValidationIssue[] {
  const seen = new Set<string>()
  return config.resolvers.flatMap((resolver, index) => {
    const path = `resolvers[${index}]`
    const issues: ValidationIssue[] = [...duplicateName(resolver, seen, path, '解析器名称')]
    if (resolver.nameservers.length === 0) {
      issues.push({ level: 'warning', path: `${path}.nameservers`, message: '解析器没有配置 nameserver' })
    }
    return issues
  })
}

function validateAuthers(config: GostConfig): ValidationIssue[] {
  const seen = new Set<string>()
  return config.authers.flatMap((auther, index) => {
    const path = `authers[${index}]`
    const issues: ValidationIssue[] = [...duplicateName(auther, seen, path, '认证器名称')]

    if (auther.users.length === 0) {
      issues.push({ level: 'warning', path: `${path}.users`, message: '认证器没有配置用户' })
    }
    auther.users.forEach((user, userIndex) => {
      const userPath = `${path}.users[${userIndex}]`
      if (!user.username.trim()) {
        issues.push({ level: 'error', path: `${userPath}.username`, message: '用户名不能为空' })
      } else if (!user.password) {
        issues.push({ level: 'warning', path: `${userPath}.password`, message: `${user.username} 没有设置密码` })
      }
    })
    return issues
  })
}

function validateRules(rules: Array<BypassRule | AdmissionRule>, section: string): ValidationIssue[] {
  const seen = new Set<string>()
  return rules.flatMap((rule, index) => {
    const path = `${section}[${index}]`
    const issues: ValidationIssue[] = [...duplicateName(rule, seen, path, '规则名称')]
    if (rule.matchers.length === 0) {
      issues.push({ level: 'warning', path: `${path}.matchers`, message: '规则没有匹配项' })
    }
    return issues
  })
}

function validateNames(values: Named[], section: string): ValidationIssue[] {
  const seen = new Set<string>()
  return values.flatMap((value, index) => duplicateName(value, seen, `${section}[${index}]`, '组件名称'))
}

function validateListeners(config: GostConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (config.api.enabled && !config.api.address.trim()) {
    issues.push({ level: 'error', path: 'api.address', message: 'API 已启用，但没有监听地址' })
  }
  if (config.metrics.enabled && !config.metrics.address.trim()) {
    issues.push({ level: 'error', path: 'metrics.address', message: 'Metrics 已启用，但没有监听地址' })
  }
  return issues
}

/** Reports a blank or already-taken name, then records it so the next entry can be compared. */
function duplicateName(value: Named, seen: Set<string>, path: string, label: string): ValidationIssue[] {
  const taken = seen.has(value.name)
  seen.add(value.name)
  if (!value.name.trim()) return [{ level: 'error', path: `${path}.name`, message: `${label}不能为空` }]
  if (taken) return [{ level: 'error', path: `${path}.name`, message: `${label}重复：${value.name}` }]
  return []
}
