# Changelog

All notable changes to this project will be documented in this file.

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
