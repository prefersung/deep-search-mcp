/**
 * Windows 系统代理检测
 * 通过读取注册表获取系统代理设置
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface WindowsProxySettings {
  enabled: boolean
  server?: string
  bypass?: string
}

/**
 * 检测是否运行在 Windows 上
 */
export function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * 获取 Windows 系统代理设置
 * 通过注册表查询
 */
export async function getWindowsProxySettings(): Promise<WindowsProxySettings> {
  if (!isWindows()) {
    return { enabled: false }
  }

  try {
    // Query registry for proxy settings (query all values at once)
    const { stdout } = await execAsync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"',
      { encoding: 'utf8' }
    )

    // Output raw registry content for debugging
    if (process.env.DEBUG_PROXY) {
      console.error('[Proxy] Raw registry output:')
      console.error(stdout)
      console.error('[Proxy] ---')
    }

    const settings: WindowsProxySettings = { enabled: false }

    // Parse ProxyEnable
    const enableMatch = stdout.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
    if (enableMatch) {
      settings.enabled = parseInt(enableMatch[1], 16) === 1
    }

    // Parse ProxyServer
    const serverMatch = stdout.match(/ProxyServer\s+REG_SZ\s+(.+?)(?:\r?\n|$)/)
    if (serverMatch) {
      settings.server = serverMatch[1].trim()
    }

    // Parse ProxyOverride (bypass list)
    const bypassMatch = stdout.match(/ProxyOverride\s+REG_SZ\s+(.+?)(?:\r?\n|$)/)
    if (bypassMatch) {
      settings.bypass = bypassMatch[1].trim()
    }

    return settings
  } catch (error) {
    // Registry query failed
    console.error('[Proxy] Windows registry query failed:', error instanceof Error ? error.message : error)
    return { enabled: false }
  }
}

/**
 * 获取 Windows 系统代理 URL
 * 返回格式: http://host:port
 */
export async function getWindowsProxyUrl(): Promise<string | null> {
  const settings = await getWindowsProxySettings()

  if (!settings.enabled || !settings.server) {
    return null
  }

  // 处理代理服务器地址
  // 可能的格式: "host:port" 或 "http=host:port;https=host:port"
  let proxyUrl = settings.server

  // 如果包含协议分隔符，提取 https 或 http 代理
  if (proxyUrl.includes('=')) {
    // 尝试提取 https 代理
    const httpsMatch = proxyUrl.match(/https=([^;]+)/)
    if (httpsMatch) {
      proxyUrl = httpsMatch[1]
    } else {
      // 尝试提取 http 代理
      const httpMatch = proxyUrl.match(/http=([^;]+)/)
      if (httpMatch) {
        proxyUrl = httpMatch[1]
      }
    }
  }

  // 确保有协议前缀
  if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
    proxyUrl = `http://${proxyUrl}`
  }

  return proxyUrl
}

/**
 * 检测系统代理 (跨平台)
 * 目前只支持 Windows，后续可扩展 macOS/Linux
 */
export async function detectSystemProxy(): Promise<string | null> {
  if (isWindows()) {
    return getWindowsProxyUrl()
  }

  // macOS/Linux 从环境变量获取（支持大小写）
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  )
}
