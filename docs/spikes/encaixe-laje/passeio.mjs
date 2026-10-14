/**
 * O ímã acha a ponta e o canto quando SÓ ALGUNS tipos estão ligados?
 *
 *   npx vite --port 3118
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/encaixe-laje/passeio.mjs [urlBase]
 *
 * O mesmo gesto — cursor a ~60 mm da ponta LIVRE da parede, onde a ponta do
 * eixo E o canto da face estão os dois no alcance — em cada combinação do menu.
 * A resposta da grade é (1100, 1100); qualquer caso que devolva isso com um
 * encaixe ligado é o ímã falhando.
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

const PONTA = { x: 1010, y: 1030 };
const CANTO = { x: 1010, y: 1105 };
const GRADE = { x: 1100, y: 1100 };
const MIRA = { x: 1060, y: 1080 };

const casos = [
  // Calibração: sem encaixe nenhum, o clique em (3000, 3000) TEM de dar
  // (3000, 3000). Se não der, a conversão tela↔modelo está errada e o resto
  // do passeio não prova nada.
  { ativos: '', alinhamento: 'DIREITA', mira: { x: 3000, y: 3000 }, espera: { x: 3000, y: 3000 }, nome: 'calibração' },
  { ativos: '', alinhamento: 'DIREITA', mira: MIRA, espera: GRADE, nome: 'nada ligado → grade' },
  { ativos: 'EXTREMIDADE', alinhamento: 'DIREITA', mira: MIRA, espera: PONTA, nome: 'só Extremidade, face' },
  { ativos: 'EXTREMIDADE', alinhamento: 'EIXO', mira: MIRA, espera: PONTA, nome: 'só Extremidade, eixo' },
  { ativos: 'CANTO', alinhamento: 'DIREITA', mira: MIRA, espera: CANTO, nome: 'só Canto, face' },
  { ativos: 'CANTO', alinhamento: 'EIXO', mira: MIRA, espera: CANTO, nome: 'só Canto, eixo' },
  { ativos: 'EXTREMIDADE,CANTO', alinhamento: 'DIREITA', mira: MIRA, espera: CANTO, nome: 'os dois, face' },
  { ativos: 'EXTREMIDADE,CANTO', alinhamento: 'EIXO', mira: MIRA, espera: PONTA, nome: 'os dois, eixo' },
];

let falhou = false;
for (const c of casos) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  const q = `?ativos=${c.ativos}&alinhamento=${c.alinhamento}`;
  await page.goto(`${urlBase}/docs/spikes/encaixe-laje/index.html${q}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Vista inicial conhecida por construção: 0,05 px/mm, origem a 60 px da
  // borda esquerda e a 60 px do RODAPÉ (Y do modelo para cima).
  const caixa = await page.locator('canvas').boundingBox();
  const tela = (p) => ({ x: caixa.x + p.x * 0.05 + 60, y: caixa.y + caixa.height - 60 - p.y * 0.05 });

  const t = tela(c.mira);
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(150);
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(200);
  const dump = JSON.parse(await page.locator('#dump').textContent());
  const p = dump.pontos[dump.pontos.length - 1];
  const ok = p && p.x === c.espera.x && p.y === c.espera.y;
  if (!ok) falhou = true;
  console.log(
    `${ok ? '✅' : '❌'} ${c.nome.padEnd(24)} [${c.ativos || '—'} / ${c.alinhamento}] → ${JSON.stringify(p)}  esperado ${JSON.stringify(c.espera)}${erros.length ? '  ERROS: ' + erros.join(' | ') : ''}`,
  );
  await page.close();
  if (c.nome === 'calibração' && !ok) {
    console.log('calibração falhou — conversão de coordenadas errada; abortando');
    break;
  }
}

await browser.close();
process.exit(falhou ? 1 : 0);
