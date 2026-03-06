/**
 * E2E 测试 - 模拟 MCP Agent 测试服务器
 * 直接通过 stdio 与 MCP 服务器通信
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { once } from 'events'

// JSON-RPC 请求 ID 计数器
let requestId = 1

// 发送 JSON-RPC 请求
function sendRequest(
  process: ChildProcess,
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = requestId++
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }) + '\n'

    let responseBuffer = ''

    const onStdout = (data: Buffer) => {
      responseBuffer += data.toString()

      // 尝试解析完整的 JSON 响应
      const lines = responseBuffer.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const response = JSON.parse(line)
          if (response.id === id) {
            process.stdout?.off('data', onStdout)
            if (response.error) {
              reject(new Error(response.error.message || JSON.stringify(response.error)))
            } else {
              resolve(response.result)
            }
            return
          }
        } catch {
          // 继续等待更多数据
        }
      }
    }

    process.stdout?.on('data', onStdout)

    // 设置超时
    setTimeout(() => {
      process.stdout?.off('data', onStdout)
      reject(new Error('Request timeout'))
    }, 60000)

    process.stdin?.write(request)
  })
}

describe('E2E: MCP Server', () => {
  let serverProcess: ChildProcess

  beforeAll(async () => {
    // 启动 MCP 服务器进程
    serverProcess = spawn('node', ['dist/cli.js', '--proxy', 'none', '--ignore-ssl'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // 监听服务器错误输出（用于调试）
    serverProcess.stderr?.on('data', (data) => {
      // console.error('[Server]', data.toString())
    })

    // 等待服务器启动
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }, 30000)

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill()
    }
  })

  describe('Tool Discovery', () => {
    it('should list available tools', async () => {
      const response = (await sendRequest(serverProcess, 'tools/list', {})) as {
        tools: Array<{ name: string }>
      }

      expect(response.tools).toBeDefined()
      expect(response.tools.length).toBeGreaterThanOrEqual(2)

      const toolNames = response.tools.map((t) => t.name)
      expect(toolNames).toContain('web_search')
      expect(toolNames).toContain('web_fetch')
    })

    it('should have correct tool schemas', async () => {
      const response = (await sendRequest(serverProcess, 'tools/list', {})) as {
        tools: Array<{
          name: string
          inputSchema: { properties: Record<string, unknown> }
        }>
      }

      const searchTool = response.tools.find((t) => t.name === 'web_search')
      expect(searchTool).toBeDefined()
      expect(searchTool!.inputSchema.properties.query).toBeDefined()
      expect(searchTool!.inputSchema.properties.numResults).toBeDefined()

      const fetchTool = response.tools.find((t) => t.name === 'web_fetch')
      expect(fetchTool).toBeDefined()
      expect(fetchTool!.inputSchema.properties.url).toBeDefined()
      expect(fetchTool!.inputSchema.properties.format).toBeDefined()
    })
  })

  describe('web_search tool', () => {
    // 注意：此测试需要能够访问 DuckDuckGo，在内网环境可能需要配置代理
    it.skip(
      'should search with DuckDuckGo (requires network access)',
      async () => {
        const response = (await sendRequest(serverProcess, 'tools/call', {
          name: 'web_search',
          arguments: {
            query: 'hello world',
            numResults: 3,
          },
        })) as {
          content: Array<{ type: string; text: string }>
        }

        expect(response.content).toBeDefined()
        expect(response.content.length).toBeGreaterThan(0)
        expect(response.content[0].type).toBe('text')

        const text = response.content[0].text
        expect(text).toBeDefined()
        // 搜索结果应该包含 URL
        expect(text).toMatch(/https?:\/\//)
      },
      60000
    )

    it('should handle search errors gracefully', async () => {
      // 测试搜索工具是否正确响应（即使是错误响应）
      const response = (await sendRequest(serverProcess, 'tools/call', {
        name: 'web_search',
        arguments: {
          query: 'test query',
          numResults: 1,
        },
      })) as {
        content: Array<{ type: string; text: string }>
        isError?: boolean
      }

      expect(response.content).toBeDefined()
      expect(response.content[0].type).toBe('text')
      // 响应内容应该是非空的
      expect(response.content[0].text.length).toBeGreaterThan(0)
    })
  })

  describe('web_fetch tool', () => {
    it(
      'should fetch a webpage',
      async () => {
        const response = (await sendRequest(serverProcess, 'tools/call', {
          name: 'web_fetch',
          arguments: {
            url: 'https://example.com',
            format: 'markdown',
          },
        })) as {
          content: Array<{ type: string; text: string }>
          isError?: boolean
        }

        expect(response.isError).not.toBe(true)
        expect(response.content).toBeDefined()
        expect(response.content[0].type).toBe('text')

        const text = response.content[0].text
        expect(text).toBeDefined()
        // example.com 页面应该包含 "Example Domain"
        expect(text.toLowerCase()).toMatch(/example/)
      },
      60000
    )

    it(
      'should fetch in text format',
      async () => {
        const response = (await sendRequest(serverProcess, 'tools/call', {
          name: 'web_fetch',
          arguments: {
            url: 'https://example.com',
            format: 'text',
          },
        })) as {
          content: Array<{ type: string; text: string }>
          isError?: boolean
        }

        expect(response.isError).not.toBe(true)
        expect(response.content).toBeDefined()
        const text = response.content[0].text
        expect(text).toBeDefined()
        expect(text.toLowerCase()).toMatch(/example/)
      },
      60000
    )

    it('should reject private IP addresses (SSRF protection)', async () => {
      const response = (await sendRequest(serverProcess, 'tools/call', {
        name: 'web_fetch',
        arguments: {
          url: 'http://127.0.0.1/admin',
        },
      })) as {
        isError?: boolean
        content: Array<{ type: string; text: string }>
      }

      expect(response.isError).toBe(true)
      expect(response.content[0].text).toMatch(/private addresses|not allowed/)
    })
  })
})
