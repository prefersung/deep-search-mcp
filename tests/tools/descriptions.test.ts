import { describe, it, expect } from 'vitest'
import { getSearchEngineDescription } from '../../src/search/index.js'
import { getWebFetchDescription } from '../../src/tools/web-fetch.js'

describe('Tool Descriptions', () => {
  describe('getSearchEngineDescription', () => {
    it('should return description for duckduckgo', () => {
      const desc = getSearchEngineDescription('duckduckgo')
      expect(desc).toBeDefined()
      expect(typeof desc).toBe('string')
      expect(desc.length).toBeGreaterThan(0)
      expect(desc).toContain('prefer Context7 tools first')
    })

    it('should return description for exa', () => {
      const desc = getSearchEngineDescription('exa')
      expect(desc).toBeDefined()
      expect(typeof desc).toBe('string')
      expect(desc).toContain('Exa')
    })

    it('should return description for bocha', () => {
      const desc = getSearchEngineDescription('bocha')
      expect(desc).toBeDefined()
      expect(typeof desc).toBe('string')
      expect(desc).toContain('Bocha')
    })
  })

  describe('getWebFetchDescription', () => {
    it('should return web fetch tool description', () => {
      const desc = getWebFetchDescription()
      expect(desc).toBeDefined()
      expect(typeof desc).toBe('string')
      expect(desc).toContain('URL')
      expect(desc).toContain('prefer Context7 tools')
    })
  })
})
