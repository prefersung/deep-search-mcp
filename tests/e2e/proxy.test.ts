/**
 * E2E 测试 - 通过代理服务器测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { SimpleProxyServer } from '../helpers/simple-proxy.js'

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

    setTimeout(() => {
      process.stdout?.off('data', onStdout)
      reject(new Error('Request timeout'))
    }, 60000)

    process.stdin?.write(request)
  })
}

describe('E2E: MCP Server with Proxy', () => {
  let serverProcess: ChildProcess
  let proxyServer: SimpleProxyServer
  const PROXY_PORT = 18888

  beforeAll(async () => {
    // 启动代理服务器
    proxyServer = new SimpleProxyServer(PROXY_PORT)
    await proxyServer.start()

    // 启动 MCP 服务器进程，配置使用代理
    serverProcess = spawn('node', ['dist/cli.js', '--proxy', `http://127.0.0.1:${PROXY_PORT}`], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    serverProcess.stderr?.on('data', (data) => {
      // console.error('[Server]', data.toString())
    })

    // 等待服务器启动
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }, 30000)

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill()
    }
    await proxyServer.stop()
  })

  beforeEach(() => {
    proxyServer.clearLogs()
  })

  describe('Proxy functionality', () => {
    it('should route requests through proxy', async () => {
      const initialCount = proxyServer.getRequestCount()

      // 执行 web_fetch 请求
      const response = (await sendRequest(serverProcess, 'tools/call', {
        name: 'web_fetch',
        arguments: {
          url: 'https://example.com',
          format: 'text',
        },
      })) as {
        content: Array<{ type: string; text: string }>
      }

      // 验证请求成功
      expect(response.content).toBeDefined()
      expect(response.content[0].text.toLowerCase()).toMatch(/example/)

      // 验证请求经过了代理
      const newCount = proxyServer.getRequestCount()
      expect(newCount).toBeGreaterThan(initialCount)

      // 检查代理日志
      const logs = proxyServer.getLogs()
      const connectLogs = logs.filter((l) => l.method === 'CONNECT')
      expect(connectLogs.length).toBeGreaterThan(0)

      // 应该有对 example.com 的 CONNECT 请求
      expect(connectLogs.some((l) => l.url.includes('example.com'))).toBe(true)
    })

    it('should handle multiple requests through proxy', async () => {
      proxyServer.clearLogs()

      // 发送多个请求
      const urls = ['https://example.com', 'https://httpbin.org/ip']

      for (const url of urls) {
        try {
          await sendRequest(serverProcess, 'tools/call', {
            name: 'web_fetch',
            arguments: {
              url,
              format: 'text',
            },
          })
        } catch (err) {
          // 某些 URL 可能失败，但应该仍然经过代理
        }
      }

      // 验证代理收到多个请求
      const logs = proxyServer.getLogs()
      expect(logs.length).toBeGreaterThanOrEqual(urls.length)
    })

    it('should show proxy logs correctly', async () => {
      proxyServer.clearLogs()

      await sendRequest(serverProcess, 'tools/call', {
        name: 'web_fetch',
        arguments: {
          url: 'https://example.com',
          format: 'markdown',
        },
      })

      const logs = proxyServer.getLogs()

      // 验证日志结构
      expect(logs.length).toBeGreaterThan(0)

      const log = logs[0]
      expect(log).toHaveProperty('method')
      expect(log).toHaveProperty('url')
      expect(log).toHaveProperty('timestamp')
      expect(typeof log.timestamp).toBe('number')
    })
  })

  describe('Proxy error handling', () => {
    it.skip('should handle proxy connection errors (requires separate process)', async () => {
      // 此测试需要单独的进程环境才能正确测试代理断开的情况
      // 在共享进程的测试环境中跳过
    })
  })
})
