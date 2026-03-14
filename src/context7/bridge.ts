import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { CallToolRequest, Tool } from '@modelcontextprotocol/sdk/types.js'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import type { Config } from '../config.js'
import { DEFAULT_CONTEXT7_CONFIG } from '../config.js'
import { resolveProxyUrl } from '../proxy/index.js'

type Context7CallToolResult = Awaited<ReturnType<Client['callTool']>>

const FALLBACK_CONTEXT7_TOOL_NAMES = new Set(['resolve-library-id', 'query-docs'])

function mergeAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined)

  if (activeSignals.length === 0) {
    return undefined
  }

  if (activeSignals.length === 1) {
    return activeSignals[0]
  }

  const controller = new AbortController()

  const abort = (signal: AbortSignal): void => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason)
    }
  }

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal)
      break
    }

    signal.addEventListener('abort', () => abort(signal), { once: true })
  }

  return controller.signal
}

export class Context7Bridge {
  private readonly enabled: boolean
  private readonly url: string
  private readonly apiKey?: string
  private readonly proxy: string
  private readonly timeout: number
  private readonly ignoreSSL: boolean

  private client: Client | null = null
  private transport: StreamableHTTPClientTransport | null = null
  private connectPromise: Promise<void> | null = null
  private cachedTools: Tool[] = []
  private readonly knownToolNames = new Set(FALLBACK_CONTEXT7_TOOL_NAMES)
  private dispatcher: Dispatcher | null = null

  constructor(config: Config) {
    const context7 = config.context7 ?? DEFAULT_CONTEXT7_CONFIG

    this.enabled = context7.enabled
    this.url = context7.url
    this.apiKey = context7.apiKey
    this.proxy = config.proxy
    this.timeout = config.timeout
    this.ignoreSSL = config.ignoreSSL
  }

  isEnabled(): boolean {
    return this.enabled
  }

  canHandleTool(name: string): boolean {
    return this.enabled && this.knownToolNames.has(name)
  }

  async listTools(): Promise<Tool[]> {
    if (!this.enabled) {
      return []
    }

    try {
      await this.ensureConnected()
      const tools = (await this.client!.listTools()).tools
      this.cacheTools(tools)
      return tools
    } catch (error) {
      console.error(
        `[Context7] Failed to list remote tools: ${error instanceof Error ? error.message : String(error)}`
      )
      return this.cachedTools
    }
  }

  async callTool(params: CallToolRequest['params']): Promise<Context7CallToolResult> {
    if (!this.enabled) {
      throw new Error('Context7 bridge is disabled')
    }

    return this.withReconnect(async () => {
      const result = await this.client!.callTool(params)
      return result
    })
  }

  async close(): Promise<void> {
    await this.invalidateConnection()
  }

  private async withReconnect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureConnected()
      return await operation()
    } catch (error) {
      await this.invalidateConnection()
      await this.ensureConnected()
      return operation()
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.enabled) {
      return
    }

    if (this.client && this.transport) {
      return
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connect()
    }

    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      fetch: this.createFetch(),
    })
    transport.onerror = (error) => {
      console.error(
        `[Context7] Remote transport error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    transport.onclose = () => {
      this.client = null
      this.transport = null
    }

    const client = new Client({
      name: 'web-bridge-mcp',
      version: '1.0.0',
    })

    await client.connect(transport)

    this.client = client
    this.transport = transport
  }

  private cacheTools(tools: Tool[]): void {
    this.cachedTools = tools
    this.knownToolNames.clear()

    for (const fallbackToolName of FALLBACK_CONTEXT7_TOOL_NAMES) {
      this.knownToolNames.add(fallbackToolName)
    }

    for (const tool of tools) {
      this.knownToolNames.add(tool.name)
    }
  }

  private async invalidateConnection(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close()
      } catch (error) {
        console.error(
          `[Context7] Failed to close remote transport: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    if (this.dispatcher) {
      try {
        await this.dispatcher.close()
      } catch (error) {
        console.error(
          `[Context7] Failed to close dispatcher: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    this.client = null
    this.transport = null
    this.dispatcher = null
  }

  private createFetch(): FetchLike {
    return async (input, init) => {
      const headers = new Headers(init?.headers)

      if (this.apiKey && !headers.has('CONTEXT7_API_KEY')) {
        headers.set('CONTEXT7_API_KEY', this.apiKey)
      }

      const timeoutSignal = AbortSignal.timeout(this.timeout)
      const signal = mergeAbortSignals([init?.signal ?? undefined, timeoutSignal])
      const dispatcher = await this.getDispatcher()

      return fetch(input, {
        ...init,
        headers,
        signal,
        dispatcher,
      } as RequestInit & { dispatcher?: Dispatcher })
    }
  }

  private async getDispatcher(): Promise<Dispatcher | undefined> {
    if (this.dispatcher) {
      return this.dispatcher
    }

    const proxyUrl = await resolveProxyUrl(this.proxy)

    if (proxyUrl) {
      this.dispatcher = new ProxyAgent({
        uri: proxyUrl,
        requestTls: {
          rejectUnauthorized: !this.ignoreSSL,
        },
        proxyTls: {
          rejectUnauthorized: !this.ignoreSSL,
        },
      })
      return this.dispatcher
    }

    if (this.ignoreSSL) {
      this.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      })
      return this.dispatcher
    }

    return undefined
  }
}
