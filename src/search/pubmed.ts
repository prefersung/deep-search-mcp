import { BaseSearchEngine, type SearchOptions, type SearchResult } from './types.js'
import { getProxyAgent } from '../proxy/index.js'
import type { FetchOptions } from '../types.js'

const ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'

interface EsearchResponse {
  esearchresult: {
    idlist: string[]
    count: string
    ERROR?: string
  }
}

interface DocSummary {
  uid: string
  title?: string
  pubdate?: string
  authors?: Array<{ name: string }>
  source?: string // 期刊名
  articleids?: Array<{ idtype: string; value: string }>
}

interface EsummaryResponse {
  result: Record<string, DocSummary> & { uids: string[] }
}

export class PubMedSearch extends BaseSearchEngine {
  name = 'pubmed'
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
    const safeNum = Math.min(numResults, 100)

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    // 两步查询共享同一个 timeout 预算
    const controller = new AbortController()
    const effectiveTimeout = Math.min(this.timeout, 25000)
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)

    try {
      // Step 1: esearch — 拿 PMID 列表
      const pmids = await this.esearch(nodeFetch, controller.signal, query, safeNum)
      if (pmids.length === 0) return []

      // Step 2: esummary — 批量拿摘要元信息
      return await this.esummary(nodeFetch, controller.signal, pmids)
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`PubMed 请求超时 (${effectiveTimeout}ms)`)
        }
        if (error.message.startsWith('PubMed')) throw error
        throw new Error(`PubMed 连接失败: ${error.message}`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private buildParams(extra: Record<string, string>): URLSearchParams {
    const p = new URLSearchParams({ db: 'pubmed', retmode: 'json', ...extra })
    if (this.apiKey) p.set('api_key', this.apiKey)
    return p
  }

  private get commonHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
    }
  }

  private async esearch(
    nodeFetch: typeof import('node-fetch').default,
    signal: AbortSignal,
    query: string,
    retmax: number
  ): Promise<string[]> {
    const params = this.buildParams({
      term: query,
      retmax: String(retmax),
      sort: 'relevance',
    })
    const url = `${ESEARCH_URL}?${params.toString()}`

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const fetchOptions: FetchOptions = { agent, signal, headers: this.commonHeaders }

    const response = await nodeFetch(url, fetchOptions)
    if (!response.ok) {
      throw new Error(`PubMed esearch 请求失败: HTTP ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as EsearchResponse
    if (data.esearchresult.ERROR) {
      throw new Error(`PubMed 查询错误: ${data.esearchresult.ERROR}`)
    }

    return data.esearchresult.idlist
  }

  private async esummary(
    nodeFetch: typeof import('node-fetch').default,
    signal: AbortSignal,
    pmids: string[]
  ): Promise<SearchResult[]> {
    const params = this.buildParams({ id: pmids.join(',') })
    const url = `${ESUMMARY_URL}?${params.toString()}`

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const fetchOptions: FetchOptions = { agent, signal, headers: this.commonHeaders }

    const response = await nodeFetch(url, fetchOptions)
    if (!response.ok) {
      throw new Error(`PubMed esummary 请求失败: HTTP ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as EsummaryResponse
    return this.parseEsummary(data, pmids)
  }

  private parseEsummary(data: EsummaryResponse, pmids: string[]): SearchResult[] {
    const results: SearchResult[] = []

    for (const pmid of pmids) {
      const doc = data.result[pmid]
      if (!doc) continue

      const title = doc.title ?? '(无标题)'
      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`

      // 作者（前 3 位）
      const authorNames = (doc.authors ?? []).map(a => a.name)
      const authorsDisplay =
        authorNames.length > 3
          ? `${authorNames.slice(0, 3).join(', ')} 等`
          : authorNames.join(', ')

      // DOI
      const doi = doc.articleids?.find(id => id.idtype === 'doi')?.value

      const metaParts: string[] = []
      if (authorsDisplay) metaParts.push(`作者: ${authorsDisplay}`)
      if (doc.pubdate) metaParts.push(`发表: ${doc.pubdate}`)
      if (doc.source) metaParts.push(`期刊: ${doc.source}`)
      if (doi) metaParts.push(`DOI: ${doi}`)

      results.push({
        title,
        url,
        snippet: metaParts.join(' | '),
      })
    }

    return results
  }
}
