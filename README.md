# dsh-ai-script-studio-mcp

把《[AI 智能剧本创作工具](https://github.com/shhsgff/ai-script-studio)》接进 DeepSeek Harness（或任意 MCP 客户端）的 **MCP 桥插件**。

装好之后，你在 DeepSeek Harness 里说一句「用第一章的设定，帮我建个新剧本，三章，每章三节」，Harness 就会调用本插件的工具，把章节结构直接写进正在运行的软件里——不用复制粘贴。

> 应用本体与插件是**两个独立仓库**：  
> 应用 → <https://github.com/shhsgff/ai-script-studio>  
> 插件 → 本仓库

---

## 它是怎么工作的

```
DeepSeek Harness ──stdio(MCP)──> server.js ──HTTP POST /rpc──> AI 智能剧本创作工具（桌面端 127.0.0.1:45871）
     调用工具                                    x-aisc-token 校验                   真正改剧本、建章节、写正文
```

- `server.js` 是一个不依赖第三方包的标准 stdio MCP 服务器（JSON-RPC 2.0，逐行）。
- 它只把工具调用转发给**正在运行的桌面软件**；软件没开时，工具会返回一句中文错误，不会静默失败。
- 桥地址与令牌由软件生成，默认放在  
  `%APPDATA%\ai-script-studio\mcp\mcp-bridge.json`（Windows）  
  也可以用命令行参数或环境变量指定。

## 前置条件

1. 《AI 智能剧本创作工具》桌面版已安装并**正在运行**；
2. 软件里 设置 → **DSH / MCP** →「开启 MCP 服务」已打开（软件会自动写好桥配置）；
3. Node.js ≥ 20；
4. 想用 DSH 插件方式的话，需要本机已装 DeepSeek Harness（`dsh` 命令可用，v0.1.7 起验证过）。

## 安装

### 方式 A：软件里点一下（最省事）

软件 → 设置 → DSH / MCP →「安装为 DSH 插件」→ 选一个 profile → 安装。
这条路径和本仓库的 `install` 命令等价（软件内部就在做同一件事）。

### 方式 B：本仓库 CLI

```bash
# 直接从 GitHub 跑，不落地源码
npx -y github:shhsgff/dsh-ai-script-studio-mcp install --profile web

# 或者克隆下来
git clone https://github.com/shhsgff/dsh-ai-script-studio-mcp
cd dsh-ai-script-studio-mcp
node bin/aisc-mcp.mjs install --profile web
```

装完重启对应的 DSH profile，插件的工具就会出现在工具列表里。

### 方式 C：任何支持 MCP 的客户端（Claude Desktop / Cursor / Cherry Studio …）

在客户端的 `mcpServers` 里加一段：

```json
{
  "mcpServers": {
    "ai-script-studio": {
      "command": "node",
      "args": ["D:/path/to/dsh-ai-script-studio-mcp/server.js"]
    }
  }
}
```

`server.js` 会自己去找 `%APPDATA%\ai-script-studio\mcp\mcp-bridge.json`；
放在别处就用第二个参数指定：`[".../server.js", "D:/my/mcp-bridge.json"]`。

## 命令

```
aisc-mcp install   [--profile web] [--bridge <桥配置>] [--plugin <mcp客户端包名>] [--out <bundle目录>]
aisc-mcp uninstall [--profile web]
aisc-mcp status
aisc-mcp snippet   [--profile web]
aisc-mcp doctor
```

| 命令 | 作用 |
| --- | --- |
| `install` | 在本机生成一个标准 DSH bundle（包内绝对路径指向真实的 server 与桥配置），再 `dsh plugin --profile <p> add` 装进去；装完会跑 `--dump-config` 验证条目真的生效 |
| `uninstall` | `dsh plugin remove`，并清掉 `node_modules` 里可能残留的软链 |
| `status` | 列出每个 profile 装没装、桥配置的端口与令牌状态 |
| `snippet` | 只打印要手动粘贴进 `cordis.patch.yml` 的那几行 |
| `doctor` | 环境自检（node、dsh、server.js、桥配置） |

选项默认值：`--profile` 优先 `web`，其次 `headless`；`--bridge` 默认 `%APPDATA%\ai-script-studio\mcp\mcp-bridge.json`；`--plugin` 默认从 `dsh --dump-config` 里反查当前 DSH 版本真正使用的 `mcp-client` 包名（版本换了也不会装错）。

## 提供的工具

| 工具 | 作用 | 关键参数 |
| --- | --- | --- |
| `create_script` | 新建一个剧本标签页，可一次给全章节/小节 | `title`、`chapters[]`（`title` + `paragraphs` 或 `sections[]`） |
| `add_chapter` | 在当前剧本末尾加一章 | `title`、`paragraphs[]` |
| `append_text` | 往某章正文末尾追加段落 | `text`（可用空行分段）、`chapter`（省略=当前章） |
| `list_scripts` | 列出当前打开的剧本与字数 | — |
| `get_script` | 读正文，续写前先了解已有内容 | `title`、`maxChars`（默认 6000） |

调用成功后软件界面会实时刷新（章节、字数、状态栏都会变）。

## 常见问题

**工具返回「无法连接到 AI 剧本创作工具（MCP 服务可能未开启）」**  
软件没开，或 设置 → DSH / MCP →「开启 MCP 服务」没打开。打开后重试即可。

**工具返回「没有找到桥配置（mcp-bridge.json）」**  
先在软件里点一次「开启 MCP 服务」生成桥配置，再 `aisc-mcp install` 重装一次。

**DSH 启动时报 `require is not defined` / 插件工具一直报错**  
这是 bundle 目录声明了 ESM 却放了 CommonJS 服务器导致的。本仓库从 1.0.0 起统一用 `server.cjs` + 不声明 `"type": "module"`，重新 `install` 一次即可。

**换了机器 / 换了软件安装位置**  
patch 里写的是本机绝对路径，换机器后重新跑一次 `install`（`--out` 会复用 `%APPDATA%\dsh-ai-script-studio-mcp\bundle-<profile>`，覆盖生成）。

**确认插件真的进了配置**

```bash
dsh --profile web --dump-config | findstr mcp-ai-script-studio
```

能看到 `- id: mcp-ai-script-studio` 就说明生效了。

## 安全说明

- 桥只监听 `127.0.0.1`，外部网络访问不到；
- 每个请求带 `x-aisc-token`（软件随机生成，存在本机桥配置里）；
- 插件本身不改你的 `cordis.patch.yml`，安装/卸载都走官方 `dsh plugin` 命令，profile 的 `package.json` 是唯一被修改的地方。

## 开发

```bash
npm test        # 起一个假桥，验证握手、tools/list、tools/call 转发与错误分支
node bin/aisc-mcp.mjs status
```

目录：

```
server.js          stdio MCP 服务器（CommonJS，无依赖）
bin/aisc-mcp.mjs   CLI：install / uninstall / status / snippet / doctor
lib/dsh.mjs        DSH 探测（profile 列表、dump-config、插件名反查、软链清理）
lib/bundle.mjs     生成 bundle（package.json + cordis.patch.yml + index.js + server.cjs）
test/              node:test 自测
```

## 许可

MIT © shhsgff。详见 [LICENSE](./LICENSE)。
