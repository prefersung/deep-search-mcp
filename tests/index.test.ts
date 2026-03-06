import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Config } from '../src/config.js'

describe('MCP Server Index', () => {
  let mockConfig: Config

  beforeEach(() => {
    mockConfig = {
      proxy: '',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: {
        engine: 'duckduckgo',
        apiKey: '',
      },
    }
  })

  describe('Tool schemas', () => {
    it('should validate web_search parameters', async () => {
      const { z } = await import('zod')
      const WebSearchSchema = z.object({
        query: z.string().describe('搜索查询内容'),
        numResults: z.number().optional().default(8).describe('返回结果数量 (默认: 8)'),
      })

      const validParams = { query: 'test', numResults: 5 }
      expect(() => WebSearchSchema.parse(validParams)).not.toThrow()

      const defaultParams = { query: 'test' }
      const parsed = WebSearchSchema.parse(defaultParams)
      expect(parsed.numResults).toBe(8)
    })

    it('should validate web_fetch parameters', async () => {
      const { z } = await import('zod')
      const WebFetchSchema = z.object({
        url: z.string().describe('要抓取的 URL'),
        format: z
          .enum(['markdown', 'text', 'html'])
          .optional()
          .default('markdown')
          .describe('返回格式 (默认: markdown)'),
        timeout: z.number().min(1).max(120).optional().describe('超时时间(秒)，1-120秒'),
      })

      const validParams = { url: 'https://example.com', format: 'text' as const, timeout: 30 }
      expect(() => WebFetchSchema.parse(validParams)).not.toThrow()

      const invalidTimeout = { url: 'https://example.com', timeout: 200 }
      expect(() => WebFetchSchema.parse(invalidTimeout)).toThrow()
    })
  })
})
