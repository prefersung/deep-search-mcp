import * as cheerio from 'cheerio'
import { BaseSearchEngine, type SearchOptions, type SearchResult } from './types.js'
import { getProxyAgent } from '../proxy/index.js'
import type { FetchOptions } from '../types.js'

const API_BASE = 'https://export.arxiv.org/api/query'

const MAX_RESULTS_PER_REQUEST = 30

// 503 退避延迟（ms）
const RETRY_DELAYS_MS = [1000, 3000]

export class ArxivSearch extends BaseSearchEngine {
  name = 'arxiv'

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, numResults = 8 } = options
    const safeNum = Math.min(numResults, MAX_RESULTS_PER_REQUEST)

    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: '0',
      max_results: String(safeNum),
      sortBy: 'relevance',
      sortOrder: 'descending',
    })
    const url = `${API_BASE}?${params.toString()}`

    return this.fetchWithRetry(url)
  }

  // 针对 503（限速/服务繁忙）做指数退避重试
  // 企业多人共享出口 IP 时特别常见
  private async fetchWithRetry(url: string, attempt = 0): Promise<SearchResult[]> {
    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const controller = new AbortController()
    const effectiveTimeout = Math.min(this.timeout, 25000)
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)

    try {
      const fetchOptions: FetchOptions = {
        agent,
        headers: {
          // arXiv 官方要求 User-Agent 包含联系信息，避免被限速
          'User-Agent': 'web-bridge-mcp/academic-search (proxy-assisted; https://github.com/chenpu17/web-bridge-mcp)',
          Accept: 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
          // 明确不使用 gzip，避免少数旧版企业代理解压异常
          'Accept-Encoding': 'identity',
        },
        signal: controller.signal,
      }

      const response = await nodeFetch(url, fetchOptions)

      if (response.status === 503) {
        const delay = RETRY_DELAYS_MS[attempt]
        if (delay !== undefined) {
          await new Promise(resolve => setTimeout(resolve, delay))
          return this.fetchWithRetry(url, attempt + 1)
        }
        throw new Error('arXiv 服务暂时不可用 (503)，建议检查代理配置或稍后重试。')
      }

      if (!response.ok) {
        throw new Error(`arXiv API 请求失败: HTTP ${response.status} ${response.statusText}`)
      }

      const xml = await response.text()
      return this.parseAtomXml(xml)
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`arXiv 请求超时 (${effectiveTimeout}ms)`)
        }
        if (error.message.startsWith('arXiv')) throw error
        throw new Error(`arXiv 连接失败: ${error.message}`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseAtomXml(xml: string): SearchResult[] {
    const $ = cheerio.load(xml, { xmlMode: true })
    const results: SearchResult[] = []

    // arXiv API 在 totalResults=0 时仍返回 200，需检查
    const total = parseInt($('opensearch\\:totalResults, totalResults').first().text().trim() || '0', 10)
    if (total === 0) {
      return []
    }

    $('entry').each((_, el) => {
      const rawTitle = $(el).find('title').first().text()
      const title = rawTitle.replace(/\s+/g, ' ').trim()

      const abstract = $(el).find('summary').first().text().replace(/\s+/g, ' ').trim()

      // published 格式: 2024-01-15T12:34:56Z → 取前 10 位
      const published = $(el).find('published').first().text().trim().slice(0, 10)

      // 主 URL: 优先 abs 页面链接，其次从 <id> 构造
      let absUrl = ''
      let pdfUrl = ''
      $(el)
        .find('link')
        .each((_, linkEl) => {
          const rel = $(linkEl).attr('rel') ?? ''
          const type = $(linkEl).attr('type') ?? ''
          const href = $(linkEl).attr('href') ?? ''
          if (rel === 'alternate' || type === 'text/html') {
            absUrl = href
          } else if (type === 'application/pdf') {
            pdfUrl = href
          }
        })
      if (!absUrl) {
        const id = $(el).find('id').first().text().trim()
        // 统一升级为 https
        absUrl = id.replace(/^http:\/\//, 'https://')
      }

      // 作者列表（取前 3 位，避免 snippet 太长）
      const authorNames = $(el)
        .find('author name')
        .map((_, a) => $(a).text().trim())
        .get()
      const authorsDisplay =
        authorNames.length > 3
          ? `${authorNames.slice(0, 3).join(', ')} 等`
          : authorNames.join(', ')

      // DOI（arXiv 命名空间 arxiv:doi 或无前缀 doi）
      const doi = $(el).find('arxiv\\:doi, doi').first().text().trim()

      // 摘要截取 280 字，保留完整句子
      const snippetBody = abstract.length > 280
        ? abstract.slice(0, 280).replace(/\s+\S*$/, '') + '…'
        : abstract

      // 组装 snippet: 元信息 + 摘要，供 AI 直接阅读
      const metaParts: string[] = []
      if (authorsDisplay) metaParts.push(`作者: ${authorsDisplay}`)
      if (published) metaParts.push(`发表: ${published}`)
      if (doi) metaParts.push(`DOI: ${doi}`)
      if (pdfUrl) metaParts.push(`PDF: ${pdfUrl}`)
      const snippet = metaParts.length > 0
        ? `${metaParts.join(' | ')}\n${snippetBody}`
        : snippetBody

      if (title && absUrl) {
        results.push({ title, url: absUrl, snippet })
      }
    })

    return results
  }
}
