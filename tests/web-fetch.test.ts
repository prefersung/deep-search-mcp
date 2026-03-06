import { describe, it, expect } from 'vitest'
import { isPrivateUrl } from '../src/tools/web-fetch.js'

describe('WebFetch SSRF Protection', () => {
  describe('isPrivateUrl', () => {
    it('should block localhost', () => {
      expect(isPrivateUrl('http://localhost/admin')).toBe(true)
      expect(isPrivateUrl('http://127.0.0.1/admin')).toBe(true)
    })

    it('should block private IP ranges', () => {
      expect(isPrivateUrl('http://10.0.0.1/secret')).toBe(true)
      expect(isPrivateUrl('http://172.16.0.1/secret')).toBe(true)
      expect(isPrivateUrl('http://192.168.1.1/secret')).toBe(true)
    })

    it('should block link-local addresses', () => {
      expect(isPrivateUrl('http://169.254.1.1/test')).toBe(true)
    })

    it('should allow public URLs', () => {
      expect(isPrivateUrl('https://example.com')).toBe(false)
      expect(isPrivateUrl('https://google.com')).toBe(false)
      expect(isPrivateUrl('https://github.com/user/repo')).toBe(false)
    })

    it('should block IPv6 localhost', () => {
      expect(isPrivateUrl('http://[::1]/admin')).toBe(true)
    })

    it('should handle invalid URLs gracefully', () => {
      expect(isPrivateUrl('not-a-url')).toBe(false)
    })
  })
})
