import { getProxyAgent } from '../proxy/index.js'
import type { Config } from '../config.js'
import type { FetchOptions } from '../types.js'

export interface FindOpenPdfResult {
  doi: string
  title?: string
  isOpenAccess: boolean
  pdfUrl?: string
  hostType?: string   // 'publisher' | 'repository' | 'preprint'
  version?: string    // 'publishedVersion' | 'acceptedVersion' | 'submittedVersion'
  source?: string     // e.g. 'arxiv', 'pubmedcentral'
  message: string
}

interface UnpaywallLocation {
  url_for_pdf?: string | null
  host_type?: string
  version?: string
  repository_institution?: string | null
  pmh_id?: string | null
}

interface UnpaywallResponse {
  doi: string
  title?: string
  is_oa: boolean
  best_oa_location?: UnpaywallLocation | null
  oa_locations?: UnpaywallLocation[]
  error?: string
}

export class FindOpenPdf {
  private readonly proxy: string
  private readonly timeout: number
  private readonly ignoreSSL: boolean
  private readonly email: string

  constructor(config: Config) {
    this.proxy = config.proxy
    this.timeout = config.timeout
    this.ignoreSSL = config.ignoreSSL
    // Unpaywall ToS 要求提供一个联系邮箱，不做验证，只是标识请求来源
    this.email = config.unpaywallEmail ?? 'user@deep-search-mcp'
  }

  async find(doi: string): Promise<FindOpenPdfResult> {
    const cleanDoi = this.normalizeDoi(doi)
    if (!cleanDoi) {
      throw new Error(`无效的 DOI 格式: ${doi}，期望格式如 10.1038/s41586-021-03819-2`)
    }

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=${encodeURIComponent(this.email)}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeout, 15000))

    try {
      const fetchOptions: FetchOptions = {
        agent,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
        },
      }

      const response = await nodeFetch(url, fetchOptions)

      if (response.status === 404) {
        return {
          doi: cleanDoi,
          isOpenAccess: false,
          message: `DOI ${cleanDoi} 在 Unpaywall 中未找到，该论文可能还未被索引。`,
        }
      }

      if (!response.ok) {
        throw new Error(`Unpaywall API 请求失败: HTTP ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as UnpaywallResponse

      if (!data.is_oa || !data.best_oa_location?.url_for_pdf) {
        return {
          doi: cleanDoi,
          title: data.title,
          isOpenAccess: data.is_oa,
          message: data.is_oa
            ? `论文有开放获取版本，但 Unpaywall 未找到直接 PDF 链接。可尝试访问: https://doi.org/${cleanDoi}`
            : `该论文暂无免费开放版本 (Closed Access)。`,
        }
      }

      const loc = data.best_oa_location
      return {
        doi: cleanDoi,
        title: data.title,
        isOpenAccess: true,
        pdfUrl: loc.url_for_pdf ?? undefined,
        hostType: loc.host_type ?? undefined,
        version: loc.version ?? undefined,
        message: `找到免费 PDF (${loc.host_type ?? 'unknown'}, ${loc.version ?? 'unknown version'})`,
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Unpaywall 请求超时，请检查代理配置')
        }
        if (error.message.startsWith('Unpaywall') || error.message.startsWith('DOI') || error.message.startsWith('无效')) {
          throw error
        }
        throw new Error(`Unpaywall 连接失败: ${error.message}`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // 支持多种 DOI 输入格式:
  //   10.1038/xxx
  //   https://doi.org/10.1038/xxx
  //   doi:10.1038/xxx
  private normalizeDoi(input: string): string | null {
    const s = input.trim()
    const doiMatch =
      s.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\S+)/i) ??
      s.match(/^doi:\s*(10\.\S+)/i) ??
      s.match(/^(10\.\d{4,}\/\S+)$/)
    return doiMatch?.[1] ?? null
  }
}

export function getFindOpenPdfDescription(): string {
  return `Find free legal PDF for a research paper using its DOI
- Queries the Unpaywall database (200M+ papers indexed)
- Returns direct PDF download link if an open-access version exists
- Covers publisher open access, institutional repositories, PubMed Central, arXiv mirrors
- Input: a DOI in any common format (10.xxxx/xxx, https://doi.org/..., doi:...)

Usage notes:
- Use this after web_search or academic search to get the actual paper content
- Many paywalled papers have legal free versions in repositories
- If no PDF found, try web_fetch on the abstract page — it sometimes links to the author's copy
- Free to use, no API key required`
}
