/**
 * 搜索引擎统一接口
 */

import type { ProxyConfig } from '../proxy/index.js'

export interface SearchResult {
  title: string
  url: string
  snippet: string
  content?: string
}

export interface SearchOptions {
  query: string
  numResults?: number
  timeout?: number
}

export interface SearchEngineInterface {
  name: string
  search(options: SearchOptions): Promise<SearchResult[]>
}

/**
 * 搜索引擎基类
 */
export abstract class BaseSearchEngine implements SearchEngineInterface {
  abstract name: string
  protected proxy: ProxyConfig
  protected timeout: number
  protected ignoreSSL: boolean

  constructor(proxy: ProxyConfig = 'none', timeout: number = 30000, ignoreSSL: boolean = false) {
    this.proxy = proxy
    this.timeout = timeout
    this.ignoreSSL = ignoreSSL
  }

  abstract search(options: SearchOptions): Promise<SearchResult[]>
}
