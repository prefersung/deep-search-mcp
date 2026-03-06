import { BaseSearchEngine, type SearchOptions, type SearchResult } from './types.js'
import { getProxyAgent } from '../proxy/index.js'
import type { BochaSearchResult, BochaResponse, FetchOptions } from '../types.js'

export class BochaSearch extends BaseSearchEngine {
  name = 'bocha'

  private readonly API_URL = 'https://mcp.bochaai.com/mcp'
  private apiKey: string
  private readonly DEFAULT_NUM_RESULTS = 8
  private sessionId: string | null = null
  private requestId = 0

  constructor(
    apiKey: string,
    proxy: string = 'none',
    timeout: number = 30000,
    ignoreSSL: boolean = false
  ) {
    super(proxy, timeout, ignoreSSL)
    this.apiKey = apiKey
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) {
      return
    }

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const initRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'web-bridge-mcp',
          version: '1.0.0',
        },
      },
    }

    const response = await nodeFetch(this.API_URL, {
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(initRequest),
    })

    // 从响应头获取 session ID
    const sessionId = response.headers.get('mcp-session-id')
    if (sessionId) {
      this.sessionId = sessionId
    } else {
      throw new Error('Bocha search initialization failed: No session ID received')
    }
  }

  async search(options: SearchOptions, retryCount = 0): Promise<SearchResult[]> {
    const { query, numResults = this.DEFAULT_NUM_RESULTS } = options

    // 确保已初始化 session
    await this.ensureSession()

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const searchRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/call',
      params: {
        name: 'bocha_web_search',
        arguments: {
          query,
          count: numResults,
        },
      },
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const fetchOptions: FetchOptions = {
        method: 'POST',
        agent,
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'mcp-session-id': this.sessionId!,
        },
        body: JSON.stringify(searchRequest),
        signal: controller.signal,
      }

      const response = await nodeFetch(this.API_URL, fetchOptions)

      if (!response.ok) {
        // If session expired, clear session and retry once
        if ((response.status === 400 || response.status === 404) && retryCount === 0) {
          this.sessionId = null
          return this.search(options, retryCount + 1)
        }
        throw new Error(`Bocha search failed: HTTP ${response.status}`)
      }

      const responseText = await response.text()
      return this.parseResponse(responseText)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Bocha search timeout (${this.timeout}ms)`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseResponse(responseText: string): SearchResult[] {
    const results: SearchResult[] = []

    const lines = responseText.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonStr = line.substring(6).trim()
          if (!jsonStr || jsonStr === '[DONE]') {
            continue
          }

          const data = JSON.parse(jsonStr) as BochaResponse

          if (data.error) {
            throw new Error(`Bocha error: ${data.error.message || 'Unknown error'}`)
          }

          if (data.result?.content?.[0]?.text) {
            return this.parseBochaText(data.result.content[0].text)
          }

          if (Array.isArray(data.results)) {
            return data.results.map((r: BochaSearchResult) => ({
              title: r.title || r.name || '',
              url: r.url || r.link || '',
              snippet: r.snippet || r.description || r.content || '',
            }))
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            continue
          }
          throw e
        }
      }
    }

    return results
  }

  private parseBochaText(text: string): SearchResult[] {
    const results: SearchResult[] = []

    // 博查返回的格式是多个 Title: 开头的块
    // 使用正则分割
    const blocks = text.split(/(?=^Title:\s)/m)

    for (const block of blocks) {
      const result = this.parseBochaBlock(block)
      if (result) {
        results.push(result)
      }
    }

    return results
  }

  private parseBochaBlock(block: string): SearchResult | null {
    let title = ''
    let url = ''
    let snippet = ''

    // 匹配 Title: xxx 格式
    const titleMatch = block.match(/^Title:\s*(.+?)(?:\n|$)/m)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }

    // 匹配 URL: xxx 格式
    const urlMatch = block.match(/URL:\s*(https?:\/\/[^\s\n]+)/im)
    if (urlMatch) {
      url = urlMatch[1].trim()
    }

    // 匹配 Description: xxx 格式
    const descMatch = block.match(/Description:\s*([\s\S]+?)(?=\n(?:Title|URL|Description|Published|Site):|$)/i)
    if (descMatch) {
      snippet = descMatch[1].trim()
    }

    if (title || url) {
      return { title, url, snippet }
    }

    return null
  }
}
