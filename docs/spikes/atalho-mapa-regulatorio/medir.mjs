/**
 * Portão do atalho no painel de zona (exit ≠ 0 reprova): o botão cabe na linha do
 * título "Zona urbanística" (uma linha só, sem estourar a caixa) nas duas larguras.
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core node docs/spikes/atalho-mapa-regulatorio/medir.mjs [url] [saida]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://127.0.0.1:3172';
const saida = process.argv[3] ?? 'C:/tmp';
fs.mkdirSync(saida, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.route(/supabase\.co\//, (r) => r.abort());
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
const falhas = [];
const conferir = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas.push(msg); };
await page.goto(`${urlBase}/docs/spikes/atalho-mapa-regulatorio/index.html`);
await page.locator('[data-caixa="catalogo-320"]').waitFor();
for (const l of [320, 448]) {
  for (const id of [`catalogo-${l}`, `empreend-${l}`]) {
    const r = await page.locator(`[data-caixa="${id}"]`).evaluate((caixa) => {
      const botao = [...caixa.querySelectorAll('button')].find((b) => b.title.startsWith('Abrir'));
      const titulo = [...caixa.querySelectorAll('p')].find((p) => p.textContent.includes('Zona urbanística'));
      const bb = botao.getBoundingClientRect(), bt = titulo.getBoundingClientRect(), bc = caixa.getBoundingClientRect();
      const linhaH = parseFloat(getComputedStyle(botao).lineHeight) || 16;
      return { texto: botao.textContent.trim(), tituloUmaLinha: bt.height <= linhaH + 2, umaLinha: bb.height <= linhaH + 2, mesmaLinha: Math.abs(bb.top + bb.height / 2 - (bt.top + bt.height / 2)) < 4, dentro: bb.right <= bc.right - 23 };
    });
    conferir(r.tituloUmaLinha && r.umaLinha && r.mesmaLinha && r.dentro, `${id}: "${r.texto}" na linha do título, título e botão em uma linha, dentro do padding (${JSON.stringify(r)})`);
  }
  conferir((await page.locator(`[data-caixa="sem-${l}"] button[title^="Abrir"]`).count()) === 0, `sem-${l}: sem prop, sem atalho`);
}
await page.locator('[data-caixa="catalogo-320"]').getByRole('button', { name: 'Cadastrar zona neste mapa' }).click();
conferir((await page.evaluate(() => window.__cliques)) === 1, 'aviso "mapa sem zona" é clicável');
await page.screenshot({ path: `${saida}/painel-zona.png` });
conferir(erros.length === 0, `sem erro de página (${erros.join(' | ')})`);
await browser.close();
process.exit(falhas.length ? 1 : 0);
