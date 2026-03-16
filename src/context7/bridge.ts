import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { CallToolRequest, Tool } from '@modelcontextprotocol/sdk/types.js'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import type { Config } from '../config.js'
import { DEFAULT_CONTEXT7_CONFIG } from '../config.js'
import { resolveProxyUrl } from '../proxy/index.js'

type Context7CallToolResult = Awaited<ReturnType<Client['callTool']>>
export interface Context7Logger {
  error(message: string): void
}

export type Context7ToolDiscoverySource = 'remote' | 'fallback'

const FALLBACK_CONTEXT7_TOOLS: Tool[] = [
  {
    name: 'resolve-library-id',
    description:
      'Official Context7 library resolver. Use this first for library, framework, SDK, API, installation, configuration, migration, and code example questions instead of generic web search. Resolves a package or framework name to a Context7-compatible library ID for follow-up documentation queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The task, topic, or problem you want to solve.',
        },
        libraryName: {
          type: 'string',
          description: 'The library or package name to resolve.',
        },
      },
      required: ['query', 'libraryName'],
    },
  },
  {
    name: 'query-docs',
    description:
      'Official Context7 documentation query tool. Use this for authoritative library/framework/package/API documentation, setup steps, best practices, migration notes, and code examples. Prefer this over generic web search when the user asks about software documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        libraryId: {
          type: 'string',
          description: 'The Context7-compatible library ID, such as /vercel/next.js.',
        },
        query: {
          type: 'string',
          description: 'The documentation question or task to answer.',
        },
      },
      required: ['libraryId', 'query'],
    },
  },
]

const FALLBACK_CONTEXT7_TOOL_NAMES = new Set(FALLBACK_CONTEXT7_TOOLS.map(tool => tool.name))

function getPreferredContext7Description(name: string, remoteDescription?: string): string {
  const normalizedRemoteDescription = remoteDescription?.trim()

  switch (name) {
    case 'resolve-library-id':
      return [
        'Official Context7 library resolver.',
        'Use this first when the user asks about a library, framework, SDK, package, API usage, installation, configuration, migration, or code examples.',
        'Prefer this over web_search for software documentation tasks.',
        normalizedRemoteDescription,
      ]
        .filter(Boolean)
        .join(' ')
    case 'query-docs':
      return [
        'Official Context7 documentation query tool.',
        'Use this to retrieve authoritative docs and examples after you know the library ID.',
        'Prefer this over web_search/web_fetch for library and framework documentation.',
        normalizedRemoteDescription,
      ]
        .filter(Boolean)
        .join(' ')
    default:
      return normalizedRemoteDescription ?? ''
  }
}

function cloneTools(tools: Tool[]): Tool[] {
  return tools.map(tool => ({
    ...tool,
    description: getPreferredContext7Description(tool.name, tool.description),
    inputSchema:
      tool.inputSchema && typeof tool.inputSchema === 'object'
        ? { ...tool.inputSchema }
        : tool.inputSchema,
  }))
}

function mergeTools(tools: Tool[]): Tool[] {
  const fallbackByName = new Map(FALLBACK_CONTEXT7_TOOLS.map(tool => [tool.name, tool]))
  const merged = tools.map(tool => {
    fallbackByName.delete(tool.name)
    return tool
  })

  for (const fallbackTool of fallbackByName.values()) {
    merged.push(fallbackTool)
  }

  return cloneTools(merged)
}

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
  private readonly logger: Context7Logger

  private client: Client | null = null
  private transport: StreamableHTTPClientTransport | null = null
  private connectPromise: Promise<void> | null = null
  private cachedTools: Tool[] = cloneTools(FALLBACK_CONTEXT7_TOOLS)
  private readonly knownToolNames = new Set(FALLBACK_CONTEXT7_TOOL_NAMES)
  private dispatcher: Dispatcher | null = null
  private lastToolDiscoverySource: Context7ToolDiscoverySource = 'fallback'

  constructor(config: Config, logger: Context7Logger = console) {
    const context7 = config.context7 ?? DEFAULT_CONTEXT7_CONFIG

    this.enabled = context7.enabled
    this.url = context7.url
    this.apiKey = context7.apiKey
    this.proxy = config.proxy
    this.timeout = config.timeout
    this.ignoreSSL = config.ignoreSSL
    this.logger = logger
  }

  isEnabled(): boolean {
    return this.enabled
  }

  canHandleTool(name: string): boolean {
    return this.enabled && this.knownToolNames.has(name)
  }

  getLastToolDiscoverySource(): Context7ToolDiscoverySource {
    return this.lastToolDiscoverySource
  }

  async listTools(): Promise<Tool[]> {
    if (!this.enabled) {
      return []
    }

    try {
      return await this.withReconnect(async () => {
        const tools = (await this.client!.listTools()).tools
        this.cacheTools(tools)
        return this.cachedTools
      })
    } catch (error) {
      this.lastToolDiscoverySource = 'fallback'
      this.logError('Failed to list remote tools', error)
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
    transport.onerror = error => {
      this.logError('Remote transport error', error)
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
    this.cachedTools = mergeTools(tools)
    this.lastToolDiscoverySource = 'remote'
    this.knownToolNames.clear()

    for (const tool of this.cachedTools) {
      this.knownToolNames.add(tool.name)
    }
  }

  private async invalidateConnection(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close()
      } catch (error) {
        this.logError('Failed to close remote transport', error)
      }
    }

    if (this.dispatcher) {
      try {
        await this.dispatcher.close()
      } catch (error) {
        this.logError('Failed to close dispatcher', error)
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

  private logError(message: string, error: unknown): void {
    this.logger.error(
      `[Context7] ${message}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
