/**
 * Passeio pela vista 3D da Planta AI.
 *
 *   node docs/spikes/planta-ai-3d/passeio.mjs [urlBase]
 *
 * Assume `npm run dev` já rodando (porta 3100).
 *
 * ⚠️ SERVIDOR NOVO. O dev server serve o que tinha em memória quando subiu: já
 * houve passeio verde COM defeito no disco na Planta Inteligente. Reinicie o
 * vite (e apague `node_modules/.vite`) antes de confiar num exit 0 daqui.
 *
 * ─── O QUE ELE COBRE, E POR QUÊ ─────────────────────────────────────────────
 *
 * `Building3DViewer` está sob `@ts-nocheck`: o compilador não valida nada dele,
 * nem escopo. Até 06/09/2026 era o único viewer 3D do sistema sem prova de
 * runtime — e tinha um defeito de câmera que ninguém havia visto.
 *
 * Três portões, e o terceiro é o que teste nenhum alcança:
 *
 *   1. nenhum erro de console ou `pageerror`;
 *   2. a cena DESENHA — medida em pixel, porque "montou sem erro" e "aparece"
 *      são coisas diferentes;
 *   3. o prédio CRESCE com a cena montada e continua enquadrado. É o gesto que
 *      expunha o defeito: `<Canvas camera>` só vale na montagem.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE ou instale playwright-core');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

async function cena(qs, nome, esperaMs = 1800) {
  await page.goto(`${urlBase}/docs/spikes/planta-ai-3d/index.html?${qs}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(esperaMs);
  await page.screenshot({ path: path.join(aqui, `saida-${nome}.png`) });
}

/**
 * Quanto do canvas está coberto por GEOMETRIA, de 0 a 1.
 *
 * Conta pixels com canal máximo < 200: o prédio e as lajes são cinza médio; o
 * fundo é quase branco e a grade, clara. Sem isto, uma cena que montou com a
 * câmera olhando para o vazio passaria — nenhum erro de console acompanha um
 * enquadramento errado.
 *
 * A leitura é feita pelo próprio navegador: o PNG do `screenshot` volta como
 * data URL, é desenhado num canvas 2D e lido com `getImageData`. Ler o canvas
 * WebGL direto não serve — sem `preserveDrawingBuffer` ele volta em branco.
 */
async function medirCena() {
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, erro) => {
      img.onload = ok;
      img.onerror = erro;
      img.src = `data:image/png;base64,${b64}`;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const W = c.width;
    const H = c.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    const escuro = (i) => Math.max(d[i], d[i + 1], d[i + 2]) < 200;

    let geometria = 0;
    for (let i = 0; i < d.length; i += 4) if (escuro(i)) geometria++;

    // Faixa de 3% no topo do canvas: se há geometria aqui, o desenho está
    // ENCOSTANDO na borda — ou seja, saindo do quadro.
    let noTopo = 0;
    const faixa = Math.max(2, Math.floor(H * 0.03));
    for (let y = 0; y < faixa; y++) {
      for (let x = 0; x < W; x++) if (escuro((y * W + x) * 4)) noTopo++;
    }
    return { frac: geometria / (d.length / 4), noTopo };
  }, png.toString('base64'));
}

// ── 1 e 2: a cena desenha, e cabe no quadro ─────────────────────────────────
//
// O piso de 2% é baixo de propósito: uma torre alta e estreita cobre pouca ÁREA
// mesmo perfeitamente enquadrada — a de 20 pavimentos rende 4,4%. O que este
// número pega é "não desenhou nada", não "desenhou pouco".
await cena('pavimentos=3', 'base');
const base = await medirCena();
if (base.frac < 0.02) {
  erros.push(`cena base quase vazia: ${(base.frac * 100).toFixed(2)}% (mínimo 2%)`);
}
if (base.noTopo > 0) {
  erros.push(`cena base encostando na borda superior: ${base.noTopo} px`);
}

await cena('pavimentos=20', 'alto');
const alto = await medirCena();
if (alto.frac < 0.02) {
  erros.push(`prédio alto quase vazio: ${(alto.frac * 100).toFixed(2)}% (mínimo 2%)`);
}
if (alto.noTopo > 0) {
  erros.push(`prédio de 20 pavimentos sai pelo topo: ${alto.noTopo} px`);
}

// ── 3: o prédio CRESCE com a cena montada ────────────────────────────────────
//
// O defeito de 06/09/2026: `<Canvas camera={{ position }}>` só vale na montagem,
// então o prédio crescia e a câmera ficava parada — o topo saía do quadro. Aqui
// o botão sobe de 3 para 15 pavimentos SEM recarregar, e a cena tem de continuar
// enquadrada. Montar já grande (a cena `alto`, acima) NÃO cobre isto.
await cena('pavimentos=3&crescer=1', 'crescer-antes');
const antesDeCrescer = await medirCena();
await page.click('#crescer');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(aqui, 'saida-crescer-depois.png') });
const depoisDeCrescer = await medirCena();

// ⚠️ O SINAL É ENCOSTAR NA BORDA, E NÃO "PINTAR POUCO" — medido em 06/09/2026:
//
//     corrigido:    5,9% pintado ·      0 px no topo
//     com defeito: 31,8% pintado · 29.410 px no topo
//
// Com a câmera parada o prédio TRANSBORDA, então ele pinta MAIS, não menos. Um
// piso de fração mínima aprovaria o defeito e reprovaria a correção — foi o
// primeiro portão que escrevi aqui, e a medição o desmentiu.
if (depoisDeCrescer.noTopo > 0) {
  erros.push(
    `ao crescer, o prédio saiu pelo topo do quadro: ${depoisDeCrescer.noTopo} px na ` +
      `faixa superior. A câmera não seguiu — ver o \`Enquadrar\` em Building3DViewer.`,
  );
}
if (depoisDeCrescer.frac < 0.02) {
  erros.push(`ao crescer, a cena esvaziou: ${(depoisDeCrescer.frac * 100).toFixed(2)}%`);
}

await browser.close();

if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log(
  `base ${(base.frac * 100).toFixed(1)}% · alto ${(alto.frac * 100).toFixed(1)}% · ` +
    `ao crescer ${(antesDeCrescer.frac * 100).toFixed(1)}% → ` +
    `${(depoisDeCrescer.frac * 100).toFixed(1)}%, ${depoisDeCrescer.noTopo} px no topo (máximo 0)`,
);
console.log('sem erro de console · prints em docs/spikes/planta-ai-3d/');
