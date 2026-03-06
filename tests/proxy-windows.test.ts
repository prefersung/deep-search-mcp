import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalPlatform = process.platform
const originalEnv = {
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  https_proxy: process.env.https_proxy,
  HTTP_PROXY: process.env.HTTP_PROXY,
  http_proxy: process.env.http_proxy,
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

async function loadWindowsModule(execAsyncMock: ReturnType<typeof vi.fn>) {
  vi.resetModules()
  vi.doMock('util', () => ({
    promisify: vi.fn(() => execAsyncMock),
  }))
  vi.doMock('child_process', () => ({
    exec: vi.fn(),
  }))
  return import('../src/proxy/windows.js')
}

describe('Windows Proxy Detection', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setPlatform(originalPlatform)
    process.env.HTTPS_PROXY = originalEnv.HTTPS_PROXY
    process.env.https_proxy = originalEnv.https_proxy
    process.env.HTTP_PROXY = originalEnv.HTTP_PROXY
    process.env.http_proxy = originalEnv.http_proxy
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    process.env.HTTPS_PROXY = originalEnv.HTTPS_PROXY
    process.env.https_proxy = originalEnv.https_proxy
    process.env.HTTP_PROXY = originalEnv.HTTP_PROXY
    process.env.http_proxy = originalEnv.http_proxy
  })

  it('should return disabled settings on non-windows', async () => {
    setPlatform('linux')
    const execAsyncMock = vi.fn().mockResolvedValue({ stdout: '' })
    const windows = await loadWindowsModule(execAsyncMock)

    const settings = await windows.getWindowsProxySettings()
    expect(settings).toEqual({ enabled: false })
    expect(execAsyncMock).not.toHaveBeenCalled()
  })

  it('should parse registry output on windows', async () => {
    setPlatform('win32')
    const stdout = [
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '    ProxyEnable    REG_DWORD    0x1',
      '    ProxyServer    REG_SZ    127.0.0.1:7890',
      '    ProxyOverride  REG_SZ    <local>',
      '',
    ].join('\n')
    const execAsyncMock = vi.fn().mockResolvedValue({ stdout })
    const windows = await loadWindowsModule(execAsyncMock)

    const settings = await windows.getWindowsProxySettings()
    expect(settings).toEqual({
      enabled: true,
      server: '127.0.0.1:7890',
      bypass: '<local>',
    })
    expect(execAsyncMock).toHaveBeenCalledTimes(1)
  })

  it('should normalize compound proxy server format to https entry', async () => {
    setPlatform('win32')
    const stdout = [
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '    ProxyEnable    REG_DWORD    0x1',
      '    ProxyServer    REG_SZ    http=proxy-http:8080;https=proxy-https:8443',
      '',
    ].join('\n')
    const execAsyncMock = vi.fn().mockResolvedValue({ stdout })
    const windows = await loadWindowsModule(execAsyncMock)

    const proxyUrl = await windows.getWindowsProxyUrl()
    expect(proxyUrl).toBe('http://proxy-https:8443')
  })

  it('should fall back to env vars on non-windows', async () => {
    setPlatform('darwin')
    process.env.HTTPS_PROXY = 'http://upper-https:9999'
    process.env.https_proxy = 'http://lower-https:9999'
    process.env.HTTP_PROXY = 'http://upper-http:9999'
    process.env.http_proxy = 'http://lower-http:9999'

    const execAsyncMock = vi.fn().mockResolvedValue({ stdout: '' })
    const windows = await loadWindowsModule(execAsyncMock)

    const proxyUrl = await windows.detectSystemProxy()
    expect(proxyUrl).toBe('http://upper-https:9999')
  })

  it('should return null when registry query fails on windows', async () => {
    setPlatform('win32')
    const execAsyncMock = vi.fn().mockRejectedValue(new Error('reg query failed'))
    const windows = await loadWindowsModule(execAsyncMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const settings = await windows.getWindowsProxySettings()
    const proxyUrl = await windows.getWindowsProxyUrl()
    const detected = await windows.detectSystemProxy()

    expect(settings).toEqual({ enabled: false })
    expect(proxyUrl).toBeNull()
    expect(detected).toBeNull()
    errorSpy.mockRestore()
  })
})
