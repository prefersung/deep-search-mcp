import { describe, it, expect } from 'vitest'
import { SemanticScholarSearch } from '../../src/search/semantic-scholar.js'

const SAMPLE_RESPONSE = {
  total: 2,
  data: [
    {
      paperId: 'abc123',
      title: 'Attention Is All You Need',
      abstract:
        'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',
      year: 2017,
      authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }, { name: 'Niki Parmar' }, { name: 'Jakob Uszkoreit' }],
      citationCount: 80000,
      openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762' },
      externalIds: { DOI: '10.48550/arXiv.1706.03762', ArXiv: '1706.03762' },
      url: 'https://www.semanticscholar.org/paper/abc123',
    },
    {
      paperId: 'def456',
      title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      abstract: 'We introduce BERT, designed to pre-train deep bidirectional representations.',
      year: 2019,
      authors: [{ name: 'Jacob Devlin' }, { name: 'Ming-Wei Chang' }],
      citationCount: 50000,
      openAccessPdf: null,
      externalIds: {},
      url: 'https://www.semanticscholar.org/paper/def456',
    },
  ],
}

describe('SemanticScholarSearch', () => {
  it('should create instance with and without API key', () => {
    const noKey = new SemanticScholarSearch('none', 30000, false)
    expect(noKey.name).toBe('semantic-scholar')

    const withKey = new SemanticScholarSearch('none', 30000, false, 'test-key')
    expect(withKey.name).toBe('semantic-scholar')
  })

  it('should parse API response into structured results', () => {
    const s = new SemanticScholarSearch('none', 30000, false) as unknown as {
      parseResponse: (data: unknown) => Array<{ title: string; url: string; snippet: string }>
    }

    const results = s.parseResponse(SAMPLE_RESPONSE)
    expect(results).toHaveLength(2)

    // 第一条：超过 3 位作者显示 "等"，引用数、DOI、PDF 都在 snippet 里
    expect(results[0].title).toBe('Attention Is All You Need')
    expect(results[0].url).toBe('https://www.semanticscholar.org/paper/abc123')
    expect(results[0].snippet).toContain('等')
    expect(results[0].snippet).toContain('80000')
    expect(results[0].snippet).toContain('DOI:')
    expect(results[0].snippet).toContain('PDF:')
    expect(results[0].snippet).toContain('We propose a new simple network')

    // 第二条：无 PDF，无 DOI，snippet 只有作者/年份/引用
    expect(results[1].title).toBe('BERT: Pre-training of Deep Bidirectional Transformers')
    expect(results[1].snippet).toContain('Jacob Devlin')
    expect(results[1].snippet).not.toContain('PDF:')
  })

  it('should return empty array when data is empty', () => {
    const s = new SemanticScholarSearch('none', 30000, false) as unknown as {
      parseResponse: (data: unknown) => unknown[]
    }
    expect(s.parseResponse({ total: 0, data: [] })).toHaveLength(0)
  })

  it('should fall back to ArXiv URL when no S2 url field', () => {
    const s = new SemanticScholarSearch('none', 30000, false) as unknown as {
      parseResponse: (data: unknown) => Array<{ url: string }>
    }
    const results = s.parseResponse({
      total: 1,
      data: [
        {
          paperId: 'xyz',
          title: 'Test Paper',
          externalIds: { ArXiv: '2301.00001' },
          url: undefined,
        },
      ],
    })
    expect(results[0].url).toBe('https://arxiv.org/abs/2301.00001')
  })
})
