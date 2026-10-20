// Converte dist-artifact/index.html no formato de página do Artifact:
// sem <!doctype>/<html>/<head>/<body>, com <title> e estilos no topo.
import { readFileSync, writeFileSync } from 'node:fs'

const [src = 'dist-artifact/index.html', out = 'dist-artifact/akora-command-center.html'] = process.argv.slice(2)
const html = readFileSync(src, 'utf8')
const pick = (re) => [...html.matchAll(re)].map((m) => m[0])

const title = '<title>AKORA Command Center</title>'
const meta = '<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="robots" content="noindex, nofollow">'
const fonts = pick(/<link[^>]+fonts\.googleapis\.com[^>]*>/g).filter((l) => l.includes('stylesheet')).join('\n')
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g).join('\n')
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g).join('\n')

writeFileSync(out, [title, meta, fonts, styles, '<div id="root"></div>', scripts].join('\n'))
console.log(`${out}: ${(readFileSync(out).length / 1024).toFixed(0)} kB`)
