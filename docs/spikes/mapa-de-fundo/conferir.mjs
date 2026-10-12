/**
 * Portão do MAPA DE FUNDO: o ladrilho cai NO LUGAR CERTO debaixo do desenho.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/mapa-de-fundo/conferir.mjs [urlBase] [pastaDeSaida]
 *
 * Para cada cenário (ruas, relevo, giro de 30°), 300 pontos lat/lon dentro da
 * tela: a cor do CANVAS no pixel onde o ponto deve cair (lat/lon → mm por
 * `geoParaLocal` → tela pelo retângulo visível do `onVistaMudou`) contra a cor
 * do mesmo ponto no ladrilho ORIGINAL baixado à parte. Mede a concordância na
 * posição certa e deslocada de ±6 px: a certa tem de ganhar com folga. Ler o
 * pixel do canvas também prova que ele não ficou "contaminado" (CORS).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue para o caminho por env */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3198';
const saida = process.argv[3] ?? 'C:/tmp';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });

// Medição SEM o lote (o preenchimento dele tinge o mapa); o print de cada cenário sai COM o lote.
const CENARIOS = [
  { nome: 'ruas', q: '?semLote=1', print: '' },
  { nome: 'relevo', q: '?semLote=1&fonte=RELEVO', print: '?fonte=RELEVO' },
  { nome: 'ruas-giro30', q: '?semLote=1&giro=30', print: '?giro=30' },
];
let tudoOk = true;

for (const c of CENARIOS) {
  const page = await browser.newPage({ viewport: { width: 960, height: 660 }, deviceScaleFactor: 1 });
  const erros = [];
  page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
  page.on('console', (m) => m.type() === 'error' && erros.push('CONSOLE ' + m.text()));
  await page.goto(`${urlBase}/docs/spikes/mapa-de-fundo/index.html${c.q}`);
  await page.waitForFunction(() => window.__mapa?.enquadrado, null, { timeout: 20000 });
  // Espera os ladrilhos: o centro da tela deixa de ser branco puro.
  await page.waitForFunction(
    () => {
      const cv = document.querySelector('#raiz canvas');
      const d = cv.getContext('2d').getImageData(cv.width / 2 + 40, cv.height / 2 + 40, 1, 1).data;
      return !(d[0] === 255 && d[1] === 255 && d[2] === 255);
    },
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(2500); // os demais ladrilhos

  const r = await page.evaluate(async () => {
    const m = window.__mapa;
    const cv = document.querySelector('#raiz canvas');
    const ctx = cv.getContext('2d');
    const k = cv.width / m.tamanho.w; // devicePixelRatio
    const tela = (x, y) => {
      const d = ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const DESLOC = [[6, 0], [-6, 0], [0, 6], [0, -6]];
    let semente = 7;
    const aleat = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
    // Só pontos com CONTRASTE no ladrilho original (borda de rodovia, rio, represa):
    // num pasto de cor única, errar a posição dá a mesma cor e o portão não discrimina.
    let contrastantes = 0;
    let certa = 0;
    const deslocada = DESLOC.map(() => 0);
    for (let i = 0; i < 2500 && contrastantes < 150; i++) {
      const x = 40 + aleat() * (m.tamanho.w - 80);
      const y = 40 + aleat() * (m.tamanho.h - 120); // longe da barra de dicas embaixo
      const p = m.geoDe(x, y);
      const ref = await m.corDoLadrilho(p.lat, p.lon);
      const vizinhos = await Promise.all(DESLOC.map(([dx, dy]) => m.corDoLadrilho(m.geoDe(x + dx, y + dy).lat, m.geoDe(x + dx, y + dy).lon)));
      if (!vizinhos.some((v) => dist(v, ref) > 60)) continue;
      contrastantes++;
      if (dist(tela(x, y), ref) < 35) certa++;
      DESLOC.forEach(([dx, dy], j) => {
        if (dist(tela(x + dx, y + dy), ref) < 35) deslocada[j]++;
      });
    }
    return { validos: contrastantes, acertos: [certa, ...deslocada], zoom: m.zoom() };
  });
  // O print sai COM o lote, para a conferência a olho.
  await page.goto(`${urlBase}/docs/spikes/mapa-de-fundo/index.html${c.print}`);
  await page.waitForFunction(() => window.__mapa?.enquadrado, null, { timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${saida}/mapa-de-fundo-${c.nome}.png`, clip: { x: 16, y: 16, width: 900, height: 600 } });
  const taxa = r.acertos.map((a) => a / r.validos);
  const certa = taxa[0];
  const melhorDeslocada = Math.max(...taxa.slice(1));
  const ok = r.validos >= 100 && certa >= 0.7 && certa - melhorDeslocada >= 0.15 && erros.length === 0;
  tudoOk &&= ok;
  console.log(
    `${ok ? '✅' : '❌'} ${c.nome}: zoom ${r.zoom}, ${r.validos} pontos — concordância na posição certa ${(certa * 100).toFixed(0)}%, ` +
      `deslocada ±6 px: ${taxa.slice(1).map((t) => (t * 100).toFixed(0) + '%').join(' / ')}${erros.length ? ` · erros: ${erros.join(' | ')}` : ''}`,
  );
  await page.close();
}
await browser.close();
console.log(tudoOk ? '✅ PORTÃO PASSOU' : '❌ PORTÃO FALHOU');
process.exit(tudoOk ? 0 : 1);
