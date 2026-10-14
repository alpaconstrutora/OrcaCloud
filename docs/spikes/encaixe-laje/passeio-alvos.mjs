/**
 * Quais peças o ímã enxerga? — ver `alvos.tsx`.
 *
 *   npx vite --port 3118
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/encaixe-laje/passeio-alvos.mjs [urlBase]
 *
 * Cada caso: um tipo de encaixe ligado, o cursor a ~30–40 mm de um ponto da
 * peça, e a resposta tem de ser um dos pontos ACEITOS (eixo ou face). A grade
 * daria um múltiplo de 100 — nenhum aceito é.
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

const urlBase = process.argv[2] ?? 'http://localhost:3118';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });

/** `aceita(p)` decide; `descreve` diz o que se esperava. */
const casos = [
  { nome: 'parede (controle) · Sobre', ativos: 'SOBRE', mira: { x: 3040, y: 8060 }, aceita: (p) => [7955, 8030, 8105].includes(p.y), descreve: 'y ∈ {7955, 8030, 8105}' },
  { nome: 'viga · Extremidade', ativos: 'EXTREMIDADE', mira: { x: 1040, y: 1060 }, aceita: (p) => p.x === 1010 && p.y === 1030, descreve: '(1010, 1030)' },
  { nome: 'viga · Canto', ativos: 'CANTO', mira: { x: 1040, y: 1150 }, aceita: (p) => p.x === 1010 && p.y === 1125, descreve: '(1010, 1125)' },
  { nome: 'viga · Sobre (face)', ativos: 'SOBRE', mira: { x: 3040, y: 1150 }, aceita: (p) => [935, 1030, 1125].includes(p.y), descreve: 'y ∈ {935, 1030, 1125}' },
  { nome: 'viga · Meio', ativos: 'MEIO', mira: { x: 3040, y: 1060 }, aceita: (p) => p.x === 3010 && p.y === 1030, descreve: '(3010, 1030)' },
  { nome: 'laje · vértice (Extremidade)', ativos: 'EXTREMIDADE', mira: { x: 1040, y: 3060 }, aceita: (p) => p.x === 1010 && p.y === 3030, descreve: '(1010, 3030)' },
  { nome: 'laje · Sobre (borda)', ativos: 'SOBRE', mira: { x: 3040, y: 3060 }, aceita: (p) => p.y === 3030, descreve: 'y = 3030' },
  { nome: 'laje · Meio (borda)', ativos: 'MEIO', mira: { x: 3040, y: 3060 }, aceita: (p) => p.x === 3010 && p.y === 3030, descreve: '(3010, 3030)' },
  { nome: 'terreno · Extremidade', ativos: 'EXTREMIDADE', mira: { x: 7040, y: 1060 }, aceita: (p) => p.x === 7010 && p.y === 1030, descreve: '(7010, 1030)' },
  { nome: 'terreno · Sobre', ativos: 'SOBRE', mira: { x: 9040, y: 1060 }, aceita: (p) => p.y === 1030, descreve: 'y = 1030' },
  { nome: 'água · vértice (Extremidade)', ativos: 'EXTREMIDADE', mira: { x: 7040, y: 3060 }, aceita: (p) => p.x === 7010 && p.y === 3030, descreve: '(7010, 3030)' },
  { nome: 'água · Sobre (borda)', ativos: 'SOBRE', mira: { x: 9040, y: 3060 }, aceita: (p) => p.y === 3030, descreve: 'y = 3030' },
];

const resultado = [];
for (const c of casos) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto(`${urlBase}/docs/spikes/encaixe-laje/alvos.html?ativos=${c.ativos}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const caixa = await page.locator('canvas').boundingBox();
  const tela = (p) => ({ x: caixa.x + p.x * 0.05 + 60, y: caixa.y + caixa.height - 60 - p.y * 0.05 });
  const t = tela(c.mira);
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(150);
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(200);
  const dump = JSON.parse(await page.locator('#dump').textContent());
  const p = dump.pontos[dump.pontos.length - 1];
  const ok = !!p && c.aceita(p);
  resultado.push(ok);
  console.log(
    `${ok ? '✅' : '❌'} ${c.nome.padEnd(30)} → ${JSON.stringify(p)}  esperado ${c.descreve}${erros.length ? '  ERROS: ' + erros.join(' | ') : ''}`,
  );
  await page.close();
}
await browser.close();
process.exit(resultado.every(Boolean) ? 0 : 1);
