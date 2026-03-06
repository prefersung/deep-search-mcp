import { describe, it, expect } from 'vitest'
import { isPrivateUrl } from '../src/tools/web-fetch.js'

describe('SSRF Protection', () => {
  describe('IPv4-mapped IPv6 addresses', () => {
    it('should block ::ffff:127.0.0.1', () => {
      expect(isPrivateUrl('http://[::ffff:127.0.0.1]/admin')).toBe(true)
    })

    it('should block ::ffff:10.0.0.1', () => {
      expect(isPrivateUrl('http://[::ffff:10.0.0.1]/admin')).toBe(true)
    })

    it('should block ::ffff:192.168.1.1', () => {
      expect(isPrivateUrl('http://[::ffff:192.168.1.1]/admin')).toBe(true)
    })

    it('should block ::ffff:172.16.0.1', () => {
      expect(isPrivateUrl('http://[::ffff:172.16.0.1]/admin')).toBe(true)
    })
  })

  describe('Standard private addresses', () => {
    it('should block localhost', () => {
      expect(isPrivateUrl('http://localhost/admin')).toBe(true)
    })

    it('should block 127.0.0.1', () => {
      expect(isPrivateUrl('http://127.0.0.1/admin')).toBe(true)
    })

    it('should block 10.0.0.1', () => {
      expect(isPrivateUrl('http://10.0.0.1/admin')).toBe(true)
    })

    it('should block 192.168.1.1', () => {
      expect(isPrivateUrl('http://192.168.1.1/admin')).toBe(true)
    })

    it('should block ::1', () => {
      expect(isPrivateUrl('http://[::1]/admin')).toBe(true)
    })
  })

  describe('Sensitive ports', () => {
    it('should block SSH port 22', () => {
      expect(isPrivateUrl('http://example.com:22')).toBe(true)
    })

    it('should block MySQL port 3306', () => {
      expect(isPrivateUrl('http://example.com:3306')).toBe(true)
    })

    it('should block Redis port 6379', () => {
      expect(isPrivateUrl('http://example.com:6379')).toBe(true)
    })
  })

  describe('Public addresses', () => {
    it('should allow example.com', () => {
      expect(isPrivateUrl('http://example.com')).toBe(false)
    })

    it('should allow 8.8.8.8', () => {
      expect(isPrivateUrl('http://8.8.8.8')).toBe(false)
    })

    it('should allow standard ports', () => {
      expect(isPrivateUrl('http://example.com:80')).toBe(false)
      expect(isPrivateUrl('https://example.com:443')).toBe(false)
    })
  })
})
