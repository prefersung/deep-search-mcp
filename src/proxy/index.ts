/**
 * 代理 Agent 模块
 * 创建支持代理的 fetch 函数
 */

import { HttpsProxyAgent } from 'https-proxy-agent'
import type { RequestInit } from 'node-fetch'
import { detectSystemProxy } from './windows.js'

export type ProxyConfig = string // 'system' | 'none' | 'http://...'

/**
 * 解析代理配置，返回实际的代理 URL
 */
export async function resolveProxyUrl(proxy: ProxyConfig): Promise<string | null> {
  if (proxy === 'none' || !proxy) {
    return null
  }

  if (proxy === 'system') {
    return detectSystemProxy()
  }

  // Validate and normalize proxy URL
  let proxyUrl = proxy.trim()

  // Add http:// prefix if missing
  if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
    proxyUrl = `http://${proxyUrl}`
  }

  // Validate URL format
  try {
    new URL(proxyUrl)
    return proxyUrl
  } catch {
    throw new Error(`Invalid proxy URL format: ${proxy}`)
  }
}

/**
 * 创建带有代理支持的 fetch 配置
 */
export async function createProxyFetchOptions(
  proxy: ProxyConfig,
  ignoreSSL: boolean = false,
  baseOptions: RequestInit = {}
): Promise<RequestInit> {
  const proxyUrl = await resolveProxyUrl(proxy)

  if (!proxyUrl) {
    return baseOptions
  }

  const agent = new HttpsProxyAgent(proxyUrl, {
    rejectUnauthorized: !ignoreSSL,
  })

  return {
    ...baseOptions,
    agent,
  }
}

/**
 * 全局代理 Agent 缓存
 */
let cachedAgent: InstanceType<typeof HttpsProxyAgent> | null = null
let cachedProxyUrl: string | null = null
let cachedIgnoreSSL: boolean = false

/**
 * 获取或创建代理 Agent
 */
export async function getProxyAgent(
  proxy: ProxyConfig,
  ignoreSSL: boolean = false
): Promise<InstanceType<typeof HttpsProxyAgent> | undefined> {
  const proxyUrl = await resolveProxyUrl(proxy)

  if (!proxyUrl) {
    return undefined
  }

  // 使用缓存避免重复创建
  if (cachedProxyUrl === proxyUrl && cachedIgnoreSSL === ignoreSSL && cachedAgent) {
    return cachedAgent
  }

  console.error(`[Proxy] Creating proxy connection: ${proxyUrl}`)
  if (ignoreSSL) {
    console.error('[Proxy] SSL certificate verification disabled')
  }

  cachedProxyUrl = proxyUrl
  cachedIgnoreSSL = ignoreSSL
  cachedAgent = new HttpsProxyAgent(proxyUrl, {
    rejectUnauthorized: !ignoreSSL,
  })

  return cachedAgent
}

/**
 * 创建带代理的 fetch 函数
 */
export function createProxiedFetch(
  proxy: ProxyConfig,
  ignoreSSL: boolean = false
): (url: string, init?: RequestInit) => Promise<unknown> {
  return async (url: string, init?: RequestInit) => {
    const agent = await getProxyAgent(proxy, ignoreSSL)

    // 动态导入 node-fetch (Node.js 环境)
    const nodeFetch = (await import('node-fetch')).default

    return nodeFetch(url, {
      ...init,
      agent,
    } as RequestInit)
  }
}
