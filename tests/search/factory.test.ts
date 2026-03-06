import { describe, it, expect } from 'vitest'
import { createSearchEngine } from '../../src/search/index.js'
import type { Config } from '../../src/config.js'
import { DuckDuckGoSearch } from '../../src/search/duckduckgo.js'

describe('Search Engine Factory', () => {
  it('should create DuckDuckGo search engine', () => {
    const config: Config = {
      proxy: 'none',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: 'duckduckgo',
    }

    const engine = createSearchEngine(config)

    expect(engine).toBeDefined()
    expect(engine).toBeInstanceOf(DuckDuckGoSearch)
    expect(engine.name).toBe('duckduckgo')
  })

  it('should create Exa search engine when configured', () => {
    const config: Config = {
      proxy: 'none',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: 'exa',
    }

    const engine = createSearchEngine(config)

    expect(engine).toBeDefined()
    expect(engine.name).toBe('exa')
  })

  it('should create Bocha search engine when configured', () => {
    const config: Config = {
      proxy: 'none',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: 'bocha',
      bochaApiKey: 'test-key',
    }

    const engine = createSearchEngine(config)

    expect(engine).toBeDefined()
    expect(engine.name).toBe('bocha')
  })

  it('should throw when Bocha is selected without API key', () => {
    const config: Config = {
      proxy: 'none',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: 'bocha',
    }

    expect(() => createSearchEngine(config)).toThrow(/bochaApiKey|API Key|博查搜索/)
  })
})
