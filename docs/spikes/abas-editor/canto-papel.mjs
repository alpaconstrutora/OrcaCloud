/**
 * Confere o CANTO da exportação olhando o resultado, não a chamada.
 *
 * O teste de unidade verifica que a pincelada foi estendida. Isso não prova que
 * o canto fechou: prova que a intenção estava certa — foi exatamente o que
 * faltou na primeira exportação, cujo comentário afirmava a intenção certa e o
 * código não a cumpria.
 *
 * Aqui o desenho é rasterizado num canvas de verdade e os PIXELS do canto são
 * lidos. Um canto aberto deixa branco onde deveria haver preto.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/abas-editor/canto-papel.mjs [urlBase]
 *
 * Roda os dois modos — com e sem a extensão — e EXIGE que o sem-extensão
 * reprove. Medição que aprova tudo não mede nada.
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

const urlBase = process.argv[2] ?? 'http://localhost:3103';

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
// `deviceScaleFactor` alto porque o canvas é exibido em 1 px por milímetro: a
// sala de teste mede 67 × 52 px na tela, pequena demais para conferir canto a
// olho. Ampliar na captura preserva o traço real, sem reescalar o desenho.
const page = await browser.newPage({
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 6,
});

async function medir(estender) {
  await page.goto(`${urlBase}/docs/spikes/abas-editor/canto.html?estender=${estender ? 1 : 0}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => window.__pronto === true);
  const r = await page.evaluate(() => window.__cantos);

  // Print AMPLIADO do canto inferior esquerdo. O número diz que fechou; o
  // recorte deixa conferir a olho — foi pular esta etapa que fez a primeira
  // correção de canto, na tela, ser feita duas vezes no escuro.
  const box = await page.evaluate(() => {
    const t = document.getElementById('tela').getBoundingClientRect();
    return { x: t.x, y: t.y, w: t.width, h: t.height };
  });
  // A sala fica centrada na área útil (margem 12 + carimbo 26 embaixo).
  await page.screenshot({
    path: `docs/spikes/abas-editor/canto-${estender ? 'com' : 'sem'}.png`,
    clip: { x: box.x + 66, y: box.y + 104, width: 80, height: 64 },
  });

  return r;
}

const semExtensao = await medir(false);
const comExtensao = await medir(true);
await browser.close();

const mostrar = (titulo, r) => {
  console.log(`\n${titulo}`);
  for (const c of r) {
    console.log(
      `  ${c.fechado ? '✓ fechado' : '✖ ABERTO '}  ${c.nome.padEnd(12)} ` +
        `pixels claros no canto: ${c.claros}/${c.total}`,
    );
  }
};

mostrar('SEM extensão (o defeito):', semExtensao);
mostrar('COM extensão (a correção):', comExtensao);

const semReprova = semExtensao.some((c) => !c.fechado);
const comAprova = comExtensao.every((c) => c.fechado);

console.log(
  `\nsem extensão reprova: ${semReprova ? 'sim' : 'NÃO — a medição não discrimina'}` +
    `\ncom extensão aprova:  ${comAprova ? 'sim' : 'NÃO'}`,
);

process.exit(semReprova && comAprova ? 0 : 1);
