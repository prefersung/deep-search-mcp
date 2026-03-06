import { BaseSearchEngine, type SearchOptions, type SearchResult } from './types.js'
import { getProxyAgent } from '../proxy/index.js'
import type { FetchOptions } from '../types.js'

export class DuckDuckGoSearch extends BaseSearchEngine {
  name = 'duckduckgo'

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, numResults = 8 } = options

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const fetchOptions: FetchOptions = {
        agent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      }

      const response = await nodeFetch(searchUrl, fetchOptions)

      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed: ${response.status} ${response.statusText}`)
      }

      const html = await response.text()
      return this.parseResults(html, numResults)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`DuckDuckGo search timeout (${this.timeout}ms)`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = []

    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/g

    let match

    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const url = match[1]
      const title = this.stripHtml(match[2])

      const actualUrl = this.extractActualUrl(url)

      if (actualUrl) {
        results.push({
          title,
          url: actualUrl,
          snippet: '',
        })
      }
    }

    const snippets: string[] = []
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(this.stripHtml(match[1]))
    }

    results.forEach((result, index) => {
      if (snippets[index]) {
        result.snippet = snippets[index]
      }
    })

    return results.slice(0, maxResults)
  }

  private extractActualUrl(redirectUrl: string): string | null {
    // DuckDuckGo 重定向 URL 格式: https://duckduckgo.com/l/?uddg=...
    try {
      const url = new URL(redirectUrl, 'https://duckduckgo.com')
      if (url.hostname === 'duckduckgo.com' && url.pathname === '/l/') {
        const uddg = url.searchParams.get('uddg')
        return uddg ? decodeURIComponent(uddg) : null
      }
      return redirectUrl
    } catch {
      return redirectUrl
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }
}
