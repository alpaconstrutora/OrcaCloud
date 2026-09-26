/**
 * A4 — portão de navegador da gaveta SIGEF (ver `sigef.tsx`).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/geo/medir-sigef.mjs [urlBase] [pastaDeSaida]
 *
 * Controle (`?incompleto=1`): pendências listadas e a planilha desligada
 * dizendo quantos erros. Completo: sem pendência, "Planilha ODS" baixa o
 * arquivo (salvo em <pasta>/sigef.ods para o `conferir-ods.py`), e mudar o tipo
 * de limite na tabela chega ao kernel (o quadro redesenha com o novo código).
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
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 1400 } });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text());
});
let falhas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✅' : '❌'} ${m}`);
  if (!c) falhas++;
};

// ── Controle: incompleto ────────────────────────────────────────────────────
await page.goto(`${urlBase}/docs/spikes/geo/sigef.html?incompleto=1`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="painel-sigef"]');
await page.screenshot({ path: path.join(saida, 'a4-sigef-incompleto.png'), fullPage: true });
const pend = await page.textContent('[data-testid="sigef-pendencias"]');
ok(/\d+ erros/.test(pend), `controle: pendências contadas (${pend.match(/\d+ erros/)?.[0]})`);
ok(/Código fora do padrão/.test(pend) && /Tipo de limite do trecho/.test(pend), 'controle: código fora do padrão e limite ausente, ditos');
const odsDesligado = page.locator('button', { hasText: 'Planilha ODS' });
ok(await odsDesligado.isDisabled(), 'controle: planilha desligada');
ok(/Resolva os \d+ erros/.test((await odsDesligado.getAttribute('title')) ?? ''), 'controle: e diz por quê');

// ── Completo ────────────────────────────────────────────────────────────────
erros.length = 0;
await page.goto(`${urlBase}/docs/spikes/geo/sigef.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="painel-sigef"]');
const s = await page.evaluate(() => window.__sigef);
ok(s.linhas?.length === 4 && s.linhas[0].codigo === 'ABC1-M-0002', `4 vértices, o 1º o mais ao norte (${s.linhas?.[0]?.codigo})`);
ok(/Nada que o validador recusaria/.test(await page.textContent('[data-testid="sigef-pendencias"]')), 'completo: sem pendência');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Planilha ODS")')]);
const destino = path.join(saida, 'sigef.ods');
await download.saveAs(destino);
ok(download.suggestedFilename().endsWith('SIGEF.ods'), `planilha baixada: ${download.suggestedFilename()} → ${destino}`);
// Mudar o limite do 1º trecho pela tabela chega ao kernel.
await page.selectOption(`select[aria-label="Tipo de limite do trecho ${s.linhas[0].codigo}"]`, 'LA5');
const depois = await page.evaluate(() => window.__sigef);
ok(depois.linhas[0].limite === 'LA5', `o tipo de limite trocado chegou ao modelo (${depois.linhas[0].limite})`);
await page.screenshot({ path: path.join(saida, 'a4-sigef-completo.png'), fullPage: true });
ok(erros.length === 0, `sem erro de console (${erros.join(' | ')})`);

await browser.close();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas > 0 ? 1 : 0);
