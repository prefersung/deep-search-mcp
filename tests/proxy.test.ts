import { describe, it, expect } from 'vitest'
import { resolveProxyUrl } from '../src/proxy/index.js'

describe('Proxy', () => {
  describe('resolveProxyUrl', () => {
    it('should return null for none proxy', async () => {
      const result = await resolveProxyUrl('none')
      expect(result).toBeNull()
    })

    it('should return the URL for custom proxy', async () => {
      const result = await resolveProxyUrl('http://proxy.example.com:8080')
      expect(result).toBe('http://proxy.example.com:8080')
    })

    it('should return null for empty proxy', async () => {
      const result = await resolveProxyUrl('')
      expect(result).toBeNull()
    })
  })
})
