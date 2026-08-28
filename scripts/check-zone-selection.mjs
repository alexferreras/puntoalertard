// Comprobación de integración con el navegador real: al pulsar una zona en el
// panel, el mapa debe acercarse y resaltarla.
//
// Existe porque `center` y `zoom` de `MapContainer` son solo valores iniciales:
// el bug no lo detectaba ningún test unitario ni el render estático.
//
// Uso:
//   1. npm run dev
//   2. Google Chrome --headless --remote-debugging-port=9222 http://localhost:3000/
//   3. node --experimental-websocket scripts/check-zone-selection.mjs
const base = 'http://127.0.0.1:9222'

const targets = await (await fetch(`${base}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000'))
if (!page) { console.error('No hay pestaña en localhost:3000'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
await new Promise((r) => ws.addEventListener('open', r))

const send = (method, params = {}) =>
  new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })) })

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return res.result?.result?.value
}

await send('Runtime.enable')

// Espera a que el mapa y la lista de zonas estén listos.
for (let i = 0; i < 30; i++) {
  const listo = await evaluate(`!!document.querySelector('.leaflet-container') &&
    document.querySelectorAll('[aria-pressed]').length > 0`)
  if (listo) break
  await new Promise((r) => setTimeout(r, 500))
}

const before = await evaluate(`(() => {
  const el = document.querySelector('.leaflet-container')
  const tiles = [...document.querySelectorAll('img.leaflet-tile')].length
  const zooms = [...new Set([...document.querySelectorAll('img.leaflet-tile')]
    .map((img) => (img.src.match(/\\/(\\d+)\\/\\d+\\/\\d+\\.png/) || [])[1]).filter(Boolean))]
  return JSON.stringify({ zoomsDeTiles: zooms, tiles })
})()`)

// Pulsa el primer botón de "Zonas con mayor riesgo" (los que muestran una insignia de riesgo).
const clicked = await evaluate(`(() => {
  const botones = [...document.querySelectorAll('button[aria-pressed]')]
    .filter((b) => /reporte\\(s\\) en un radio de/.test(b.textContent || ''))
  if (botones.length === 0) return 'sin-botones'
  botones[0].click()
  return botones[0].textContent.trim().slice(0, 60)
})()`)

await new Promise((r) => setTimeout(r, 1500))

const after = await evaluate(`(() => {
  const zooms = [...new Set([...document.querySelectorAll('img.leaflet-tile')]
    .map((img) => (img.src.match(/\\/(\\d+)\\/\\d+\\/\\d+\\.png/) || [])[1]).filter(Boolean))]
  return JSON.stringify({
    zoomsDeTiles: zooms,
    marcadoresIndividuales: document.querySelectorAll('.pa-marker').length,
    clusters: document.querySelectorAll('.pa-cluster').length,
    tooltipPermanente: !!document.querySelector('.leaflet-tooltip'),
    trazoResaltado: [...document.querySelectorAll('path.leaflet-interactive')]
      .some((p) => p.getAttribute('stroke-dasharray') === '6 4' && p.getAttribute('stroke-width') === '4'),
  })
})()`)

console.log('botón pulsado:', clicked)
console.log('antes: ', before)
console.log('después:', after)

const b = JSON.parse(before), a = JSON.parse(after)
console.log('\nzoom de tiles antes:', b.zoomsDeTiles, '-> después:', a.zoomsDeTiles)
console.log('el mapa se acercó:', Math.max(...a.zoomsDeTiles.map(Number)) > Math.max(...b.zoomsDeTiles.map(Number)) ? 'SÍ' : 'NO')
console.log('salió del modo agrupado:', a.marcadoresIndividuales > 0 && a.clusters === 0 ? 'SÍ' : `clusters=${a.clusters} marcadores=${a.marcadoresIndividuales}`)
console.log('zona resaltada con trazo discontinuo:', a.trazoResaltado ? 'SÍ' : 'NO')
console.log('tooltip permanente visible:', a.tooltipPermanente ? 'SÍ' : 'NO')
ws.close()
