# 远程服务器管理客户端

基于 Vue 3 + Vite + Electron 的跨平台桌面应用，用于管理 SSH 服务器连接、浏览与编辑远程文件、执行命令，并支持本地 ↔ 远程目录的实时双向同步。

## 功能特性

- 连接管理：新增/编辑/删除服务器连接，一键发起 SSH 连接。
- 远程文件：浏览目录、预览文件、编辑并保存远程文件，支持删除文件/目录（可递归）。
- 终端执行：在当前远程目录下执行命令并查看标准输出/错误与退出码。
- 双向同步：本地与远程目录实时监听变化并同步，提供同步日志视图。
- DeepSeek AI 工具（可选）：多轮对话，命令生成/解释，文件定位与查找建议。
- 主题切换：内置多套主题，记忆并自动应用上次选择。

## 运行环境

- Node.js 18+（建议 LTS）
- macOS / Windows / Linux

## 快速开始

```bash
npm install
npm run dev
```

开发模式会同时启动 Vite（前端）与 Electron（主进程）。待终端出现就绪提示后会自动打开桌面窗口。

## 脚本命令

- `npm run dev`：启动本地开发（Vite + Electron）。
- `npm run build`：先构建渲染进程，再使用 `electron-builder` 打包应用。
- `npm run preview`：仅预览已构建的渲染进程页面（不启动 Electron）。
- `npm run lint`：使用 ESLint 检查 JS/Vue 代码。

## 项目结构

```
electron/               # Electron 主进程与 Node 服务
  main.js               # 应用入口与 IPC 处理
  preload.js            # 预加载，向渲染进程暴露受控 API
  services/
    sshClient.js        # SSH/SFTP 客户端封装（基于 ssh2）
    fileSync.js         # 本地/远程双向同步（基于 chokidar）
    connectionStore.js  # 连接与同步映射的持久化（electron-store）

src/                    # Vue 3 渲染进程
  main.js               # 入口
  App.vue               # 根组件
  components/           # 界面组件（ServerList、RemoteExplorer 等）
  store/                # Pinia 状态（useMainStore）

index.html              # Vite 入口模板
vite.config.js          # Vite 配置
```

## 关键模块说明

- `electron/services/sshClient.js`：管理 SSH 连接、SFTP 目录/文件读写与命令执行。
- `electron/services/fileSync.js`：监听本地与远程变化，处理上传/下载与冲突策略，向渲染进程推送同步日志。
- `electron/services/connectionStore.js`：持久化保存连接与同步映射（默认 `electron-store` 未加密，见安全说明）。
- `electron/preload.js`：通过 `contextBridge` 暴露受控 API（如 `listDirectory`、`startSync` 等）。

## 开发规范

- 缩进 2 空格；JS 优先使用单引号。
- Vue SFC 文件名使用帕斯卡命名（例如 `ServerList.vue`）。
- Electron 服务位于 `electron/services`，使用小驼峰（例如 `sshClient.js`）。
- Pinia Store 命名以 `useXxxStore`（例如 `useMainStore`）。
- ESLint：`eslint:recommended` + `plugin:vue/vue3-recommended`，已关闭 `vue/multi-word-component-names` 规则。

## 安全与配置

- 不要提交任何凭据或私钥。连接配置中的 `password`/`privateKey` 由用户提供。
- `electron-store` 默认未加密，若需持久化敏感信息，优先使用系统钥匙串/安全存储方案。
- 避免在日志中输出包含路径、令牌等敏感信息；样例中仅使用示例主机与用户名。
- 示例连接：`user@example.com:22` 或 `user@192.0.2.10`（TEST-NET-1）。

## 测试（建议）

项目暂未集成测试框架。如需补充：

- 优先使用 Vitest + @vue/test-utils。
- 单元测试放置于 `src/**/__tests__/` 或 `tests/unit/`，文件名以 `*.spec.js` 结尾。
- 优先覆盖 Pinia Store 的 Action 以及 Electron 服务（SSH、文件同步），用 Mock 隔离实际网络与文件系统副作用。

## 打包与发布

```bash
npm run build
```

构建将先产出渲染进程静态资源（Vite），再由 `electron-builder` 生成安装包。根据目标平台调整 `electron-builder` 配置（签名、图标、发布渠道等）。

## 常见问题（FAQ）

- 无法打开 SFTP 通道？请确认远程服务器安装并启用 `openssh-sftp-server`，并在 `sshd_config` 中开启 SFTP 子系统后重启 SSH 服务。
- 连接失败/权限错误？优先使用密钥登录，检查远程用户权限与防火墙/安全组入站规则，必要时调整端口转发或白名单。
- 同步策略与排除规则？当前实现侧重实时双向同步与日志，可按需扩展排除列表/冲突处理策略。

## 许可证

MIT

---

如需新增功能或完善文档，欢迎提交 PR。提交前请遵循提交规范（如 `feat:`、`fix:`、`chore:`）并附上变更目的、截图/终端输出与相关 Issue 链接。
