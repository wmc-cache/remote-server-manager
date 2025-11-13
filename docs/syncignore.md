# .syncignore 使用说明

在本地同步根目录创建一个名为 `.syncignore` 的文件，用来排除不需要参与同步/扫描的文件或目录，可显著降低 CPU 与 IO 开销。

支持的匹配规则（轻量子集）：

- 目录名：`node_modules/`、`dist/`、`.git/`（与任意层级同名目录匹配）
- 路径前缀：`public/assets`（匹配根目录下的 `public/assets/**`）
- 后缀通配：`*.log`、`*.tmp`
- 取反：`!keep/.env`（从忽略集中剔除某一路径）

内置默认忽略（可通过取反覆盖）：

- `.rsm_trash/`、`.git/`、`node_modules/`、`dist/`

示例：

```
# 忽略常见大型目录
node_modules/
dist/
.git/

# 日志与临时文件
*.log
*.tmp

# 只保留这个 .env
!config/.env
```

注意：当前实现为性能优化的精简规则，并非完整的 .gitignore 语法实现；如需更复杂的匹配，请据此调整目录结构或规则粒度。

