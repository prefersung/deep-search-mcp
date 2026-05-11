import * as cheerio from 'cheerio'
import { getProxyAgent } from '../proxy/index.js'
import type { Config } from '../config.js'
import type { FetchOptions } from '../types.js'

export interface PaperDetail {
  id: string
  idType: 'arxiv' | 'doi' | 'pmid' | 'unknown'
  title: string
  authors: string[]
  abstract?: string
  published?: string
  journal?: string
  doi?: string
  arxivId?: string
  pmid?: string
  pdfUrl?: string
  url: string
  citationCount?: number
}

export class GetPaper {
  private readonly proxy: string
  private readonly timeout: number
  private readonly ignoreSSL: boolean

  constructor(config: Config) {
    this.proxy = config.proxy
    this.timeout = config.timeout
    this.ignoreSSL = config.ignoreSSL
  }

  async get(id: string): Promise<PaperDetail> {
    const detected = this.detectIdType(id)

    switch (detected.type) {
      case 'arxiv':
        return this.fetchFromArxiv(detected.value)
      case 'doi':
        return this.fetchFromCrossRef(detected.value)
      case 'pmid':
        return this.fetchFromPubMed(detected.value)
      default:
        throw new Error(
          `无法识别 ID 类型: ${id}\n` +
          '支持的格式:\n' +
          '  arXiv: 2301.00001 或 arxiv:2301.00001 或 https://arxiv.org/abs/2301.00001\n' +
          '  DOI:   10.1038/xxx 或 https://doi.org/10.1038/xxx\n' +
          '  PMID:  pmid:38000001 或 PMID:38000001'
        )
    }
  }

  // ─── arXiv ────────────────────────────────────────────────────────────────

  private async fetchFromArxiv(arxivId: string): Promise<PaperDetail> {
    const nodeFetch = (await import('node-fetch')).default
    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)

    const params = new URLSearchParams({
      id_list: arxivId,
      max_results: '1',
    })
    const url = `https://export.arxiv.org/api/query?${params.toString()}`

    const response = await this.fetch(nodeFetch, agent, url)
    const xml = await response.text()

    const $ = cheerio.load(xml, { xmlMode: true })
    const entry = $('entry').first()
    if (!entry.length) {
      throw new Error(`arXiv 未找到论文: ${arxivId}`)
    }

    const title = entry.find('title').first().text().replace(/\s+/g, ' ').trim()
    const abstract = entry.find('summary').first().text().replace(/\s+/g, ' ').trim()
    const published = entry.find('published').first().text().trim().slice(0, 10)
    const authors = entry.find('author name').map((_, el) => $(el).text().trim()).get()
    const doi = entry.find('arxiv\\:doi, doi').first().text().trim() || undefined

    let absUrl = ''
    let pdfUrl = ''
    entry.find('link').each((_, el) => {
      const rel = $(el).attr('rel') ?? ''
      const type = $(el).attr('type') ?? ''
      const href = $(el).attr('href') ?? ''
      if (rel === 'alternate' || type === 'text/html') absUrl = href
      else if (type === 'application/pdf') pdfUrl = href
    })
    if (!absUrl) absUrl = `https://arxiv.org/abs/${arxivId}`

    return {
      id: arxivId,
      idType: 'arxiv',
      title,
      authors,
      abstract,
      published,
      doi,
      arxivId,
      pdfUrl: pdfUrl || `https://arxiv.org/pdf/${arxivId}`,
      url: absUrl,
    }
  }

  // ─── CrossRef (DOI) ───────────────────────────────────────────────────────

  private async fetchFromCrossRef(doi: string): Promise<PaperDetail> {
    const nodeFetch = (await import('node-fetch')).default
    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)

    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    const response = await this.fetch(nodeFetch, agent, url, {
      // CrossRef 要求一个 User-Agent 标识符（Polite Pool，提升优先级）
      'User-Agent': 'deep-search-mcp (mailto:user@deep-search-mcp)',
    })

    if (response.status === 404) {
      throw new Error(`CrossRef 未找到 DOI: ${doi}`)
    }

    const data = (await response.json()) as {
      message: {
        title?: string[]
        author?: Array<{ given?: string; family?: string }>
        abstract?: string
        published?: { 'date-parts'?: number[][] }
        'container-title'?: string[]
        DOI?: string
        link?: Array<{ URL: string; 'content-type': string }>
      }
    }

    const msg = data.message
    const title = msg.title?.[0] ?? '(无标题)'
    const authors = (msg.author ?? []).map(a =>
      [a.given, a.family].filter(Boolean).join(' ')
    )
    const abstract = msg.abstract
      ? msg.abstract.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : undefined
    const dateParts = msg.published?.['date-parts']?.[0]
    const published = dateParts
      ? dateParts.filter(Boolean).join('-').padEnd(4, '')
      : undefined
    const journal = msg['container-title']?.[0]

    // 找 PDF 链接
    const pdfLink = msg.link?.find(l => l['content-type'] === 'application/pdf')

    return {
      id: doi,
      idType: 'doi',
      title,
      authors,
      abstract,
      published,
      journal,
      doi,
      pdfUrl: pdfLink?.URL,
      url: `https://doi.org/${doi}`,
    }
  }

  // ─── PubMed (PMID) ────────────────────────────────────────────────────────

  private async fetchFromPubMed(pmid: string): Promise<PaperDetail> {
    const nodeFetch = (await import('node-fetch')).default
    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)

    // efetch 返回完整 XML（含摘要），比 esummary 信息更多
    const params = new URLSearchParams({
      db: 'pubmed',
      id: pmid,
      retmode: 'xml',
      rettype: 'abstract',
    })
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`
    const response = await this.fetch(nodeFetch, agent, url)
    const xml = await response.text()

    const $ = cheerio.load(xml, { xmlMode: true })
    const article = $('PubmedArticle').first()
    if (!article.length) {
      throw new Error(`PubMed 未找到 PMID: ${pmid}`)
    }

    const title = article.find('ArticleTitle').first().text().trim()
    const abstract = article.find('AbstractText')
      .map((_, el) => {
        const label = $(el).attr('Label')
        const text = $(el).text().trim()
        return label ? `${label}: ${text}` : text
      })
      .get()
      .join('\n')

    const authors = article.find('Author').map((_, el) => {
      const last = $(el).find('LastName').text()
      const fore = $(el).find('ForeName').text()
      return fore ? `${fore} ${last}` : last
    }).get()

    const year = article.find('PubDate Year').first().text()
    const month = article.find('PubDate Month').first().text()
    const published = [year, month].filter(Boolean).join(' ')

    const journal = article.find('Title').first().text().trim()

    const doi = article.find('ArticleId[IdType="doi"]').first().text().trim() || undefined
    const pmc = article.find('ArticleId[IdType="pmc"]').first().text().trim()

    return {
      id: pmid,
      idType: 'pmid',
      title,
      authors,
      abstract: abstract || undefined,
      published: published || undefined,
      journal: journal || undefined,
      doi,
      pmid,
      pdfUrl: pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmc}/pdf/` : undefined,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }
  }

  // ─── 共用 fetch ────────────────────────────────────────────────────────────

  private async fetch(
    nodeFetch: typeof import('node-fetch').default,
    agent: Awaited<ReturnType<typeof getProxyAgent>>,
    url: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<Awaited<ReturnType<typeof nodeFetch>>> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeout, 20000))

    try {
      const fetchOptions: FetchOptions = {
        agent,
        signal: controller.signal,
        headers: {
          Accept: 'application/json, application/xml, text/xml',
          'Accept-Encoding': 'identity',
          ...extraHeaders,
        },
      }
      const response = await nodeFetch(url, fetchOptions)
      if (!response.ok && response.status !== 404) {
        throw new Error(`请求失败: HTTP ${response.status} ${response.statusText}`)
      }
      return response
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('get_paper 请求超时，请检查代理配置')
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ─── ID 类型检测 ──────────────────────────────────────────────────────────

  private detectIdType(input: string): { type: 'arxiv' | 'doi' | 'pmid' | 'unknown'; value: string } {
    const s = input.trim()

    // arXiv URL
    const arxivUrl = s.match(/arxiv\.org\/abs\/([^\s?#]+)/i)
    if (arxivUrl) return { type: 'arxiv', value: arxivUrl[1] }

    // arXiv ID (with or without prefix)
    const arxivId = s.match(/^(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i)
    if (arxivId) return { type: 'arxiv', value: arxivId[1] }

    // DOI URL
    const doiUrl = s.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\S+)/i)
    if (doiUrl) return { type: 'doi', value: doiUrl[1] }

    // DOI bare or with prefix
    const doi = s.match(/^(?:doi:\s*)?(10\.\d{4,}\/\S+)$/i)
    if (doi) return { type: 'doi', value: doi[1] }

    // PMID
    const pmid = s.match(/^(?:pmid:?\s*)?(\d{7,8})$/i)
    if (pmid) return { type: 'pmid', value: pmid[1] }

    // PubMed URL
    const pmidUrl = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)
    if (pmidUrl) return { type: 'pmid', value: pmidUrl[1] }

    return { type: 'unknown', value: s }
  }
}

export function getGetPaperDescription(): string {
  return `Fetch complete metadata and abstract for a single paper by its ID
- Supports arXiv ID (2301.00001), DOI (10.xxxx/xxx), and PubMed PMID
- Also accepts full URLs: https://arxiv.org/abs/..., https://doi.org/..., https://pubmed.ncbi.nlm.nih.gov/...
- Returns: title, authors, abstract, publication date, journal, DOI, PDF link

Usage notes:
- Use this when you already know the paper's ID and want full details
- For arXiv papers, always returns a PDF link
- For PubMed papers with PMC full text, returns a PMC PDF link
- For DOIs, uses CrossRef (free) to fetch metadata
- Combine with find_open_pdf to get PDF links for DOI-only papers`
}
