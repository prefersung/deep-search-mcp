import TurndownService from 'turndown'
import { getProxyAgent } from '../proxy/index.js'
import type { Config } from '../config.js'
import type { FetchOptions } from '../types.js'

export interface WebFetchOptions {
  url: string
  format?: 'markdown' | 'text' | 'html'
  timeout?: number
}

export interface WebFetchResult {
  title: string
  content: string
  url: string
  contentType: string
}

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0/,
  /^\[::1\]$/,
  /^::1$/,
  /^\[fc00:/i,
  /^fc00:/i,
  /^\[fe80:/i,
  /^fe80:/i,
]

const BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']

/**
 * 检查 URL 是否为内网地址（SSRF 防护）
 */
const BLOCKED_PORTS = [
  22, // SSH
  23, // Telnet
  25, // SMTP
  110, // POP3
  143, // IMAP
  993, // IMAPS
  995, // POP3S
  3306, // MySQL
  5432, // PostgreSQL
  6379, // Redis
  27017, // MongoDB
]

export function isPrivateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()
    const port = url.port ? parseInt(url.port) : url.protocol === 'https:' ? 443 : 80

    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return true
    }

    if (BLOCKED_PORTS.includes(port)) {
      return true
    }

    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return true
      }
    }

    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (ipPattern.test(hostname)) {
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          return true
        }
      }
    }

    return false
  } catch {
    return false
  }
}

export class WebFetch {
  private proxy: string
  private defaultTimeout: number
  private ignoreSSL: boolean

  constructor(config: Config) {
    this.proxy = config.proxy
    this.defaultTimeout = config.timeout
    this.ignoreSSL = config.ignoreSSL
  }

  async fetch(options: WebFetchOptions): Promise<WebFetchResult> {
    const { url, format = 'markdown', timeout } = options

    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('URL must start with http:// or https://')
    }

    // SSRF protection: check for private addresses
    if (isPrivateUrl(url)) {
      throw new Error('Access to private addresses, local addresses or sensitive ports is not allowed')
    }

    // Auto upgrade HTTP to HTTPS
    const targetUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url

    const actualTimeout = Math.min((timeout || this.defaultTimeout / 1000) * 1000, MAX_TIMEOUT)

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    let acceptHeader = '*/*'
    switch (format) {
      case 'markdown':
        acceptHeader =
          'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1'
        break
      case 'text':
        acceptHeader = 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1'
        break
      case 'html':
        acceptHeader = 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1'
        break
    }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: acceptHeader,
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), actualTimeout)

    try {
      const fetchOptions: FetchOptions = {
        agent,
        headers,
        signal: controller.signal,
      }

      let response = await nodeFetch(targetUrl, fetchOptions)

      if (response.status === 403 && response.headers.get('cf-mitigated') === 'challenge') {
        response = await nodeFetch(targetUrl, {
          ...fetchOptions,
          headers: { ...headers, 'User-Agent': 'web-bridge-mcp' },
        })
      }

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }

      // Check response size
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        throw new Error('Response too large (exceeds 5MB limit)')
      }

      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
        throw new Error('Response too large (exceeds 5MB limit)')
      }

      const contentType = response.headers.get('content-type') || 'text/plain'
      const mime = contentType.split(';')[0]?.trim().toLowerCase() || ''

      // 处理图片
      if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
        const base64Content = Buffer.from(arrayBuffer).toString('base64')
        return {
          title: `Image: ${targetUrl}`,
          content: `![Image](${targetUrl})\n\nBase64: data:${mime};base64,${base64Content.substring(0, 100)}...`,
          url: targetUrl,
          contentType,
        }
      }

      const content = new TextDecoder().decode(arrayBuffer)

      // 根据格式处理内容
      let output: string
      switch (format) {
        case 'markdown':
          if (contentType.includes('text/html')) {
            output = this.convertHTMLToMarkdown(content)
          } else {
            output = content
          }
          break

        case 'text':
          if (contentType.includes('text/html')) {
            output = this.extractTextFromHTML(content)
          } else {
            output = content
          }
          break

        case 'html':
        default:
          output = content
      }

      return {
        title: this.extractTitle(content) || targetUrl,
        content: output,
        url: targetUrl,
        contentType,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return match ? match[1].trim() : null
  }

  private extractTextFromHTML(html: string): string {
    // 简单的 HTML 到文本转换
    const text = html
      // 移除 script 和 style 标签及其内容
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // 移除所有 HTML 标签
      .replace(/<[^>]+>/g, ' ')
      // 解码 HTML 实体
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // 清理空白
      .replace(/\s+/g, ' ')
      .trim()

    return text
  }

  private convertHTMLToMarkdown(html: string): string {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    })

    // 移除不需要的标签
    turndownService.remove(['script', 'style', 'meta', 'link', 'noscript'])

    return turndownService.turndown(html)
  }
}

/**
 * 获取 WebFetch 工具描述
 */
export function getWebFetchDescription(): string {
  return `网页内容抓取工具
- 获取指定 URL 的网页内容
- 支持多种输出格式: markdown (默认), text, html
- 自动将 HTTP 升级到 HTTPS
- 支持超时设置 (最大 120 秒)
- 响应大小限制: 5MB

使用场景:
- 获取网页正文内容
- 抓取技术文档
- 读取在线文章`
}
