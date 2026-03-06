import { describe, it, expect } from 'vitest'
import { ExaSearch } from '../../src/search/exa.js'
import { BochaSearch } from '../../src/search/bocha.js'

describe('Search Parsing', () => {
  it('should parse Exa SSE response text', () => {
    const exa = new ExaSearch('none', 30000, false) as unknown as {
      parseResponse: (responseText: string) => Array<{ title: string; url: string; snippet: string }>
    }

    const responseText = [
      'event: message',
      'data: {"result":{"content":[{"type":"text","text":"Title: Exa Result\\nURL: https://exa.example.com\\nText: Exa snippet"}]}}',
      '',
    ].join('\n')

    const results = exa.parseResponse(responseText)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      title: 'Exa Result',
      url: 'https://exa.example.com',
      snippet: 'Exa snippet',
    })
  })

  it('should parse Bocha response with results array', () => {
    const bocha = new BochaSearch('test-key', 'none', 30000, false) as unknown as {
      parseResponse: (responseText: string) => Array<{ title: string; url: string; snippet: string }>
    }

    const responseText =
      'data: {"results":[{"title":"Bocha Result","url":"https://bocha.example.com","snippet":"Bocha snippet"}]}\n'

    const results = bocha.parseResponse(responseText)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      title: 'Bocha Result',
      url: 'https://bocha.example.com',
      snippet: 'Bocha snippet',
    })
  })

  it('should parse Bocha text blocks from content field', () => {
    const bocha = new BochaSearch('test-key', 'none', 30000, false) as unknown as {
      parseResponse: (responseText: string) => Array<{ title: string; url: string; snippet: string }>
    }

    const responseText =
      'data: {"result":{"content":[{"type":"text","text":"Title: Block Result\\nURL: https://block.example.com\\nDescription: Block snippet"}]}}\n'

    const results = bocha.parseResponse(responseText)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      title: 'Block Result',
      url: 'https://block.example.com',
      snippet: 'Block snippet',
    })
  })
})
