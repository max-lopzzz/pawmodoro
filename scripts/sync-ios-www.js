const fs = require('fs')
const path = require('path')

function syncIosWww({ rendererDir, assetsDir, outDir }) {
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  for (const entry of fs.readdirSync(rendererDir)) {
    const srcPath = path.join(rendererDir, entry)
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, path.join(outDir, entry))
    }
  }

  const indexPath = path.join(outDir, 'index.html')
  const html = fs.readFileSync(indexPath, 'utf8')
  fs.writeFileSync(indexPath, html.split('../assets/').join('assets/'))

  fs.cpSync(assetsDir, path.join(outDir, 'assets'), { recursive: true })
}

module.exports = { syncIosWww }

if (require.main === module) {
  syncIosWww({
    rendererDir: path.join(__dirname, '..', 'renderer'),
    assetsDir: path.join(__dirname, '..', 'assets'),
    outDir: path.join(__dirname, '..', 'www')
  })
  console.log('Synced renderer/ + assets/ into www/ for Capacitor')
}
