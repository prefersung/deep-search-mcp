import TurndownService from 'turndown'
import * as cheerio from 'cheerio'
import { promises as dns } from 'dns'
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
  /^\[f[cd][0-9a-f]{2}:/i,
  /^f[cd][0-9a-f]{2}:/i,
  /^\[fe[89ab][0-9a-f]:/i,
  /^fe[89ab][0-9a-f]:/i,
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
    let hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const port = url.port ? parseInt(url.port) : url.protocol === 'https:' ? 443 : 80

    // Remove brackets from IPv6 addresses
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1)
    }

    // Check for IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (hostname.includes('::ffff:')) {
      // Extract IPv4 part (could be in decimal or hex format)
      const ipv4Match = hostname.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
      if (ipv4Match) {
        hostname = ipv4Match[1]
      } else {
        // Handle hex format like ::ffff:7f00:1 (which is 127.0.0.1)
        const hexMatch = hostname.match(/::ffff:([0-9a-f]+):([0-9a-f]+)/)
        if (hexMatch) {
          const hex1 = parseInt(hexMatch[1], 16)
          const hex2 = parseInt(hexMatch[2], 16)
          hostname = `${(hex1 >> 8) & 0xff}.${hex1 & 0xff}.${(hex2 >> 8) & 0xff}.${hex2 & 0xff}`
        }
      }
    }

    if (BLOCKED_HOSTNAMES.includes(hostname) || hostname.endsWith('.localhost')) {
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

/**
 * Check if domain resolves to private IP (DNS rebinding protection)
 */
async function resolvesToPrivateIp(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')

    // Skip if already an IP address (already checked by isPrivateUrl)
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i
    if (ipPattern.test(hostname)) {
      return false
    }

    // Resolve IPv4 addresses
    try {
      const addresses = await dns.resolve4(hostname)
      for (const ip of addresses) {
        if (isPrivateUrl(`http://${ip}`)) {
          return true
        }
      }
    } catch {
      // Ignore DNS resolution errors for IPv4
    }

    // Resolve IPv6 addresses
    try {
      const addresses = await dns.resolve6(hostname)
      for (const ip of addresses) {
        if (isPrivateUrl(`http://[${ip}]`)) {
          return true
        }
      }
    } catch {
      // Ignore DNS resolution errors for IPv6
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
      throw new Error(
        'Access to private addresses, local addresses or sensitive ports is not allowed'
      )
    }

    // SSRF protection: check DNS resolution (prevent DNS rebinding)
    if (await resolvesToPrivateIp(url)) {
      throw new Error('Domain resolves to private address')
    }

    // Auto upgrade HTTP to HTTPS
    let targetUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url

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
        redirect: 'manual', // Disable auto-redirect for SSRF protection
      }

      // Manual redirect handling with SSRF validation
      let response = await nodeFetch(targetUrl, fetchOptions)
      let redirectCount = 0
      const MAX_REDIRECTS = 5

      while (
        redirectCount < MAX_REDIRECTS &&
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get('location')
      ) {
        const redirectUrl = response.headers.get('location')!
        const absoluteRedirectUrl = new URL(redirectUrl, targetUrl).href

        // Validate redirect target for SSRF
        if (isPrivateUrl(absoluteRedirectUrl)) {
          throw new Error('Redirect to private address blocked')
        }

        // DNS rebinding protection for redirect target
        if (await resolvesToPrivateIp(absoluteRedirectUrl)) {
          throw new Error('Redirect target resolves to private address')
        }

        targetUrl = absoluteRedirectUrl
        response = await nodeFetch(targetUrl, fetchOptions)
        redirectCount++
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error('Too many redirects')
      }

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
    try {
      // 使用 cheerio 解析 HTML，类似 OpenCode 的 HTMLRewriter 方法
      const $ = cheerio.load(html)

      // 移除不需要的标签
      $('script, style, noscript, iframe, object, embed').remove()

      // 提取所有文本内容
      const text = $('body').text() || $.text()

      // 清理多余空白
      return text.replace(/\s+/g, ' ').trim()
    } catch (error) {
      // Fallback to basic regex if cheerio fails
      return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
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
  return `Fetches content from a specified URL and converts it to readable format
- Use this when you have a specific URL to retrieve (not for searching)
- Takes a URL and optional format as input
- Fetches the URL content, converts to requested format (markdown by default)
- Returns the full page content in the specified format

Usage notes:
  - Use web_search first to find URLs, then use this tool to fetch their content
  - If the user is asking for library/framework/package/API documentation, prefer Context7 tools before web_fetch
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - Format options: "markdown" (default), "text", or "html"
  - Response size limit: 5MB
  - Maximum timeout: 120 seconds`
}
