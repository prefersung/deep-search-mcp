import { describe, it, expect } from 'vitest'
import { DuckDuckGoSearch } from '../../src/search/duckduckgo.js'

describe('DuckDuckGo Search Engine', () => {
  it('should create instance with config', () => {
    const duckduckgo = new DuckDuckGoSearch('none', 30000, false)

    expect(duckduckgo).toBeDefined()
    expect(duckduckgo.name).toBe('duckduckgo')
  })
})

