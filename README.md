# GOST Studio

GOST Studio 是 GOST 的跨平台桌面控制台：用清晰的界面管理服务入口、转发链、路由规则和原始配置，同时保留 GOST 原生能力与极客选项。

> 当前是 0.1.0 基础版本：已经完成核心工作台 UI、服务/转发链编辑器、原始 YAML 编辑器、配置校验、Tauri 运行时边界，以及 upstream 版本锁定机制。

## 设计取向

- **简约大气**：克制的色彩、清晰的层级、低噪音的信息密度，不使用夸张渐变或模板化 AI 卡片。
- **基础与极客并存**：日常配置通过表单完成；metadata、matcher、插件、网络命名空间、协议参数等能力留在高级配置中。
- **不 fork GOST**：通过原生 YAML、CLI、Web API 和 Metrics 与 GOST 集成，避免 UI 与运行时实现强耦合。
- **可审阅升级**：`compatibility/gost.lock.json` 记录 GOST 与 `x` 的精确提交，更新过程可以进入 PR 审查。

## 开发

```bash
pnpm install --ignore-scripts
pnpm dev
```

浏览器开发模式会使用本地演示状态；桌面模式：

```bash
pnpm tauri:dev
```

验证：

```bash
pnpm exec tsc -b --pretty false
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Upstream 同步

```bash
pnpm sync:gost
```

同步脚本只更新兼容性锁文件，不会自动改写用户配置，也不会静默替换正在运行的 GOST。正式发布流程应在 CI 中构建并审阅对应提交的 GOST 二进制。

## 目录

```text
src/                         React 工作台和配置适配器
src-tauri/                   Tauri 2 桌面壳与运行时进程管理
compatibility/gost.lock.json GOST / x 精确提交锁
scripts/update-gost.mjs      upstream 提交同步脚本
docs/ARCHITECTURE.md         集成边界与更新策略
```

## 当前已开放的第二阶段能力

- 配置文件打开、保存和浏览器模式导出
- GOST 二进制与配置路径选择
- GOST stdout/stderr 实时日志面板
- GOST / x upstream 自动检查（本地缓存 6 小时）
- 服务、Bypass、Admission、Resolver 的可视化编辑
- 转发链组件库：可将 Direct、HTTP over TLS、SOCKS5、Relay over QUIC 拖入路径
- 节点拖动排序与配置保存
- 手动 CI/CD：避免每次本地提交都消耗 GitHub Actions 分钟

## 阶段性 CI/CD

本地迭代优先执行：

```bash
pnpm exec tsc -b --pretty false
pnpm test -- --run
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

达到阶段性成果后，再在 GitHub Actions 中手动运行：

```text
Actions → verify → Run workflow → target=all
```

需要检查 GOST upstream 时，手动运行：

```text
Actions → upstream compatibility check → Run workflow
```

仓库不会因每次 push 自动运行 CI，也不会每天定时消耗 Actions 配额。
