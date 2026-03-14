import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/config.js'

const mockState = vi.hoisted(() => {
  return {
    listHandler: undefined as undefined | ((request?: unknown) => unknown),
    callHandler: undefined as undefined | ((request: unknown) => unknown),
    searchEngine: {
      search: vi.fn(),
    },
    webFetch: vi.fn(),
    context7ListTools: vi.fn().mockResolvedValue([]),
    context7CallTool: vi.fn(),
    context7CanHandleTool: vi.fn().mockReturnValue(false),
  }
})

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  class MockServer {
    setRequestHandler(_schema: unknown, handler: (request: unknown) => unknown): void {
      if (!mockState.listHandler) {
        mockState.listHandler = handler
        return
      }
      mockState.callHandler = handler
    }

    async connect(_transport: unknown): Promise<void> {
      return
    }
  }

  return { Server: MockServer }
})

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  class MockStdioServerTransport {}
  return { StdioServerTransport: MockStdioServerTransport }
})

vi.mock('../src/search/index.js', () => {
  return {
    createSearchEngine: () => mockState.searchEngine,
    getSearchEngineDescription: () => 'mock-search-desc',
  }
})

vi.mock('../src/tools/web-fetch.js', () => {
  class MockWebFetch {
    fetch = mockState.webFetch
  }

  return {
    WebFetch: MockWebFetch,
    getWebFetchDescription: () => 'mock-web-fetch-desc',
  }
})

vi.mock('../src/context7/bridge.js', () => {
  class MockContext7Bridge {
    isEnabled(): boolean {
      return true
    }

    canHandleTool(name: string): boolean {
      return mockState.context7CanHandleTool(name)
    }

    async listTools() {
      return mockState.context7ListTools()
    }

    async callTool(params: unknown) {
      return mockState.context7CallTool(params)
    }
  }

  return { Context7Bridge: MockContext7Bridge }
})

import { startServer } from '../src/index.js'

describe('MCP Server Runtime', () => {
  const config: Config = {
    proxy: 'none',
    webSearch: 'duckduckgo',
    timeout: 30000,
    ignoreSSL: false,
  }

  beforeEach(() => {
    mockState.listHandler = undefined
    mockState.callHandler = undefined
    mockState.searchEngine.search.mockReset()
    mockState.webFetch.mockReset()
    mockState.context7ListTools.mockReset().mockResolvedValue([])
    mockState.context7CallTool.mockReset()
    mockState.context7CanHandleTool.mockReset().mockReturnValue(false)
  })

  it('should register tools and expose schemas', async () => {
    await startServer(config)

    expect(mockState.listHandler).toBeDefined()
    const listResult = (await mockState.listHandler!()) as {
      tools: Array<{ name: string; description: string }>
    }
    expect(listResult.tools.map((t) => t.name)).toEqual(['web_search', 'web_fetch'])
    expect(listResult.tools[0]?.description).toBe('mock-search-desc')
    expect(listResult.tools[1]?.description).toBe('mock-web-fetch-desc')
  })

  it('should merge Context7 tools into tool listing', async () => {
    mockState.context7ListTools.mockResolvedValue([
      {
        name: 'resolve-library-id',
        description: 'mock-context7-tool',
        inputSchema: { type: 'object' },
      },
    ])

    await startServer(config)
    const listResult = (await mockState.listHandler!()) as { tools: Array<{ name: string }> }

    expect(listResult.tools.map((tool) => tool.name)).toContain('resolve-library-id')
  })

  it('should route web_search calls to search engine', async () => {
    mockState.searchEngine.search.mockResolvedValue([
      { title: 'Result A', url: 'https://example.com/a', snippet: 'Snippet A' },
    ])

    await startServer(config)
    const response = (await mockState.callHandler!({
      params: {
        name: 'web_search',
        arguments: { query: 'hello', numResults: 1 },
      },
    })) as { content: Array<{ text: string }>; isError?: boolean }

    expect(mockState.searchEngine.search).toHaveBeenCalledWith({ query: 'hello', numResults: 1 })
    expect(response.isError).toBeUndefined()
    expect(response.content[0]?.text).toContain('**Result A**')
  })

  it('should route web_fetch calls and validate timeout bounds', async () => {
    mockState.webFetch.mockResolvedValue({
      title: 'Page Title',
      content: 'Page Content',
      url: 'https://example.com',
      contentType: 'text/html',
    })

    await startServer(config)

    const okResponse = (await mockState.callHandler!({
      params: {
        name: 'web_fetch',
        arguments: { url: 'https://example.com', format: 'text', timeout: 30 },
      },
    })) as { content: Array<{ text: string }>; isError?: boolean }

    expect(mockState.webFetch).toHaveBeenCalledWith({
      url: 'https://example.com',
      format: 'text',
      timeout: 30,
    })
    expect(okResponse.isError).toBeUndefined()

    const invalidResponse = (await mockState.callHandler!({
      params: {
        name: 'web_fetch',
        arguments: { url: 'https://example.com', timeout: 200 },
      },
    })) as { content: Array<{ text: string }>; isError?: boolean }

    expect(invalidResponse.isError).toBe(true)
    expect(invalidResponse.content[0]?.text).toMatch(/120/)
  })

  it('should return isError for unknown tools', async () => {
    await startServer(config)

    const response = (await mockState.callHandler!({
      params: {
        name: 'unknown_tool',
        arguments: {},
      },
    })) as { content: Array<{ text: string }>; isError?: boolean }

    expect(response.isError).toBe(true)
    expect(response.content[0]?.text).toContain('Unknown tool')
  })

  it('should forward Context7 tool calls', async () => {
    mockState.context7CanHandleTool.mockReturnValue(true)
    mockState.context7CallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'context7 result' }],
    })

    await startServer(config)
    const response = (await mockState.callHandler!({
      params: {
        name: 'resolve-library-id',
        arguments: { query: 'next', libraryName: 'next.js' },
      },
    })) as { content: Array<{ text: string }>; isError?: boolean }

    expect(mockState.context7CallTool).toHaveBeenCalledWith({
      name: 'resolve-library-id',
      arguments: { query: 'next', libraryName: 'next.js' },
    })
    expect(response.isError).toBeUndefined()
    expect(response.content[0]?.text).toBe('context7 result')
  })
})
