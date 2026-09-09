import { useEffect, useMemo, useState } from 'react'
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
  LifeBuoy,
  Menu,
  Network,
  Play,
  Plus,
  RotateCw,
  Router,
  Save,
  Search,
  Server,
  Settings2,
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
import { parseConfig, sampleConfig, serializeConfig, validateConfig } from './lib/config'
import { getRuntimeState, isTauriRuntime, startGost, stopGost } from './lib/tauri'
import type { ChainConfig, GostConfig, NodeConfig, RuntimeState, ServiceConfig, ViewKey } from './types'
import './styles.css'

const viewLabels: Record<ViewKey, string> = { overview: '总览', services: '服务', chains: '转发链', routing: '路由与规则', advanced: '高级配置', runtime: '运行时' }

const navItems: Array<{ id: ViewKey; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: '总览', icon: Activity },
  { id: 'services', label: '服务', icon: Server },
  { id: 'chains', label: '转发链', icon: GitBranch },
  { id: 'routing', label: '路由与规则', icon: Router },
  { id: 'advanced', label: '高级配置', icon: Braces },
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
  const [configPath, setConfigPath] = useState(() => window.localStorage.getItem('gost-studio.configPath') ?? 'gost.yml')

  useEffect(() => {
    window.localStorage.setItem('gost-studio.configPath', configPath)
  }, [configPath])

  useEffect(() => {
    let cancelled = false
    getRuntimeState().then((state) => {
      if (!cancelled && isTauriRuntime()) setRuntime(state)
    }).catch(() => undefined)
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
          <button className="nav-item" onClick={() => showNotice('日志查看器将在下一版开放')}><TerminalSquare size={17} strokeWidth={1.9} /><span>运行日志</span></button>
          <button className={`nav-item ${view === 'runtime' ? 'nav-item--active' : ''}`} onClick={() => selectView('runtime')}><HardDriveDownload size={17} strokeWidth={1.9} /><span>运行时</span><span className="beta-label">BETA</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sync-card">
            <div className="sync-icon"><GitBranch size={15} /></div>
            <div className="sync-copy"><strong>跟进 upstream</strong><span>master · 已同步</span></div>
            <Check size={15} className="success-icon" />
          </div>
          <button className="nav-item" onClick={() => showNotice('设置将在下一版开放')}><Settings2 size={17} strokeWidth={1.9} /><span>设置</span></button>
          <div className="profile-row"><div className="profile-avatar"><UserRound size={15} /></div><span>本地管理员</span><CircleHelp size={16} className="muted-icon profile-help" /></div>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>GOST Studio</span><ChevronRight size={14} /><strong>{viewLabels[view]}</strong></div>
          <div className="topbar-actions">
            <div className="connection-status"><span className={`status-dot status-dot--${runtime.status}`} />{runtime.status === 'running' ? '本地运行中' : '已停止'}</div>
            <button className="icon-button" aria-label="搜索" onClick={() => showNotice('搜索会在配置规模较大时自动启用')}><Search size={17} /></button>
            <button className="icon-button" aria-label="帮助" onClick={() => showNotice('查看 docs.gost.run 获取协议与配置说明')}><CircleHelp size={17} /></button>
            <div className="topbar-avatar">T</div>
          </div>
        </header>

        <div className="content-wrap">
          {view === 'overview' && <Overview config={config} runtime={runtime} onSelectView={selectView} onToggleRuntime={toggleRuntime} onNotice={showNotice} />}
          {view === 'services' && <ServicesView config={config} expertMode={expertMode} onConfigChange={updateConfig} onToggleExpert={() => setExpertMode((current) => !current)} onNotice={showNotice} />}
          {view === 'chains' && <ChainsView config={config} onConfigChange={updateConfig} onNotice={showNotice} />}
          {view === 'routing' && <RoutingView config={config} onConfigChange={updateConfig} onNotice={showNotice} />}
          {view === 'advanced' && <AdvancedView config={config} rawConfig={rawConfig} expertMode={expertMode} issues={issues} onRawChange={setRawConfig} onApply={applyRawConfig} onToggleExpert={() => setExpertMode((current) => !current)} onNotice={showNotice} />}
          {view === 'runtime' && <RuntimeView runtime={runtime} configPath={configPath} onConfigPathChange={setConfigPath} onBinaryPathChange={(binaryPath) => setRuntime((current) => ({ ...current, binaryPath }))} onToggleRuntime={toggleRuntime} onNotice={showNotice} />}
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

function Overview({ config, runtime, onSelectView, onToggleRuntime, onNotice }: { config: GostConfig; runtime: RuntimeState; onSelectView: (view: ViewKey) => void; onToggleRuntime: () => void; onNotice: (message: string) => void }) {
  const runningServices = config.services.filter((service) => service.enabled).length
  const nodeCount = config.chains.reduce((total, chain) => total + chain.nodes.length, 0)
  return <>
    <PageHeader eyebrow="LOCAL WORKSPACE / DEFAULT" title="一眼看清，稳稳运行。" description="管理本地 GOST 实例、服务和转发路径。简单配置留给日常，底层能力随时可见。" actions={<><button className="button button--secondary" onClick={() => onSelectView('advanced')}><Code2 size={16} />打开原始配置</button><button className={`button ${runtime.status === 'running' ? 'button--danger' : 'button--primary'}`} onClick={onToggleRuntime}>{runtime.status === 'running' ? <><Square size={14} fill="currentColor" />停止实例</> : <><Play size={15} fill="currentColor" />启动实例</>}</button></>} />

    <div className="runtime-banner">
      <div className="runtime-state"><span className="runtime-pulse" /><div><span className="label-small">GOST RUNTIME</span><strong>{runtime.status === 'running' ? '运行正常' : runtime.status === 'starting' ? '正在启动' : '未运行'}</strong></div></div>
      <div className="runtime-meta"><span><span className="meta-label">版本</span>{runtime.version}</span><span><span className="meta-label">来源</span>{runtime.source}</span><span><span className="meta-label">PID</span>{runtime.pid ?? '—'}</span></div>
      <button className="text-button" onClick={() => onNotice('运行时管理器会在发布版中自动下载与校验二进制')}><ExternalLink size={14} />查看运行时</button>
    </div>

    <div className="metric-grid">
      <MetricCard label="活动服务" value={`${runningServices}/${config.services.length}`} detail="当前启用" icon={Server} tone="blue" />
      <MetricCard label="转发节点" value={String(nodeCount)} detail="跨 2 条路径" icon={GitBranch} tone="violet" />
      <MetricCard label="请求成功率" value="99.98%" detail="过去 24 小时" icon={Gauge} tone="green" />
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

function ServicesView({ config, expertMode, onConfigChange, onToggleExpert, onNotice }: { config: GostConfig; expertMode: boolean; onConfigChange: (config: GostConfig) => void; onToggleExpert: () => void; onNotice: (message: string) => void }) {
  const [selectedName, setSelectedName] = useState(config.services[0]?.name ?? '')
  const selected = config.services.find((service) => service.name === selectedName) ?? config.services[0]
  useEffect(() => { if (!config.services.some((service) => service.name === selectedName)) setSelectedName(config.services[0]?.name ?? '') }, [config.services, selectedName])

  function updateService(patch: Partial<ServiceConfig>) {
    if (!selected) return
    onConfigChange({ ...config, services: config.services.map((service) => service.name === selected.name ? { ...service, ...patch } : service) })
  }
  function addService() {
    const name = `service-${config.services.length + 1}`
    const service: ServiceConfig = { name, type: 'http', listener: 'tcp', address: ':8081', chain: 'direct', auth: false, enabled: false, requests: 0, traffic: '—', status: 'stopped' }
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
    <div className="editor-layout"><aside className="editor-sidebar panel"><div className="editor-sidebar-head"><div><span className="label-small">SERVICES</span><strong>{config.services.length} 个入口</strong></div><button className="icon-button" aria-label="添加服务" onClick={addService}><Plus size={16} /></button></div><div className="editor-list">{config.services.map((service) => <button key={service.name} className={`editor-list-item ${service.name === selected?.name ? 'editor-list-item--active' : ''}`} onClick={() => setSelectedName(service.name)}><span className={`list-type-dot list-type-dot--${service.type}`} /> <span className="list-item-copy"><strong>{service.name}</strong><small>{service.address}</small></span><span className={`list-live-dot ${service.enabled ? 'list-live-dot--on' : ''}`} /></button>)}</div><button className="add-list-button" onClick={addService}><Plus size={15} />添加服务</button></aside><section className="editor-main">{selected ? <><div className="editor-title-row"><div><div className="title-with-status"><h2>{selected.name}</h2><span className={`inline-status inline-status--${selected.status}`}><i />{selected.status === 'running' ? '运行中' : '已停止'}</span></div><p>服务 / {selected.type} / {selected.listener}</p></div><div className="title-actions"><button className="icon-button" aria-label="删除服务" onClick={removeService}><Trash2 size={16} /></button><button className="button button--secondary button--compact" onClick={() => onNotice('服务配置已保存')}><Save size={15} />保存</button></div></div><div className="form-section panel"><SectionHeading icon={Globe2} title="入口配置" description="定义 GOST 对外监听的协议和地址。" /><div className="form-grid form-grid--three"><Field label="服务名称"><input value={selected.name} onChange={(event) => { const name = event.target.value; updateService({ name }); setSelectedName(name) }} /></Field><SelectField label="处理器" value={selected.type} options={['http', 'socks5', 'tcp', 'udp', 'auto']} onChange={(value) => updateService({ type: value as ServiceConfig['type'] })} /><SelectField label="监听器" value={selected.listener} options={['tcp', 'udp', 'tls', 'ws', 'http2', 'quic']} onChange={(value) => updateService({ listener: value as ServiceConfig['listener'] })} /></div><div className="form-grid form-grid--three"><Field label="监听地址" hint="支持 :8080、127.0.0.1:1080"><input value={selected.address} onChange={(event) => updateService({ address: event.target.value })} /></Field><SelectField label="转发链" value={selected.chain} options={config.chains.map((chain) => chain.name)} onChange={(value) => updateService({ chain: value })} /><ToggleField label="启用身份认证" checked={selected.auth} onChange={(checked) => updateService({ auth: checked })} /></div></div><div className="form-section panel"><SectionHeading icon={GitBranch} title="转发路径" description="请求会沿着选定的链路到达目标地址。" /><div className="path-preview"><div className="path-node path-node--origin"><span>入口</span><strong>{selected.address}</strong></div><div className="path-line" /><div className="path-node"><span>转发链</span><strong>{selected.chain || '直连'}</strong></div><div className="path-line path-line--dashed" /><div className="path-node path-node--target"><span>目标</span><strong>按请求决定</strong></div></div></div>{expertMode && <div className="form-section panel expert-section"><SectionHeading icon={Zap} title="极客选项" description="这些设置直接映射到 GOST 的 metadata 和高级配置。" /><div className="form-grid form-grid--three"><Field label="重试次数"><input type="number" defaultValue={1} min={0} /></Field><Field label="空闲超时"><input defaultValue="30s" /></Field><Field label="网络命名空间"><input placeholder="留空表示默认" /></Field></div><div className="notice-box"><Info size={16} /><span>高级字段会原样保留到 YAML；如果不确定某个选项，请从官方文档或原始配置开始。</span></div></div>}</> : <EmptyState title="还没有服务" description="创建第一个 GOST 服务入口。" action={<button className="button button--primary" onClick={addService}><Plus size={15} />新建服务</button>} />}</section></div>
    <div className="editor-mode-bar"><div><span className="mode-indicator"><span />{expertMode ? '极客模式已开启' : '基础模式'}</span><span className="mode-description">{expertMode ? '显示 metadata、重试、超时等底层选项' : '保留最常用的服务配置'}</span></div><button className="toggle-mode" onClick={onToggleExpert}>{expertMode ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}<span>{expertMode ? '关闭极客模式' : '开启极客模式'}</span></button></div>
  </>
}

function ChainsView({ config, onConfigChange, onNotice }: { config: GostConfig; onConfigChange: (config: GostConfig) => void; onNotice: (message: string) => void }) {
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
    onConfigChange({
      ...config,
      chains: config.chains.map((chain) => chain.name === selected.name ? { ...chain, ...patch } : chain),
    })
  }

  function addNode() {
    if (!selected) return
    const node: NodeConfig = {
      name: `node-${selected.nodes.length + 1}`,
      addr: '127.0.0.1:8080',
      connector: 'http',
      dialer: 'tcp',
      health: 'healthy',
      latency: 0,
    }
    updateChain({ nodes: [...selected.nodes, node] })
  }

  function updateNode(index: number, patch: Partial<NodeConfig>) {
    if (!selected) return
    updateChain({ nodes: selected.nodes.map((node, nodeIndex) => nodeIndex === index ? { ...node, ...patch } : node) })
  }

  return (
    <>
      <PageHeader
        eyebrow="CONFIGURATION / CHAINS"
        title="转发链"
        description="把节点组织成清晰的路径。选择策略、健康状态和底层协议都在同一张图里。"
        actions={
          <>
            <button className="button button--secondary" onClick={() => onNotice('节点探测已刷新')}>
              <RotateCw size={15} />刷新探测
            </button>
            <button className="button button--primary" onClick={addChain}>
              <Plus size={16} />新建转发链
            </button>
          </>
        }
      />
      <div className="chain-workbench">
        <aside className="chain-list panel">
          <div className="editor-sidebar-head">
            <div><span className="label-small">CHAINS</span><strong>{config.chains.length} 条路径</strong></div>
            <button className="icon-button" aria-label="添加转发链" onClick={addChain}><Plus size={16} /></button>
          </div>
          {config.chains.map((chain) => (
            <button key={chain.name} className={`chain-list-item ${chain.name === selected?.name ? 'chain-list-item--active' : ''}`} onClick={() => setSelectedName(chain.name)}>
              <div className="chain-list-icon"><GitBranch size={15} /></div>
              <div><strong>{chain.name}</strong><span>{chain.nodes.length} 个节点 · {chain.strategy}</span></div>
              <span className={`list-live-dot ${chain.enabled ? 'list-live-dot--on' : ''}`} />
            </button>
          ))}
          <button className="add-list-button" onClick={addChain}><Plus size={15} />添加转发链</button>
        </aside>
        <section className="chain-canvas panel">
          {selected ? (
            <>
              <div className="chain-canvas-head">
                <div>
                  <div className="title-with-status">
                    <h2>{selected.name}</h2>
                    <span className={`chain-state ${selected.enabled ? 'chain-state--on' : ''}`}>{selected.enabled ? '启用' : '停用'}</span>
                  </div>
                  <p>节点按照选择策略组成一条实际转发路径。</p>
                </div>
                <ToggleField label="启用链路" checked={selected.enabled} onChange={(checked) => updateChain({ enabled: checked })} />
              </div>
              <div className="chain-diagram">
                <div className="diagram-endpoint">
                  <div className="endpoint-icon endpoint-icon--client"><Globe2 size={18} /></div>
                  <span>客户端</span>
                </div>
                <div className="diagram-connector" />
                {selected.nodes.length === 0 ? (
                  <div className="diagram-empty">
                    <GitBranch size={22} />
                    <strong>这条链还没有节点</strong>
                    <span>添加节点后，路径会在这里展开</span>
                    <button className="button button--secondary button--compact" onClick={addNode}><Plus size={14} />添加第一个节点</button>
                  </div>
                ) : (
                  <div className="diagram-nodes">
                    {selected.nodes.map((node, index) => (
                      <div className="diagram-node-wrap" key={node.name}>
                        <div className="diagram-node">
                          <div className={`node-status node-status--${node.health}`} />
                          <div className="node-card-copy">
                            <strong>{node.name}</strong>
                            <span>{node.addr}</span>
                            <small>{node.dialer} → {node.connector} · {node.latency} ms</small>
                          </div>
                          <button className="node-edit-button" aria-label={`编辑 ${node.name}`} onClick={() => onNotice('节点编辑已展开')}><Settings2 size={14} /></button>
                        </div>
                        {index < selected.nodes.length - 1 && <div className="diagram-connector diagram-connector--node" />}
                      </div>
                    ))}
                  </div>
                )}
                <div className="diagram-connector" />
                <div className="diagram-endpoint">
                  <div className="endpoint-icon endpoint-icon--target"><ArrowUpRight size={18} /></div>
                  <span>目标地址</span>
                </div>
              </div>
              <div className="chain-settings">
                <div className="chain-setting">
                  <span>选择策略</span>
                  <SelectField label="" value={selected.strategy} options={['round', 'random', 'fifo', 'hash']} onChange={(value) => updateChain({ strategy: value as ChainConfig['strategy'] })} />
                </div>
                <div className="chain-setting">
                  <span>节点状态</span>
                  <div className="setting-value">
                    <i className="legend-dot legend-dot--green" />{selected.nodes.filter((node) => node.health === 'healthy').length} healthy
                    <i className="legend-dot legend-dot--amber" />{selected.nodes.filter((node) => node.health === 'degraded').length} degraded
                  </div>
                </div>
                <button className="button button--secondary button--compact" onClick={addNode}><Plus size={14} />添加节点</button>
              </div>
              <div className="node-table">
                {selected.nodes.map((node, index) => (
                  <div className="node-table-row" key={node.name}>
                    <span className={`node-status node-status--${node.health}`} />
                    <input value={node.name} aria-label="节点名称" onChange={(event) => updateNode(index, { name: event.target.value })} />
                    <input value={node.addr} aria-label="节点地址" onChange={(event) => updateNode(index, { addr: event.target.value })} />
                    <span className="node-protocol">{node.dialer} / {node.connector}</span>
                    <span className="node-latency">{node.latency} ms</span>
                    <button className="icon-button" aria-label="删除节点" onClick={() => updateChain({ nodes: selected.nodes.filter((candidate) => candidate.name !== node.name) })}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="还没有转发链" description="创建一条路径，把服务与节点连接起来。" action={<button className="button button--primary" onClick={addChain}><Plus size={15} />新建转发链</button>} />
          )}
        </section>
      </div>
    </>
  )
}

function RoutingView({ config, onConfigChange, onNotice }: { config: GostConfig; onConfigChange: (config: GostConfig) => void; onNotice: (message: string) => void }) {
  return <><PageHeader eyebrow="CONTROL / ROUTING" title="路由与规则" description="把流量决策从黑盒里拿出来：哪些地址直连、哪些请求走链路，都可以明确看到。" actions={<button className="button button--primary" onClick={() => onNotice('规则编辑器将在下一版开放')}><Plus size={16} />添加规则</button>} /><div className="routing-grid"><section className="panel routing-card"><div className="panel-heading"><div><h2>当前路由策略</h2><span>按服务分配的默认路径</span></div><ShieldCheck size={18} className="success-icon" /></div>{config.services.map((service) => <div className="route-row" key={service.name}><div className="route-service"><span className={`service-type service-type--${service.type}`}>{service.type === 'http' ? 'H' : service.type === 'socks5' ? 'S5' : service.type.toUpperCase()}</span><strong>{service.name}</strong></div><ArrowDownToLine size={15} className="muted-icon" /><span className="route-chain">{service.chain || 'direct'}</span><span className="rule-state">默认</span></div>)}</section><section className="panel routing-card"><div className="panel-heading"><div><h2>能力开关</h2><span>可用的 GOST 扩展能力</span></div><Zap size={18} className="amber-icon" /></div><CapabilityRow label="DNS Resolver" description="自定义 DNS、DoH、DoT 与链路解析" enabled={true} onToggle={() => onNotice('Resolver 设置已标记')} /><CapabilityRow label="Admission" description="接入来源的白名单与黑名单" enabled={false} onToggle={() => onNotice('Admission 设置已标记')} /><CapabilityRow label="Traffic limiter" description="按服务或用户限制带宽" enabled={false} onToggle={() => onNotice('Limiter 设置已标记')} /><CapabilityRow label="Sniffing" description="识别 TLS SNI、HTTP Host 等请求信息" enabled={true} onToggle={() => onNotice('Sniffing 设置已标记')} /></section></div><section className="panel rule-library"><div className="panel-heading"><div><h2>规则库</h2><span>基础版先保持透明，后续可接入完整 matcher 表达式。</span></div><button className="button button--secondary button--compact" onClick={() => onNotice('规则导入将在下一版开放')}><HardDriveDownload size={15} />导入规则</button></div><div className="rule-table"><div className="rule-table-head"><span>名称</span><span>类型</span><span>作用范围</span><span>状态</span></div><div className="rule-table-row"><strong>local-private</strong><span>Bypass</span><span>private, localhost</span><span className="rule-state rule-state--enabled">启用</span></div><div className="rule-table-row"><strong>office-admission</strong><span>Admission</span><span>service / private-socks</span><span className="rule-state">未启用</span></div><div className="rule-table-row"><strong>resolver-east</strong><span>Resolver</span><span>chain / relay-east</span><span className="rule-state rule-state--enabled">启用</span></div></div></section><div className="routing-note"><Info size={16} /><span>规则最终会写入 GOST 的 <code>bypasses</code>、<code>admissions</code>、<code>resolvers</code> 与 <code>hosts</code> 节点。需要精确表达式时，请使用高级配置。</span></div></>
}

function AdvancedView({ config, rawConfig, expertMode, issues, onRawChange, onApply, onToggleExpert, onNotice }: { config: GostConfig; rawConfig: string; expertMode: boolean; issues: ReturnType<typeof validateConfig>; onRawChange: (source: string) => void; onApply: () => void; onToggleExpert: () => void; onNotice: (message: string) => void }) {
  return <><PageHeader eyebrow="CONFIGURATION / RAW" title="高级配置" description="这里是 GOST 的原始 YAML。基础界面不会遮蔽能力，未知字段也可以保留在你的配置里。" actions={<><button className="button button--secondary" onClick={() => onRawChange(serializeConfig(config))}><RotateCw size={15} />重置为当前配置</button><button className="button button--primary" onClick={onApply}><Check size={15} />应用配置</button></>} /><div className="advanced-layout"><section className="raw-editor panel"><div className="raw-editor-head"><div><div className="title-with-status"><Code2 size={18} /><h2>gost.yml</h2><span className="file-state">未保存</span></div><p>YAML · 由 GOST 原生配置模型驱动</p></div><div className="editor-tools"><button className="icon-button" aria-label="格式化 YAML" onClick={() => onNotice('YAML 已按 2 空格缩进')}><Braces size={16} /></button><button className="icon-button" aria-label="保存配置" onClick={() => onNotice('配置已保存到本地工作区')}><Save size={16} /></button></div></div><textarea className="code-editor" spellCheck={false} value={rawConfig} onChange={(event) => onRawChange(event.target.value)} aria-label="GOST 原始 YAML 配置" /><div className="raw-editor-foot"><span><Command size={13} /> YAML</span><span>{rawConfig.split('\n').length} 行</span><span>UTF-8</span></div></section><aside className="advanced-sidebar"><section className="panel validation-panel"><div className="panel-heading"><div><h2>配置检查</h2><span>应用前自动检查</span></div>{issues.length === 0 ? <Check size={18} className="success-icon" /> : <AlertTriangle size={18} className="amber-icon" />}</div>{issues.length === 0 ? <div className="empty-validation"><div className="validation-circle"><Check size={17} /></div><strong>配置没有发现问题</strong><span>可以安全应用</span></div> : <div className="issue-list">{issues.map((issue) => <div className={`issue-row issue-row--${issue.level}`} key={`${issue.path}-${issue.message}`}><span>{issue.level === 'error' ? <X size={13} /> : <AlertTriangle size={13} />}</span><div><strong>{issue.path}</strong><p>{issue.message}</p></div></div>)}</div>}</section><section className="panel expert-panel"><div className="panel-heading"><div><h2>极客模式</h2><span>展示所有配置细节</span></div><button className="toggle-mode toggle-mode--small" onClick={onToggleExpert}>{expertMode ? <ToggleRight size={21} /> : <ToggleLeft size={21} />}<span>{expertMode ? '开启' : '关闭'}</span></button></div><p className="expert-copy">适合需要直接使用 matcher、metadata、插件、监听器参数和系统级选项的用户。</p><div className="expert-tags"><span>metadata</span><span>plugin</span><span>matcher</span><span>netns</span></div></section><section className="panel config-actions"><button className="action-link" onClick={() => onNotice('将以时间戳创建配置备份')}><HardDriveDownload size={16} /><span><strong>备份配置</strong><small>创建一个可恢复的本地快照</small></span><ChevronRight size={15} /></button><button className="action-link" onClick={() => onNotice('配置差异查看器将在下一版开放')}><GitBranch size={16} /><span><strong>查看变更</strong><small>对比上次应用的版本</small></span><ChevronRight size={15} /></button></section></aside></div></>
}

function RuntimeView({ runtime, configPath, onConfigPathChange, onBinaryPathChange, onToggleRuntime, onNotice }: { runtime: RuntimeState; configPath: string; onConfigPathChange: (path: string) => void; onBinaryPathChange: (path: string) => void; onToggleRuntime: () => void; onNotice: (message: string) => void }) {
  const isRunning = runtime.status === 'running'
  return <>
    <PageHeader eyebrow="RUNTIME / LOCAL ENGINE" title="运行时" description="GOST Studio 不替换 GOST，它负责找到、校验并管理你选择的 GOST 二进制。运行时升级始终保留在可审阅的版本锁中。" actions={<><button className="button button--secondary" onClick={() => onNotice('正在检查当前运行时')}><RotateCw size={15} />检查状态</button><button className={`button ${isRunning ? 'button--danger' : 'button--primary'}`} onClick={onToggleRuntime}>{isRunning ? <><Square size={14} fill="currentColor" />停止 GOST</> : <><Play size={15} fill="currentColor" />启动 GOST</>}</button></>} />
    <div className="runtime-grid">
      <section className="panel runtime-config-card"><div className="panel-heading"><div><h2>本地运行时</h2><span>桌面端进程管理</span></div><span className={`chain-state ${isRunning ? 'chain-state--on' : ''}`}>{isRunning ? 'RUNNING' : runtime.status.toUpperCase()}</span></div><div className="runtime-form"><Field label="GOST 二进制路径" hint="可填写绝对路径；发布版将支持系统文件选择器"><input value={runtime.binaryPath} onChange={(event) => onBinaryPathChange(event.target.value)} placeholder="例如 /usr/local/bin/gost" /></Field><Field label="配置文件路径" hint="相对于工作区或填写绝对路径"><input value={configPath} onChange={(event) => onConfigPathChange(event.target.value)} /></Field><div className="runtime-command"><span>实际启动命令</span><code>{runtime.binaryPath || 'gost'} -C {configPath || 'gost.yml'}</code></div></div><div className="notice-box notice-box--neutral"><Info size={16} /><span>浏览器模式只展示演示状态；Tauri 桌面模式会通过系统进程启动真正的 GOST。</span></div></section>
      <section className="panel runtime-lock-card"><div className="panel-heading"><div><h2>兼容性锁</h2><span>最近同步：2026-09-09</span></div><GitBranch size={18} className="success-icon" /></div><div className="lock-entry"><div><span>go-gost / gost</span><strong>36cc2662</strong><small>master · anchor gitignore rule</small></div><Check size={16} className="success-icon" /></div><div className="lock-entry"><div><span>go-gost / x</span><strong>f70b1145</strong><small>master · plugin lifecycle</small></div><Check size={16} className="success-icon" /></div><button className="text-button runtime-sync-button" onClick={() => onNotice('同步器会在 CI 中生成可审阅的更新 PR')}><GitBranch size={14} />检查 upstream 更新</button></section>
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
