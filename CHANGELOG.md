# Changelog

All notable changes to this project will be documented in this file.

## [1.0.19-beta.3] - 2026-03-16

### Changed

- **Context7 Tool Routing Hints**: Strengthened the `resolve-library-id` and `query-docs` tool descriptions so coding agents more clearly prefer official Context7 for library, framework, SDK, API, installation, configuration, migration, and code example questions
- **Tool Prioritization Guidance**: Added explicit hints to `web_search` and `web_fetch` descriptions telling agents to prefer Context7 before generic web lookup for software documentation tasks

## [1.0.19-beta.2] - 2026-03-16

### Changed

- **Diagnose Defaults**: `diagnose` now includes the Context7 connectivity check by default, with `--no-context7` available to skip it when needed
- **Diagnose Output**: Context7 discovery now reports a warning when it falls back to built-in tool metadata instead of claiming full remote discovery success

### Fixed

- **Context7 Diagnostics on Some Proxies**: Improved operator-facing output for environments where remote `listTools()` returns an incompatible content type but direct Context7 tool calls still succeed
- **README Guidance**: Updated diagnose examples and expectations to match the new default Context7 behavior

## [1.0.19-beta.1] - 2026-03-14

### Changed

- **Context7 Bridge Resilience**: Added built-in fallback tool metadata for `resolve-library-id` and `query-docs` when remote discovery temporarily fails
- **Context7 Logging**: Replaced direct bridge error output with an injectable logger interface for cleaner diagnostics and future extensibility
- **Server Lifecycle**: Added graceful runtime shutdown so the Context7 bridge transport and dispatcher are closed on process exit

### Fixed

- **Context7 Tool Discovery**: `listTools()` now retries through the reconnect path before falling back, improving resilience during transient remote errors
- **Context7 Tests**: Added coverage for disabled mode, fallback behavior, reconnect handling, and bridge cleanup on runtime shutdown

## [1.0.19-beta.0] - 2026-03-14

### Added

- **Official Context7 Bridge**: Added official Context7 remote MCP passthrough with native `resolve-library-id` and `query-docs` tools
- **Optional Context7 Authentication**: Added `CONTEXT7_API_KEY` and `--context7-api-key` support while keeping anonymous basic usage available
- **Context7 Diagnostics**: Added Context7 connectivity checks to the `diagnose` command
- **Context7 Configuration**: Added `--context7`, `--context7-url`, `CONTEXT7_MCP_URL`, and `ENABLE_CONTEXT7`

### Changed

- **CLI Startup**: Startup output now shows Context7 enablement, endpoint, and auth mode
- **README**: Added Context7 setup, CLI examples, environment variables, Claude Code examples, and FAQ
- **CI**: GitHub Actions CI now validates on Ubuntu, macOS, and Windows across Node.js 18/20/22
- **Publish Workflow**: GitHub release workflow now publishes prereleases to npm with the `beta` dist-tag

### Fixed

- **Context7 Transport Compatibility**: Switched Context7 remote MCP fetch path to `fetch` + `undici` dispatcher for proper MCP Streamable HTTP compatibility with proxy support

## [1.1.0] - 2026-03-05

### Added

- **Testing Framework**: Added Vitest for unit testing with coverage support
- **Code Quality Tools**: 
  - ESLint with TypeScript support for code linting
  - Prettier for code formatting
- **CI/CD**: GitHub Actions workflows for:
  - Automated testing on multiple Node.js versions (18, 20, 22)
  - Automated npm publishing on releases
- **Type Definitions**: Created comprehensive TypeScript type definitions
- **Environment Configuration**: Added `.env.example` for easier setup

### Changed

- **Type Safety**: 
  - Removed all `as any` type assertions
  - Added proper type definitions for fetch options
  - Improved type safety for JSON parsing
- **SSRF Protection**: Enhanced security with:
  - Port blocking for sensitive services (SSH, SMTP, databases, etc.)
  - Better IPv6 address handling
  - Improved private IP detection
- **Code Quality**: 
  - Fixed all ESLint warnings and errors
  - Improved code formatting consistency
  - Added comprehensive unit tests

### Fixed

- IPv6 localhost detection in SSRF protection
- Type safety issues in search engine implementations
- Missing `zod-to-json-schema` dependency declaration
- Unnecessary escape characters in regex patterns

### Developer Experience

- Added npm scripts:
  - `npm run test` - Run tests
  - `npm run test:coverage` - Run tests with coverage
  - `npm run lint` - Check code quality
  - `npm run lint:fix` - Auto-fix lint issues
  - `npm run format` - Format code with Prettier
  - `npm run format:check` - Check code formatting
  - `npm run typecheck` - Type check without emission
  - `npm run prepublishOnly` - Pre-publish validation

## [1.0.0] - 2025-03-05

### Added

- Initial release
- MCP Server with proxy support
- DuckDuckGo search (free, no API key required)
- Exa AI search (MCP endpoint)
- Bocha AI search (Chinese-friendly)
- Web fetch with Markdown/Text/HTML output
- System proxy detection (Windows)
- SSL certificate bypass option
- SSRF protection
- Response size limits
- Timeout configuration
