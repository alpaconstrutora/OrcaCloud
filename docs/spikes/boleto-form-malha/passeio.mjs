/**
 * Passeio do harness: mede na tela o que as duas entregas prometem.
 *
 *   node docs/spikes/boleto-form-malha/passeio.mjs [urlBase] [outDir]
 *
 * Mede, não só fotografa: altura e radius do campo, classe do rótulo, e o
 * estado do <select> de Organização em cada status. Print por status junto.
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

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3121';
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});

const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
await page.goto(`${urlBase}/docs/spikes/boleto-form-malha/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Organização');

const resultado = {};

for (const status of ['rascunho', 'aprovado', 'pago', 'cancelado']) {
  await page.selectOption('[data-el="status"]', status);
  await page.waitForTimeout(400);

  resultado[status] = await page.evaluate(() => {
    const rotulos = [...document.querySelectorAll('label')];
    const rotuloOrg = rotulos.find(l => l.textContent.trim().startsWith('Organização'));
    const campoOrg = rotuloOrg?.parentElement?.querySelector('select');
    const dica = rotuloOrg?.parentElement?.querySelector('p');
    const cs = campoOrg && getComputedStyle(campoOrg);
    return {
      campoExiste: !!campoOrg,
      desabilitado: campoOrg?.disabled ?? null,
      opcoes: campoOrg ? [...campoOrg.options].map(o => o.textContent.trim()) : [],
      motivoNaTela: dica?.textContent?.trim() ?? null,
      alturaCampo: cs ? Math.round(campoOrg.getBoundingClientRect().height) : null,
      radiusCampo: cs?.borderTopLeftRadius ?? null,
      fundoCampo: cs?.backgroundColor ?? null,
      // §21: rótulo sem uppercase, peso 600, cinza slate-500.
      rotulo: rotuloOrg && (() => {
        const r = getComputedStyle(rotuloOrg);
        return { transform: r.textTransform, peso: r.fontWeight, tamanho: r.fontSize, cor: r.color, tracking: r.letterSpacing };
      })(),
      // Nenhum rótulo do formulário pode ter voltado ao estilo gritado.
      rotulosGritados: rotulos.filter(l => getComputedStyle(l).textTransform === 'uppercase').length,
      // ── Painéis (§30) ───────────────────────────────────────────────────
      // A queixa foi "não tem separação entre o boleto e os campos". Separação
      // aqui é medível: painel branco sobre fundo cinza, com borda.
      paineis: (() => {
        const cards = [...document.querySelectorAll('div')].filter(d => {
          const c = getComputedStyle(d);
          return c.backgroundColor === 'rgb(255, 255, 255)'
            && c.borderTopWidth === '1px'
            && parseFloat(c.borderTopLeftRadius) === 10
            && d.getBoundingClientRect().width > 300;
        });
        const corpo = document.querySelector('[data-corpo]');
        return {
          quantidade: cards.length,
          fundoDoCorpo: corpo ? getComputedStyle(corpo).backgroundColor : null,
          contrasteComOFundo: corpo
            ? getComputedStyle(corpo).backgroundColor !== 'rgb(255, 255, 255)'
            : null,
        };
      })(),
      secoes: [...document.querySelectorAll('h3')].map(h => h.textContent.trim()),
    };
  });

  await page.screenshot({ path: path.join(outDir, `boleto-${status}.png`), fullPage: false });
}

await browser.close();
console.log(JSON.stringify(resultado, null, 2));

const r = resultado;
const falhas = [];
if (!r.rascunho.campoExiste) falhas.push('campo Organização não existe');
if (r.rascunho.desabilitado !== false) falhas.push('rascunho deveria permitir trocar de organização');
for (const s of ['aprovado', 'pago', 'cancelado']) {
  if (r[s].desabilitado !== true) falhas.push(`${s} deveria estar desabilitado`);
  if (!r[s].motivoNaTela) falhas.push(`${s} está desabilitado sem dizer o motivo`);
}
if (r.rascunho.alturaCampo !== 36) falhas.push(`campo com ${r.rascunho.alturaCampo}px, esperado 36 (§16 h-9)`);
if (r.rascunho.radiusCampo !== '6px') falhas.push(`radius ${r.rascunho.radiusCampo}, esperado 6px (§16)`);
if (r.rascunho.rotulo?.transform !== 'none') falhas.push('rótulo voltou a uppercase (§21)');
if (r.rascunho.rotulo?.peso !== '600') falhas.push(`peso do rótulo ${r.rascunho.rotulo?.peso}, esperado 600 (§21)`);
if (r.rascunho.rotulosGritados !== 0) falhas.push(`${r.rascunho.rotulosGritados} rótulos ainda em uppercase (§21)`);
// Painéis: 2 cards (documento + formulário) sobre um fundo que NÃO é branco.
if (r.rascunho.paineis.quantidade !== 2) falhas.push(`${r.rascunho.paineis.quantidade} painéis brancos com borda, esperado 2 (documento + formulário)`);
if (r.rascunho.paineis.contrasteComOFundo !== true) falhas.push(`fundo do corpo é ${r.rascunho.paineis.fundoDoCorpo} — painel branco sobre branco não separa nada`);
const esperadas = ['Documento original', 'Cobrança', 'Quem recebe', 'Classificação', 'Observações'];
for (const t of esperadas) {
  if (!r.rascunho.secoes.includes(t)) falhas.push(`falta o título de seção "${t}"`);
}

if (falhas.length) {
  console.error('FALHA:\n - ' + falhas.join('\n - '));
  process.exit(1);
}
console.log('OK: campo Organização com regra e motivo, malha §21/§30/§16 medida na tela.');
