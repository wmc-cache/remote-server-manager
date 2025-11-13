# 打包 Mac + Windows

本项目使用 electron-builder 打包。已在 package.json 配置好 `build.mac` 与 `build.win` 目标，并提供以下脚本：

- `npm run build:mac`：构建当前平台（macOS）的产物（dmg、zip）
- `npm run build:win`：构建 Windows 产物（nsis、zip）
- `npm run build:mw`：一次性构建 macOS + Windows（在 macOS 上执行）

注意：从 macOS 交叉构建 Windows 需要安装打包依赖：

- 安装 Wine（用于 NSIS 产物）：
  - Homebrew（推荐）：`brew install --cask wine-stable`（或其它可用的 wine 包）
- 安装 Mono（部分场景需要）：
  - `brew install mono`

如果无法安装 Wine/Mono，可选方案：

1) 只在 macOS 构建 zip 产物（不依赖 NSIS 安装器）：
   - 修改命令：`npm run build -- --win zip`（或 `npm run build:win -- --win zip`）
2) 在 Windows 机器上执行 `npm run build:win`（无需 Wine/Mono）。
3) 使用 electronuserland/electron-builder 的 Docker 镜像（需 Docker 与网络）：
   - `docker run --rm -ti -v $PWD:/project electronuserland/electron-builder:wine /bin/bash`

构建输出位置
- 默认输出在 `dist/` 同级的打包输出目录（electron-builder 默认行为，具体以终端日志为准）。

签名与图标
- 当前未配置应用签名与自定义图标。如需上架或去除安全提示，请配置：
  - mac 签名与 notarize（Apple Developer）
  - win 代码签名证书（.pfx）
  - 图标：`build/icon.icns`（mac）、`build/icon.ico`（win）并在 build 配置中指向

