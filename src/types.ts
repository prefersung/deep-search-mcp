import type { RequestInfo, RequestInit } from 'node-fetch'
import type { Agent } from 'http'

export interface FetchOptions extends Omit<RequestInit, 'agent'> {
  agent?: Agent | boolean | ((parsedUrl: URL) => Agent | boolean | undefined)
  signal?: AbortSignal
}

export type FetchFunction = (url: RequestInfo, init?: FetchOptions) => Promise<Response>

export interface BochaSearchResult {
  title?: string
  name?: string
  url?: string
  link?: string
  snippet?: string
  description?: string
  content?: string
}

export interface ExaSearchResult {
  title?: string
  url?: string
  content?: string
}

export interface BochaResponse {
  error?: {
    message?: string
  }
  result?: {
    content?: Array<{
      type: string
      text: string
    }>
  }
  results?: BochaSearchResult[]
}

export interface ExaResponse {
  jsonrpc: string
  result?: {
    content?: Array<{
      type: string
      text: string
    }>
  }
  error?: {
    message: string
  }
}
