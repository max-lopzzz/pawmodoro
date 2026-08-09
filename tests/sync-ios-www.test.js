const fs = require('fs')
const os = require('os')
const path = require('path')
const { syncIosWww } = require('../scripts/sync-ios-www')

describe('syncIosWww', () => {
  let tmpDir, rendererDir, assetsDir, outDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ios-www-'))
    rendererDir = path.join(tmpDir, 'renderer')
    assetsDir = path.join(tmpDir, 'assets')
    outDir = path.join(tmpDir, 'www')

    fs.mkdirSync(rendererDir, { recursive: true })
    fs.mkdirSync(assetsDir, { recursive: true })

    fs.writeFileSync(
      path.join(rendererDir, 'index.html'),
      '<img src="../assets/cat.gif"><script src="app.js"></script>'
    )
    fs.writeFileSync(path.join(rendererDir, 'app.js'), 'console.log("app")')
    fs.writeFileSync(path.join(rendererDir, 'style.css'), 'body { color: red; }')

    fs.writeFileSync(path.join(assetsDir, 'cat.gif'), 'fake-gif-bytes')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('copies renderer files into outDir', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    expect(fs.readFileSync(path.join(outDir, 'app.js'), 'utf8')).toBe('console.log("app")')
    expect(fs.readFileSync(path.join(outDir, 'style.css'), 'utf8')).toBe('body { color: red; }')
  })

  test('copies assetsDir into outDir/assets', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    expect(fs.readFileSync(path.join(outDir, 'assets', 'cat.gif'), 'utf8')).toBe('fake-gif-bytes')
  })

  test('rewrites ../assets/ to assets/ in the copied index.html', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
    expect(html).toContain('src="assets/cat.gif"')
    expect(html).not.toContain('../assets/')
  })

  test('does not modify the source renderer/index.html', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    const sourceHtml = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8')
    expect(sourceHtml).toContain('../assets/cat.gif')
  })

  test('clears a previous outDir before re-syncing', () => {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'stale-file.txt'), 'old build output')

    syncIosWww({ rendererDir, assetsDir, outDir })

    expect(fs.existsSync(path.join(outDir, 'stale-file.txt'))).toBe(false)
  })
})
