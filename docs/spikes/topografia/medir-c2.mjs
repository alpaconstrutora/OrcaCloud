/**
 * C2 — prova de VIAS E GREIDE na gaveta real.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/topografia/medir-c2.mjs [urlBase] [pastaDeSaida]
 *
 * Portão (sai com 1 se falhar):
 *  - controle (`?vias` ausente): a gaveta não está no painel;
 *  - `?vias=1`: a tabela de estacas tem as 7 estacas do eixo de 28 m a passo 5
 *    (0+0,00 … 5+3,00: 28 m), o greide de partida vai da cota do terreno no início à
 *    do fim (input da última estaca = cota do terreno lá), a nota tem as mesmas
 *    7 linhas, e os volumes do DOM são os do motor (corte e aterro, 1 casa);
 *  - `?vista=planta&vias=1`: monta sem erro (foto: eixo âmbar com as estacas).
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

await abrir('vista=painel', 'c2-painel-controle.png', true);
ok((await page.$('[data-testid="painel-vias"]')) === null, 'controle: sem a gaveta de vias');

await abrir('vista=painel&vias=1', 'c2-painel-vias.png', true);
{
  const c2 = await page.evaluate(() => window.__c2);
  ok(c2?.comVias === true, 'vias: o harness ligou a via');
  ok(!!(await page.$('[data-testid="painel-vias"]')), 'vias: gaveta presente');
  const linhas = await page.$$('[data-testid="vias-estacas"] tbody tr');
  ok(linhas.length === 7 && c2.estacas.length === 7, `vias: 7 estacas (DOM ${linhas.length}, motor ${c2.estacas.length})`);
  ok(c2.estacas[0] === '0+0,00' && c2.estacas[6] === '5+3,00', `vias: nomes ${c2.estacas[0]} … ${c2.estacas[6]}`);
  const primeira = await page.inputValue('input[aria-label="Cota do greide na estaca 0+0,00"]');
  const ultima = await page.inputValue('input[aria-label="Cota do greide na estaca 5+3,00"]');
  const g = c2.greide.pontos;
  ok(
    Math.abs(Number(primeira) - g[0].cotaM) < 0.001 && Math.abs(Number(ultima) - g[1].cotaM) < 0.001,
    `vias: greide de partida ${primeira} → ${ultima} (motor ${g[0].cotaM.toFixed(3)} → ${g[1].cotaM.toFixed(3)})`,
  );
  ok(
    !!(await page.$('button[aria-label="Remover PIV da estaca 0+0,00"]')) && (await page.$('button[aria-label="Remover PIV da estaca 3+0,00"]')) === null,
    'vias: PIV só nas pontas',
  );
  const nota = await page.$$('[data-testid="vias-nota"] tbody tr');
  ok(nota.length === 7, `vias: nota de serviço com 7 linhas (${nota.length})`);
  const volumes = await page.textContent('[data-testid="vias-volumes"]');
  ok(
    volumes.includes(`${fmt(c2.corteM3)} m³`) && volumes.includes(`${fmt(c2.aterroM3)} m³`),
    `vias: volumes do DOM = motor (corte ${fmt(c2.corteM3)}, aterro ${fmt(c2.aterroM3)})`,
  );
  ok(c2.corteM3 + c2.aterroM3 > 0, 'vias: há movimento de terra (o terreno não é plano no eixo)');
  ok((await page.$$('img[data-testid="vias-perfil"], img[data-testid="vias-secao"]')).length === 2, 'vias: perfil e seção desenhados como imagem');
}

await abrir('vista=planta&vias=1', 'c2-planta-vias.png', false);

await browser.close();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas > 0 ? 1 : 0);
