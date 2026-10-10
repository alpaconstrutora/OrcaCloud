/**
 * O portão do GERADOR DE CLIMATIZAÇÃO (E11).
 *
 *   node docs/spikes/gerador-climatizacao/passeio.mjs [urlBase]
 *
 * Gerar a prévia → as etapas aparecem, a prévia já mostra o split e a linha na
 * planta (a barra conta); Lançar → o desenho passa a ter o que a prévia tinha;
 * Ctrl+Z → volta ao de antes. Falha também em qualquer erro de console.
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
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

const barra = () => page.locator('#barra').innerText();
const num = (txt, rotulo) => Number(new RegExp(`${rotulo}: (\\d+)`).exec(txt)?.[1] ?? NaN);

await page.goto(`${urlBase}/docs/spikes/gerador-climatizacao/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="gerador-climatizacao"]', { timeout: 15000 });
const antes = await barra();
await page.getByRole('button', { name: 'Gerar a prévia' }).click();
await page.waitForSelector('[data-testid="ppci-etapas"]', { timeout: 15000 });
await page.waitForTimeout(600);
const etapas = await page.locator('[data-testid="ppci-etapas"]').innerText();
const previa = await barra();
await page.screenshot({ path: path.join(aqui, 'saida-previa.png') });
for (const e of ['Carga térmica por ambiente', 'Equipamentos', 'Linha frigorígena e dreno', 'Circuito dos pontos de ar-condicionado']) {
  if (!etapas.includes(e)) erros.push(`a etapa "${e}" não apareceu`);
}
if (num(antes, 'EVAPORADORAS') !== 0) erros.push(`o desenho já nasceu com evaporadora: ${antes}`);
if (!/^PRÉVIA/.test(previa) || num(previa, 'EVAPORADORAS') !== 2 || num(previa, 'CONDENSADORAS') !== 2) erros.push(`a prévia devia ter 2 splits (Sala e Quarto): ${previa}`);
if (!(num(previa, 'LINHA') > 0) || !(num(previa, 'DRENO') > 0)) erros.push(`a prévia sem linha ou dreno: ${previa}`);
if (num(previa, 'AR COM CIRCUITO') !== 2) erros.push(`os pontos de ar-condicionado sem circuito na prévia: ${previa}`);

await page.getByRole('button', { name: /^Lançar tudo/ }).click();
await page.waitForTimeout(500);
const lancado = await barra();
await page.screenshot({ path: path.join(aqui, 'saida-lancado.png') });
if (!/^DESENHO/.test(lancado) || lancado.replace(/^DESENHO · /, '') !== previa.replace(/^PRÉVIA · /, '')) erros.push(`o lançado não é a prévia: ${lancado} × ${previa}`);

await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
const desfeito = await barra();
if (desfeito !== antes) erros.push(`Ctrl+Z não desfez o lote inteiro: ${desfeito} (antes: ${antes})`);
await browser.close();

console.log(`antes:   ${antes}\nprévia:  ${previa}\nlançado: ${lancado}\nCtrl+Z:  ${desfeito}`);
if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('sem erro de console · prints em docs/spikes/gerador-climatizacao/');
