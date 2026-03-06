import { describe, it, expect } from 'vitest'
import { DuckDuckGoSearch } from '../../src/search/duckduckgo.js'

describe('DuckDuckGo Search Engine', () => {
  it('should create instance with config', () => {
    const duckduckgo = new DuckDuckGoSearch('none', 30000, false)

    expect(duckduckgo).toBeDefined()
    expect(duckduckgo.name).toBe('duckduckgo')
  })

  it('should extract actual URL from DuckDuckGo redirect', () => {
    const duckduckgo = new DuckDuckGoSearch('none', 30000, false) as unknown as {
      extractActualUrl: (url: string) => string | null
    }

    const redirectUrl =
      'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle%3Fid%3D1&rut=abc'
    expect(duckduckgo.extractActualUrl(redirectUrl)).toBe('https://example.com/article?id=1')
  })

  it('should parse HTML search results into structured data', () => {
    const duckduckgo = new DuckDuckGoSearch('none', 30000, false) as unknown as {
      parseResults: (html: string, maxResults: number) => Array<{ title: string; url: string; snippet: string }>
    }

    const html = `
      <html>
        <body>
          <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">First Result</a>
          <a class="result__snippet">First snippet text</a>
          <a class="result__a" href="https://example.com/b">Second Result</a>
          <a class="result__snippet">Second snippet text</a>
        </body>
      </html>
    `

    const results = duckduckgo.parseResults(html, 2)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('First Result')
    expect(results[0].url).toBe('https://example.com/a')
    expect(results[0].snippet).toContain('First snippet text')

    expect(results[1].title).toBe('Second Result')
    expect(results[1].url).toBe('https://example.com/b')
  })
})
