# 远程服务器管理（Electron + Vue3）性能优化设计

目标：在不牺牲安全性的前提下，降低启动/内存/交互时延，提升同步吞吐与大文件预览体验，并提供量化可观测与灰度开关，确保改动可验证、可回滚。

## 关键指标（SLIs/目标）
- 启动与首屏
  - 冷启动到首屏可交互（TTI）< 1.5s（开发环境 < 2.0s）
  - 产物主包 < 900KB（gzip 后），大预览库独立分包
- 运行时内存
  - Idle 状态总内存（主进程+渲染进程）< 180MB
  - 预览大文件峰值内存较现状下降 ≥ 35%
- 交互性能
  - 目录列表渲染（3000 项）< 120ms（首屏虚拟列表首屏渲染）
  - 文本（≤ 200KB）高亮耗时 < 200ms
- 同步吞吐
  - 初次对齐（1000 小文件）≤ 60s（带 4 并发），后续单文件变更 < 1s 触发上传
  - 大文件（≥ 50MB）传输稳定，UI 不冻结

## 分层优化总览
- 渲染层（Vue）：按需加载与分包、虚拟列表、避免把大数据放入响应式、Worker 化重计算、Blob URL 替代 Base64。
- 主进程/IPC：大文件分块/流式传输、减少 IPC 大包、SFTP 连接与操作池化、日志降噪与采样。
- 同步（SFTP）：受控并发、批量合并、忽略规则、队列背压、目录扫描优化。
- 构建与产物：Rollup manualChunks 拆重、依赖瘦身、dev 预构建、生产 SourceMap/Target 调整。
- 可观测：采集启动/内存/耗时日志，关键路径埋点与调试开关。

---

## 渲染层优化

1) 预览依赖按需与分包（高收益，优先级 P0）
- 问题：`src/components/FilePreview.vue:43-50` 静态引入 `@tato30/vue-pdf`、`@vue-office/*`、`highlight.js`、`marked`，会被打进主包，首屏体积大、启动慢。
- 方案：
  - 改为动态导入并用 `defineAsyncComponent` 包裹，首屏只加载框架与基础 UI；对应 Rollup `manualChunks` 做独立分包。
  - CSS 也延迟加载（通过组件内动态 `import()` 触发）。
- 实施要点（示意）：
  - FilePreview.vue 内：
    - 将 `import VuePdf ...` 改为 `const VuePdf = defineAsyncComponent(() => import('@tato30/vue-pdf'))`；
    - `@vue-office/*` 同理；
    - `highlight.js` 改为按需引入核心与少量语言（见“依赖瘦身”）。
  - Vite 分包见“构建与产物”。

2) 大数据非响应化存储（P0）
- 问题：`src/store/mainStore.js:151-156` 将大文件 Base64 放入 Pinia `state.previewFile`，会触发深层响应式代理与多次计算，放大内存与 GC 压力。
- 方案：
  - Store 仅存“元信息”（path、type、size、encoding），实际二进制/文本内容放入非响应式缓存（模块级 `Map` 或 `WeakMap`），组件用时读取；或使用 `shallowRef`/`markRaw` 存放。
  - 预览结束/切换时主动释放（清空缓存、回收 Blob URL）。
- 迁移路径：
  - 新增 `src/store/previewCache.js`（非响应式 Map）；
  - `previewRemoteFile` 仅设置 `previewMeta`，真实内容写入 `previewCache.set(path, payload)`；
  - FilePreview 通过 `watch(() => store.previewMeta, ...)` 读取缓存。

3) Blob URL 替代 Base64（P0）
- 问题：Base64 约比原始二进制膨胀 33%，渲染图像/音视频时内存峰值较高。
- 方案：将二进制转为 `Blob`，用 `URL.createObjectURL(blob)` 作为 `src`；关闭时 `URL.revokeObjectURL`。
- 兼容：PDF/Office 组件若支持 `Uint8Array/ArrayBuffer`，优先直接传入，不再中转 Base64（`src/components/FilePreview.vue:98-115` 已使用 `Uint8Array`，保留此路径）。

4) 虚拟列表（P1）
- 问题：`src/components/RemoteExplorer.vue` 对大型目录 `v-for` 直接渲染，>1000 项时会卡顿。
- 方案：引入虚拟滚动（如 `vue-virtual-scroller`）或实现简易窗口化（仅渲染可视区+缓冲区）。
- 低成本方案：当 `entries.length > 300` 启用“分页/窗口化渲染”。

5) 语法高亮与 Markdown 瘦身（P1）
- 问题：全量 `highlight.js` + 自动探测耗时重，且体积大。
- 方案：
  - 仅引入核心 `highlight.js/lib/core`；按需注册常用语言（js/ts/json/bash/yaml/markdown/...）。
  - 大文本（> 300KB）关闭自动高亮或采用延迟/Worker。
  - Markdown 仅在需要时动态导入 `marked`。

6) Worker 化重计算（P2）
- 将 Markdown 渲染与长文本语法高亮放入 Web Worker，主线程只负责展示；超时/取消控制避免“卡死”。

---

## 主进程/IPC 优化

1) 大文件分块/流式 IPC（P1→P0 于大文件场景）
- 问题：`ipcMain.handle('ssh:read-file-binary')` 一次性返回整段 Base64，造成两端内存峰值高、GC 压力大、IPC 复制耗时长。
- 方案：
  - 新增基于 requestId 的流式通道：`ssh:read-file-stream`（请求） -> `ssh:read-file-chunk::<id>`（事件推送），按 512KB~1MB 分块传输；渲染层汇聚为 Blob/ArrayBuffer。
  - 写入同理提供 `ssh:write-file-stream`（可选）。

2) SFTP 连接/通道复用
- 现有 `electron/services/sshClient.js:getSFTP` 已缓存 SFTP；确保错误关闭时清理（已处理）。建议：监控 `sftp.__closed` 命中率/重连次数。

3) 日志与错误采样
- `sync:log` 事件较频繁时（如初次对齐），建议采样/合并（每秒最多 N 条），减少 IPC 压力与渲染层重绘。

---

## 同步（SFTP）优化

1) 并发/队列（P0）
- 问题：`electron/services/fileSync.js` 的上传/下载在一些路径是串行执行（受 `schedule` 链式影响）。
- 方案：
  - 针对“初次对齐/批量下载”阶段使用受控并发（建议 3~6），单连接避免过多并发导致远端负载过高；
  - 持续监听阶段仍保持串行（稳定优先），但允许同一变更合并/去重。

2) 忽略与消抖（P0）
- 在本地 Watcher 忽略 `.rsm_trash`，避免回环；变更风暴时合并 100~300ms 内同名文件多次事件。
- 建议在 `startLocalWatcher` 增加：`ignored: /\.rsm_trash(\/|$)/`；对 `add/change` 做 `debounce`/`throttle`。

3) 目录扫描优化（P1）
- 远端树扫描：优先复用 `readdir` 返回的 `attrs`，避免额外 `stat`；必要时分层限深或分批（大目录）。
- 本地树扫描：跳过大体积或忽略模式（如 `.git`、`node_modules`）可配置。

4) 可靠性与回压（P1）
- 失败重试指数退避（已用于 getSFTP），上传/下载失败进入有限重试队列；队列积压超阈值暂停 watcher 上游投入，避免“背压失控”。

---

## 构建与产物优化（Vite/Rollup）

建议修改：`vite.config.js`

```js
// 关键：按需分包 & 依赖预构建
build: {
  outDir: 'dist',
  emptyOutDir: true,
  sourcemap: false,
  cssCodeSplit: true,
  target: 'es2020',
  rollupOptions: {
    output: {
      manualChunks: {
        'pdf-viewer': ['@tato30/vue-pdf'],
        'office-viewers': ['@vue-office/docx', '@vue-office/excel'],
        'markdown-hl': ['marked', 'highlight.js/lib/core'],
      },
    },
  },
},
optimizeDeps: {
  include: [
    'highlight.js/lib/core',
    // 如启用：具体语言包（体积小，按需引入）
    'highlight.js/lib/languages/javascript',
    'highlight.js/lib/languages/typescript',
    'highlight.js/lib/languages/json',
    'highlight.js/lib/languages/bash',
    'highlight.js/lib/languages/yaml',
    'highlight.js/lib/languages/markdown',
  ],
},
```

依赖瘦身：将 FilePreview 中的 `import hljs from 'highlight.js'` 改为核心版：

```js
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
// ... 注册必要语言
hljs.registerLanguage('javascript', javascript);
```

---

## 可观测性与压测

- 启动/首屏：渲染层使用 `performance.mark/measure` 记录 `app_mounted`、首个列表渲染完成时间，主进程记录 `ready`/`browser-window-created` 到 `did-finish-load`。
- 内存：周期性（每 10s）采样 `process.getProcessMemoryInfo()`（主进程）和 `performance.memory`（渲染层，Chromium 提供时），日志仅在调试模式输出。
- 同步：记录初次对齐耗时、下载/上传失败率、平均吞吐（MB/s），超阈值报警到 `sync:log`（降噪）。

---

## 落地优先级与验收

- P0（两天内）：
  - 预览依赖按需 + 分包（FilePreview + Vite 配置）；
  - 预览大数据非响应化 + Blob URL；
  - Watcher 忽略 `.rsm_trash` 与变更消抖；
  - 基础指标埋点（启动/内存）。

- P1（一周内）：
  - 目录虚拟列表；
  - 同步初次对齐并发下载；
  - 高亮/Markdown 瘦身与阈值控制；
  - 日志采样。

- P2（按需）：
  - IPC 分块/流式预览；
  - Worker 化 Markdown/高亮；
  - 可配置忽略/限深策略；
  - SFTP 写入分块/断点续传（需要更复杂的协议约定）。

验收标准：按“关键指标”逐项对比现状与优化后数据，均达到或优于目标；提供回滚开关（环境变量或配置项）确保快速止血。

---

## 关联文件与改动点索引

- 预览按需/分包：
  - `src/components/FilePreview.vue:41-50`（改为动态导入+按需注册语言）；
  - `vite.config.js`（`rollupOptions.output.manualChunks` 与 `optimizeDeps.include`）。
- 非响应化与 Blob URL：
  - `src/store/mainStore.js:134-156`（预览读取路径；改为仅写 meta + 缓存）；
  - 新增 `src/store/previewCache.js`（非响应式缓存）；
  - `src/components/FilePreview.vue`（从缓存读数据 + 生成/释放 Blob URL）。
- Watcher 忽略与消抖：
  - `electron/services/fileSync.js` 的 `startLocalWatcher`（添加 `ignored` 与 debounce 逻辑）。
- 同步并发：
  - `electron/services/fileSync.js` 的远端初次对齐下载循环（改为受控并发）。
- 流式 IPC（可选 P2）：
  - `electron/main.js` & `electron/preload.js`（新增流式通道，按 requestId 订阅/取消）。

---

如需，我可以按上述清单逐条提交代码改动，并配套简单的性能基准脚本与验证步骤。

