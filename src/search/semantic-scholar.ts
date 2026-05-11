import { BaseSearchEngine, type SearchOptions, type SearchResult } from './types.js'
import { getProxyAgent } from '../proxy/index.js'
import type { FetchOptions } from '../types.js'

const API_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search'

const FIELDS = 'title,abstract,authors,year,citationCount,openAccessPdf,externalIds,url'

const MAX_BACKOFF_MS = 30000

interface S2Author {
  name: string
}

interface S2OpenAccessPdf {
  url: string
}

interface S2ExternalIds {
  DOI?: string
  ArXiv?: string
  PubMed?: string
}

interface S2Paper {
  paperId: string
  title?: string
  abstract?: string
  year?: number
  authors?: S2Author[]
  citationCount?: number
  openAccessPdf?: S2OpenAccessPdf
  externalIds?: S2ExternalIds
  url?: string
}

interface S2Response {
  total: number
  data: S2Paper[]
}

export class SemanticScholarSearch extends BaseSearchEngine {
  name = 'semantic-scholar'
  private readonly apiKey?: string

  constructor(
    proxy: string = 'none',
    timeout: number = 30000,
    ignoreSSL: boolean = false,
    apiKey?: string
  ) {
    super(proxy, timeout, ignoreSSL)
    this.apiKey = apiKey
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, numResults = 8 } = options

    const params = new URLSearchParams({
      query,
      fields: FIELDS,
      limit: String(Math.min(numResults, 100)), // API 单次上限 100
    })
    const url = `${API_BASE}?${params.toString()}`

    return this.fetchWithRetry(url)
  }

  private async fetchWithRetry(url: string, attempt = 0): Promise<SearchResult[]> {
    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const controller = new AbortController()
    const effectiveTimeout = Math.min(this.timeout, 25000)
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
    }
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey
    }

    try {
      const fetchOptions: FetchOptions = {
        agent,
        headers,
        signal: controller.signal,
      }

      const response = await nodeFetch(url, fetchOptions)

      // 429: 限速。优先读 Retry-After 头，否则指数退避
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after')
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
        const waitMs = !isNaN(retryAfterSec)
          ? retryAfterSec * 1000
          : Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)

        if (attempt < 3 && waitMs <= MAX_BACKOFF_MS) {
          await new Promise(resolve => setTimeout(resolve, waitMs))
          return this.fetchWithRetry(url, attempt + 1)
        }

        const keyTip = this.apiKey ? '' : ' 建议申请免费 API Key (--semantic-scholar-api-key) 以提升限速上限。'
        throw new Error(`Semantic Scholar 请求被限速 (429)，多次重试后仍失败。${keyTip}`)
      }

      if (!response.ok) {
        throw new Error(`Semantic Scholar API 请求失败: HTTP ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as S2Response
      return this.parseResponse(data)
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Semantic Scholar 请求超时 (${effectiveTimeout}ms)`)
        }
        if (error.message.startsWith('Semantic Scholar')) throw error
        throw new Error(`Semantic Scholar 连接失败: ${error.message}`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseResponse(data: S2Response): SearchResult[] {
    if (!data.data?.length) return []

    return data.data.map(paper => {
      const title = paper.title ?? '(无标题)'

      // 优先用 S2 自己的页面链接，其次用 ArXiv 链接
      const url =
        paper.url ??
        (paper.externalIds?.ArXiv
          ? `https://arxiv.org/abs/${paper.externalIds.ArXiv}`
          : `https://www.semanticscholar.org/paper/${paper.paperId}`)

      // 摘要截取 280 字
      const abstract = (paper.abstract ?? '').replace(/\s+/g, ' ').trim()
      const snippetBody =
        abstract.length > 280
          ? abstract.slice(0, 280).replace(/\s*\S+$/, '') + '…'
          : abstract

      // 作者（前 3 位）
      const authorNames = (paper.authors ?? []).map(a => a.name)
      const authorsDisplay =
        authorNames.length > 3
          ? `${authorNames.slice(0, 3).join(', ')} 等`
          : authorNames.join(', ')

      // 组装元信息行
      const metaParts: string[] = []
      if (authorsDisplay) metaParts.push(`作者: ${authorsDisplay}`)
      if (paper.year) metaParts.push(`年份: ${paper.year}`)
      if (paper.citationCount != null) metaParts.push(`引用: ${paper.citationCount}`)
      if (paper.externalIds?.DOI) metaParts.push(`DOI: ${paper.externalIds.DOI}`)
      if (paper.openAccessPdf?.url) metaParts.push(`PDF: ${paper.openAccessPdf.url}`)

      const snippet =
        metaParts.length > 0
          ? `${metaParts.join(' | ')}\n${snippetBody}`
          : snippetBody

      return { title, url, snippet }
    })
  }
}
