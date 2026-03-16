import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalArgv = [...process.argv]
const originalPlatform = process.platform
const originalTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

describe('CLI', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.argv = [...originalArgv]
    setPlatform(originalPlatform)
    if (originalTlsReject === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsReject
    }
  })

  afterEach(() => {
    process.argv = [...originalArgv]
    setPlatform(originalPlatform)
  })

  it('should parse startup options and invoke startServer', async () => {
    const startServer = vi.fn().mockResolvedValue(undefined)
    const loadConfigFromEnv = vi.fn((options: Record<string, unknown>) => ({
      proxy: options.proxy as string,
      webSearch: options.webSearch as 'duckduckgo' | 'exa' | 'bocha',
      bochaApiKey: options.bochaApiKey as string | undefined,
      timeout: options.timeout as number,
      ignoreSSL: options.ignoreSSL as boolean,
      context7: options.context7 as Record<string, unknown> | undefined,
    }))
    const validateConfig = vi.fn()
    const resolveProxyUrl = vi.fn().mockResolvedValue('http://127.0.0.1:7890')

    vi.doMock('../src/index.js', () => ({ startServer }))
    vi.doMock('../src/config.js', () => ({
      DEFAULT_CONTEXT7_CONFIG: { enabled: false, url: 'https://mcp.context7.com/mcp' },
      loadConfigFromEnv,
      validateConfig,
    }))
    vi.doMock('../src/proxy/index.js', () => ({ resolveProxyUrl }))
    vi.doMock('../src/proxy/windows.js', () => ({
      detectSystemProxy: vi.fn().mockResolvedValue(null),
      getWindowsProxySettings: vi.fn().mockResolvedValue({ enabled: false }),
    }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.argv = [
      'node',
      'cli.js',
      '--proxy',
      'system',
      '--web-search',
      'bocha',
      '--bocha-api-key',
      'secret-key',
      '--timeout',
      '15000',
      '--ignore-ssl',
    ]

    await import('../src/cli.js')
    await vi.waitFor(() => expect(startServer).toHaveBeenCalledTimes(1))

    expect(loadConfigFromEnv).toHaveBeenCalledWith({
      proxy: 'system',
      webSearch: 'bocha',
      bochaApiKey: 'secret-key',
      timeout: 15000,
      ignoreSSL: true,
      context7: {
        enabled: false,
        apiKey: undefined,
        url: undefined,
      },
    })
    expect(validateConfig).toHaveBeenCalledTimes(1)
    expect(resolveProxyUrl).toHaveBeenCalledWith('system')
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0')
    errorSpy.mockRestore()
  })

  it('should exit with code 1 when startup validation fails', async () => {
    const startServer = vi.fn().mockResolvedValue(undefined)
    const loadConfigFromEnv = vi.fn().mockReturnValue({
      proxy: 'none',
      webSearch: 'duckduckgo',
      timeout: 30000,
      ignoreSSL: false,
      context7: {
        enabled: false,
        url: 'https://mcp.context7.com/mcp',
      },
    })
    const validateConfig = vi.fn(() => {
      throw new Error('invalid config')
    })

    vi.doMock('../src/index.js', () => ({ startServer }))
    vi.doMock('../src/config.js', () => ({
      DEFAULT_CONTEXT7_CONFIG: { enabled: false, url: 'https://mcp.context7.com/mcp' },
      loadConfigFromEnv,
      validateConfig,
    }))
    vi.doMock('../src/proxy/index.js', () => ({ resolveProxyUrl: vi.fn() }))
    vi.doMock('../src/proxy/windows.js', () => ({
      detectSystemProxy: vi.fn().mockResolvedValue(null),
      getWindowsProxySettings: vi.fn().mockResolvedValue({ enabled: false }),
    }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => code as never) as never)

    process.argv = ['node', 'cli.js']

    await import('../src/cli.js')
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(1))
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(startServer).not.toHaveBeenCalled()
    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('should show proxy details in detect-proxy command on windows', async () => {
    setPlatform('win32')

    const detectSystemProxy = vi.fn().mockResolvedValue('http://127.0.0.1:7890')
    const getWindowsProxySettings = vi.fn().mockResolvedValue({
      enabled: true,
      server: '127.0.0.1:7890',
      bypass: '<local>',
    })

    vi.doMock('../src/index.js', () => ({ startServer: vi.fn() }))
    vi.doMock('../src/config.js', () => ({
      DEFAULT_CONTEXT7_CONFIG: { enabled: false, url: 'https://mcp.context7.com/mcp' },
      loadConfigFromEnv: vi.fn(),
      validateConfig: vi.fn(),
    }))
    vi.doMock('../src/proxy/index.js', () => ({ resolveProxyUrl: vi.fn() }))
    vi.doMock('../src/proxy/windows.js', () => ({
      detectSystemProxy,
      getWindowsProxySettings,
    }))

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.argv = ['node', 'cli.js', 'detect-proxy']

    await import('../src/cli.js')
    await vi.waitFor(() => expect(detectSystemProxy).toHaveBeenCalledTimes(1))

    const output = logSpy.mock.calls.flat().join('\n')
    expect(output).toContain('Windows Registry Proxy Settings:')
    expect(output).toContain('Detected system proxy')
    expect(getWindowsProxySettings).toHaveBeenCalledTimes(1)
    logSpy.mockRestore()
  })

  it('should run diagnose command end-to-end with mocked dependencies', async () => {
    const resolveProxyUrl = vi.fn().mockResolvedValue('http://127.0.0.1:7890')
    const getProxyAgent = vi.fn().mockResolvedValue({ fake: 'agent' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ origin: '1.2.3.4' }),
    })
    const searchMock = vi
      .fn()
      .mockResolvedValue([{ title: 'T', url: 'https://example.com', snippet: 'S' }])
    const webFetchMock = vi.fn().mockResolvedValue({
      title: 'Example Domain',
      content: 'example',
      url: 'https://www.163.com',
      contentType: 'text/html',
    })

    vi.doMock('../src/index.js', () => ({ startServer: vi.fn() }))
    vi.doMock('../src/config.js', () => ({
      DEFAULT_CONTEXT7_CONFIG: { enabled: false, url: 'https://mcp.context7.com/mcp' },
      loadConfigFromEnv: vi.fn(),
      validateConfig: vi.fn(),
    }))
    vi.doMock('../src/proxy/windows.js', () => ({
      detectSystemProxy: vi.fn().mockResolvedValue(null),
      getWindowsProxySettings: vi.fn().mockResolvedValue({ enabled: false }),
    }))
    vi.doMock('../src/proxy/index.js', () => ({ resolveProxyUrl, getProxyAgent }))
    vi.doMock('node-fetch', () => ({ default: fetchMock }))
    vi.doMock('../src/search/duckduckgo.js', () => ({
      DuckDuckGoSearch: class {
        search = searchMock
      },
    }))
    vi.doMock('../src/tools/web-fetch.js', () => ({
      WebFetch: class {
        fetch = webFetchMock
      },
    }))
    vi.doMock('../src/context7/bridge.js', () => ({
      Context7Bridge: class {
        listTools = vi.fn().mockResolvedValue([
          { name: 'resolve-library-id', inputSchema: { type: 'object' } },
          { name: 'query-docs', inputSchema: { type: 'object' } },
        ])
        getLastToolDiscoverySource = vi.fn().mockReturnValue('remote')
        callTool = vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        })
      },
    }))

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.argv = ['node', 'cli.js', 'diagnose', '--proxy', 'system']

    await import('../src/cli.js')
    await vi.waitFor(() => expect(webFetchMock).toHaveBeenCalledTimes(1))

    expect(resolveProxyUrl).toHaveBeenCalledWith('system')
    expect(getProxyAgent).toHaveBeenCalledWith('system', false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledWith({ query: 'test', numResults: 3 })
    expect(webFetchMock).toHaveBeenCalledWith({ url: 'https://www.163.com', format: 'text' })

    const output = logSpy.mock.calls.flat().join('\n')
    expect(output).toContain('Testing Context7')
    expect(output).toContain('Diagnostics complete!')
    logSpy.mockRestore()
  })

  it('should run diagnose Context7 check by default', async () => {
    const listToolsMock = vi.fn().mockResolvedValue([
      { name: 'resolve-library-id', inputSchema: { type: 'object' } },
      { name: 'query-docs', inputSchema: { type: 'object' } },
    ])
    const callToolMock = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    })

    vi.doMock('../src/index.js', () => ({ startServer: vi.fn() }))
    vi.doMock('../src/config.js', () => ({
      DEFAULT_CONTEXT7_CONFIG: { enabled: false, url: 'https://mcp.context7.com/mcp' },
      loadConfigFromEnv: vi.fn(),
      validateConfig: vi.fn(),
    }))
    vi.doMock('../src/proxy/windows.js', () => ({
      detectSystemProxy: vi.fn().mockResolvedValue(null),
      getWindowsProxySettings: vi.fn().mockResolvedValue({ enabled: false }),
    }))
    vi.doMock('../src/proxy/index.js', () => ({
      resolveProxyUrl: vi.fn().mockResolvedValue(null),
      getProxyAgent: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('node-fetch', () => ({
      default: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ origin: '1.2.3.4' }),
      }),
    }))
    vi.doMock('../src/search/duckduckgo.js', () => ({
      DuckDuckGoSearch: class {
        search = vi
          .fn()
          .mockResolvedValue([{ title: 'T', url: 'https://example.com', snippet: 'S' }])
      },
    }))
    vi.doMock('../src/tools/web-fetch.js', () => ({
      WebFetch: class {
        fetch = vi.fn().mockResolvedValue({
          title: 'Example Domain',
          content: 'example',
          url: 'https://example.com',
          contentType: 'text/html',
        })
      },
    }))
    vi.doMock('../src/context7/bridge.js', () => ({
      Context7Bridge: class {
        listTools = listToolsMock
        getLastToolDiscoverySource = vi.fn().mockReturnValue('remote')
        callTool = callToolMock
      },
    }))

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.argv = ['node', 'cli.js', 'diagnose', '--proxy', 'none']

    await import('../src/cli.js')
    await vi.waitFor(() => expect(callToolMock).toHaveBeenCalledTimes(1))

    const output = logSpy.mock.calls.flat().join('\n')
    expect(output).toContain('Testing Context7')
    expect(output).toContain('Context7 tool call successful')
    logSpy.mockRestore()
  })

  it('should show a warning when Context7 discovery falls back to built-in metadata', async () => {
    const listToolsMock = vi.fn().mockResolvedValue([
      { name: 'resolve-library-id', inputSchema: { type: 'object' } },
      { name: 'query-docs', inputSchema: { type: 'object' } },
    ])
    const callToolMock = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    })

    vi.doMock('../src/index.js', () => ({ startServer: vi.fn() }))
    vi.doMock('../src/config.js', () => ({
      DEFAULT_CONTEXT7_CONFIG: { enabled: false, url: 'https://mcp.context7.com/mcp' },
      loadConfigFromEnv: vi.fn(),
      validateConfig: vi.fn(),
    }))
    vi.doMock('../src/proxy/windows.js', () => ({
      detectSystemProxy: vi.fn().mockResolvedValue(null),
      getWindowsProxySettings: vi.fn().mockResolvedValue({ enabled: false }),
    }))
    vi.doMock('../src/proxy/index.js', () => ({
      resolveProxyUrl: vi.fn().mockResolvedValue(null),
      getProxyAgent: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('node-fetch', () => ({
      default: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ origin: '1.2.3.4' }),
      }),
    }))
    vi.doMock('../src/search/duckduckgo.js', () => ({
      DuckDuckGoSearch: class {
        search = vi
          .fn()
          .mockResolvedValue([{ title: 'T', url: 'https://example.com', snippet: 'S' }])
      },
    }))
    vi.doMock('../src/tools/web-fetch.js', () => ({
      WebFetch: class {
        fetch = vi.fn().mockResolvedValue({
          title: 'Example Domain',
          content: 'example',
          url: 'https://example.com',
          contentType: 'text/html',
        })
      },
    }))
    vi.doMock('../src/context7/bridge.js', () => ({
      Context7Bridge: class {
        listTools = listToolsMock
        getLastToolDiscoverySource = vi.fn().mockReturnValue('fallback')
        callTool = callToolMock
      },
    }))

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.argv = ['node', 'cli.js', 'diagnose', '--proxy', 'none']

    await import('../src/cli.js')
    await vi.waitFor(() => expect(callToolMock).toHaveBeenCalledTimes(1))

    const output = logSpy.mock.calls.flat().join('\n')
    expect(output).toContain('fell back to built-in metadata')
    expect(output).toContain('Context7 tool call successful')
    logSpy.mockRestore()
  })
})
