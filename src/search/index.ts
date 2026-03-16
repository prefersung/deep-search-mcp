/**
 * 搜索引擎工厂
 */

import type { Config, SearchEngine } from '../config.js'
import { DuckDuckGoSearch } from './duckduckgo.js'
import { ExaSearch } from './exa.js'
import { BochaSearch } from './bocha.js'
import type { SearchEngineInterface, SearchOptions, SearchResult } from './types.js'

export type { SearchEngineInterface, SearchOptions, SearchResult }

/**
 * 创建搜索引擎实例
 */
export function createSearchEngine(config: Config): SearchEngineInterface {
  const { webSearch, proxy, timeout, ignoreSSL, bochaApiKey } = config

  switch (webSearch) {
    case 'duckduckgo':
      return new DuckDuckGoSearch(proxy, timeout, ignoreSSL)

    case 'exa':
      return new ExaSearch(proxy, timeout, ignoreSSL)

    case 'bocha':
      if (!bochaApiKey) {
        throw new Error('博查搜索需要配置 bochaApiKey')
      }
      return new BochaSearch(bochaApiKey, proxy, timeout, ignoreSSL)

    default: {
      const _exhaustiveCheck: never = webSearch
      throw new Error(`不支持的搜索引擎: ${_exhaustiveCheck as string}`)
    }
  }
}

/**
 * 获取搜索引擎描述
 */
export function getSearchEngineDescription(engine: SearchEngine): string {
  const descriptions: Record<SearchEngine, string> = {
    duckduckgo: `Search the web using DuckDuckGo - performs real-time web searches
- Provides up-to-date information for current events and recent data
- Returns search results with titles, URLs, and snippets
- Use this tool for accessing information beyond your knowledge cutoff
- Performs searches in a single API call

Usage notes:
- Use web_search to find information; use web_fetch to retrieve specific URLs
- If the question is about library/framework/package/API documentation, prefer Context7 tools first
- Free to use, no API key required
- Supports both English and Chinese queries
- Best for general web searches and finding recent information`,

    exa: `Search the web using Exa AI - AI-optimized search engine with real-time capabilities
- Provides up-to-date information for current events and recent data
- Returns high-quality, highly relevant search results
- Use this tool for accessing information beyond your knowledge cutoff
- Performs searches in a single API call

Usage notes:
- Use web_search to find information; use web_fetch to retrieve specific URLs
- If the question is about library/framework/package/API documentation, prefer Context7 tools first
- AI-powered search optimization for better relevance
- Best for technical research and academic queries
- Excellent for AI-related content searches`,

    bocha: `Search the web using Bocha AI - Chinese-friendly search engine with real-time capabilities
- Provides up-to-date information for current events and recent data
- Optimized for Chinese language search results
- Use this tool for accessing information beyond your knowledge cutoff
- Performs searches in a single API call

Usage notes:
- Use web_search to find information; use web_fetch to retrieve specific URLs
- If the question is about library/framework/package/API documentation, prefer Context7 tools first
- Best for Chinese content searches
- Optimized for China-localized information
- Supports real-time web crawling`,
  }

  return descriptions[engine]
}
