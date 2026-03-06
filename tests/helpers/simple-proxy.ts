/**
 * 简易 HTTP/HTTPS 代理服务器
 * 用于测试代理功能
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { connect } from 'net'
import { URL } from 'url'
import type { AddressInfo } from 'net'

export interface ProxyLog {
  method: string
  url: string
  statusCode?: number
  timestamp: number
}

export class SimpleProxyServer {
  private port: number
  private server: ReturnType<typeof createServer> | null = null
  private logs: ProxyLog[] = []
  private requestCount = 0

  constructor(port: number = 0) {
    this.port = port
  }

  /**
   * 启动代理服务器
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res)
      })

      // 处理 HTTPS CONNECT 请求
      this.server.on('connect', (req: IncomingMessage, socket: NodeJS.Socket, head: Buffer) => {
        this.handleConnect(req, socket, head)
      })

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(this.port, '127.0.0.1', () => {
        const address = this.server!.address() as AddressInfo
        this.port = address.port
        console.log(`[Proxy] 代理服务器已启动: http://127.0.0.1:${this.port}`)
        resolve()
      })
    })
  }

  /**
   * 停止代理服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve()
        return
      }

      // 设置超时，强制关闭
      const timeout = setTimeout(() => {
        console.log('[Proxy] 代理服务器强制关闭')
        resolve()
      }, 5000)

      this.server.close((err) => {
        clearTimeout(timeout)
        if (err) {
          // 即使出错也 resolve，因为可能是连接未完全关闭
          console.log('[Proxy] 代理服务器已停止 (有错误)')
          resolve()
        } else {
          console.log('[Proxy] 代理服务器已停止')
          resolve()
        }
      })
    })
  }

  /**
   * 获取代理日志
   */
  getLogs(): ProxyLog[] {
    return [...this.logs]
  }

  /**
   * 获取请求计数
   */
  getRequestCount(): number {
    return this.requestCount
  }

  /**
   * 清空日志
   */
  clearLogs(): void {
    this.logs = []
    this.requestCount = 0
  }

  /**
   * 获取代理 URL
   */
  getUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  /**
   * 处理 HTTP 请求
   */
  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    this.requestCount++
    const log: ProxyLog = {
      method: req.method || 'GET',
      url: req.url || '',
      timestamp: Date.now(),
    }
    this.logs.push(log)

    console.log(`[Proxy] HTTP ${req.method} ${req.url}`)

    try {
      const url = new URL(req.url || '')

      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: req.method,
        headers: req.headers,
      }

      const proxyReq = require('http').request(options, (proxyRes: IncomingMessage) => {
        log.statusCode = proxyRes.statusCode
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (err: Error) => {
        console.error(`[Proxy] 请求错误: ${err.message}`)
        log.statusCode = 500
        res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end(`Proxy Error: ${err.message}`)
      })

      req.pipe(proxyReq)
    } catch (err) {
      console.error(`[Proxy] URL 解析错误: ${(err as Error).message}`)
      log.statusCode = 400
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Bad Request')
    }
  }

  /**
   * 处理 HTTPS CONNECT 请求
   */
  private handleConnect(req: IncomingMessage, socket: NodeJS.Socket, head: Buffer): void {
    this.requestCount++
    const log: ProxyLog = {
      method: 'CONNECT',
      url: req.url || '',
      timestamp: Date.now(),
    }
    this.logs.push(log)

    console.log(`[Proxy] CONNECT ${req.url}`)

    const [hostname, port] = (req.url || '').split(':')
    const targetPort = parseInt(port) || 443

    const targetSocket = connect(targetPort, hostname, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) {
        targetSocket.write(head)
      }
      targetSocket.pipe(socket)
      socket.pipe(targetSocket)
      log.statusCode = 200
    })

    targetSocket.on('error', (err) => {
      console.error(`[Proxy] CONNECT 错误: ${err.message}`)
      log.statusCode = 500
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      socket.end()
    })

    socket.on('error', (err) => {
      console.error(`[Proxy] Socket 错误: ${err.message}`)
      targetSocket.end()
    })
  }
}

// 如果直接运行此文件，启动代理服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  const proxy = new SimpleProxyServer(8888)

  proxy.start().then(() => {
    console.log('[Proxy] 按 Ctrl+C 停止代理服务器')
  })

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n[Proxy] 正在关闭...')
    await proxy.stop()
    process.exit(0)
  })
}
