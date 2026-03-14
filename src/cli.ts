// Check for --ignore-ssl flag early, before any imports
if (process.argv.includes('--ignore-ssl')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

import { createRequire } from 'module'
import { Command } from 'commander'
import { startServer } from './index.js'
import {
  DEFAULT_CONTEXT7_CONFIG,
  loadConfigFromEnv,
  validateConfig,
  type Config,
  type SearchEngine,
} from './config.js'
import { Context7Bridge } from './context7/bridge.js'
import { resolveProxyUrl } from './proxy/index.js'
import { detectSystemProxy } from './proxy/windows.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

interface CliOptions {
  proxy: string
  webSearch: string
  bochaApiKey?: string
  timeout: string
  ignoreSsl: boolean
  context7: boolean
  context7ApiKey?: string
  context7Url?: string
}

function hasCliFlag(...flags: string[]): boolean {
  return flags.some(flag => process.argv.includes(flag))
}

function getCliOptionValue(flags: string[], fallback?: string): string | undefined {
  for (const flag of flags) {
    const index = process.argv.indexOf(flag)
    if (index !== -1) {
      const value = process.argv[index + 1]
      if (value && !value.startsWith('-')) {
        return value
      }
    }
  }

  return fallback
}

const program = new Command()

program
  .name('web-bridge-mcp')
  .description(
    'MCP Server with proxy support for web search and fetch - Bridge intranet to internet'
  )
  .version(version)
  .option('-p, --proxy <proxy>', '代理设置: system | none | http://host:port', 'none')
  .option('--web-search <engine>', '搜索引擎: duckduckgo | exa | bocha', 'duckduckgo')
  .option('--bocha-api-key <key>', '博查 AI API Key (建议使用环境变量 BOCHA_API_KEY)')
  .option('-t, --timeout <ms>', '请求超时时间(毫秒)', '30000')
  .option('--ignore-ssl', '忽略 SSL 证书校验 (解决代理证书问题)', false)
  .option('--context7', '启用官方 Context7 MCP 透传', false)
  .option('--context7-api-key <key>', 'Context7 API Key (可选，提高限额)')
  .option('--context7-url <url>', 'Context7 MCP URL')
  .action(async (options: CliOptions) => {
    try {
      const context7Enabled =
        options.context7 ||
        Boolean(options.context7ApiKey) ||
        process.argv.includes('--context7-url')

      const config: Config = loadConfigFromEnv({
        proxy: options.proxy,
        webSearch: options.webSearch as SearchEngine,
        bochaApiKey: options.bochaApiKey,
        timeout: parseInt(options.timeout, 10),
        ignoreSSL: options.ignoreSsl,
        context7: {
          enabled: context7Enabled,
          apiKey: options.context7ApiKey,
          url: options.context7Url,
        },
      })

      // Validate config
      validateConfig(config)

      // Display startup info
      console.error('========================================')
      console.error('  Web Bridge MCP Server')
      console.error('========================================')
      console.error(`Search Engine: ${config.webSearch}`)
      console.error(`Proxy: ${config.proxy}`)

      // If system proxy, show detected proxy address
      if (config.proxy === 'system') {
        const proxyUrl = await resolveProxyUrl(config.proxy)
        if (proxyUrl) {
          console.error(`System Proxy: ${proxyUrl}`)
        } else {
          console.error('System Proxy: Not detected')
        }
      }

      console.error(`Timeout: ${config.timeout}ms`)
      console.error(`Ignore SSL: ${config.ignoreSSL ? 'Yes' : 'No'}`)
      console.error(`Context7: ${config.context7?.enabled ? 'Enabled' : 'Disabled'}`)

      if (config.context7?.enabled) {
        console.error(`Context7 URL: ${config.context7.url}`)
        console.error(
          `Context7 Auth: ${config.context7.apiKey ? 'API Key configured' : 'Anonymous'}`
        )
      }

      // Security warning
      if (config.ignoreSSL) {
        console.error('')
        console.error('⚠️  WARNING: SSL certificate verification is disabled!')
        console.error(
          '   This may lead to man-in-the-middle attack risks. Use only in trusted networks.'
        )
      }

      if (options.bochaApiKey) {
        console.error('')
        console.error('⚠️  TIP: API Keys passed via command line are visible in process list.')
        console.error('   Recommend using environment variables: BOCHA_API_KEY')
      }

      if (options.context7ApiKey) {
        console.error('')
        console.error('⚠️  TIP: API Keys passed via command line are visible in process list.')
        console.error('   Recommend using environment variables: CONTEXT7_API_KEY')
      }

      console.error('----------------------------------------')
      console.error('')

      // Start MCP Server
      await startServer(config)
    } catch (error) {
      console.error('Startup failed:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

// 添加检测代理的子命令
program
  .command('detect-proxy')
  .description('Detect system proxy settings')
  .action(async () => {
    console.log('Detecting system proxy settings...')
    console.log(`Operating System: ${process.platform}`)
    console.log('')

    if (process.platform === 'win32') {
      // Windows detailed detection
      const { getWindowsProxySettings } = await import('./proxy/windows.js')
      const settings = await getWindowsProxySettings()

      console.log('Windows Registry Proxy Settings:')
      console.log(`  ProxyEnable: ${settings.enabled ? '1 (Enabled)' : '0 (Disabled)'}`)
      console.log(`  ProxyServer: ${settings.server || '(Not set)'}`)
      console.log(`  ProxyOverride: ${settings.bypass || '(Not set)'}`)
      console.log('')
    }

    // Check environment variables
    console.log('Environment Variable Proxy Settings:')
    console.log(`  HTTPS_PROXY: ${process.env.HTTPS_PROXY || '(Not set)'}`)
    console.log(`  https_proxy: ${process.env.https_proxy || '(Not set)'}`)
    console.log(`  HTTP_PROXY: ${process.env.HTTP_PROXY || '(Not set)'}`)
    console.log(`  http_proxy: ${process.env.http_proxy || '(Not set)'}`)
    console.log('')

    const proxyUrl = await detectSystemProxy()
    if (proxyUrl) {
      console.log(`✓ Detected system proxy: ${proxyUrl}`)
    } else {
      console.log('✗ No system proxy detected')
      console.log('')
      console.log('Tips: If your system has proxy configured, please check:')
      console.log('  1. Windows: Settings -> Network & Internet -> Proxy')
      console.log('  2. Or use command line: --proxy http://host:port')
      console.log('  3. Or set environment variable: $env:HTTPS_PROXY="http://host:port"')
    }
  })

// Add diagnose command
program
  .command('diagnose')
  .description('Diagnose proxy connection and test internet access')
  .option('-p, --proxy <proxy>', 'Proxy setting: system | none | http://host:port', 'system')
  .option('--ignore-ssl', 'Ignore SSL certificate verification', false)
  .option('--context7', 'Test Context7 connectivity', false)
  .option('--context7-api-key <key>', 'Context7 API Key (optional)')
  .option('--context7-url <url>', 'Context7 MCP URL', DEFAULT_CONTEXT7_CONFIG.url)
  .action(
    async (options: {
      proxy: string
      ignoreSsl: boolean
      context7: boolean
      context7ApiKey?: string
      context7Url: string
    }) => {
      const diagnoseOptions = {
        proxy: getCliOptionValue(['--proxy', '-p'], options.proxy) || options.proxy,
        ignoreSsl: options.ignoreSsl || hasCliFlag('--ignore-ssl'),
        context7: options.context7 || hasCliFlag('--context7'),
        context7ApiKey: getCliOptionValue(['--context7-api-key'], options.context7ApiKey),
        context7Url:
          getCliOptionValue(['--context7-url'], options.context7Url) || options.context7Url,
      }
      const totalSteps = diagnoseOptions.context7 ? 5 : 4

      console.log('========================================')
      console.log('  Proxy Connection Diagnostics')
      console.log('========================================')
      console.log('')

      // Security warning for SSL ignore
      if (diagnoseOptions.ignoreSsl) {
        console.log('⚠️  WARNING: SSL certificate verification is disabled!')
        console.log('   This may lead to man-in-the-middle attack risks.')
        console.log('')
      }

      // Step 1: Detect proxy
      console.log(`[1/${totalSteps}] Detecting proxy settings...`)
      let proxyUrl: string | null = null
      try {
        proxyUrl = await resolveProxyUrl(diagnoseOptions.proxy)
        if (proxyUrl) {
          console.log(`✓ Proxy detected: ${proxyUrl}`)
        } else if (diagnoseOptions.proxy === 'none') {
          console.log('✓ Direct connection (no proxy)')
        } else {
          console.log('✗ No proxy configured')
          if (diagnoseOptions.proxy === 'system') {
            console.log('  Tip: Set proxy manually with --proxy http://host:port')
          }
        }
      } catch (error) {
        console.log(
          `✗ Failed to detect proxy: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      console.log('')

      // Step 2: Test proxy connection
      console.log(`[2/${totalSteps}] Testing proxy connection...`)
      try {
        const { getProxyAgent } = await import('./proxy/index.js')
        const agent = await getProxyAgent(diagnoseOptions.proxy, diagnoseOptions.ignoreSsl)
        const nodeFetch = (await import('node-fetch')).default

        const testUrl = 'https://httpbin.org/ip'
        console.log(`  Testing URL: ${testUrl}`)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        try {
          const startTime = Date.now()
          const response = await nodeFetch(testUrl, {
            agent,
            headers: { 'User-Agent': 'web-bridge-mcp-diagnostics' },
            signal: controller.signal,
          })
          const duration = Date.now() - startTime
          clearTimeout(timeoutId)

          if (response.ok) {
            const data = (await response.json()) as { origin: string }
            console.log(`✓ Connection successful (${duration}ms)`)
            console.log(`  Your IP: ${data.origin}`)
          } else {
            console.log(`✗ Connection failed: HTTP ${response.status}`)
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.log(`✗ Connection timeout (>10s)`)
          } else {
            console.log(
              `✗ Connection failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
            )
          }
          if (diagnoseOptions.ignoreSsl) {
            console.log('  Note: SSL verification is disabled')
          } else {
            console.log('  Tip: Try --ignore-ssl if you have certificate issues')
          }
        }
      } catch (error) {
        console.log(
          `✗ Failed to initialize proxy: ${error instanceof Error ? error.message : String(error)}`
        )
        console.log('  Check your proxy URL format (e.g., http://host:port)')
      }
      console.log('')

      // Step 3: Test search
      console.log(`[3/${totalSteps}] Testing web search...`)
      try {
        const { DuckDuckGoSearch } = await import('./search/duckduckgo.js')
        const search = new DuckDuckGoSearch(diagnoseOptions.proxy, 30000, diagnoseOptions.ignoreSsl)

        const startTime = Date.now()
        const results = await search.search({ query: 'test', numResults: 3 })
        const duration = Date.now() - startTime

        if (results.length > 0) {
          console.log(`✓ Search successful (${duration}ms)`)
          console.log(`  Found ${results.length} results`)
        } else {
          console.log(`⚠ Search returned no results`)
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('timeout')) {
            console.log(`✗ Search timeout: ${error.message}`)
          } else if (error.message.includes('failed') || error.message.includes('HTTP')) {
            console.log(`✗ Search connection failed: ${error.message}`)
          } else {
            console.log(`✗ Search failed: ${error.message}`)
          }
        } else {
          console.log(`✗ Search failed: ${String(error)}`)
        }
      }
      console.log('')

      // Step 4: Test web fetch
      console.log(`[4/${totalSteps}] Testing web fetch...`)
      try {
        const { WebFetch } = await import('./tools/web-fetch.js')
        const webFetch = new WebFetch({
          proxy: diagnoseOptions.proxy,
          timeout: 30000,
          ignoreSSL: diagnoseOptions.ignoreSsl,
          webSearch: 'duckduckgo',
        })

        const testUrl = 'https://www.163.com'
        console.log(`  Fetching: ${testUrl}`)

        const startTime = Date.now()
        const result = await webFetch.fetch({ url: testUrl, format: 'text' })
        const duration = Date.now() - startTime

        console.log(`✓ Fetch successful (${duration}ms)`)
        console.log(`  Title: ${result.title}`)
        console.log(`  Content length: ${result.content.length} chars`)
      } catch (error) {
        if (error instanceof Error) {
          console.log(`✗ Fetch failed: ${error.message}`)
        } else {
          console.log(`✗ Fetch failed: ${String(error)}`)
        }
      }
      console.log('')

      if (diagnoseOptions.context7) {
        console.log(`[5/${totalSteps}] Testing Context7...`)
        try {
          const context7Bridge = new Context7Bridge({
            proxy: diagnoseOptions.proxy,
            timeout: 30000,
            ignoreSSL: diagnoseOptions.ignoreSsl,
            webSearch: 'duckduckgo',
            context7: {
              enabled: true,
              apiKey: diagnoseOptions.context7ApiKey,
              url: diagnoseOptions.context7Url,
            },
          })

          const tools = await context7Bridge.listTools()
          console.log(`✓ Context7 tool discovery successful`)
          console.log(`  Found ${tools.length} tools`)

          const startTime = Date.now()
          const result = await context7Bridge.callTool({
            name: 'resolve-library-id',
            arguments: {
              query: 'Node.js HTTP server setup',
              libraryName: 'node',
            },
          })
          const duration = Date.now() - startTime

          console.log(`✓ Context7 tool call successful (${duration}ms)`)
          console.log(
            `  Blocks returned: ${'content' in result && Array.isArray(result.content) ? result.content.length : 0}`
          )
        } catch (error) {
          if (error instanceof Error) {
            console.log(`✗ Context7 failed: ${error.message}`)
          } else {
            console.log(`✗ Context7 failed: ${String(error)}`)
          }
        }
        console.log('')
      }

      console.log('========================================')
      console.log('Diagnostics complete!')
      console.log('========================================')
    }
  )

program.parse()
