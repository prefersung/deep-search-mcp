import { describe, it, expect } from 'vitest'
import {
  validateConfig,
  loadConfigFromEnv,
  DEFAULT_CONFIG,
  DEFAULT_CONTEXT7_CONFIG,
} from '../src/config.js'

describe('Config', () => {
  describe('loadConfigFromEnv', () => {
    it('should load default config when no options provided', () => {
      const config = loadConfigFromEnv()
      expect(config.proxy).toBe(DEFAULT_CONFIG.proxy)
      expect(config.webSearch).toBe(DEFAULT_CONFIG.webSearch)
      expect(config.timeout).toBe(DEFAULT_CONFIG.timeout)
      expect(config.ignoreSSL).toBe(DEFAULT_CONFIG.ignoreSSL)
      expect(config.context7).toEqual(DEFAULT_CONTEXT7_CONFIG)
    })

    it('should merge partial config with defaults', () => {
      const config = loadConfigFromEnv({ proxy: 'http://test.com:8080' })
      expect(config.proxy).toBe('http://test.com:8080')
      expect(config.webSearch).toBe(DEFAULT_CONFIG.webSearch)
      expect(config.context7).toEqual(DEFAULT_CONTEXT7_CONFIG)
    })

    it('should override defaults with provided options', () => {
      const config = loadConfigFromEnv({
        proxy: 'system',
        webSearch: 'exa',
        timeout: 60000,
        ignoreSSL: true,
      })
      expect(config.proxy).toBe('system')
      expect(config.webSearch).toBe('exa')
      expect(config.timeout).toBe(60000)
      expect(config.ignoreSSL).toBe(true)
    })

    it('should enable context7 when configured', () => {
      const config = loadConfigFromEnv({
        context7: {
          enabled: true,
          url: 'https://mcp.context7.com/mcp',
          apiKey: 'ctx7sk_test',
        },
      })

      expect(config.context7).toEqual({
        enabled: true,
        url: 'https://mcp.context7.com/mcp',
        apiKey: 'ctx7sk_test',
      })
    })
  })

  describe('validateConfig', () => {
    it('should throw error when bocha search is selected without api key', () => {
      const config = loadConfigFromEnv({ webSearch: 'bocha' })
      expect(() => validateConfig(config)).toThrow(
        'Bocha search requires --bocha-api-key or BOCHA_API_KEY environment variable'
      )
    })

    it('should pass validation with valid proxy URL', () => {
      const config = loadConfigFromEnv({ proxy: 'http://proxy.example.com:8080' })
      expect(() => validateConfig(config)).not.toThrow()
    })

    it('should throw error for invalid proxy URL', () => {
      const config = loadConfigFromEnv({ proxy: 'invalid-url' })
      expect(() => validateConfig(config)).toThrow('Invalid proxy URL format')
    })

    it('should throw error for invalid timeout', () => {
      const config = loadConfigFromEnv({ timeout: 500 })
      expect(() => validateConfig(config)).toThrow('timeout must be between 1000-300000 milliseconds')
    })

    it('should throw error for unsupported protocol', () => {
      const config = loadConfigFromEnv({ proxy: 'ftp://proxy.com:21' })
      expect(() => validateConfig(config)).toThrow('Proxy URL must use http or https protocol')
    })

    it('should throw error for invalid context7 URL', () => {
      const config = loadConfigFromEnv({
        context7: {
          enabled: true,
          url: 'invalid-url',
        },
      })

      expect(() => validateConfig(config)).toThrow('Invalid Context7 MCP URL format')
    })
  })
})
