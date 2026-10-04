/**
 * Mede as CAMADAS POR DISCIPLINA no canvas e no 3D reais. É um PORTÃO
 * (exit ≠ 0 reprova).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/camadas/medir.mjs [urlBase] [pastaDeSaida]
 *
 * O que ele afirma:
 *
 *  1. PIXEL. Os pixels do pilar são os que mudam entre "tudo visível" e
 *     "Estrutura oculta". Oculta: o lugar fica igual ao fundo em volta (o
 *     preenchimento da sala, não o branco). Meio-tom: MAIS CLARO que visível e
 *     MAIS ESCURO que oculto — clareia, não some.
 *  2. CLIQUE. No centro do pilar: visível seleciona o pilar; em meio-tom e
 *     oculto, não (camada atenuada é referência, não pega clique).
 *  3. PAINEL REAL. "Expandir Hidráulica" → "Isolar Esgoto": esgoto visível,
 *     arquitetura em meio-tom, estrutura oculta — e o pilar some do desenho.
 *  4. TERRENO. Ocultar o Terreno muda o desenho (a divisa passou a obedecer).
 *  5. 3D. A passada translúcida desenha: meio-tom ≠ visível ≠ oculta, sem erro.
 *
 * ⚠️ As contas de pixel rodam DENTRO da página (`window.__fotos`): transferir o
 * `ImageData` inteiro para o Node (milhões de números) derrubava o Node 24
 * desta máquina com "Check failed: has_exception()".
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

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

const urlBase = process.argv[2] ?? 'http://localhost:3107';
const saida = process.argv[3] ?? 'C:/tmp';
fs.mkdirSync(saida, { recursive: true });
const ALVO = `${urlBase}/docs/spikes/camadas/index.html`;

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 1 });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

const falhas = [];
const conferir = (ok, msg) => {
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
  if (!ok) falhas.push(msg);
};
const pausa = (ms) => page.waitForTimeout(ms);
async function estado(e) {
  await page.evaluate((x) => window.__camadas(x), e);
  await pausa(350);
}

/** Retrata o canvas 2D do desenho (o maior da área) em `window.__fotos[nome]`. */
async function foto(nome) {
  await page.evaluate((n) => {
    const cs = [...document.querySelectorAll('[data-testid="desenho"] canvas')];
    const canvas = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const r = canvas.getBoundingClientRect();
    window.__fotos = window.__fotos ?? {};
    window.__fotos[n] = { data: d.data, width: d.width, height: d.height, left: r.left, top: r.top, escala: r.width / canvas.width };
  }, nome);
}
/** Os pixels que diferem entre duas fotos: quantos, o centro (coordenada de tela) e a caixa. */
async function mascara(a, b, nome, limiar = 24) {
  return page.evaluate(
    ([a, b, nome, limiar]) => {
      const A = window.__fotos[a];
      const B = window.__fotos[b];
      const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const ids = [];
      for (let i = 0; i < A.data.length; i += 4) if (Math.abs(lum(A.data, i) - lum(B.data, i)) > limiar) ids.push(i);
      window.__mascaras = window.__mascaras ?? {};
      window.__mascaras[nome] = ids;
      let sx = 0;
      let sy = 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const i of ids) {
        const p = i / 4;
        const x = p % A.width;
        const y = Math.floor(p / A.width);
        sx += x;
        sy += y;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const n = Math.max(1, ids.length);
      return { n: ids.length, centro: { x: A.left + (sx / n) * A.escala, y: A.top + (sy / n) * A.escala }, caixa: { x0, y0, x1, y1 } };
    },
    [a, b, nome, limiar],
  );
}
/** Escuridão média (255 − luminância) da foto nos pixels da máscara. */
async function escuridao(f, m) {
  return page.evaluate(
    ([f, m]) => {
      const F = window.__fotos[f];
      const ids = window.__mascaras[m];
      let s = 0;
      for (const i of ids) s += 255 - (0.299 * F.data[i] + 0.587 * F.data[i + 1] + 0.114 * F.data[i + 2]);
      return s / Math.max(1, ids.length);
    },
    [f, m],
  );
}
/** Escuridão média de uma faixa logo FORA da caixa — o fundo local (a sala). */
async function fundoEmVolta(f, caixa) {
  return page.evaluate(
    ([f, c]) => {
      const F = window.__fotos[f];
      let s = 0;
      let n = 0;
      for (let y = c.y0 - 12; y <= c.y1 + 12; y++)
        for (let x = c.x0 - 12; x <= c.x1 + 12; x++) {
          const perto = x >= c.x0 - 6 && x <= c.x1 + 6 && y >= c.y0 - 6 && y <= c.y1 + 6;
          if (perto || x < 0 || y < 0 || x >= F.width || y >= F.height) continue;
          const i = (y * F.width + x) * 4;
          s += 255 - (0.299 * F.data[i] + 0.587 * F.data[i + 1] + 0.114 * F.data[i + 2]);
          n++;
        }
      return s / Math.max(1, n);
    },
    [f, caixa],
  );
}
async function clicar(pt) {
  await page.evaluate(() => (window.__selecionados = []));
  await page.mouse.click(pt.x, pt.y);
  await pausa(300);
  return page.evaluate(() => window.__selecionados ?? []);
}

// ── 2D ──────────────────────────────────────────────────────────────────────
await page.goto(ALVO, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__pronto === true);
await pausa(1200);
const ids = await page.evaluate(() => window.__ids);

await estado('padrao');
await foto('visivel');
await page.screenshot({ path: path.join(saida, 'camadas-1-tudo-visivel.png') });
await estado({ ESTRUTURA: 'OCULTA' });
await foto('oculta');
await estado({ ESTRUTURA: 'ATENUADA' });
await foto('meioTom');
await page.screenshot({ path: path.join(saida, 'camadas-2-estrutura-meio-tom.png') });

const doPilar = await mascara('visivel', 'oculta', 'pilar');
conferir(doPilar.n > 200, `pilar ocupa pixels que mudam ao ocultar a Estrutura (${doPilar.n})`);
const eV = await escuridao('visivel', 'pilar');
const eA = await escuridao('meioTom', 'pilar');
const eO = await escuridao('oculta', 'pilar');
const fundo = await fundoEmVolta('oculta', doPilar.caixa);
console.log(`   escuridão média no pilar — visível ${eV.toFixed(1)} · meio-tom ${eA.toFixed(1)} · oculta ${eO.toFixed(1)} · fundo em volta ${fundo.toFixed(1)}`);
conferir(Math.abs(eO - fundo) < 12, 'oculta: o lugar do pilar fica igual ao fundo em volta (a sala)');
conferir(eA < eV * 0.7, 'meio-tom: mais claro que visível');
conferir(eA > eO + 8, 'meio-tom: NÃO some (mais escuro que oculta)');

const meio = doPilar.centro;
await estado('padrao');
const selV = await clicar(meio);
conferir(selV.includes(ids.pilar), `visível: clique no pilar seleciona o pilar (${JSON.stringify(selV)})`);
await estado({ ESTRUTURA: 'ATENUADA' });
const selA = await clicar(meio);
conferir(!selA.includes(ids.pilar), `meio-tom: clique no pilar NÃO o seleciona (${JSON.stringify(selA)})`);
await estado({ ESTRUTURA: 'OCULTA' });
const selO = await clicar(meio);
conferir(!selO.includes(ids.pilar), `oculta: clique no pilar NÃO o seleciona (${JSON.stringify(selO)})`);

// Painel REAL: expandir a Hidráulica e isolar o Esgoto.
await estado('padrao');
await page.getByRole('button', { name: 'Expandir Hidráulica' }).click();
await page.getByRole('button', { name: /Isolar Esgoto/ }).click();
await pausa(400);
const isolado = await page.evaluate(() => window.__estado);
conferir(
  isolado.ESGOTO === 'VISIVEL' && isolado.ARQUITETURA === 'ATENUADA' && isolado.ESTRUTURA === 'OCULTA' && isolado.ELETRICA_FORCA === 'OCULTA',
  'Isolar Esgoto pelo painel: esgoto visível, arquitetura meio-tom, estrutura e elétrica ocultas',
);
await foto('isolado');
const eIso = await escuridao('isolado', 'pilar');
const fundoIso = await fundoEmVolta('isolado', doPilar.caixa);
conferir(Math.abs(eIso - fundoIso) < 12, `com o Esgoto isolado o pilar não aparece (${eIso.toFixed(1)} × fundo ${fundoIso.toFixed(1)})`);
await page.screenshot({ path: path.join(saida, 'camadas-3-esgoto-isolado.png') });
await page.getByRole('button', { name: /Reexibir/ }).first().click();
await pausa(300);
conferir((await page.evaluate(() => window.__estado.ESTRUTURA)) === 'VISIVEL', 'Reexibir volta a Estrutura');

// Terreno: a divisa passou a obedecer.
await estado('padrao');
await foto('comTerreno');
await estado({ TERRENO: 'OCULTA' });
await foto('semTerreno');
const doTerreno = await mascara('comTerreno', 'semTerreno', 'terreno');
conferir(doTerreno.n > 200, `ocultar o Terreno muda o desenho (${doTerreno.n} px)`);

// ── 3D ──────────────────────────────────────────────────────────────────────
await page.goto(`${ALVO}?3d=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__pronto === true);
await page.waitForSelector('[data-testid="desenho"] canvas', { timeout: 30000 });
await pausa(5000);
async function tela3d(nome) {
  const caixa = await page.locator('[data-testid="desenho"]').boundingBox();
  const buf = await page.screenshot({ path: path.join(saida, nome), clip: caixa });
  await page.evaluate(
    async ([b64, n]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      window.__fotos3d = window.__fotos3d ?? {};
      window.__fotos3d[n] = ctx.getImageData(0, 0, c.width, c.height).data;
    },
    [buf.toString('base64'), nome],
  );
}
const difs3d = (a, b) =>
  page.evaluate(
    ([a, b]) => {
      const A = window.__fotos3d[a];
      const B = window.__fotos3d[b];
      const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let n = 0;
      for (let i = 0; i < A.length; i += 4) if (Math.abs(lum(A, i) - lum(B, i)) > 18) n++;
      return n;
    },
    [a, b],
  );
await estado('padrao');
await pausa(800);
await tela3d('camadas-4-3d-visivel.png');
await estado({ ESTRUTURA: 'ATENUADA', ARQUITETURA: 'ATENUADA' });
await pausa(1200);
await tela3d('camadas-5-3d-meio-tom.png');
await estado({ ESTRUTURA: 'OCULTA', ARQUITETURA: 'OCULTA' });
await pausa(800);
await tela3d('camadas-6-3d-oculta.png');
const dVA = await difs3d('camadas-4-3d-visivel.png', 'camadas-5-3d-meio-tom.png');
const dAO = await difs3d('camadas-5-3d-meio-tom.png', 'camadas-6-3d-oculta.png');
console.log(`   3D: visível×meio-tom ${dVA} px · meio-tom×oculta ${dAO} px`);
conferir(dVA > 500, '3D: meio-tom difere de visível');
conferir(dAO > 500, '3D: meio-tom difere de oculta — a passada translúcida desenha');

conferir(erros.length === 0, `sem erro de console/JS${erros.length ? ': ' + erros.slice(0, 5).join(' | ') : ''}`);
await browser.close();
console.log(falhas.length ? `\nREPROVADO: ${falhas.length} conferência(s)` : '\nAPROVADO');
process.exit(falhas.length ? 1 : 0);
