/**
 * 配置管理模块
 */

export type SearchEngine = 'duckduckgo' | 'exa' | 'bocha'

export interface Config {
  /** 代理设置: 'system' | 'none' | 代理URL */
  proxy: string
  /** 搜索引擎选择 */
  webSearch: SearchEngine
  /** 博查 API Key */
  bochaApiKey?: string
  /** Exa API Key (如果需要) */
  exaApiKey?: string
  /** 请求超时(毫秒) */
  timeout: number
  /** 忽略 SSL 证书校验 */
  ignoreSSL: boolean
}

export const DEFAULT_CONFIG: Config = {
  proxy: 'none',
  webSearch: 'duckduckgo',
  timeout: 30000,
  ignoreSSL: false,
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(partial: Partial<Config> = {}): Config {
  return {
    proxy:
      partial.proxy ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.PROXY ||
      DEFAULT_CONFIG.proxy,
    webSearch:
      partial.webSearch || (process.env.WEB_SEARCH as SearchEngine) || DEFAULT_CONFIG.webSearch,
    bochaApiKey: partial.bochaApiKey || process.env.BOCHA_API_KEY,
    exaApiKey: partial.exaApiKey || process.env.EXA_API_KEY,
    timeout: partial.timeout || parseInt(process.env.TIMEOUT || '') || DEFAULT_CONFIG.timeout,
    ignoreSSL:
      partial.ignoreSSL ??
      (process.env.IGNORE_SSL === 'true' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') ??
      DEFAULT_CONFIG.ignoreSSL,
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: Config): void {
  // Validate search engine config
  if (config.webSearch === 'bocha' && !config.bochaApiKey) {
    throw new Error('Bocha search requires --bocha-api-key or BOCHA_API_KEY environment variable')
  }

  // Validate timeout range
  if (config.timeout < 1000 || config.timeout > 300000) {
    throw new Error('timeout must be between 1000-300000 milliseconds')
  }

  // Validate proxy URL format
  if (config.proxy !== 'none' && config.proxy !== 'system') {
    try {
      const url = new URL(config.proxy)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Proxy URL must use http or https protocol')
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`Invalid proxy URL format: ${config.proxy}`)
      }
      throw e
    }
  }
}

/**
 * Validate search parameters
 */
export function validateSearchParams(numResults?: number): void {
  if (numResults !== undefined) {
    if (numResults < 1 || numResults > 50) {
      throw new Error('numResults must be between 1-50')
    }
  }
}
