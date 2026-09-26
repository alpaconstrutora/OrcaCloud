/**
 * C1 — prova do PLATÔ INCLINADO e do VOLUME ENTRE VERSÕES no painel real.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/topografia/medir-c1.mjs [urlBase] [pastaDeSaida]
 *
 * Portão (sai com 1 se falhar):
 *  - controle (`?inclinado` ausente): toggle desligado, sem campos, sem a
 *    seção de volume (uma versão só);
 *  - `?inclinado=1`: toggle ligado com 2 / 0 / 0; a cota de projeto sobe 0,2 m
 *    do sul ao norte do platô (2 % × 10 m) com o centro na cota informada; a
 *    seção "Volume entre versões" mostra o mesmo aterro que o motor calculou
 *    (antes = 0,3 m abaixo) e corte zero;
 *  - `?vista=corte&plato=1&inclinado=1` monta sem erro (a foto é para o olho:
 *    a linha do projeto tem de estar INCLINADA no corte).
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

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? 'C:/tmp';
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});
let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) falhas++;
};
const fmt = (v, casas = 1) => v.toFixed(casas).replace('.', ',');

async function abrir(extra, nome, fullPage) {
  erros.length = 0;
  await page.goto(`${urlBase}/docs/spikes/topografia/index.html?${extra}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(saida, nome), fullPage });
  const ruido = erros.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
  ok(ruido.length === 0, `${nome}: sem erro de console (${ruido.length})`);
  for (const e of ruido) console.log('   ' + e.slice(0, 200));
}

// ── Controle ────────────────────────────────────────────────────────────────
await abrir('vista=painel', 'c1-painel-controle.png', true);
{
  const toggle = await page.$('input[aria-label="Platô inclinado"]');
  ok(!!toggle, 'controle: o toggle "Platô inclinado" existe');
  ok(toggle && !(await toggle.isChecked()), 'controle: toggle DESLIGADO');
  ok((await page.$('input[aria-label="Longitudinal"]')) === null, 'controle: sem os campos de caimento');
  ok((await page.$('[data-testid="topografia-volume-entre-versoes"]')) === null, 'controle: sem "Volume entre versões" (uma versão só)');
}

// ── Platô inclinado ─────────────────────────────────────────────────────────
await abrir('vista=painel&inclinado=1', 'c1-painel-inclinado.png', true);
{
  const c1 = await page.evaluate(() => window.__c1);
  ok(c1?.inclinado === true, 'inclinado: o harness ligou a inclinação');
  ok(await page.isChecked('input[aria-label="Platô inclinado"]'), 'inclinado: toggle LIGADO');
  const long = await page.inputValue('input[aria-label="Longitudinal"]');
  const transv = await page.inputValue('input[aria-label="Transversal"]');
  const az = await page.inputValue('input[aria-label="Azimute"]');
  ok(long === '2' && transv === '0' && az === '0', `inclinado: campos 2 / 0 / 0 (lidos ${long} / ${transv} / ${az})`);
  // Física: 2 % ao longo de +Y, platô de 10 m (y 5 000 → 15 000): sul −0,1, norte +0,1 em torno do centro.
  const dNS = c1.cotaNorte - c1.cotaSul;
  ok(Math.abs(dNS - 0.196) < 0.005, `inclinado: cota de projeto sobe ${fmt(dNS, 3)} m do sul ao norte (9,8 m × 2 % = 0,196)`);
  ok(Math.abs(c1.cotaNorte + c1.cotaSul - 2 * c1.cotaCentro) < 0.001, 'inclinado: o centro do platô está na cota informada (plano gira em torno dele)');

  // Volume entre versões: DOM = motor.
  const secao = await page.$('[data-testid="topografia-volume-entre-versoes"]');
  ok(!!secao, 'inclinado: seção "Volume entre versões" presente (duas versões)');
  const texto = secao ? await secao.textContent() : '';
  ok(c1.volume && c1.volume.corteM3 === 0, `motor: corte entre versões = 0 (${c1.volume?.corteM3})`);
  ok(c1.volume && c1.volume.aterroM3 > 0, `motor: aterro entre versões > 0 (${fmt(c1.volume?.aterroM3 ?? 0)} m³)`);
  // A "versão antes" é 0,3 m abaixo em toda a grade: aterro = área comparada × 0,3, ± 0,1 %.
  const esperado = c1.volume.areaM2 * 0.3;
  ok(Math.abs(c1.volume.aterroM3 - esperado) / esperado < 0.001, `motor: aterro = área × 0,3 m (${fmt(c1.volume.aterroM3)} × ${fmt(esperado)})`);
  ok(texto.includes(`${fmt(c1.volume.aterroM3)} m³`), `DOM: "Aterro executado" mostra ${fmt(c1.volume.aterroM3)} m³`);
  ok(texto.includes('Corte executado') && texto.includes('0,0 m³'), 'DOM: "Corte executado" 0,0 m³');
  const antes = await page.inputValue('select[aria-label="Versão de antes"]');
  const depois = await page.inputValue('select[aria-label="Versão de depois"]');
  ok(antes === 'v0' && depois !== 'v0', `DOM: antes = v0 (anterior), depois = a selecionada (${antes} → ${depois})`);
}

// ── Corte: para o olho ──────────────────────────────────────────────────────
await abrir('vista=corte&plato=1&inclinado=1', 'c1-corte-inclinado.png', false);
// O corte FRENTE percorre X: só a inclinação TRANSVERSAL (`?inclinado=2`, 5 % ao longo de X) aparece nele.
await abrir('vista=corte&plato=1&inclinado=2', 'c1-corte-transversal.png', false);
await abrir('vista=corte&plato=1', 'c1-corte-horizontal.png', false);

await browser.close();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas > 0 ? 1 : 0);
