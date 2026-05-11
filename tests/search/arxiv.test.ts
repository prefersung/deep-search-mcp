import { describe, it, expect } from 'vitest'
import { ArxivSearch } from '../../src/search/arxiv.js'

// 最小合法 Atom XML，模拟 arXiv 真实响应结构
const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>2</opensearch:totalResults>
  <entry>
    <id>https://arxiv.org/abs/2301.00001</id>
    <title>Attention Is All You Need</title>
    <summary>We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.</summary>
    <published>2023-01-01T00:00:00Z</published>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Jones</name></author>
    <link rel="alternate" type="text/html" href="https://arxiv.org/abs/2301.00001"/>
    <link rel="related" type="application/pdf" href="https://arxiv.org/pdf/2301.00001"/>
    <arxiv:doi>10.1234/example</arxiv:doi>
  </entry>
  <entry>
    <id>https://arxiv.org/abs/2302.00002</id>
    <title>Large Language Models Survey</title>
    <summary>A comprehensive survey of large language models and their applications in natural language processing tasks.</summary>
    <published>2023-02-15T00:00:00Z</published>
    <author><name>Carol White</name></author>
    <author><name>Dave Brown</name></author>
    <author><name>Eve Davis</name></author>
    <author><name>Frank Wilson</name></author>
    <link rel="alternate" type="text/html" href="https://arxiv.org/abs/2302.00002"/>
    <link rel="related" type="application/pdf" href="https://arxiv.org/pdf/2302.00002"/>
  </entry>
</feed>`

const EMPTY_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>0</opensearch:totalResults>
</feed>`

describe('ArxivSearch', () => {
  it('should create instance', () => {
    const s = new ArxivSearch('none', 30000, false)
    expect(s.name).toBe('arxiv')
  })

  it('should parse Atom XML into structured results', () => {
    const s = new ArxivSearch('none', 30000, false) as unknown as {
      parseAtomXml: (xml: string) => Array<{ title: string; url: string; snippet: string }>
    }

    const results = s.parseAtomXml(SAMPLE_ATOM_XML)
    expect(results).toHaveLength(2)

    // 第一条：标题、URL、作者、日期、DOI、PDF 都齐全
    expect(results[0].title).toBe('Attention Is All You Need')
    expect(results[0].url).toBe('https://arxiv.org/abs/2301.00001')
    expect(results[0].snippet).toContain('Alice Smith')
    expect(results[0].snippet).toContain('2023-01-01')
    expect(results[0].snippet).toContain('DOI: 10.1234/example')
    expect(results[0].snippet).toContain('PDF:')
    expect(results[0].snippet).toContain('We propose a new simple network')

    // 第二条：超过 3 位作者时 snippet 应显示 "等"
    expect(results[1].title).toBe('Large Language Models Survey')
    expect(results[1].snippet).toContain('等')
  })

  it('should return empty array when totalResults is 0', () => {
    const s = new ArxivSearch('none', 30000, false) as unknown as {
      parseAtomXml: (xml: string) => unknown[]
    }
    expect(s.parseAtomXml(EMPTY_ATOM_XML)).toHaveLength(0)
  })

  it('should fall back to id element when no alternate link present', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2303.00003</id>
    <title>Fallback URL Test</title>
    <summary>Testing fallback URL construction from id element.</summary>
    <published>2023-03-01T00:00:00Z</published>
    <author><name>Test Author</name></author>
  </entry>
</feed>`

    const s = new ArxivSearch('none', 30000, false) as unknown as {
      parseAtomXml: (xml: string) => Array<{ url: string }>
    }
    const results = s.parseAtomXml(xml)
    // http:// 应被升级为 https://
    expect(results[0].url).toBe('https://arxiv.org/abs/2303.00003')
  })
})
