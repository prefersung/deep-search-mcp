/**
 * MCP Server 主入口
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Config } from './config.js'
import { createSearchEngine, getSearchEngineDescription } from './search/index.js'
import { WebFetch, getWebFetchDescription } from './tools/web-fetch.js'

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

/**
 * 启动 MCP Server
 */
export async function startServer(config: Config): Promise<void> {
  // 创建搜索引擎实例
  const searchEngine = createSearchEngine(config)
  const webFetch = new WebFetch(config)

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
    const tools = [
      {
        name: 'web_search',
        description: getSearchEngineDescription(config.webSearch),
        inputSchema: zodToJsonSchema(WebSearchSchema),
      },
      {
        name: 'web_fetch',
        description: getWebFetchDescription(),
        inputSchema: zodToJsonSchema(WebFetchSchema),
      },
    ]

    return { tools }
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

        default:
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
  await server.connect(transport)

  console.error('MCP Server 已启动，等待连接...')
}
