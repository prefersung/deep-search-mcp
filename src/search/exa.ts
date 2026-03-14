import { BaseSearchEngine, type SearchOptions, type SearchResult } from './types.js'
import { getProxyAgent } from '../proxy/index.js'
import type { ExaResponse, FetchOptions } from '../types.js'

interface ExaSearchRequest {
  jsonrpc: string
  id: number
  method: string
  params: {
    name: string
    arguments: {
      query: string
      numResults?: number
      livecrawl?: 'fallback' | 'preferred'
      type?: 'auto' | 'fast' | 'deep'
      contextMaxCharacters?: number
    }
  }
}

export class ExaSearch extends BaseSearchEngine {
  name = 'exa'

  private readonly API_URL = 'https://mcp.exa.ai/mcp'
  private readonly DEFAULT_NUM_RESULTS = 8

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, numResults = this.DEFAULT_NUM_RESULTS } = options

    const agent = await getProxyAgent(this.proxy, this.ignoreSSL)
    const nodeFetch = (await import('node-fetch')).default

    const searchRequest: ExaSearchRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query,
          type: 'auto',
          numResults,
          livecrawl: 'fallback',
          contextMaxCharacters: 10000,
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
        },
        body: JSON.stringify(searchRequest),
        signal: controller.signal,
      }

      const response = await nodeFetch(this.API_URL, fetchOptions)

      if (!response.ok) {
        throw new Error(`Exa AI search failed: HTTP ${response.status}`)
      }

      const responseText = await response.text()
      return this.parseResponse(responseText)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Exa AI search timeout (${this.timeout}ms)`)
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
      // 跳过空行和 event 行
      if (!line.trim() || line.startsWith('event:')) {
        continue
      }

      if (line.startsWith('data: ')) {
        try {
          const data: ExaResponse = JSON.parse(line.substring(6)) as ExaResponse

          if (data.error) {
            throw new Error(`Exa AI error: ${data.error.message}`)
          }

          if (data.result?.content?.[0]?.text) {
            return this.parseExaText(data.result.content[0].text)
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

  private parseExaText(text: string): SearchResult[] {
    const results: SearchResult[] = []

    // Exa 返回的格式是多个 Title: 开头的块
    // 使用正则分割，支持多种格式
    const blocks = text.split(/(?=^Title:\s)/m)

    for (const block of blocks) {
      const result = this.parseExaBlock(block)
      if (result) {
        results.push(result)
      }
    }

    // 如果没有解析到结果，尝试其他格式
    if (results.length === 0) {
      // 尝试按 ## 标题分割
      const altBlocks = text.split(/\n\n(?=##)/i)
      for (const block of altBlocks) {
        const result = this.parseExaBlock(block)
        if (result) {
          results.push(result)
        }
      }
    }

    return results
  }

  private parseExaBlock(block: string): SearchResult | null {
    let title = ''
    let url = ''
    let snippet = ''

    // 尝试匹配 Title: xxx 格式
    const titleMatch = block.match(/^Title:\s*(.+?)(?:\n|$)/m)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }

    // 尝试匹配 ## xxx 格式
    if (!title) {
      const headingMatch = block.match(/^##\s*(.+)$/m)
      if (headingMatch) {
        title = headingMatch[1].trim()
      }
    }

    // 尝试匹配 URL: xxx 格式
    const urlMatch = block.match(/URL:\s*(https?:\/\/[^\s\n]+)/im)
    if (urlMatch) {
      url = urlMatch[1].trim()
    }

    // 尝试匹配 markdown 链接格式 [xxx](url)
    if (!url) {
      const linkMatch = block.match(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/)
      if (linkMatch) {
        if (!title) {
          title = linkMatch[1]
        }
        url = linkMatch[2]
      }
    }

    // 尝试匹配 Text: xxx 或 Content: xxx 格式
    const textMatch = block.match(
      /(?:Text|Content):\s*([\s\S]+?)(?=\n(?:Title|URL|Author|Published|Text|Content):|$)/i
    )
    if (textMatch) {
      snippet = textMatch[1].trim()
    }

    // 如果没有 snippet，使用整个块（去除已识别的部分）
    if (!snippet && (title || url)) {
      snippet = block
        .replace(/^Title:.*$/m, '')
        .replace(/^URL:.*$/m, '')
        .replace(/^Author:.*$/m, '')
        .replace(/^Published Date:.*$/m, '')
        .replace(/^(Text|Content):/im, '')
        .trim()
    }

    if (title || url) {
      return { title, url, snippet }
    }

    return null
  }
}
