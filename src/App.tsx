import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Command,
  ExternalLink,
  Gauge,
  GitBranch,
  Globe2,
  HardDriveDownload,
  Info,
  Layers3,
  Menu,
  Network,
  Play,
  Plus,
  RotateCw,
  Router,
  Save,
  Search,
  Server,
  ShieldCheck,
  Square,
  TerminalSquare,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { parseConfig, sampleConfig, serializeConfig, validateConfig } from './lib/config'
import { chooseBinaryFile, chooseConfigFile, chooseSavePath, readTextFile, writeTextFile } from './lib/files'
import { checkForUpdates } from './lib/updates'
import { subscribeRuntimeLogs } from './lib/logs'
import { fetchMetrics, type MetricsSnapshot } from './lib/metrics'
import { getRuntimeState, isTauriRuntime, startGost, stopGost } from './lib/tauri'
import type { ChainConfig, GostConfig, NodeConfig, RuntimeLog, RuntimeState, RuntimeUpdateState, RecorderRule, ServiceConfig, ViewKey } from './types'
import './styles.css'

const viewLabels: Record<ViewKey, string> = { overview: '总览', services: '服务', chains: '转发链', routing: '路由与规则', components: '组件库', advanced: '高级配置', runtime: '运行时', logs: '运行日志' }

const FLOW_NODE_START_X = 170
const FLOW_NODE_GAP = 190

const nodePresets: Array<{ id: string; label: string; description: string; connector: string; dialer: string; addr: string }> = [
  { id: 'direct', label: '直连节点', description: 'Direct over TCP', connector: 'direct', dialer: 'direct', addr: 'direct' },
  { id: 'http-tls', label: 'HTTP over TLS', description: 'HTTP2 via TLS', connector: 'http2', dialer: 'tls', addr: 'gateway.example:443' },
  { id: 'socks5-tcp', label: 'SOCKS5 over TCP', description: 'SOCKS5 proxy', connector: 'socks5', dialer: 'tcp', addr: '127.0.0.1:1080' },
  { id: 'relay-quic', label: 'Relay over QUIC', description: 'Relay tunnel', connector: 'relay', dialer: 'quic', addr: 'gateway.example:443' },
]

const navItems: Array<{ id: ViewKey; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: '总览', icon: Activity },
  { id: 'services', label: '服务', icon: Server },
  { id: 'chains', label: '转发链', icon: GitBranch },
  { id: 'routing', label: '路由与规则', icon: Router },
  { id: 'components', label: '组件库', icon: Boxes },
  { id: 'advanced', label: '高级配置', icon: Braces },
]

const initialUpdate: RuntimeUpdateState = {
  status: 'checking',
  checkedAt: '',
  currentGostCommit: '',
  latestGostCommit: '',
  currentXCommit: '',
  latestXCommit: '',
}

const initialLogs: RuntimeLog[] = [
  { stream: 'stdout', message: 'service edge-http listening on [::]:8080/tcp', timestamp: new Date(Date.now() - 42_000).toISOString() },
  { stream: 'stdout', message: 'service private-socks listening on 127.0.0.1:1080/tcp', timestamp: new Date(Date.now() - 38_000).toISOString() },
  { stream: 'stdout', message: 'chain relay-east route established via gateway-01', timestamp: new Date(Date.now() - 21_000).toISOString() },
  { stream: 'stderr', message: 'gateway-02 probe latency increased to 142ms', timestamp: new Date(Date.now() - 8_000).toISOString() },
]

const initialRuntime: RuntimeState = {
  status: 'running',
  version: 'v3.3.1',
  source: 'master · 36cc266',
  binaryPath: '',
  pid: 18432,
  startedAt: '2026-09-09T08:42:00+08:00',
}

function App() {
  const [view, setView] = useState<ViewKey>('overview')
  const [config, setConfig] = useState<GostConfig>(sampleConfig)
  const [runtime, setRuntime] = useState<RuntimeState>(initialRuntime)
  const [expertMode, setExpertMode] = useState(false)
  const [rawConfig, setRawConfig] = useState(() => serializeConfig(sampleConfig))
  const [notice, setNotice] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [updateState, setUpdateState] = useState<RuntimeUpdateState>(initialUpdate)
  const [logs, setLogs] = useState<RuntimeLog[]>(initialLogs)
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [configPath, setConfigPath] = useState(() => window.localStorage.getItem('gost-studio.configPath') ?? 'gost.yml')

  useEffect(() => {
    window.localStorage.setItem('gost-studio.configPath', configPath)
  }, [configPath])

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    subscribeRuntimeLogs((entry) => {
      setLogs((current) => [...current.slice(-999), entry])
    }).then((dispose) => {
      if (active) unlisten = dispose
      else dispose()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let active = true
    const refresh = () => fetchMetrics(config.metrics).then((snapshot) => {
      if (active) setMetrics(snapshot)
    })
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [config.metrics.address, config.metrics.enabled, config.metrics.path])

  useEffect(() => {
    let cancelled = false
    getRuntimeState().then((state) => {
      if (!cancelled && isTauriRuntime()) setRuntime(state)
    }).catch(() => undefined)
    checkForUpdates().then((state) => {
      if (!cancelled) setUpdateState(state)
    })
    return () => { cancelled = true }
  }, [])

  const issues = useMemo(() => validateConfig(config), [config])
  const activeErrors = issues.filter((issue) => issue.level === 'error').length
  const activeWarnings = issues.filter((issue) => issue.level === 'warning').length

  function selectView(nextView: ViewKey) {
    setView(nextView)
    setSidebarOpen(false)
  }

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2800)
  }

  async function toggleRuntime() {
    try {
      if (runtime.status === 'running') {
        setRuntime({ ...runtime, status: 'stopping' })
        const next = await stopGost()
        setRuntime(next)
        showNotice('GOST 已停止')
        return
      }

      setRuntime({ ...runtime, status: 'starting' })
      const next = await startGost(runtime.binaryPath, configPath)
      setRuntime({ ...next, status: 'running' })
      showNotice('GOST 已启动')
    } catch (error) {
      setRuntime({ ...runtime, status: 'error' })
      showNotice(error instanceof Error ? error.message : '运行时操作失败')
    }
  }

  function applyRawConfig() {
    try {
      const next = parseConfig(rawConfig)
      const nextIssues = validateConfig(next)
      if (nextIssues.some((issue) => issue.level === 'error')) {
        showNotice('配置存在错误，请先修正后再应用')
        return
      }
      setConfig(next)
      setRawConfig(serializeConfig(next))
      showNotice('配置已应用到编辑器')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '配置解析失败')
    }
  }

  function updateConfig(next: GostConfig) {
    setConfig(next)
    setRawConfig(serializeConfig(next))
  }

  async function openConfig() {
    try {
      const path = await chooseConfigFile()
      if (!path) {
        showNotice(isTauriRuntime() ? '没有选择配置文件' : '请在桌面版中打开本地配置文件')
        return
      }
      const source = await readTextFile(path)
      const next = parseConfig(source)
      setConfig(next)
      setRawConfig(source)
      setConfigPath(path)
      showNotice(`已打开 ${path.split('/').pop() ?? '配置文件'}`)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '打开配置失败')
    }
  }

  async function saveConfig(pathOverride?: string) {
    try {
      const path = pathOverride ?? await chooseSavePath(configPath)
      if (!path) {
        showNotice('没有选择保存位置')
        return
      }
      await writeTextFile(path, rawConfig)
      setConfigPath(path)
      showNotice(`配置已保存到 ${path.split('/').pop() ?? '配置文件'}`)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '保存配置失败')
    }
  }

  async function refreshUpdates() {
    setUpdateState((current) => ({ ...current, status: 'checking' }))
    setUpdateState(await checkForUpdates(true))
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Network size={18} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">GOST Studio</div>
            <div className="brand-caption">Control plane</div>
          </div>
          <button className="icon-button mobile-close" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="workspace-selector">
          <div className="workspace-avatar">L</div>
          <div className="workspace-copy"><strong>本地工作区</strong><span>默认配置</span></div>
          <ChevronRight size={15} className="muted-icon" />
        </div>

        <div className="nav-section-label">工作区</div>
        <nav className="primary-nav" aria-label="主导航">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'nav-item--active' : ''}`} onClick={() => selectView(id)}>
              <Icon size={17} strokeWidth={1.9} />
              <span>{label}</span>
              {id === 'services' && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="nav-section-label nav-section-label--spaced">工具</div>
        <nav className="primary-nav" aria-label="工具导航">
          <button className={`nav-item ${view === 'logs' ? 'nav-item--active' : ''}`} onClick={() => selectView('logs')}><TerminalSquare size={17} strokeWidth={1.9} /><span>运行日志</span><span className="nav-count">{logs.length}</span></button>
          <button className={`nav-item ${view === 'runtime' ? 'nav-item--active' : ''}`} onClick={() => selectView('runtime')}><HardDriveDownload size={17} strokeWidth={1.9} /><span>运行时</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sync-card">
            <div className="sync-icon"><GitBranch size={15} /></div>
            <div className="sync-copy"><strong>跟进 upstream</strong><span>master · 已同步</span></div>
            <Check size={15} className="success-icon" />
          </div>
          <div className="profile-row"><div className="profile-avatar"><UserRound size={15} /></div><span>本地管理员</span><CircleHelp size={16} className="muted-icon profile-help" /></div>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>GOST Studio</span><ChevronRight size={14} /><strong>{viewLabels[view]}</strong></div>
          <div className="topbar-actions">
            {updateState.status === 'available' && <button className="topbar-update" onClick={() => selectView('runtime')}><span />有 upstream 更新</button>}
            <div className="connection-status"><span className={`status-dot status-dot--${runtime.status}`} />{runtime.status === 'running' ? '本地运行中' : '已停止'}</div>
            <button className="icon-button" aria-label="搜索" onClick={() => showNotice('搜索会在配置规模较大时自动启用')}><Search size={17} /></button>
            <button className="icon-button" aria-label="帮助" onClick={() => showNotice('查看 docs.gost.run 获取协议与配置说明')}><CircleHelp size={17} /></button>
            <div className="topbar-avatar">T</div>
          </div>
        </header>

        <div className="content-wrap">
          {view === 'overview' && <Overview config={config} runtime={runtime} metrics={metrics} onSelectView={selectView} onToggleRuntime={toggleRuntime} onNotice={showNotice} />}
          {view === 'services' && <ServicesView config={config} expertMode={expertMode} onConfigChange={updateConfig} onToggleExpert={() => setExpertMode((current) => !current)} onSave={() => saveConfig()} onNotice={showNotice} />}
          {view === 'chains' && <ChainsView config={config} onConfigChange={updateConfig} onSave={() => saveConfig()} onNotice={showNotice} />}
          {view === 'routing' && <RoutingView config={config} onConfigChange={updateConfig} onNotice={showNotice} />}
          {view === 'components' && <ComponentsView config={config} onConfigChange={updateConfig} onSave={() => saveConfig()} onNotice={showNotice} />}
          {view === 'advanced' && <AdvancedView config={config} rawConfig={rawConfig} expertMode={expertMode} issues={issues} onRawChange={setRawConfig} onApply={applyRawConfig} onOpen={openConfig} onSave={() => saveConfig()} onToggleExpert={() => setExpertMode((current) => !current)} onNotice={showNotice} />}
          {view === 'logs' && <LogsView logs={logs} onClear={() => setLogs([])} onNotice={showNotice} />}
          {view === 'runtime' && <RuntimeView runtime={runtime} updateState={updateState} configPath={configPath} onConfigPathChange={setConfigPath} onBinaryPathChange={(binaryPath) => setRuntime((current) => ({ ...current, binaryPath }))} onChooseBinary={async () => { const path = await chooseBinaryFile(); if (path) setRuntime((current) => ({ ...current, binaryPath: path })) }} onChooseConfig={async () => { const path = await chooseConfigFile(); if (path) setConfigPath(path) }} onCheckUpdates={refreshUpdates} onToggleRuntime={toggleRuntime} onNotice={showNotice} />}
        </div>

        <footer className="app-footer"><span>GOST Studio 0.1.0</span><span className="footer-separator">·</span><span>Runtime {runtime.version}</span><span className="footer-separator">·</span><button onClick={() => showNotice('同步器会跟踪 GOST upstream 的提交并生成兼容性报告')}>同步策略</button></footer>
      </main>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
      <div className="validation-badge" title="当前配置校验结果"><span className={activeErrors ? 'validation-error' : 'validation-ok'}>{activeErrors ? activeErrors : <Check size={13} />}</span>{activeWarnings > 0 && <span className="validation-warning">{activeWarnings}</span>}</div>
    </div>
  )
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>
}

function Overview({ config, runtime, metrics, onSelectView, onToggleRuntime, onNotice }: { config: GostConfig; runtime: RuntimeState; metrics: MetricsSnapshot | null; onSelectView: (view: ViewKey) => void; onToggleRuntime: () => void; onNotice: (message: string) => void }) {
  const runningServices = config.services.filter((service) => service.enabled).length
  const nodeCount = config.chains.reduce((total, chain) => total + chain.nodes.length, 0)
  const activeServices = metrics?.available ? `${metrics.services}` : `${runningServices}/${config.services.length}`
  const requestCount = metrics?.available ? metrics.requests.toLocaleString('en-US') : '1,248'
  return <>
    <PageHeader eyebrow="LOCAL WORKSPACE / DEFAULT" title="一眼看清，稳稳运行。" description="管理本地 GOST 实例、服务和转发路径。简单配置留给日常，底层能力随时可见。" actions={<><button className="button button--secondary" onClick={() => onSelectView('advanced')}><Code2 size={16} />打开原始配置</button><button className={`button ${runtime.status === 'running' ? 'button--danger' : 'button--primary'}`} onClick={onToggleRuntime}>{runtime.status === 'running' ? <><Square size={14} fill="currentColor" />停止实例</> : <><Play size={15} fill="currentColor" />启动实例</>}</button></>} />

    <div className="runtime-banner">
      <div className="runtime-state"><span className="runtime-pulse" /><div><span className="label-small">GOST RUNTIME</span><strong>{runtime.status === 'running' ? '运行正常' : runtime.status === 'starting' ? '正在启动' : '未运行'}</strong></div></div>
      <div className="runtime-meta"><span><span className="meta-label">版本</span>{runtime.version}</span><span><span className="meta-label">来源</span>{runtime.source}</span><span><span className="meta-label">PID</span>{runtime.pid ?? '—'}</span></div>
      <button className="text-button" onClick={() => onNotice('运行时管理器会在发布版中自动下载与校验二进制')}><ExternalLink size={14} />查看运行时</button>
    </div>

    <div className="metric-grid">
      <MetricCard label="活动服务" value={activeServices} detail={metrics?.available ? '来自 Prometheus' : '当前启用'} icon={Server} tone="blue" />
      <MetricCard label="转发节点" value={String(nodeCount)} detail="跨 2 条路径" icon={GitBranch} tone="violet" />
      <MetricCard label="请求总数" value={requestCount} detail={metrics?.available ? '当前 Metrics' : '演示数据'} icon={Gauge} tone="green" />
      <MetricCard label="传输流量" value="25.2 GB" detail="过去 24 小时" icon={ArrowUpRight} tone="amber" />
    </div>

    <div className="overview-grid">
      <section className="panel traffic-panel"><div className="panel-heading"><div><h2>流量概览</h2><span>过去 24 小时 · 所有服务</span></div><button className="select-button">24 小时 <ChevronRight size={14} /></button></div><div className="chart-area"><div className="chart-y-labels"><span>2 GB</span><span>1 GB</span><span>0</span></div><div className="chart"><div className="chart-gridline chart-gridline--top" /><div className="chart-gridline chart-gridline--middle" /><div className="chart-gridline chart-gridline--bottom" /><svg viewBox="0 0 720 230" preserveAspectRatio="none" aria-label="流量趋势图"><path className="chart-fill" d="M0,183 C35,178 45,151 80,157 S120,193 155,164 S202,145 230,156 S280,106 315,121 S360,161 395,137 S430,89 460,102 S500,143 530,127 S570,44 603,67 S650,95 685,58 S708,45 720,40 L720,230 L0,230 Z" /><path className="chart-line" d="M0,183 C35,178 45,151 80,157 S120,193 155,164 S202,145 230,156 S280,106 315,121 S360,161 395,137 S430,89 460,102 S500,143 530,127 S570,44 603,67 S650,95 685,58 S708,45 720,40" /></svg><div className="chart-x-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>现在</span></div></div></div><div className="chart-legend"><span><i className="legend-dot legend-dot--blue" />入站 12.7 GB</span><span><i className="legend-dot legend-dot--violet" />出站 12.5 GB</span><span className="chart-up"><ArrowUpRight size={14} />较昨日 8.2%</span></div></section>

      <section className="panel health-panel"><div className="panel-heading"><div><h2>运行健康</h2><span>实时状态</span></div><button className="icon-button" aria-label="刷新健康状态" onClick={() => onNotice('健康状态已刷新')}><RotateCw size={16} /></button></div><div className="health-score"><div className="score-ring"><span>98</span><small>/ 100</small></div><div><strong>运行状态良好</strong><p>没有阻塞中的错误</p></div></div><div className="health-list"><HealthRow label="服务可用性" value="100%" detail="3 个服务" status="good" /><HealthRow label="节点连通率" value="94%" detail="1 个有波动" status="warn" /><HealthRow label="配置校验" value="通过" detail="0 个错误" status="good" /></div></section>
    </div>

    <div className="overview-grid overview-grid--bottom"><section className="panel service-panel"><div className="panel-heading"><div><h2>服务</h2><span>监听中的入口</span></div><button className="text-button" onClick={() => onSelectView('services')}>管理服务 <ChevronRight size={14} /></button></div><div className="service-table">{config.services.map((service) => <ServiceRow key={service.name} service={service} onClick={() => onSelectView('services')} />)}</div></section><section className="panel chain-panel"><div className="panel-heading"><div><h2>转发路径</h2><span>节点与健康状态</span></div><button className="text-button" onClick={() => onSelectView('chains')}>查看路径 <ChevronRight size={14} /></button></div>{config.chains.map((chain) => <ChainRow key={chain.name} chain={chain} />)}<button className="add-row-button" onClick={() => onNotice('可在转发链页面新增路径')}><Plus size={15} />新建转发链</button></section></div>

    <div className="recent-line"><span className="label-small">最近活动</span><div className="recent-event"><span className="event-dot event-dot--green" /><span>配置已校验</span><time>刚刚</time></div><div className="recent-event"><span className="event-dot event-dot--blue" /><span>edge-http 处理了 1,248 个请求</span><time>12 分钟前</time></div><div className="recent-event"><span className="event-dot event-dot--amber" /><span>gateway-02 延迟升高</span><time>24 分钟前</time></div></div>
  </>
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Activity; tone: string }) { return <div className="metric-card"><div className={`metric-icon metric-icon--${tone}`}><Icon size={17} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div> }
function HealthRow({ label, value, detail, status }: { label: string; value: string; detail: string; status: 'good' | 'warn' }) { return <div className="health-row"><div className={`health-check health-check--${status}`}>{status === 'good' ? <Check size={13} /> : <AlertTriangle size={13} />}</div><div><strong>{label}</strong><span>{detail}</span></div><b>{value}</b></div> }
function ServiceRow({ service, onClick }: { service: ServiceConfig; onClick: () => void }) { return <button className="service-row" onClick={onClick}><div className={`service-type service-type--${service.type}`}>{service.type === 'http' ? 'H' : service.type === 'socks5' ? 'S5' : service.type.toUpperCase()}</div><div className="service-row-main"><strong>{service.name}</strong><span>{service.listener.toUpperCase()} · {service.address}</span></div><span className={`inline-status inline-status--${service.status}`}><i />{service.status === 'running' ? '运行中' : service.status === 'warning' ? '有波动' : '已停止'}</span><ChevronRight size={15} className="muted-icon" /></button> }
function ChainRow({ chain }: { chain: ChainConfig }) { return <div className="chain-row"><div className="chain-row-name"><div className="chain-symbol"><GitBranch size={15} /></div><div><strong>{chain.name}</strong><span>{chain.strategy} · {chain.nodes.length} 个节点</span></div></div><div className="node-health-stack">{chain.nodes.map((node) => <span key={node.name} className={`node-health node-health--${node.health}`} title={`${node.name} · ${node.latency} ms`} />)}</div><span className={`chain-state ${chain.enabled ? 'chain-state--on' : ''}`}>{chain.enabled ? '启用' : '停用'}</span></div> }

function ServicesView({ config, expertMode, onConfigChange, onToggleExpert, onSave, onNotice }: { config: GostConfig; expertMode: boolean; onConfigChange: (config: GostConfig) => void; onToggleExpert: () => void; onSave: () => void; onNotice: (message: string) => void }) {
  const [selectedName, setSelectedName] = useState(config.services[0]?.name ?? '')
  const selected = config.services.find((service) => service.name === selectedName) ?? config.services[0]
  useEffect(() => { if (!config.services.some((service) => service.name === selectedName)) setSelectedName(config.services[0]?.name ?? '') }, [config.services, selectedName])

  function updateService(patch: Partial<ServiceConfig>) {
    if (!selected) return
    onConfigChange({ ...config, services: config.services.map((service) => service.name === selected.name ? { ...service, ...patch } : service) })
  }
  function addService() {
    const name = `service-${config.services.length + 1}`
    const service: ServiceConfig = { name, type: 'http', listener: 'tcp', address: ':8081', chain: 'direct', auth: false, authUsername: '', authPassword: '', enabled: false, requests: 0, traffic: '—', status: 'stopped' }
    onConfigChange({ ...config, services: [...config.services, service] })
    setSelectedName(name)
  }
  function removeService() {
    if (!selected) return
    onConfigChange({ ...config, services: config.services.filter((service) => service.name !== selected.name) })
    onNotice(`${selected.name} 已从编辑器移除`)
  }

  return <>
    <PageHeader eyebrow="CONFIGURATION / SERVICES" title="服务入口" description="把监听地址、协议和转发路径放在一起管理。常用选项保持克制，细节留给极客模式。" actions={<><button className="button button--secondary" onClick={() => onNotice('配置校验已通过')}><ShieldCheck size={16} />校验配置</button><button className="button button--primary" onClick={addService}><Plus size={16} />新建服务</button></>} />
    <div className="editor-layout"><aside className="editor-sidebar panel"><div className="editor-sidebar-head"><div><span className="label-small">SERVICES</span><strong>{config.services.length} 个入口</strong></div><button className="icon-button" aria-label="添加服务" onClick={addService}><Plus size={16} /></button></div><div className="editor-list">{config.services.map((service) => <button key={service.name} className={`editor-list-item ${service.name === selected?.name ? 'editor-list-item--active' : ''}`} onClick={() => setSelectedName(service.name)}><span className={`list-type-dot list-type-dot--${service.type}`} /> <span className="list-item-copy"><strong>{service.name}</strong><small>{service.address}</small></span><span className={`list-live-dot ${service.enabled ? 'list-live-dot--on' : ''}`} /></button>)}</div><button className="add-list-button" onClick={addService}><Plus size={15} />添加服务</button></aside><section className="editor-main">{selected ? <><div className="editor-title-row"><div><div className="title-with-status"><h2>{selected.name}</h2><span className={`inline-status inline-status--${selected.status}`}><i />{selected.status === 'running' ? '运行中' : '已停止'}</span></div><p>服务 / {selected.type} / {selected.listener}</p></div><div className="title-actions"><button className="icon-button" aria-label="删除服务" onClick={removeService}><Trash2 size={16} /></button><button className="button button--secondary button--compact" onClick={onSave}><Save size={15} />保存</button></div></div><div className="form-section panel"><SectionHeading icon={Globe2} title="入口配置" description="定义 GOST 对外监听的协议和地址。" /><div className="form-grid form-grid--three"><Field label="服务名称"><input value={selected.name} onChange={(event) => { const name = event.target.value; updateService({ name }); setSelectedName(name) }} /></Field><SelectField label="处理器" value={selected.type} options={['http', 'socks5', 'tcp', 'udp', 'auto']} onChange={(value) => updateService({ type: value as ServiceConfig['type'] })} /><SelectField label="监听器" value={selected.listener} options={['tcp', 'udp', 'tls', 'ws', 'http2', 'quic']} onChange={(value) => updateService({ listener: value as ServiceConfig['listener'] })} /></div><div className="form-grid form-grid--three"><Field label="监听地址" hint="支持 :8080、127.0.0.1:1080"><input value={selected.address} onChange={(event) => updateService({ address: event.target.value })} /></Field><SelectField label="转发链" value={selected.chain} options={config.chains.map((chain) => chain.name)} onChange={(value) => updateService({ chain: value })} /><ToggleField label="启用身份认证" checked={selected.auth} onChange={(checked) => updateService({ auth: checked })} /></div>{selected.auth && <div className="form-grid form-grid--three auth-fields"><Field label="用户名"><input value={selected.authUsername} onChange={(event) => updateService({ authUsername: event.target.value })} /></Field><Field label="密码"><input type="password" value={selected.authPassword} onChange={(event) => updateService({ authPassword: event.target.value })} /></Field></div>}</div><div className="form-section panel"><SectionHeading icon={GitBranch} title="转发路径" description="请求会沿着选定的链路到达目标地址。" /><div className="path-preview"><div className="path-node path-node--origin"><span>入口</span><strong>{selected.address}</strong></div><div className="path-line" /><div className="path-node"><span>转发链</span><strong>{selected.chain || '直连'}</strong></div><div className="path-line path-line--dashed" /><div className="path-node path-node--target"><span>目标</span><strong>按请求决定</strong></div></div></div>{expertMode && <div className="form-section panel expert-section"><SectionHeading icon={Zap} title="极客选项" description="这些设置直接映射到 GOST 的 metadata 和高级配置。" /><div className="form-grid form-grid--three"><Field label="重试次数"><input type="number" defaultValue={1} min={0} /></Field><Field label="空闲超时"><input defaultValue="30s" /></Field><Field label="网络命名空间"><input placeholder="留空表示默认" /></Field></div><div className="notice-box"><Info size={16} /><span>高级字段会原样保留到 YAML；如果不确定某个选项，请从官方文档或原始配置开始。</span></div></div>}</> : <EmptyState title="还没有服务" description="创建第一个 GOST 服务入口。" action={<button className="button button--primary" onClick={addService}><Plus size={15} />新建服务</button>} />}</section></div>
    <div className="editor-mode-bar"><div><span className="mode-indicator"><span />{expertMode ? '极客模式已开启' : '基础模式'}</span><span className="mode-description">{expertMode ? '显示 metadata、重试、超时等底层选项' : '保留最常用的服务配置'}</span></div><button className="toggle-mode" onClick={onToggleExpert}>{expertMode ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}<span>{expertMode ? '关闭极客模式' : '开启极客模式'}</span></button></div>
  </>
}

type FlowNodeData = {
  kind: 'start' | 'end' | 'gost'
  index?: number
  node?: NodeConfig
  title?: string
}

type GostFlowNode = Node<FlowNodeData>

function ChainsView({ config, onConfigChange, onSave, onNotice }: { config: GostConfig; onConfigChange: (config: GostConfig) => void; onSave: () => void; onNotice: (message: string) => void }) {
  const [selectedName, setSelectedName] = useState(config.chains[0]?.name ?? '')
  const selected = config.chains.find((chain) => chain.name === selectedName) ?? config.chains[0]

  function addChain() {
    const name = `relay-${config.chains.length + 1}`
    const chain: ChainConfig = { name, strategy: 'round', enabled: false, nodes: [] }
    onConfigChange({ ...config, chains: [...config.chains, chain] })
    setSelectedName(name)
  }

  function updateChain(patch: Partial<ChainConfig>) {
    if (!selected) return
    onConfigChange({ ...config, chains: config.chains.map((chain) => chain.name === selected.name ? { ...chain, ...patch } : chain) })
  }

  return (
    <>
      <PageHeader eyebrow="CONFIGURATION / CHAINS" title="转发链" description="把节点拖到画布上组成一条真实路径。横向顺序就是 GOST 的 hop 顺序，连接关系始终保持可读。" actions={<><button className="button button--secondary" onClick={() => onNotice('节点状态已刷新')}><RotateCw size={15} />刷新状态</button><button className="button button--secondary" onClick={onSave}><Save size={15} />保存配置</button><button className="button button--primary" onClick={addChain}><Plus size={16} />新建转发链</button></>} />
      <div className="chain-workbench">
        <aside className="chain-list panel">
          <div className="editor-sidebar-head"><div><span className="label-small">CHAINS</span><strong>{config.chains.length} 条路径</strong></div><button className="icon-button" aria-label="添加转发链" onClick={addChain}><Plus size={16} /></button></div>
          {config.chains.map((chain) => <button key={chain.name} className={`chain-list-item ${chain.name === selected?.name ? 'chain-list-item--active' : ''}`} onClick={() => setSelectedName(chain.name)}><div className="chain-list-icon"><GitBranch size={15} /></div><div><strong>{chain.name}</strong><span>{chain.nodes.length} 个组件 · {chain.strategy}</span></div><span className={`list-live-dot ${chain.enabled ? 'list-live-dot--on' : ''}`} /></button>)}
          <button className="add-list-button" onClick={addChain}><Plus size={15} />添加转发链</button>
        </aside>
        <section className="chain-canvas panel">
          {selected ? <>
            <div className="chain-canvas-head"><div><div className="title-with-status"><h2>{selected.name}</h2><span className={`chain-state ${selected.enabled ? 'chain-state--on' : ''}`}>{selected.enabled ? '启用' : '停用'}</span></div><p>拖动节点调整顺序；点击节点右上角编辑实际参数。</p></div><ToggleField label="启用链路" checked={selected.enabled} onChange={(checked) => updateChain({ enabled: checked })} /></div>
            <ReactFlowProvider><ChainFlowCanvas chain={selected} onChange={(patch) => updateChain(patch)} onNotice={onNotice} /></ReactFlowProvider>
          </> : <EmptyState title="还没有转发链" description="创建一条路径，把服务与节点连接起来。" action={<button className="button button--primary" onClick={addChain}><Plus size={15} />新建转发链</button>} />}
        </section>
        <ComponentPalette onAdd={(preset) => {
          if (!selected) return
          const node: NodeConfig = { name: `${preset.id}-${selected.nodes.length + 1}`, addr: preset.addr, connector: preset.connector, dialer: preset.dialer, health: 'healthy', latency: 0 }
          updateChain({ nodes: [...selected.nodes, node] })
        }} />
      </div>
    </>
  )
}

function ChainFlowCanvas({ chain, onChange, onNotice }: { chain: ChainConfig; onChange: (patch: Partial<ChainConfig>) => void; onNotice: (message: string) => void }) {
  const reactFlow = useReactFlow()
  const [isDropActive, setIsDropActive] = useState(false)
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null)
  const selectedNode = selectedNodeIndex === null ? null : chain.nodes[selectedNodeIndex]

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.16, duration: 180 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [chain.nodes.length, reactFlow])

  const flowBlueprint = useMemo<GostFlowNode[]>(() => {
    const nodeItems: GostFlowNode[] = chain.nodes.map((node, index) => ({
      id: `node-${index}`,
      type: 'gost',
      position: node.position ?? { x: FLOW_NODE_START_X + index * FLOW_NODE_GAP, y: 126 },
      data: { kind: 'gost', index, node },
      draggable: true,
    }))
    return [
      { id: 'client', type: 'gost', position: { x: 22, y: 142 }, data: { kind: 'start', title: '客户端' }, draggable: false },
      ...nodeItems,
      { id: 'target', type: 'gost', position: { x: FLOW_NODE_START_X + chain.nodes.length * FLOW_NODE_GAP, y: 142 }, data: { kind: 'end', title: '目标地址' }, draggable: false },
    ]
  }, [chain.nodes])
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GostFlowNode>(flowBlueprint)
  useEffect(() => setFlowNodes(flowBlueprint), [flowBlueprint, setFlowNodes])

  const flowEdges = useMemo<Edge[]>(() => {
    const ids = ['client', ...chain.nodes.map((_, index) => `node-${index}`), 'target']
    return ids.slice(0, -1).map((source, index) => ({ id: `${source}-${ids[index + 1]}`, source, target: ids[index + 1], type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#96a9a0' } }))
  }, [chain.nodes])

  const handleNodeDragStop = useCallback<OnNodeDrag>((_, node) => {
    const data = node.data as FlowNodeData
    if (data.kind !== 'gost' || data.index === undefined) return
    const nodes = chain.nodes.map((candidate, index) => index === data.index ? { ...candidate, position: { x: node.position.x, y: node.position.y } } : candidate)
    const ordered = nodes.map((candidate, index) => ({ candidate, index })).sort((a, b) => (a.candidate.position?.x ?? 0) - (b.candidate.position?.x ?? 0)).map(({ candidate }) => candidate)
    onChange({ nodes: ordered })
  }, [chain.nodes, onChange])

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const presetId = event.dataTransfer.getData('application/gost-node')
    const preset = nodePresets.find((candidate) => candidate.id === presetId)
    if (!preset) return
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const node: NodeConfig = { name: `${preset.id}-${chain.nodes.length + 1}`, addr: preset.addr, connector: preset.connector, dialer: preset.dialer, health: 'healthy', latency: 0, position }
    onChange({ nodes: [...chain.nodes, node] })
    setIsDropActive(false)
    onNotice(`${preset.label} 已加入 ${chain.name}`)
  }

  function moveSelected(delta: -1 | 1) {
    if (selectedNodeIndex === null) return
    const nextIndex = selectedNodeIndex + delta
    if (nextIndex < 0 || nextIndex >= chain.nodes.length) return
    const nodes = [...chain.nodes]
    const [moved] = nodes.splice(selectedNodeIndex, 1)
    nodes.splice(nextIndex, 0, moved)
    onChange({ nodes })
    setSelectedNodeIndex(nextIndex)
  }

  function updateSelected(patch: Partial<NodeConfig>) {
    if (selectedNodeIndex === null) return
    onChange({ nodes: chain.nodes.map((node, index) => index === selectedNodeIndex ? { ...node, ...patch } : node) })
  }

  return <>
    <div className="flow-toolbar"><div className="flow-toolbar-copy"><span className="flow-help-icon"><Info size={14} /></span><span>拖动节点卡片改变顺序，拖入组件后自动接入路径。</span></div><div className="flow-toolbar-actions"><span className="flow-count">{chain.nodes.length} 个节点</span><button className="button button--secondary button--compact" onClick={() => onChange({ nodes: chain.nodes.map((node, index) => ({ ...node, position: { x: FLOW_NODE_START_X + index * FLOW_NODE_GAP, y: 126 } })) })}><Layers3 size={14} />自动排布</button></div></div>
    <div className={`flow-editor ${isDropActive ? 'flow-editor--drop-active' : ''}`} onDragEnter={(event) => { if (event.dataTransfer.types.includes('application/gost-node')) setIsDropActive(true) }} onDragLeave={() => setIsDropActive(false)} onDragOverCapture={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes('application/gost-node')) { event.dataTransfer.dropEffect = 'copy'; setIsDropActive(true) } }} onDropCapture={(event) => { setIsDropActive(false); handleDrop(event) }}>
      {isDropActive && <div className="flow-drop-overlay"><ArrowDownToLine size={17} /><strong>松开以添加节点</strong><span>组件会接入当前转发链</span></div>}
      <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={{ gost: GostFlowNode }} onNodesChange={onNodesChange} onNodeDragStop={handleNodeDragStop} onNodeClick={(_, node) => { const data = node.data as FlowNodeData; setSelectedNodeIndex(data.kind === 'gost' ? data.index ?? null : null) }} fitView fitViewOptions={{ padding: 0.16 }} minZoom={0.6} maxZoom={1.35} proOptions={{ hideAttribution: true }}>
        <Background color="#e7e5dd" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {chain.nodes.length === 0 && <div className="flow-drop-empty"><div className="flow-drop-icon"><ArrowDownToLine size={18} /></div><strong>从右侧拖入第一个组件</strong><span>或点击组件卡片直接添加</span></div>}
    </div>
    {selectedNode && <div className="node-inspector"><div className="node-inspector-head"><div><span className="label-small">SELECTED NODE</span><strong>{selectedNode.name}</strong></div><div className="node-inspector-actions"><button className="button button--secondary button--compact" onClick={() => moveSelected(-1)} disabled={selectedNodeIndex === 0}>向左</button><button className="button button--secondary button--compact" onClick={() => moveSelected(1)} disabled={selectedNodeIndex === chain.nodes.length - 1}>向右</button><button className="icon-button" aria-label="关闭节点检查器" onClick={() => setSelectedNodeIndex(null)}><X size={15} /></button></div></div><div className="node-inspector-grid"><Field label="节点名称"><input value={selectedNode.name} onChange={(event) => updateSelected({ name: event.target.value })} /></Field><Field label="地址"><input value={selectedNode.addr} onChange={(event) => updateSelected({ addr: event.target.value })} /></Field><Field label="Dialer"><input value={selectedNode.dialer} onChange={(event) => updateSelected({ dialer: event.target.value })} /></Field><Field label="Connector"><input value={selectedNode.connector} onChange={(event) => updateSelected({ connector: event.target.value })} /></Field></div></div>}
  </>
}

function GostFlowNode({ data }: NodeProps<GostFlowNode>) {
  if (data.kind === 'start') return <div className="flow-endpoint flow-endpoint--client"><div className="endpoint-icon endpoint-icon--client"><Globe2 size={17} /></div><strong>{data.title}</strong><Handle type="source" position={Position.Right} /></div>
  if (data.kind === 'end') return <div className="flow-endpoint flow-endpoint--target"><Handle type="target" position={Position.Left} /><div className="endpoint-icon endpoint-icon--target"><ArrowUpRight size={17} /></div><strong>{data.title}</strong></div>
  const node = data.node
  if (!node) return null
  return <div className="flow-node-card"><Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} /><div className={`flow-node-status flow-node-status--${node.health}`} /><div className="flow-node-copy"><strong>{node.name}</strong><span>{node.addr}</span><small>{node.dialer} → {node.connector}</small></div><div className="flow-node-grip"><span /><span /><span /></div></div>
}

function ComponentPalette({ onAdd }: { onAdd: (preset: typeof nodePresets[number]) => void }) {
  return <aside className="component-palette panel"><div className="palette-heading"><div><span className="label-small">COMPONENTS</span><strong>拖入路径</strong></div><Boxes size={17} className="violet-icon" /></div><p className="palette-intro">组件是 GOST 的一个 Node：Dialer 负责通道，Connector 负责协议。</p><div className="palette-list">{nodePresets.map((preset) => <button key={preset.id} className="palette-item" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/gost-node', preset.id) }} onClick={() => onAdd(preset)}><span className={`palette-icon palette-icon--${preset.id}`}><Network size={14} /></span><span><strong>{preset.label}</strong><small>{preset.description}</small></span><Plus size={13} className="muted-icon" /></button>)}</div><div className="palette-drop-hint"><ArrowDownToLine size={15} /><span>拖到画布，生成一个节点</span></div></aside>
}

type ComponentTab = 'authers' | 'hosts' | 'limiters' | 'recorders' | 'other'

function ComponentsView({ config, onConfigChange, onSave, onNotice }: { config: GostConfig; onConfigChange: (config: GostConfig) => void; onSave: () => void; onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<ComponentTab>('authers')
  const tabs: Array<{ id: ComponentTab; label: string; count: number; description: string }> = [
    { id: 'authers', label: '认证器', count: config.authers.length, description: '用户与密码' },
    { id: 'hosts', label: 'Hosts', count: config.hosts.length, description: '域名映射' },
    { id: 'limiters', label: '限速器', count: config.limiters.length, description: '带宽限制' },
    { id: 'recorders', label: '记录器', count: config.recorders.length, description: '流量记录' },
    { id: 'other', label: '其他能力', count: countOtherComponents(config.raw), description: 'Ingress、插件、配额' },
  ]

  function addAuther() {
    onConfigChange({ ...config, authers: [...config.authers, { name: `auther-${config.authers.length + 1}`, users: [{ username: 'user', password: '' }] }] })
  }
  function addHostGroup() {
    onConfigChange({ ...config, hosts: [...config.hosts, { name: `hosts-${config.hosts.length + 1}`, entries: [{ ip: '127.0.0.1', hostname: 'localhost', aliases: [] }] }] })
  }
  function addLimiter() {
    onConfigChange({ ...config, limiters: [...config.limiters, { name: `limiter-${config.limiters.length + 1}`, limits: ['10MB'] }] })
  }
  function addRecorder() {
    onConfigChange({ ...config, recorders: [...config.recorders, { name: `recorder-${config.recorders.length + 1}`, type: 'file', target: './logs/gost.log' }] })
  }

  const add = tab === 'authers' ? addAuther : tab === 'hosts' ? addHostGroup : tab === 'limiters' ? addLimiter : tab === 'recorders' ? addRecorder : () => onNotice('其他能力请在高级配置中按 GOST 原生结构编辑')
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0]

  return <>
    <PageHeader eyebrow="CONFIGURATION / COMPONENTS" title="组件库" description="把 GOST 的可复用能力集中管理。每个组件都对应一个明确的配置对象，服务、转发链和高级 YAML 可以引用它们。" actions={<><button className="button button--secondary" onClick={onSave}><Save size={15} />保存配置</button><button className="button button--primary" onClick={add}><Plus size={16} />添加{activeTab.label}</button></>} />
    <div className="component-layout">
      <aside className="component-nav panel">{tabs.map((item) => <button key={item.id} className={`component-nav-item ${tab === item.id ? 'component-nav-item--active' : ''}`} onClick={() => setTab(item.id)}><div className="component-nav-icon"><Boxes size={15} /></div><span><strong>{item.label}</strong><small>{item.description}</small></span><b>{item.count}</b></button>)}</aside>
      <section className="component-main panel">
        {tab === 'authers' && <AuthersEditor config={config} onChange={onConfigChange} />}
        {tab === 'hosts' && <HostsEditor config={config} onChange={onConfigChange} />}
        {tab === 'limiters' && <LimitersEditor config={config} onChange={onConfigChange} />}
        {tab === 'recorders' && <RecordersEditor config={config} onChange={onConfigChange} />}
        {tab === 'other' && <OtherComponents raw={config.raw} onNotice={onNotice} />}
      </section>
    </div>
  </>
}

function AuthersEditor({ config, onChange }: { config: GostConfig; onChange: (config: GostConfig) => void }) {
  function updateGroup(index: number, patch: Partial<GostConfig['authers'][number]>) { onChange({ ...config, authers: config.authers.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) }) }
  function updateUser(groupIndex: number, userIndex: number, patch: Partial<GostConfig['authers'][number]['users'][number]>) { onChange({ ...config, authers: config.authers.map((group, index) => index === groupIndex ? { ...group, users: group.users.map((user, index) => index === userIndex ? { ...user, ...patch } : user) } : group) }) }
  return <ComponentEditorIntro icon={UserRound} title="认证器" description="认证器可以被服务的 Handler/Listener 或节点的 Connector 引用。密码只写入本地配置文件。" empty={config.authers.length === 0} emptyLabel="添加一个认证器后，服务就可以启用 Basic Auth。">{config.authers.map((group, groupIndex) => <div className="component-card" key={`${group.name}-${groupIndex}`}><div className="component-card-head"><div className="component-card-title"><span className="component-card-index">{String(groupIndex + 1).padStart(2, '0')}</span><input value={group.name} aria-label="认证器名称" onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} /></div><span className="component-card-meta">{group.users.length} 个用户</span></div><div className="user-table-head"><span>用户名</span><span>密码</span><span /></div>{group.users.map((user, userIndex) => <div className="user-row" key={`${user.username}-${userIndex}`}><input value={user.username} aria-label="用户名" onChange={(event) => updateUser(groupIndex, userIndex, { username: event.target.value })} /><input type="password" value={user.password} aria-label="密码" onChange={(event) => updateUser(groupIndex, userIndex, { password: event.target.value })} /><button className="icon-button" aria-label="删除用户" onClick={() => updateGroup(groupIndex, { users: group.users.filter((_, index) => index !== userIndex) })}><Trash2 size={13} /></button></div>)}<button className="add-inline-button" onClick={() => updateGroup(groupIndex, { users: [...group.users, { username: `user-${group.users.length + 1}`, password: '' }] })}><Plus size={13} />添加用户</button></div>)}</ComponentEditorIntro>
}

function HostsEditor({ config, onChange }: { config: GostConfig; onChange: (config: GostConfig) => void }) {
  function updateGroup(index: number, patch: Partial<GostConfig['hosts'][number]>) { onChange({ ...config, hosts: config.hosts.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) }) }
  return <ComponentEditorIntro icon={Globe2} title="Hosts 映射" description="将主机名映射到固定 IP，服务和转发链可以通过 hosts 引用它。" empty={config.hosts.length === 0} emptyLabel="添加一个 Hosts 组后，可以在服务或节点中引用。">{config.hosts.map((group, groupIndex) => <div className="component-card" key={`${group.name}-${groupIndex}`}><div className="component-card-head"><div className="component-card-title"><span className="component-card-index">{String(groupIndex + 1).padStart(2, '0')}</span><input value={group.name} aria-label="Hosts 名称" onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} /></div><span className="component-card-meta">{group.entries.length} 条映射</span></div><div className="hosts-table-head"><span>IP</span><span>Hostname</span><span>Aliases</span><span /></div>{group.entries.map((entry, entryIndex) => <div className="hosts-row" key={`${entry.hostname}-${entryIndex}`}><input value={entry.ip} aria-label="IP 地址" onChange={(event) => updateGroup(groupIndex, { entries: group.entries.map((candidate, index) => index === entryIndex ? { ...candidate, ip: event.target.value } : candidate) })} /><input value={entry.hostname} aria-label="Hostname" onChange={(event) => updateGroup(groupIndex, { entries: group.entries.map((candidate, index) => index === entryIndex ? { ...candidate, hostname: event.target.value } : candidate) })} /><input value={entry.aliases.join(', ')} aria-label="Aliases" onChange={(event) => updateGroup(groupIndex, { entries: group.entries.map((candidate, index) => index === entryIndex ? { ...candidate, aliases: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) } : candidate) })} /><button className="icon-button" aria-label="删除映射" onClick={() => updateGroup(groupIndex, { entries: group.entries.filter((_, index) => index !== entryIndex) })}><Trash2 size={13} /></button></div>)}<button className="add-inline-button" onClick={() => updateGroup(groupIndex, { entries: [...group.entries, { ip: '127.0.0.1', hostname: 'new.local', aliases: [] }] })}><Plus size={13} />添加映射</button></div>)}</ComponentEditorIntro>
}

function LimitersEditor({ config, onChange }: { config: GostConfig; onChange: (config: GostConfig) => void }) {
  return <ComponentEditorIntro icon={Gauge} title="限速器" description="limits 使用 GOST 原生格式，例如 10MB、100Mbps；之后可以在服务上引用 limiter。" empty={config.limiters.length === 0} emptyLabel="添加限速器后，可以把带宽策略绑定到服务。"><div className="simple-component-list">{config.limiters.map((limiter, index) => <div className="simple-component-row" key={`${limiter.name}-${index}`}><div className="component-card-index">{String(index + 1).padStart(2, '0')}</div><input value={limiter.name} aria-label="限速器名称" onChange={(event) => onChange({ ...config, limiters: config.limiters.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, name: event.target.value } : candidate) })} /><input value={limiter.limits.join(', ')} aria-label="限速规则" onChange={(event) => onChange({ ...config, limiters: config.limiters.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, limits: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) } : candidate) })} /><button className="icon-button" aria-label="删除限速器" onClick={() => onChange({ ...config, limiters: config.limiters.filter((_, candidateIndex) => candidateIndex !== index) })}><Trash2 size={13} /></button></div>)}</div></ComponentEditorIntro>
}

function RecordersEditor({ config, onChange }: { config: GostConfig; onChange: (config: GostConfig) => void }) {
  return <ComponentEditorIntro icon={HardDriveDownload} title="记录器" description="记录器把流量或事件写入文件、HTTP、TCP 或 Redis 后端。" empty={config.recorders.length === 0} emptyLabel="添加记录器后，可以在服务的 recorders 中引用。"><div className="simple-component-list">{config.recorders.map((recorder, index) => <div className="recorder-row" key={`${recorder.name}-${index}`}><div className="component-card-index">{String(index + 1).padStart(2, '0')}</div><input value={recorder.name} aria-label="记录器名称" onChange={(event) => onChange({ ...config, recorders: config.recorders.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, name: event.target.value } : candidate) })} /><select value={recorder.type} aria-label="记录器类型" onChange={(event) => onChange({ ...config, recorders: config.recorders.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, type: event.target.value as RecorderRule['type'] } : candidate) })}><option value="file">File</option><option value="http">HTTP</option><option value="tcp">TCP</option><option value="redis">Redis</option></select><input value={recorder.target} aria-label="记录器目标" onChange={(event) => onChange({ ...config, recorders: config.recorders.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, target: event.target.value } : candidate) })} /><button className="icon-button" aria-label="删除记录器" onClick={() => onChange({ ...config, recorders: config.recorders.filter((_, candidateIndex) => candidateIndex !== index) })}><Trash2 size={13} /></button></div>)}</div></ComponentEditorIntro>
}

function ComponentEditorIntro({ icon: Icon, title, description, empty, emptyLabel, children }: { icon: typeof Activity; title: string; description: string; empty: boolean; emptyLabel: string; children: React.ReactNode }) {
  return <><div className="component-editor-header"><div className="section-heading"><div className="section-heading-icon"><Icon size={16} /></div><div><h2>{title}</h2><p>{description}</p></div></div></div>{empty ? <div className="component-empty"><div className="empty-state-icon"><Boxes size={20} /></div><strong>{emptyLabel}</strong><span>使用右上角按钮开始</span></div> : children}</>
}

function OtherComponents({ raw, onNotice }: { raw?: Record<string, unknown>; onNotice: (message: string) => void }) {
  const modules = [
    ['ingresses', 'Ingress', '按域名把入口映射到远端端点'],
    ['routers', 'Router', '按目标地址选择 gateway'],
    ['quotas', 'Quota', '累计流量额度与周期'],
    ['caches', 'Cache', 'HTTP 缓存与过期策略'],
    ['rewriters', 'Rewriter', '插件化请求/响应改写'],
    ['observers', 'Observer', '服务状态和统计事件'],
    ['sds', 'Service discovery', '注册、续期和发现服务'],
  ] as const
  return <><div className="component-editor-header"><div className="section-heading"><div className="section-heading-icon"><Zap size={16} /></div><div><h2>其他能力</h2><p>这些模块配置结构更依赖具体协议和部署环境，先提供清晰入口，详细字段留在高级 YAML。</p></div></div></div><div className="other-module-grid">{modules.map(([key, label, description]) => <button className="other-module-card" key={key} onClick={() => onNotice(`${label} 的完整编辑器将在下一阶段开放，请先使用高级配置`)}><div className="other-module-icon"><Network size={16} /></div><div><strong>{label}</strong><span>{description}</span></div><b>{countRaw(raw, key)}</b><ChevronRight size={15} className="muted-icon" /></button>)}</div><div className="notice-box notice-box--neutral"><Info size={16} /><span>当前版本已经可以保留和运行这些原生字段；当你需要精确控制 plugin、metadata 或协议专属参数时，使用高级配置不会被 UI 覆盖。</span></div></>
}

function countOtherComponents(raw?: Record<string, unknown>): number { return ['ingresses', 'routers', 'quotas', 'caches', 'rewriters', 'observers', 'sds'].reduce((total, key) => total + countRaw(raw, key), 0) }
function countRaw(raw: Record<string, unknown> | undefined, key: string): number { return Array.isArray(raw?.[key]) ? (raw?.[key] as unknown[]).length : 0 }

function RoutingView({ config, onConfigChange, onNotice }: { config: GostConfig; onConfigChange: (config: GostConfig) => void; onNotice: (message: string) => void }) {
  function updateBypass(index: number, patch: Partial<GostConfig['bypasses'][number]>) {
    onConfigChange({ ...config, bypasses: config.bypasses.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) })
  }
  function updateAdmission(index: number, patch: Partial<GostConfig['admissions'][number]>) {
    onConfigChange({ ...config, admissions: config.admissions.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) })
  }
  function updateResolver(index: number, patch: Partial<GostConfig['resolvers'][number]>) {
    onConfigChange({ ...config, resolvers: config.resolvers.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) })
  }
  function addBypass() {
    onConfigChange({ ...config, bypasses: [...config.bypasses, { name: `bypass-${config.bypasses.length + 1}`, whitelist: false, matchers: ['example.com'] }] })
  }
  function addAdmission() {
    onConfigChange({ ...config, admissions: [...config.admissions, { name: `admission-${config.admissions.length + 1}`, whitelist: true, matchers: ['127.0.0.1'] }] })
  }
  function addResolver() {
    onConfigChange({ ...config, resolvers: [...config.resolvers, { name: `resolver-${config.resolvers.length + 1}`, nameservers: ['udp://1.1.1.1:53'], prefer: 'ipv4' }] })
  }
  function removeRule(type: 'bypass' | 'admission' | 'resolver', index: number) {
    if (type === 'bypass') onConfigChange({ ...config, bypasses: config.bypasses.filter((_, ruleIndex) => ruleIndex !== index) })
    if (type === 'admission') onConfigChange({ ...config, admissions: config.admissions.filter((_, ruleIndex) => ruleIndex !== index) })
    if (type === 'resolver') onConfigChange({ ...config, resolvers: config.resolvers.filter((_, ruleIndex) => ruleIndex !== index) })
  }

  return <>
    <PageHeader eyebrow="CONTROL / ROUTING" title="路由与规则" description="把流量决策从黑盒里拿出来：哪些地址直连、哪些请求走链路，都可以明确看到。" actions={<button className="button button--primary" onClick={() => onNotice('请选择对应规则卡片新增规则')}><Plus size={16} />添加规则</button>} />
    <div className="routing-grid">
      <section className="panel routing-card">
        <div className="panel-heading"><div><h2>Bypass 分流</h2><span>匹配目标地址后跳过或进入代理链</span></div><ShieldCheck size={18} className="success-icon" /></div>
        <div className="rule-editor-list">
          {config.bypasses.map((rule, index) => <div className="rule-editor-row" key={`${rule.name}-${index}`}><div className="rule-editor-name"><span className="rule-kind rule-kind--bypass">B</span><input value={rule.name} aria-label="Bypass 名称" onChange={(event) => updateBypass(index, { name: event.target.value })} /><button className="icon-button" aria-label="删除 Bypass" onClick={() => removeRule('bypass', index)}><Trash2 size={13} /></button></div><input className="rule-matchers" value={rule.matchers.join(', ')} aria-label="Bypass 匹配项" onChange={(event) => updateBypass(index, { matchers: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /><div className="rule-row-foot"><span>{rule.whitelist ? '白名单：匹配项直连' : '黑名单：匹配项走链'}</span><button className={`mini-switch ${rule.whitelist ? 'mini-switch--on' : ''}`} onClick={() => updateBypass(index, { whitelist: !rule.whitelist })}>{rule.whitelist ? 'WHITELIST' : 'BLACKLIST'}</button></div></div>)}
        </div>
        <button className="add-row-button" onClick={addBypass}><Plus size={14} />添加 Bypass 规则</button>
      </section>
      <section className="panel routing-card">
        <div className="panel-heading"><div><h2>Admission 准入</h2><span>控制谁可以连接到服务入口</span></div><ShieldCheck size={18} className="amber-icon" /></div>
        <div className="rule-editor-list">
          {config.admissions.map((rule, index) => <div className="rule-editor-row" key={`${rule.name}-${index}`}><div className="rule-editor-name"><span className="rule-kind rule-kind--admission">A</span><input value={rule.name} aria-label="Admission 名称" onChange={(event) => updateAdmission(index, { name: event.target.value })} /><button className="icon-button" aria-label="删除 Admission" onClick={() => removeRule('admission', index)}><Trash2 size={13} /></button></div><input className="rule-matchers" value={rule.matchers.join(', ')} aria-label="Admission 匹配项" onChange={(event) => updateAdmission(index, { matchers: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /><div className="rule-row-foot"><span>{rule.whitelist ? '仅允许匹配来源' : '拒绝匹配来源'}</span><button className={`mini-switch ${rule.whitelist ? 'mini-switch--on' : ''}`} onClick={() => updateAdmission(index, { whitelist: !rule.whitelist })}>{rule.whitelist ? 'ALLOW' : 'DENY'}</button></div></div>)}
        </div>
        <button className="add-row-button" onClick={addAdmission}><Plus size={14} />添加 Admission 规则</button>
      </section>
    </div>
    <section className="panel routing-card resolver-card"><div className="panel-heading"><div><h2>Resolver 解析</h2><span>为服务或转发链准备 DNS 解析策略</span></div><button className="button button--secondary button--compact" onClick={addResolver}><Plus size={14} />添加解析器</button></div><div className="resolver-table"><div className="resolver-table-head"><span>名称</span><span>Nameservers</span><span>偏好</span><span /></div>{config.resolvers.map((resolver, index) => <div className="resolver-row" key={`${resolver.name}-${index}`}><input value={resolver.name} aria-label="Resolver 名称" onChange={(event) => updateResolver(index, { name: event.target.value })} /><input value={resolver.nameservers.join(', ')} aria-label="Nameserver" onChange={(event) => updateResolver(index, { nameservers: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /><select value={resolver.prefer} onChange={(event) => updateResolver(index, { prefer: event.target.value as GostConfig['resolvers'][number]['prefer'] })}><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option><option value="none">不偏好</option></select><button className="icon-button" aria-label="删除 Resolver" onClick={() => removeRule('resolver', index)}><Trash2 size={13} /></button></div>)}</div></section>
    <section className="panel rule-library"><div className="panel-heading"><div><h2>服务路由</h2><span>入口默认使用的转发链，可在服务页继续细化。</span></div><Network size={18} className="success-icon" /></div>{config.services.map((service) => <div className="route-row" key={service.name}><div className="route-service"><span className={`service-type service-type--${service.type}`}>{service.type === 'http' ? 'H' : service.type === 'socks5' ? 'S5' : service.type.toUpperCase()}</span><strong>{service.name}</strong></div><ArrowDownToLine size={15} className="muted-icon" /><span className="route-chain">{service.chain || 'direct'}</span><span className="rule-state rule-state--enabled">默认</span></div>)}</section>
    <div className="routing-note"><Info size={16} /><span>规则会写入 GOST 的 <code>bypasses</code>、<code>admissions</code> 和 <code>resolvers</code> 节点。更复杂的 matcher、插件和动态数据源请使用高级配置。</span></div>
  </>
}

function AdvancedView({ config, rawConfig, expertMode, issues, onRawChange, onApply, onOpen, onSave, onToggleExpert, onNotice }: { config: GostConfig; rawConfig: string; expertMode: boolean; issues: ReturnType<typeof validateConfig>; onRawChange: (source: string) => void; onApply: () => void; onOpen: () => void; onSave: () => void; onToggleExpert: () => void; onNotice: (message: string) => void }) {
  return <><PageHeader eyebrow="CONFIGURATION / RAW" title="高级配置" description="这里是 GOST 的原始 YAML。基础界面不会遮蔽能力，未知字段也可以保留在你的配置里。" actions={<><button className="button button--secondary" onClick={onOpen}><ExternalLink size={15} />打开文件</button><button className="button button--secondary" onClick={() => onRawChange(serializeConfig(config))}><RotateCw size={15} />重置为当前配置</button><button className="button button--secondary" onClick={onSave}><Save size={15} />保存文件</button><button className="button button--primary" onClick={onApply}><Check size={15} />应用配置</button></>} /><div className="advanced-layout"><section className="raw-editor panel"><div className="raw-editor-head"><div><div className="title-with-status"><Code2 size={18} /><h2>gost.yml</h2><span className="file-state">未保存</span></div><p>YAML · 由 GOST 原生配置模型驱动</p></div><div className="editor-tools"><button className="icon-button" aria-label="格式化 YAML" onClick={() => onNotice('YAML 已按 2 空格缩进')}><Braces size={16} /></button><button className="icon-button" aria-label="保存配置" onClick={onSave}><Save size={16} /></button></div></div><textarea className="code-editor" spellCheck={false} value={rawConfig} onChange={(event) => onRawChange(event.target.value)} aria-label="GOST 原始 YAML 配置" /><div className="raw-editor-foot"><span><Command size={13} /> YAML</span><span>{rawConfig.split('\n').length} 行</span><span>UTF-8</span></div></section><aside className="advanced-sidebar"><section className="panel validation-panel"><div className="panel-heading"><div><h2>配置检查</h2><span>应用前自动检查</span></div>{issues.length === 0 ? <Check size={18} className="success-icon" /> : <AlertTriangle size={18} className="amber-icon" />}</div>{issues.length === 0 ? <div className="empty-validation"><div className="validation-circle"><Check size={17} /></div><strong>配置没有发现问题</strong><span>可以安全应用</span></div> : <div className="issue-list">{issues.map((issue) => <div className={`issue-row issue-row--${issue.level}`} key={`${issue.path}-${issue.message}`}><span>{issue.level === 'error' ? <X size={13} /> : <AlertTriangle size={13} />}</span><div><strong>{issue.path}</strong><p>{issue.message}</p></div></div>)}</div>}</section><section className="panel expert-panel"><div className="panel-heading"><div><h2>极客模式</h2><span>展示所有配置细节</span></div><button className="toggle-mode toggle-mode--small" onClick={onToggleExpert}>{expertMode ? <ToggleRight size={21} /> : <ToggleLeft size={21} />}<span>{expertMode ? '开启' : '关闭'}</span></button></div><p className="expert-copy">适合需要直接使用 matcher、metadata、插件、监听器参数和系统级选项的用户。</p><div className="expert-tags"><span>metadata</span><span>plugin</span><span>matcher</span><span>netns</span></div></section><section className="panel config-actions"><button className="action-link" onClick={() => onNotice('将以时间戳创建配置备份')}><HardDriveDownload size={16} /><span><strong>备份配置</strong><small>创建一个可恢复的本地快照</small></span><ChevronRight size={15} /></button><button className="action-link" onClick={() => onNotice('配置差异查看器将在下一版开放')}><GitBranch size={16} /><span><strong>查看变更</strong><small>对比上次应用的版本</small></span><ChevronRight size={15} /></button></section></aside></div></>
}

function LogsView({ logs, onClear, onNotice }: { logs: RuntimeLog[]; onClear: () => void; onNotice: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const [stream, setStream] = useState<'all' | 'stdout' | 'stderr'>('all')
  const visibleLogs = logs.filter((entry) => (stream === 'all' || entry.stream === stream) && entry.message.toLowerCase().includes(query.toLowerCase()))
  return <>
    <PageHeader eyebrow="RUNTIME / LOGS" title="运行日志" description="直接查看 GOST 进程输出。桌面版会实时接收 stdout 和 stderr，排查链路和协议问题时不必离开工作台。" actions={<><button className="button button--secondary" onClick={() => onNotice('日志已导出为文本文件')}><HardDriveDownload size={15} />导出日志</button><button className="button button--secondary" onClick={onClear}><Trash2 size={15} />清空</button></>} />
    <section className="panel logs-panel">
      <div className="logs-toolbar"><div className="log-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索日志内容" /></div><div className="log-filters">{(['all', 'stdout', 'stderr'] as const).map((value) => <button key={value} className={stream === value ? 'log-filter--active' : ''} onClick={() => setStream(value)}>{value === 'all' ? '全部' : value}</button>)}</div><span className="log-count">{visibleLogs.length} entries</span></div>
      <div className="log-console" role="log" aria-live="polite">{visibleLogs.length === 0 ? <div className="log-empty"><TerminalSquare size={22} /><span>暂无匹配日志</span></div> : visibleLogs.map((entry, index) => <div className={`log-line log-line--${entry.stream}`} key={`${entry.timestamp}-${index}`}><time>{formatLogTime(entry.timestamp)}</time><span className="log-stream">{entry.stream}</span><code>{entry.message}</code></div>)}</div>
    </section>
  </>
}

function formatLogTime(value: string): string {
  const parsed = Number(value)
  const date = Number.isFinite(parsed) && parsed > 1_000_000_000 ? new Date(parsed * 1000) : new Date(value)
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function RuntimeView({ runtime, updateState, configPath, onConfigPathChange, onBinaryPathChange, onChooseBinary, onChooseConfig, onCheckUpdates, onToggleRuntime, onNotice }: { runtime: RuntimeState; updateState: RuntimeUpdateState; configPath: string; onConfigPathChange: (path: string) => void; onBinaryPathChange: (path: string) => void; onChooseBinary: () => void; onChooseConfig: () => void; onCheckUpdates: () => void; onToggleRuntime: () => void; onNotice: (message: string) => void }) {
  const isRunning = runtime.status === 'running'
  const updateAvailable = updateState.status === 'available'
  return <>
    <PageHeader eyebrow="RUNTIME / LOCAL ENGINE" title="运行时" description="GOST Studio 不替换 GOST，它负责找到、校验并管理你选择的 GOST 二进制。运行时升级始终保留在可审阅的版本锁中。" actions={<><button className="button button--secondary" onClick={onCheckUpdates}><RotateCw size={15} />检查更新</button><button className={`button ${isRunning ? 'button--danger' : 'button--primary'}`} onClick={onToggleRuntime}>{isRunning ? <><Square size={14} fill="currentColor" />停止 GOST</> : <><Play size={15} fill="currentColor" />启动 GOST</>}</button></>} />
    <div className="runtime-grid">
      <section className="panel runtime-config-card"><div className="panel-heading"><div><h2>本地运行时</h2><span>桌面端进程管理</span></div><span className={`chain-state ${isRunning ? 'chain-state--on' : ''}`}>{isRunning ? 'RUNNING' : runtime.status.toUpperCase()}</span></div><div className="runtime-form"><Field label="GOST 二进制路径" hint="可填写绝对路径；发布版将支持系统文件选择器"><div className="path-input"><input value={runtime.binaryPath} onChange={(event) => onBinaryPathChange(event.target.value)} placeholder="例如 /usr/local/bin/gost" /><button className="button button--secondary button--compact" onClick={onChooseBinary}>选择</button></div></Field><Field label="配置文件路径" hint="相对于工作区或填写绝对路径"><div className="path-input"><input value={configPath} onChange={(event) => onConfigPathChange(event.target.value)} /><button className="button button--secondary button--compact" onClick={onChooseConfig}>选择</button></div></Field><div className="runtime-command"><span>实际启动命令</span><code>{runtime.binaryPath || 'gost'} -C {configPath || 'gost.yml'}</code></div></div><div className="notice-box notice-box--neutral"><Info size={16} /><span>浏览器模式只展示演示状态；Tauri 桌面模式会通过系统进程启动真正的 GOST。</span></div></section>
      <section className={`panel runtime-lock-card ${updateAvailable ? 'runtime-lock-card--update' : ''}`}><div className="panel-heading"><div><h2>兼容性锁</h2><span>最近检查：{updateState.checkedAt ? new Date(updateState.checkedAt).toLocaleString('zh-CN') : '检查中'}</span></div>{updateAvailable ? <AlertTriangle size={18} className="amber-icon" /> : <Check size={18} className="success-icon" />}</div><div className="lock-entry"><div><span>go-gost / gost</span><strong>{updateState.latestGostCommit ? updateState.latestGostCommit.slice(0, 8) : '36cc2662'}</strong><small>{updateAvailable ? (updateState.gostMessage || 'master 有新提交') : 'master · 已同步'}</small></div>{updateAvailable ? <ArrowUpRight size={16} className="amber-icon" /> : <Check size={16} className="success-icon" />}</div><div className="lock-entry"><div><span>go-gost / x</span><strong>{updateState.latestXCommit ? updateState.latestXCommit.slice(0, 8) : 'f70b1145'}</strong><small>{updateAvailable ? (updateState.xMessage || 'master 有新提交') : 'master · 已同步'}</small></div>{updateAvailable ? <ArrowUpRight size={16} className="amber-icon" /> : <Check size={16} className="success-icon" />}</div>{updateAvailable ? <div className="update-callout"><AlertTriangle size={15} /><span>发现 upstream 更新。建议先刷新兼容性锁，再人工审阅后升级运行时。</span></div> : <div className="update-callout update-callout--ok"><Check size={15} /><span>{updateState.status === 'offline' ? '暂时无法连接 GitHub，将在下次启动时重试。' : '当前 upstream 与兼容性锁一致。'}</span></div>}<button className="text-button runtime-sync-button" onClick={onCheckUpdates}><GitBranch size={14} />立即检查 upstream</button></section>
    </div>
    <section className="panel runtime-policy-card"><div className="panel-heading"><div><h2>升级策略</h2><span>让 UI 跟进 GOST，而不是绑死在某一次提交上。</span></div><ShieldCheck size={18} className="success-icon" /></div><div className="policy-grid"><div><span className="policy-number">01</span><strong>提交锁定</strong><p>每次运行时都记录 GOST 与 x 的精确提交。</p></div><div><span className="policy-number">02</span><strong>兼容性检查</strong><p>同步器只更新锁文件，变更先进入 PR。</p></div><div><span className="policy-number">03</span><strong>原始配置兜底</strong><p>UI 模型之外的字段保留在高级 YAML 中。</p></div></div></section>
  </>
}

function CapabilityRow({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) { return <div className="capability-row"><div><strong>{label}</strong><span>{description}</span></div><button className={`switch ${enabled ? 'switch--on' : ''}`} aria-label={`${label}${enabled ? '关闭' : '开启'}`} onClick={onToggle}><span /></button></div> }
function SectionHeading({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) { return <div className="section-heading"><div className="section-heading-icon"><Icon size={16} /></div><div><h3>{title}</h3><p>{description}</p></div></div> }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <Field label={label}><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronRight size={14} /></div></Field> }
function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <div className="toggle-field"><span>{label}</span><button className={`switch ${checked ? 'switch--on' : ''}`} aria-pressed={checked} onClick={() => onChange(!checked)}><span /></button></div> }
function EmptyState({ title, description, action }: { title: string; description: string; action: React.ReactNode }) { return <div className="empty-state"><div className="empty-state-icon"><Boxes size={22} /></div><h2>{title}</h2><p>{description}</p>{action}</div> }

export default App
