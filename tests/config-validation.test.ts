import { describe, it, expect } from 'vitest'
import { validateConfig, validateSearchParams } from '../src/config.js'
import type { Config } from '../src/config.js'

describe('Config Validation', () => {
  describe('validateConfig', () => {
    it('should pass for valid config', () => {
      const config: Config = {
        proxy: 'none',
        timeout: 30000,
        ignoreSSL: false,
        webSearch: 'duckduckgo',
        context7: {
          enabled: false,
          url: 'https://mcp.context7.com/mcp',
        },
      }

      expect(() => validateConfig(config)).not.toThrow()
    })

    it('should throw for bocha without API key', () => {
      const config: Config = {
        proxy: 'none',
        timeout: 30000,
        ignoreSSL: false,
        webSearch: 'bocha',
        context7: {
          enabled: false,
          url: 'https://mcp.context7.com/mcp',
        },
      }

      expect(() => validateConfig(config)).toThrow(/Bocha search requires/)
    })

    it('should throw for invalid timeout', () => {
      const config: Config = {
        proxy: 'none',
        timeout: 500,
        ignoreSSL: false,
        webSearch: 'duckduckgo',
        context7: {
          enabled: false,
          url: 'https://mcp.context7.com/mcp',
        },
      }

      expect(() => validateConfig(config)).toThrow(/timeout must be between/)
    })

    it('should throw for invalid proxy URL', () => {
      const config: Config = {
        proxy: 'invalid-url',
        timeout: 30000,
        ignoreSSL: false,
        webSearch: 'duckduckgo',
        context7: {
          enabled: false,
          url: 'https://mcp.context7.com/mcp',
        },
      }

      expect(() => validateConfig(config)).toThrow(/Invalid proxy URL/)
    })

    it('should throw for invalid context7 URL', () => {
      const config: Config = {
        proxy: 'none',
        timeout: 30000,
        ignoreSSL: false,
        webSearch: 'duckduckgo',
        context7: {
          enabled: true,
          url: 'invalid-url',
        },
      }

      expect(() => validateConfig(config)).toThrow(/Invalid Context7 MCP URL/)
    })
  })

  describe('validateSearchParams', () => {
    it('should pass for valid numResults', () => {
      expect(() => validateSearchParams(10)).not.toThrow()
    })

    it('should throw for numResults too small', () => {
      expect(() => validateSearchParams(0)).toThrow(/numResults must be between/)
    })

    it('should throw for numResults too large', () => {
      expect(() => validateSearchParams(100)).toThrow(/numResults must be between/)
    })
  })
})
