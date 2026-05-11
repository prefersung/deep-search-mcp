# deep-search-mcp

[![npm version](https://badge.fury.io/js/@chenpu%2Fweb-bridge-mcp.svg)](https://badge.fury.io/js/@chenpu%2Fweb-bridge-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-105%20passing-brightgreen)](https://github.com/chenpu17/web-bridge-mcp)

> MCP Server for deep web & academic search — with proxy support for restricted networks.

Most MCP search tools only wrap a single web search engine. **deep-search-mcp** gives your AI agent **6 search backends** — including three academic databases that most tools completely ignore — and works seamlessly behind corporate proxies with SSL inspection.

## What makes it different

| Feature | Other MCP search tools | deep-search-mcp |
|---|---|---|
| Web search | ✅ | ✅ DuckDuckGo + Exa AI |
| Academic papers | ❌ | ✅ arXiv + Semantic Scholar + PubMed |
| Chinese search | ❌ | ✅ Bocha AI |
| Proxy support | ❌ | ✅ system / custom URL |
| SSL inspection bypass | ❌ | ✅ `--ignore-ssl` |
| Free to use | partial | ✅ 4 out of 6 engines need no API key |
| Context7 docs | ❌ | ✅ built-in |

## Quick start

```bash
# No install needed
npx deep-search-mcp --web-search arxiv

# Behind a corporate proxy with SSL inspection
npx deep-search-mcp --proxy system --ignore-ssl --web-search arxiv

# Custom proxy URL
npx deep-search-mcp --proxy http://proxy.example.com:8080 --ignore-ssl
```

## Search engines

### Web search

```bash
# DuckDuckGo — free, no API key
npx deep-search-mcp --web-search duckduckgo

# Exa AI — AI-ranked results with content snippets
npx deep-search-mcp --web-search exa

# Bocha AI — best for Chinese content
npx deep-search-mcp --web-search bocha --bocha-api-key sk-xxx
```

### Academic search

```bash
# arXiv — preprints across CS, physics, math, biology
# Free, no key needed
npx deep-search-mcp --web-search arxiv

# Semantic Scholar — 200M+ papers with citation metrics
# Free; API key optional (raises rate limit)
npx deep-search-mcp --web-search semantic-scholar
npx deep-search-mcp --web-search semantic-scholar --semantic-scholar-api-key <key>

# PubMed — 35M+ biomedical and clinical papers (NCBI)
# Free; API key optional (raises rate limit)
npx deep-search-mcp --web-search pubmed
npx deep-search-mcp --web-search pubmed --pubmed-api-key <key>
```

### Academic search results

Each academic result includes everything you need to evaluate a paper at a glance:

```
1. **Attention Is All You Need**
   URL: https://arxiv.org/abs/1706.03762
   作者: Ashish Vaswani, Noam Shazeer, Niki Parmar 等 | 发表: 2017-06-12 | PDF: https://arxiv.org/pdf/1706.03762
   We propose a new simple network architecture, the Transformer...

2. **BERT: Pre-training of Deep Bidirectional Transformers**
   URL: https://www.semanticscholar.org/paper/...
   作者: Jacob Devlin, Ming-Wei Chang | 年份: 2019 | 引用: 50000 | DOI: 10.18653/...
   We introduce BERT, designed to pre-train deep bidirectional representations...
```

## Proxy configuration

The proxy options work for all six search engines and the web fetch tool:

```bash
# Auto-detect system proxy (reads env vars on Linux/Mac, registry on Windows)
npx deep-search-mcp --proxy system

# Explicit proxy URL
npx deep-search-mcp --proxy http://proxy.example.com:8080

# With SSL certificate bypass (needed when proxy does TLS inspection)
npx deep-search-mcp --proxy system --ignore-ssl

# No proxy
npx deep-search-mcp --proxy none
```

**Diagnose your proxy connection:**

```bash
npx deep-search-mcp diagnose --proxy system --ignore-ssl
```

This runs 5 checks: proxy detection → connectivity → web search → web fetch → Context7.

## Claude Code integration

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "deep-search": {
      "command": "npx",
      "args": [
        "deep-search-mcp",
        "--proxy", "system",
        "--ignore-ssl",
        "--web-search", "arxiv"
      ]
    }
  }
}
```

For biomedical research:

```json
{
  "mcpServers": {
    "deep-search": {
      "command": "npx",
      "args": [
        "deep-search-mcp",
        "--proxy", "system",
        "--ignore-ssl",
        "--web-search", "pubmed"
      ],
      "env": {
        "PUBMED_API_KEY": "your-ncbi-key"
      }
    }
  }
}
```

## MCP tools exposed

| Tool | Description |
|---|---|
| `web_search` | Search using the configured engine |
| `web_fetch` | Fetch and convert any URL to markdown / text / HTML |
| `resolve-library-id` | Context7: find a library's ID |
| `query-docs` | Context7: retrieve library documentation |

## All options

| Option | Description | Default |
|---|---|---|
| `-p, --proxy <proxy>` | `system` \| `none` \| `http://...` | reads env vars |
| `--web-search <engine>` | `duckduckgo` \| `exa` \| `bocha` \| `arxiv` \| `semantic-scholar` \| `pubmed` | `duckduckgo` |
| `--bocha-api-key <key>` | Bocha AI API key | `BOCHA_API_KEY` env |
| `--semantic-scholar-api-key <key>` | Semantic Scholar API key | `SEMANTIC_SCHOLAR_API_KEY` env |
| `--pubmed-api-key <key>` | PubMed / NCBI API key | `PUBMED_API_KEY` env |
| `-t, --timeout <ms>` | Request timeout in ms | `30000` |
| `--ignore-ssl` | Bypass SSL certificate verification | `false` |
| `--no-context7` | Disable Context7 tool passthrough | enabled by default |
| `--context7-api-key <key>` | Context7 API key (optional) | `CONTEXT7_API_KEY` env |

## Environment variables

```bash
HTTPS_PROXY=http://proxy.example.com:8080
BOCHA_API_KEY=sk-xxx
SEMANTIC_SCHOLAR_API_KEY=xxx
PUBMED_API_KEY=xxx
CONTEXT7_API_KEY=ctx7sk_xxx
IGNORE_SSL=true
```

## Search engine comparison

| Engine | Free | Key required | Best for |
|---|---|---|---|
| DuckDuckGo | ✅ | No | General web search |
| Exa AI | ❌ | No (MCP endpoint) | AI-ranked web results |
| Bocha AI | ❌ | Yes | Chinese content |
| arXiv | ✅ | No | Preprints (CS, physics, math, bio) |
| Semantic Scholar | ✅ | Optional | Cross-discipline papers + citations |
| PubMed | ✅ | Optional | Biomedical & clinical research |

## Development

```bash
git clone https://github.com/your-name/deep-search-mcp.git
cd deep-search-mcp
npm install
npm run dev -- --proxy system --ignore-ssl --web-search arxiv
npm test
npm run build
```

## License

MIT
