/**
 * 在编译后的 cli.js 文件头部添加 shebang
 * TypeScript 编译器不会保留源文件中的 shebang
 */
const fs = require('fs')
const path = require('path')

const cliPath = path.join(__dirname, '..', 'dist', 'cli.js')
const shebang = '#!/usr/bin/env node\n'

try {
  let content = fs.readFileSync(cliPath, 'utf8')

  // 如果已经有 shebang，先移除
  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n')
    content = content.substring(newlineIndex + 1)
  }

  // 添加 shebang
  fs.writeFileSync(cliPath, shebang + content)
  console.log('✓ Added shebang to dist/cli.js')
} catch (err) {
  console.error('Failed to add shebang:', err.message)
  process.exit(1)
}
