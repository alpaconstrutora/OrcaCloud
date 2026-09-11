/**
 * Passeio: abre o harness, clica no campo Fornecedor e mede cada célula do
 * drawer "Selecionar Fornecedor". Falha (exit 1) se qualquer CNPJ/CPF ou
 * Categoria estiver cortado (scrollWidth > clientWidth). O Nome pode truncar
 * — é o único texto livre — mas é reportado.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/fornecedor-drawer/passeio.mjs [urlBase] [outDir]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch { /* segue para o caminho por env */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3179';
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const launch = process.env.CHROME_EXE
  ? { headless: true, executablePath: process.env.CHROME_EXE }
  : { headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' };
const browser = await chromium.launch(launch);

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

await page.goto(`${urlBase}/docs/spikes/fornecedor-drawer/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Fornecedor');
await page.locator('#raiz button').first().click();
await page.waitForSelector('text=Selecionar Fornecedor');
await page.waitForTimeout(400); // transição do Sheet
await page.screenshot({ path: path.join(outDir, '01-drawer-fornecedor.png') });

const medidas = await page.evaluate(() => {
  const painel = document.querySelector('[role="dialog"] table');
  const larguraDrawer = painel.closest('.fixed.bg-white')?.getBoundingClientRect().width;
  const ths = [...painel.querySelectorAll('thead th')].map((th) => Math.round(th.getBoundingClientRect().width));
  const linhas = [...painel.querySelectorAll('tbody tr')]
    .filter((tr) => tr.children.length === 3)
    .map((tr) => {
      const [tdNome, tdDoc, tdCat] = tr.children;
      const pNome = tdNome.querySelector('p');
      const pCat = tdCat.querySelector('p');
      return {
        nome: pNome.textContent, nomeCortado: pNome.scrollWidth > pNome.clientWidth,
        doc: tdDoc.textContent, docCortado: tdDoc.scrollWidth > tdDoc.clientWidth,
        categoria: pCat.textContent, categoriaCortada: pCat.scrollWidth > pCat.clientWidth,
      };
    });
  return { larguraDrawer, ths, linhas };
});

await browser.close();

const docsCortados = medidas.linhas.filter((l) => l.docCortado);
const catsCortadas = medidas.linhas.filter((l) => l.categoriaCortada);
const nomesCortados = medidas.linhas.filter((l) => l.nomeCortado);
console.log(JSON.stringify({
  larguraDrawer: medidas.larguraDrawer,
  larguraColunas: medidas.ths,
  linhas: medidas.linhas.length,
  docsCortados: docsCortados.map((l) => l.doc),
  categoriasCortadas: catsCortadas.map((l) => l.categoria),
  nomesTruncados: nomesCortados.map((l) => l.nome),
  erros,
}, null, 2));

// 11/09/2026, segunda rodada: o usuário reclamou do NOME cortado. Drawer foi a
// 4xl (896px) e o Nome quebra em linha — nenhuma célula pode mais cortar.
if (medidas.linhas.length === 0 || docsCortados.length || catsCortadas.length || nomesCortados.length || erros.length) {
  console.error('FALHA: alguma célula (Nome, CNPJ/CPF ou Categoria) cortada, ou erro no console.');
  process.exit(1);
}
if (medidas.larguraDrawer < 896) {
  console.error(`FALHA: drawer com ${medidas.larguraDrawer}px; esperado 896px (size="4xl").`);
  process.exit(1);
}
console.log('OK: Nome, CNPJ/CPF e Categoria inteiros em todas as linhas; drawer de 896px.');
