/**
 * MCP Server 主入口
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Config } from './config.js'
import { Context7Bridge } from './context7/bridge.js'
import { createSearchEngine, getSearchEngineDescription } from './search/index.js'
import { WebFetch, getWebFetchDescription } from './tools/web-fetch.js'
import { FindOpenPdf, getFindOpenPdfDescription } from './tools/find-open-pdf.js'
import { GetPaper, getGetPaperDescription } from './tools/get-paper.js'

export interface ServerRuntime {
  close(): Promise<void>
}

// 工具参数 Schema
const WebSearchSchema = z.object({
  query: z.string().describe('搜索查询内容'),
  numResults: z.number().optional().default(8).describe('返回结果数量 (默认: 8)'),
})

const WebFetchSchema = z.object({
  url: z.string().describe('要抓取的 URL'),
  format: z
    .enum(['markdown', 'text', 'html'])
    .optional()
    .default('markdown')
    .describe('返回格式 (默认: markdown)'),
  timeout: z.number().min(1).max(120).optional().describe('超时时间(秒)，1-120秒'),
})

const GetPaperSchema = z.object({
  id: z.string().describe('论文 ID：arXiv ID (2301.00001)、DOI (10.xxxx/xxx)、PMID，或对应 URL'),
})

const FindOpenPdfSchema = z.object({
  doi: z.string().describe('论文 DOI，支持格式：10.xxxx/xxx、doi:...、https://doi.org/...'),
})

/**
 * 启动 MCP Server
 */
export async function startServer(config: Config): Promise<ServerRuntime> {
  // 创建搜索引擎实例
  const searchEngine = createSearchEngine(config)
  const webFetch = new WebFetch(config)
  const getPaper = new GetPaper(config)
  const findOpenPdf = new FindOpenPdf(config)
  const context7Bridge = new Context7Bridge(config)

  // 创建 MCP Server
  const server = new Server(
    {
      name: 'proxy-web-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools: Tool[] = [
      {
        name: 'web_search',
        description: getSearchEngineDescription(config.webSearch),
        inputSchema: zodToJsonSchema(WebSearchSchema) as Tool['inputSchema'],
      },
      {
        name: 'web_fetch',
        description: getWebFetchDescription(),
        inputSchema: zodToJsonSchema(WebFetchSchema) as Tool['inputSchema'],
      },
      {
        name: 'get_paper',
        description: getGetPaperDescription(),
        inputSchema: zodToJsonSchema(GetPaperSchema) as Tool['inputSchema'],
      },
      {
        name: 'find_open_pdf',
        description: getFindOpenPdfDescription(),
        inputSchema: zodToJsonSchema(FindOpenPdfSchema) as Tool['inputSchema'],
      },
    ]

    return context7Bridge.listTools().then(context7Tools => ({
      tools: [...tools, ...context7Tools],
    }))
  })

  // 注册工具调用处理器
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case 'web_search': {
          const params = WebSearchSchema.parse(args)
          const results = await searchEngine.search({
            query: params.query,
            numResults: params.numResults,
          })

          // 格式化输出
          const output = results
            .map((r, i) => {
              return `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`
            })
            .join('\n\n')

          return {
            content: [
              {
                type: 'text',
                text: output || 'No search results found',
              },
            ],
          }
        }

        case 'web_fetch': {
          const params = WebFetchSchema.parse(args)
          const result = await webFetch.fetch({
            url: params.url,
            format: params.format,
            timeout: params.timeout,
          })

          return {
            content: [
              {
                type: 'text',
                text: `# ${result.title}\n\nURL: ${result.url}\nContent-Type: ${result.contentType}\n\n---\n\n${result.content}`,
              },
            ],
          }
        }

        case 'get_paper': {
          const params = GetPaperSchema.parse(args)
          const paper = await getPaper.get(params.id)
          const lines: string[] = [
            `# ${paper.title}`,
            ``,
            `**Authors:** ${paper.authors.join(', ') || '(unknown)'}`,
          ]
          if (paper.published) lines.push(`**Published:** ${paper.published}`)
          if (paper.journal) lines.push(`**Journal:** ${paper.journal}`)
          if (paper.doi) lines.push(`**DOI:** ${paper.doi}`)
          if (paper.arxivId) lines.push(`**arXiv:** ${paper.arxivId}`)
          if (paper.pmid) lines.push(`**PMID:** ${paper.pmid}`)
          lines.push(`**URL:** ${paper.url}`)
          if (paper.pdfUrl) lines.push(`**PDF:** ${paper.pdfUrl}`)
          if (paper.abstract) lines.push(``, `## Abstract`, ``, paper.abstract)
          return { content: [{ type: 'text', text: lines.join('\n') }] }
        }

        case 'find_open_pdf': {
          const params = FindOpenPdfSchema.parse(args)
          const result = await findOpenPdf.find(params.doi)
          const lines: string[] = [`**DOI:** ${result.doi}`]
          if (result.title) lines.push(`**Title:** ${result.title}`)
          lines.push(`**Open Access:** ${result.isOpenAccess ? 'Yes' : 'No'}`)
          if (result.pdfUrl) lines.push(`**PDF URL:** ${result.pdfUrl}`)
          if (result.hostType) lines.push(`**Host:** ${result.hostType}`)
          if (result.version) lines.push(`**Version:** ${result.version}`)
          lines.push(``, result.message)
          return { content: [{ type: 'text', text: lines.join('\n') }] }
        }

        default:
          if (context7Bridge.canHandleTool(name)) {
            return context7Bridge.callTool({ name, arguments: args })
          }

          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      }
    }
  })

  // 启动传输
  const transport = new StdioServerTransport()
  let bridgeClosed = false
  let runtimeClosed = false

  const closeContext7Bridge = async (): Promise<void> => {
    if (bridgeClosed) {
      return
    }

    bridgeClosed = true
    await context7Bridge.close()
  }

  transport.onclose = () => {
    void closeContext7Bridge()
  }

  await server.connect(transport)

  console.error('MCP Server 已启动，等待连接...')

  return {
    close: async () => {
      if (runtimeClosed) {
        return
      }

      runtimeClosed = true

      try {
        await transport.close()
      } finally {
        await closeContext7Bridge()
      }
    },
  }
}
