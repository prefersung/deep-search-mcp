import { describe, it, expect } from 'vitest'
import { WebFetch } from '../src/tools/web-fetch.js'
import { DEFAULT_CONFIG } from '../src/config.js'

describe('Cheerio HTML Text Extraction', () => {
  const webFetch = new WebFetch(DEFAULT_CONFIG)

  it('should extract text from simple HTML', () => {
    const html = '<html><body><p>Hello World</p></body></html>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toBe('Hello World')
  })

  it('should remove script tags', () => {
    const html = '<html><body><p>Content</p><script>alert("bad")</script></body></html>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toBe('Content')
    expect(text).not.toContain('alert')
  })

  it('should remove style tags', () => {
    const html = '<html><body><p>Content</p><style>body{color:red}</style></body></html>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toBe('Content')
    expect(text).not.toContain('color')
  })

  it('should handle HTML entities', () => {
    const html = '<html><body><p>Hello&nbsp;World &amp; Test</p></body></html>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toContain('Hello')
    expect(text).toContain('World')
    expect(text).toContain('&')
  })

  it('should normalize whitespace', () => {
    const html = '<html><body><p>Hello    \n\n   World</p></body></html>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toBe('Hello World')
  })

  it('should handle empty HTML', () => {
    const html = ''
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toBe('')
  })

  it('should handle HTML without body tag', () => {
    const html = '<html><p>Content</p></html>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toBe('Content')
  })

  it('should fallback on malformed HTML', () => {
    const html = '<p>Content<script>bad</p>'
    // @ts-expect-error - accessing private method for testing
    const text = webFetch.extractTextFromHTML(html)
    expect(text).toContain('Content')
  })
})
