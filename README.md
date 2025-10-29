# 远程服务器管理客户端

基于 **Vue 3 + Vite + Electron** 打造的桌面应用，提供 SSH 服务器连接管理、远程文件浏览、命令执行以及本地↔远程目录的实时双向同步能力。

## 本地开发

```bash
npm install
npm run dev
```

开发模式下，Vite 启动前端页面，Electron 在渲染进程中加载。等待命令行输出 `ready` 后会自动打开桌面窗口。

## 核心目录

- `electron/` Electron 主进程、预加载脚本与 Node 侧服务实现。
- `src/` Vue 3 前端界面代码。
- `src/components/` 界面组件（连接管理、文件浏览、同步任务等）。
- `src/store/` Pinia 状态管理，集中存放连接与同步信息。

## 打包

```bash
npm run build
```

打包工作流将先构建渲染进程的前端产物，再借助 `electron-builder` 生成可分发安装包（需根据目标平台调整配置）。

## 后续规划

- 增加 SSH 密钥管理与加密存储。
- 丰富同步策略（排除列表、批量任务）。
- 接入日志/通知系统，提供更完整的可观测性。
