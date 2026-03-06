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
    duckduckgo: `DuckDuckGo 网络搜索 - 免费无需 API Key
- 搜索互联网获取最新信息
- 支持中英文搜索
- 返回搜索结果列表，包含标题、链接和摘要

使用场景:
- 获取最新新闻和资讯
- 查找技术文档和教程
- 搜索产品信息和评论`,

    exa: `Exa AI 网络搜索 - AI 优化的搜索引擎
- 使用 AI 技术优化搜索结果
- 返回高质量、相关性强的结果
- 支持深度搜索模式

使用场景:
- 需要高质量搜索结果
- 学术研究和技术调研
- AI 相关内容搜索`,

    bocha: `博查 AI 网络搜索 - 中文友好的搜索引擎
- 对中文搜索结果优化
- 支持实时网页抓取
- 返回结构化搜索结果

使用场景:
- 中文内容搜索
- 中国本地化信息查询
- 实时资讯获取`,
  }

  return descriptions[engine]
}
