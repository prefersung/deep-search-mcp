import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  return {
    clientListTools: vi.fn(),
    clientCallTool: vi.fn(),
    transportClose: vi.fn(),
    resolveProxyUrl: vi.fn(),
    globalFetch: vi.fn(),
    dispatcherClose: vi.fn(),
    lastTransport:
      null as null | { url: URL; opts?: { fetch?: (input: unknown, init?: unknown) => Promise<unknown> } },
  }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class MockClient {
    async connect(_transport: unknown): Promise<void> {
      return
    }

    async listTools() {
      return mockState.clientListTools()
    }

    async callTool(params: unknown) {
      return mockState.clientCallTool(params)
    }
  }

  return { Client: MockClient }
})

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  class MockStreamableHTTPClientTransport {
    onclose?: () => void
    onerror?: (error: Error) => void

    constructor(url: URL, opts?: { fetch?: (input: unknown, init?: unknown) => Promise<unknown> }) {
      mockState.lastTransport = { url, opts }
    }

    async close(): Promise<void> {
      mockState.transportClose()
      this.onclose?.()
    }
  }

  return { StreamableHTTPClientTransport: MockStreamableHTTPClientTransport }
})

vi.mock('../src/proxy/index.js', () => ({
  resolveProxyUrl: mockState.resolveProxyUrl,
}))

vi.mock('undici', () => {
  class MockAgent {
    async close(): Promise<void> {
      mockState.dispatcherClose()
    }
  }

  class MockProxyAgent extends MockAgent {
    constructor(public readonly options: unknown) {
      super()
    }
  }

  return {
    Agent: MockAgent,
    ProxyAgent: MockProxyAgent,
  }
})

import { Context7Bridge } from '../src/context7/bridge.js'

describe('Context7Bridge', () => {
  beforeEach(() => {
    mockState.clientListTools.mockReset()
    mockState.clientCallTool.mockReset()
    mockState.transportClose.mockReset()
    mockState.resolveProxyUrl.mockReset().mockResolvedValue('http://proxy.example.com:8080')
    mockState.globalFetch.mockReset().mockResolvedValue(new Response('ok'))
    mockState.dispatcherClose.mockReset()
    mockState.lastTransport = null
    vi.stubGlobal('fetch', mockState.globalFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return no tools when bridge is disabled', async () => {
    const bridge = new Context7Bridge({
      proxy: 'none',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: 'duckduckgo',
      context7: {
        enabled: false,
        url: 'https://mcp.context7.com/mcp',
      },
    })

    await expect(bridge.listTools()).resolves.toEqual([])
    expect(bridge.canHandleTool('resolve-library-id')).toBe(false)
    expect(mockState.clientListTools).not.toHaveBeenCalled()
  })

  it('should list remote tools and mark them as handled', async () => {
    mockState.clientListTools.mockResolvedValue({
      tools: [
        {
          name: 'resolve-library-id',
          description: 'Resolve library',
          inputSchema: { type: 'object' },
        },
        {
          name: 'query-docs',
          description: 'Query docs',
          inputSchema: { type: 'object' },
        },
      ],
    })

    const bridge = new Context7Bridge({
      proxy: 'system',
      timeout: 30000,
      ignoreSSL: true,
      webSearch: 'duckduckgo',
      context7: {
        enabled: true,
        apiKey: 'ctx7sk_test',
        url: 'https://mcp.context7.com/mcp',
      },
    })

    const tools = await bridge.listTools()

    expect(tools).toHaveLength(2)
    expect(bridge.canHandleTool('resolve-library-id')).toBe(true)
    expect(bridge.canHandleTool('query-docs')).toBe(true)
    expect(tools[0]?.description).toContain('Official Context7 library resolver')
    expect(tools[1]?.description).toContain('Official Context7 documentation query tool')
    expect(mockState.lastTransport?.url.href).toBe('https://mcp.context7.com/mcp')

    const transportFetch = mockState.lastTransport?.opts?.fetch
    expect(transportFetch).toBeDefined()

    await transportFetch?.('https://example.com', {
      headers: {
        Accept: 'application/json',
      },
    })

    expect(mockState.resolveProxyUrl).toHaveBeenCalledWith('system')
    expect(mockState.globalFetch).toHaveBeenCalledTimes(1)

    const fetchOptions = mockState.globalFetch.mock.calls[0]?.[1] as {
      headers: Headers
      dispatcher: { options: { uri: string } }
    }
    expect(fetchOptions.headers.get('CONTEXT7_API_KEY')).toBe('ctx7sk_test')
    expect(fetchOptions.dispatcher.options.uri).toBe('http://proxy.example.com:8080')
  })

  it('should fall back to built-in tool definitions when discovery fails', async () => {
    const logger = {
      error: vi.fn(),
    }

    mockState.clientListTools.mockRejectedValue(new Error('network down'))

    const bridge = new Context7Bridge(
      {
        proxy: 'none',
        timeout: 30000,
        ignoreSSL: false,
        webSearch: 'duckduckgo',
        context7: {
          enabled: true,
          url: 'https://mcp.context7.com/mcp',
        },
      },
      logger
    )

    const tools = await bridge.listTools()

    expect(mockState.clientListTools).toHaveBeenCalledTimes(2)
    expect(tools.map(tool => tool.name)).toEqual(['resolve-library-id', 'query-docs'])
    expect(tools[0]?.description).toContain('Prefer this over web_search')
    expect(tools[1]?.description).toContain('Prefer this over web_search/web_fetch')
    expect(tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      required: ['query', 'libraryName'],
    })
    expect(logger.error).toHaveBeenCalledWith(
      '[Context7] Failed to list remote tools: network down'
    )
  })

  it('should reconnect and retry when remote call fails once', async () => {
    mockState.clientCallTool
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
      })

    const bridge = new Context7Bridge({
      proxy: 'none',
      timeout: 30000,
      ignoreSSL: false,
      webSearch: 'duckduckgo',
      context7: {
        enabled: true,
        url: 'https://mcp.context7.com/mcp',
      },
    })

    const result = await bridge.callTool({
      name: 'resolve-library-id',
      arguments: {
        query: 'next auth',
        libraryName: 'next.js',
      },
    })

    expect(mockState.clientCallTool).toHaveBeenCalledTimes(2)
    expect(mockState.transportClose).toHaveBeenCalledTimes(1)
    const typedResult = result as { content?: Array<{ type: string }> }
    expect(typedResult.content?.[0]?.type).toBe('text')
  })
})
