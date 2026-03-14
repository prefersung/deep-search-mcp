import { Blob, File } from 'node:buffer'

const globalScope = globalThis as unknown as Record<string, unknown>

if (typeof globalThis.Blob === 'undefined') {
  globalScope.Blob = Blob
}

if (typeof globalThis.File === 'undefined') {
  globalScope.File = File
}
