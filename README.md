# @chenpu17/web-bridge-mcp

[![npm version](https://badge.fury.io/js/@chenpu%2Fweb-bridge-mcp.svg)](https://badge.fury.io/js/@chenpu%2Fweb-bridge-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

支持代理配置的 MCP Server，提供 Web 搜索、网页抓取，以及官方 Context7 文档能力透传。

**专为内网环境设计**，让无法直接访问外网的 AI 编程工具（如 Claude Code、OpenCode）也能获取互联网信息。

## 特性

- **代理支持**: 支持 `system`（自动检测系统代理）、`none`（不使用代理）、自定义代理 URL
- **Windows 系统代理检测**: 自动读取 Windows 注册表获取系统代理配置
- **SSL 证书忽略**: 支持忽略 SSL 证书校验，解决代理导致的证书问题
- **多种搜索引擎**: DuckDuckGo（免费）、Exa AI、博查 AI
- **网页抓取**: 支持 Markdown、纯文本、HTML 格式输出
- **官方 Context7 透传**: 直连 `https://mcp.context7.com/mcp`，暴露官方 `resolve-library-id` / `query-docs` 工具
- **Context7 可选鉴权**: 支持 `CONTEXT7_API_KEY`，不配置也可匿名基础使用
- **npx 运行**: 无需安装，一条命令即可使用

## 快速开始

```bash
# 使用 npx 直接运行（推荐）
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl

# 启用官方 Context7
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl --context7

# 或全局安装
npm install -g @chenpu17/web-bridge-mcp
web-bridge-mcp --proxy system --ignore-ssl
```

## 使用方法

### 基本用法

```bash
# 使用 DuckDuckGo 搜索（默认，免费无需配置）
npx @chenpu17/web-bridge-mcp

# 使用系统代理
npx @chenpu17/web-bridge-mcp --proxy system

# 指定代理地址
npx @chenpu17/web-bridge-mcp --proxy http://proxy.company.com:8080

# 忽略 SSL 证书校验（解决代理证书问题）
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl
```

### 启用 Context7

```bash
# 启用官方 Context7 MCP 透传
npx @chenpu17/web-bridge-mcp --context7

# 内网推荐：系统代理 + 忽略 SSL + Context7
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl --context7

# 配置 Context7 API Key（可选，提高限额）
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl --context7 --context7-api-key ctx7sk_xxx
```

### 搜索引擎配置

```bash
# DuckDuckGo（默认，免费）
npx @chenpu17/web-bridge-mcp --web-search duckduckgo

# Exa AI（AI 优化搜索）
npx @chenpu17/web-bridge-mcp --web-search exa

# 博查 AI（中文友好，需要 API Key）
npx @chenpu17/web-bridge-mcp --web-search bocha --bocha-api-key sk-xxx
```

### 完整示例（企业内网推荐配置）

```bash
# 使用系统代理 + 忽略 SSL + DuckDuckGo + 官方 Context7
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl --context7

# 使用系统代理 + 忽略 SSL + 博查搜索 + 官方 Context7
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl --web-search bocha --bocha-api-key sk-xxx
```

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `HTTPS_PROXY` / `HTTP_PROXY` | 代理地址 |
| `BOCHA_API_KEY` | 博查 AI 的 Bearer Token |
| `CONTEXT7_API_KEY` | Context7 API Key（可选） |
| `CONTEXT7_MCP_URL` | Context7 MCP URL，默认 `https://mcp.context7.com/mcp` |
| `ENABLE_CONTEXT7` | 启用 Context7（设置为 `true`） |
| `IGNORE_SSL` | 忽略 SSL 证书校验 (设置为 `true`) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | 设置为 `0` 也可忽略 SSL |

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-p, --proxy <proxy>` | 代理设置: system \| none \| http://... | none |
| `--web-search <engine>` | 搜索引擎: duckduckgo \| exa \| bocha | duckduckgo |
| `--bocha-api-key <key>` | 博查 AI API Key | - |
| `-t, --timeout <ms>` | 请求超时时间(毫秒) | 30000 |
| `--ignore-ssl` | 忽略 SSL 证书校验 | false |
| `--context7` | 启用官方 Context7 MCP 透传 | false |
| `--context7-api-key <key>` | Context7 API Key（可选） | - |
| `--context7-url <url>` | Context7 MCP URL | `https://mcp.context7.com/mcp` |

### 检测系统代理

```bash
npx @chenpu17/web-bridge-mcp detect-proxy
```

### 诊断代理连接

测试代理配置是否正常工作，包括连接测试、搜索测试和抓取测试：

```bash
# 使用系统代理进行诊断
npx @chenpu17/web-bridge-mcp diagnose

# 使用指定代理进行诊断
npx @chenpu17/web-bridge-mcp diagnose --proxy http://proxy.company.com:8080

# 忽略 SSL 证书进行诊断
npx @chenpu17/web-bridge-mcp diagnose --proxy system --ignore-ssl

# 额外测试 Context7 连通性
npx @chenpu17/web-bridge-mcp diagnose --proxy system --ignore-ssl --context7
```

诊断命令会自动测试：
1. 代理检测 - 检查代理配置是否正确
2. 连接测试 - 测试是否能通过代理访问互联网
3. 搜索测试 - 测试 DuckDuckGo 搜索功能
4. 抓取测试 - 测试网页内容抓取功能
5. Context7 测试（启用 `--context7` 时）- 测试官方 Context7 工具发现与调用

每个步骤都会显示详细的测试结果和响应时间，帮助快速定位问题。

## MCP 工具

### web_search

搜索互联网获取信息。

**参数**:
- `query` (string): 搜索查询内容
- `numResults` (number, 可选): 返回结果数量，默认 8

### web_fetch

抓取指定 URL 的网页内容。

**参数**:
- `url` (string): 要抓取的 URL
- `format` (enum, 可选): 返回格式 - markdown / text / html，默认 markdown
- `timeout` (number, 可选): 超时时间(秒)，最大 120

### resolve-library-id

官方 Context7 工具，解析库名并返回 Context7 兼容的 library ID。

**参数**:
- `query` (string): 当前要完成的任务或问题
- `libraryName` (string): 要查找的库名

### query-docs

官方 Context7 工具，根据 library ID 检索最新文档和代码示例。

**参数**:
- `libraryId` (string): Context7 兼容库 ID，例如 `/vercel/next.js`
- `query` (string): 具体问题或任务

## 在 Claude Code 中使用

在 Claude Code 的配置文件中添加 MCP Server：

```json
{
  "mcpServers": {
    "proxy-web": {
      "command": "npx",
      "args": [
        "@chenpu17/web-bridge-mcp",
        "--proxy", "system",
        "--ignore-ssl",
        "--web-search", "duckduckgo",
        "--context7"
      ]
    }
  }
}
```

如果使用博查搜索：

```json
{
  "mcpServers": {
    "proxy-web": {
      "command": "npx",
      "args": [
        "@chenpu17/web-bridge-mcp",
        "--proxy", "system",
        "--ignore-ssl",
        "--context7",
        "--web-search", "bocha",
        "--bocha-api-key", "sk-xxx"
      ]
    }
  }
}
```

如果 Context7 需要更高限额，可追加 API Key：

```json
{
  "mcpServers": {
    "proxy-web": {
      "command": "npx",
      "args": [
        "@chenpu17/web-bridge-mcp",
        "--proxy", "system",
        "--ignore-ssl",
        "--context7",
        "--context7-api-key", "ctx7sk_xxx"
      ]
    }
  }
}
```

## 搜索引擎对比

| 搜索引擎 | 免费 | 鉴权方式 | 特点 |
|---------|------|---------|------|
| DuckDuckGo | ✅ | 无需 | 免费、无限制，结果质量一般 |
| Exa AI | ❌ | 无需（MCP端点） | AI 优化搜索，结果质量高 |
| 博查 AI | ❌ | Bearer Token | 中文搜索友好 |

## 常见问题

### 1. 代理证书错误

如果遇到 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 错误，请添加 `--ignore-ssl` 参数：

```bash
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl
```

### 2. Windows 系统代理未检测到

确保系统代理已正确配置：
1. 打开「设置」→「网络和 Internet」→「代理」
2. 检查「使用代理服务器」是否已开启

### 3. 博查搜索认证失败

确保 API Key 正确，可以通过环境变量或命令行参数配置：

```bash
# 方式1: 命令行参数
npx @chenpu17/web-bridge-mcp --web-search bocha --bocha-api-key sk-xxx

# 方式2: 环境变量
export BOCHA_API_KEY=sk-xxx
npx @chenpu17/web-bridge-mcp --web-search bocha
```

### 4. Context7 是否必须鉴权？

不是必须。官方远端 MCP 在很多场景下支持匿名基础使用，但限额更低。

如果你在企业内网长期使用，建议配置 `CONTEXT7_API_KEY` 或 `--context7-api-key`，这样更稳定，也更接近官方推荐方式：

```bash
export CONTEXT7_API_KEY=ctx7sk_xxx
npx @chenpu17/web-bridge-mcp --proxy system --ignore-ssl --context7
```

## 开发

```bash
# 克隆仓库
git clone https://github.com/chenpu/web-bridge-mcp.git
cd web-bridge-mcp

# 安装依赖
npm install

# 开发模式
npm run dev -- --proxy system --ignore-ssl

# 构建
npm run build

# 运行构建产物
npm start -- --proxy system --ignore-ssl

# 运行测试
npm test

# 代码质量检查
npm run lint

# 格式化代码
npm run format

# 类型检查
npm run typecheck
```

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 运行测试确保通过 (`npm test`)
4. 运行 lint 检查 (`npm run lint`)
5. 提交更改
6. 推送到分支
7. 创建 Pull Request

## 技术栈

- **Runtime**: Node.js >= 18
- **Language**: TypeScript
- **Framework**: MCP SDK
- **Testing**: Vitest
- **Linting**: ESLint + TypeScript ESLint
- **Formatting**: Prettier

## 安全性

### SSRF 防护

本项目实现了多层 SSRF (Server-Side Request Forgery) 防护：

- **内网 IP 段阻止**: 自动阻止访问私有 IP 地址
- **敏感端口过滤**: 禁止访问数据库、邮件等敏感服务端口
- **IPv6 支持**: 同时检测 IPv4 和 IPv6 内网地址
- **本地地址拦截**: 阻止 localhost 和本地回环地址

### 最佳实践

- 使用环境变量存储敏感信息（API Keys）
- 支持忽略 SSL 证书校验（仅限受信任的网络环境）
- 响应大小限制（5MB）
- 请求超时控制

## License

MIT © chenpu
