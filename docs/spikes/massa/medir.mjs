/**
 * Mede o ESTUDO DE MASSA no canvas real, e é um PORTÃO (exit ≠ 0 reprova).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/massa/medir.mjs [urlBase] [pastaDeSaida]
 *
 * O que ele afirma:
 *
 *  1. Os números do motor no exemplo do pedido (1.200 m², TO 60 %, CA 3,
 *     gabarito 8): implantação máxima 720 m², área computável máxima 3.600 m²,
 *     5 pavimentos possíveis; a torre sobre o podium conta do 4º ao 10º.
 *  2. PIXELS: o podium âmbar pinta, e a torre acima do gabarito sai com o
 *     contorno VERMELHO. É a única prova de que o bloco alcança a tela.
 *  3. O controle `?vazio=1`: o MESMO lote sem bloco tem de dar ~zero âmbar e
 *     ~zero vermelho — senão a medição estaria contando o fundo.
 *
 * ⚠️ O preenchimento do bloco é pintado com alpha 0,35 sobre o branco: o âmbar
 * #fcd34d vira ~(254, 240, 193) no pixel. Procurar o valor nominal daria zero
 * (a lição do loteamento: medir cor com alpha exige a cor COMPOSTA).
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
const ALVO = `${urlBase}/docs/spikes/massa/index.html`;

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

async function contarCores(p) {
  return p.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const conta = { ambar: 0, vermelho: 0, total: width * height };
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 32) continue;
      // Âmbar COMPOSTO do podium: pintado a 35 % por cima do preenchimento
      // verde-claro do LOTE (não do branco), o pixel cai para ~(240, 234, 184).
      // O que o identifica é a relação entre canais: R ≈ G, ambos bem acima de B.
      // A grade (azulada) e o verde do lote têm B ≥ R; o vermelho tem G ≈ B.
      if (r > 220 && b < 210 && r - b > 30 && g - b > 20 && Math.abs(r - g) < 30) conta.ambar += 1;
      // O contorno do bloco com problema (#dc2626) e o rótulo dele (#b91c1c).
      else if (r > 160 && g < 90 && b < 90) conta.vermelho += 1;
    }
    return conta;
  });
}

/** Abre e afasta a vista até o lote de 30 × 40 m caber (a vista nasce em 1 m = 50 px). */
async function abrir(url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const canvas = await page.$('canvas');
  if (canvas) {
    const caixa = await canvas.boundingBox();
    if (caixa) {
      await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
      for (let i = 0; i < 11; i += 1) await page.mouse.wheel(0, 120);
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(600);
}

const linhas = [];
let falhas = 0;
const exigir = (ok, texto) => {
  linhas.push(`${ok ? 'ok  ' : 'FALHA'} ${texto}`);
  if (!ok) falhas += 1;
};

// ── 1. COM blocos ────────────────────────────────────────────────────────────
await abrir(ALVO);
const dados = await page.evaluate(() => window.__massa ?? null);
const com = await contarCores(page);
await page.screenshot({ path: path.join(saida, 'massa-blocos.png') });

if (!dados) {
  exigir(false, 'window.__massa não existe — o harness não montou');
} else {
  exigir(dados.blocos === 2, `modelo: ${dados.blocos} blocos (esperado 2)`);
  exigir(dados.loteM2 === 1200, `lote ${dados.loteM2} m² (esperado 1.200)`);
  exigir(dados.implantacaoMaxM2 === 720, `implantação máxima ${dados.implantacaoMaxM2} m² (TO 60 % → 720)`);
  exigir(dados.potencialM2 === 3600, `área computável máxima ${dados.potencialM2} m² (CA 3 → 3.600)`);
  exigir(dados.pavimentosPossiveis === 5, `pavimentos possíveis ${dados.pavimentosPossiveis} (3.600 ÷ 720)`);
  exigir(dados.toPct === 60, `TO usada ${dados.toPct} % (a torre sobre o podium não soma duas vezes)`);
  exigir(JSON.stringify(dados.ordinaisDaTorre) === JSON.stringify([4, 5, 6, 7, 8, 9, 10]), `ordinais da torre ${JSON.stringify(dados.ordinaisDaTorre)}`);
  exigir(dados.pavimentosMax === 10, `pavimentos do prédio ${dados.pavimentosMax}`);
  exigir(JSON.stringify(dados.comProblema) === JSON.stringify(['Torre']), `blocos com problema: ${dados.comProblema.join(', ') || 'nenhum'} (esperado só a Torre)`);
  exigir(dados.construidaM2 === 720 * 3 + 225 * 7, `área construída ${dados.construidaM2} m² (2.160 + 1.575)`);
  // M2 — produto MISTO: o podium COMERCIAL recebe lojas, a torre RESIDENCIAL os apartamentos;
  // a torre vai até o 10º pavimento do prédio → 2 elevadores → núcleo 24 + 10 = 34 m².
  const pr = dados.produto;
  exigir(pr.nucleoDaTorre === 'SUGERIDO:34', `núcleo da torre ${pr.nucleoDaTorre} (esperado SUGERIDO:34)`);
  exigir(pr.torrePorPav > 0 && pr.podiumPorPav > 0, `unidades por pavimento: torre ${pr.torrePorPav} · podium ${pr.podiumPorPav}`);
  exigir(pr.unidades > 0 && pr.eficienciaGlobalPct > 40 && pr.eficienciaGlobalPct < 90, `produto: ${pr.unidades} unidades, eficiência global ${pr.eficienciaGlobalPct} %`);
  exigir(pr.vagasExigidas > 0, `vagas exigidas pelo produto: ${pr.vagasExigidas}`);
  // M3 — financeiro com CUB fixo (2.000 × 1,25): obra = (podium 2.160 + torre 1.575) × 2.500.
  const fi = dados.financeiro;
  exigir(fi && fi.custoObra === 3735 * 2500, `custo de obra ${fi?.custoObra} (3.735 m² × R$ 2.500)`);
  exigir(fi && fi.vgv > 0 && fi.margemPct !== null, `VGV ${fi?.vgv} · margem ${fi?.margemPct} %`);
  // O CUB REAL, pela mesma função da tela: tem de vir da TABELA, inclusive o PP-N (coluna pp_4_n).
  for (let i = 0; i < 20 && !dados.cubReal; i += 1) {
    await page.waitForTimeout(500);
    dados.cubReal = await page.evaluate(() => window.__massa?.cubReal ?? null);
  }
  const cr = dados.cubReal;
  exigir(cr && !cr.erro && cr.r8n.fonte === 'TABELA' && cr.r8n.valorM2 > 1000, `CUB real R8-N/MG: ${cr?.r8n?.valorM2} (${cr?.r8n?.fonte} ${cr?.r8n?.referencia ?? ''})${cr?.erro ? ' ' + cr.erro : ''}`);
  exigir(cr && !cr.erro && cr.ppn.fonte === 'TABELA' && cr.ppn.valorM2 > 1000, `CUB real PP-N/MG: ${cr?.ppn?.valorM2} (${cr?.ppn?.fonte}) — coluna pp_4_n`);
  // M5b — sol de 21/06 a 19,9° S (o sol fica ao norte o dia todo): a fachada norte da torre vê sol, a sul não;
  // a sombra cai para o sul — o vizinho da frente (rua, ao sul) perde, o dos fundos não. E cabe numa edição.
  const so = dados.sol;
  exigir(so && so.norteDaTorreH > 6 && so.sulDaTorreH === 0, `sol na torre em 21/06: norte ${so?.norteDaTorreH} h, sul ${so?.sulDaTorreH} h`);
  exigir(so && so.perdaFrenteH > 0 && so.perdaFundosH === 0, `sol tirado do vizinho: frente ${so?.perdaFrenteH} h, fundos ${so?.perdaFundosH} h`);
  exigir(so && so.ms < 150, `insolação completa da massa em ${so?.ms} ms (roda a cada edição com a gaveta aberta)`);
}
if (!com) exigir(false, 'não achei o canvas');
else {
  linhas.push(`      pixels: âmbar ${com.ambar} · vermelho ${com.vermelho}`);
  exigir(com.ambar > 3000, `o podium pintou (${com.ambar} px âmbar)`);
  exigir(com.vermelho > 200, `a torre acima do gabarito saiu em vermelho (${com.vermelho} px)`);
}

// ── 2. O CONTROLE: o mesmo lote sem bloco ────────────────────────────────────
await abrir(`${ALVO}?vazio=1`);
const sem = await contarCores(page);
await page.screenshot({ path: path.join(saida, 'massa-vazio.png') });
if (!sem) exigir(false, 'controle: não achei o canvas');
else {
  linhas.push(`      controle: âmbar ${sem.ambar} · vermelho ${sem.vermelho}`);
  exigir(sem.ambar < 100, `sem bloco não há âmbar (${sem.ambar} px)`);
  exigir(sem.vermelho < 50, `sem bloco não há vermelho (${sem.vermelho} px)`);
}

// ── 3. M5: a TELA do gerador de massa, com o Web Worker real ─────────────────
// 1.340 px = janela de 1.600 menos a barra lateral do app (260): a largura REAL
// do miolo — o harness sem barra mentia sobre a largura (a coluna Pareto cortada).
await page.setViewportSize({ width: 1340, height: 1300 });
await page.goto(`${ALVO}?gerar=1`, { waitUntil: 'networkidle' });
let ger = null;
for (let i = 0; i < 40 && !ger; i += 1) {
  await page.waitForTimeout(250);
  ger = await page.evaluate(() => window.__gerador ?? null);
}
exigir(ger && ger.viaWorker && !ger.erro, `worker do gerador respondeu no navegador (${ger?.msWorker} ms; fio principal ${ger?.msLocal} ms)${ger?.erro ? ' ' + ger.erro : ''}`);
exigir(ger && ger.igual, 'worker e fio principal deram o MESMO resultado (determinístico)');
exigir(ger && ['TORRE', 'DUAS_TORRES', 'LAMINA'].every((t) => ger.tipos.includes(t)), `os três cenários do pedido saíram: ${ger?.tipos?.join(', ')}`);
// Controle: ANTES do clique não há resumo nem linha — a medição abaixo discrimina.
const antes = await page.evaluate(() => ({ resumo: !!document.querySelector('[data-testid="resumo-do-gerador-de-massa"]'), linhas: document.querySelectorAll('[data-testid="tela-gerador-de-massa"] tbody tr td:not([colspan])').length }));
exigir(!antes.resumo && antes.linhas === 0, `controle: antes de gerar, nenhuma implantação na tela (${antes.linhas} células)`);
await page.click('[data-testid="gerar-massa"]');
await page.waitForSelector('[data-testid="resumo-do-gerador-de-massa"]', { timeout: 20000 }).catch(() => null);
const tela = await page.evaluate(() => {
  const resumo = document.querySelector('[data-testid="resumo-do-gerador-de-massa"]')?.textContent ?? null;
  const linhas = [...document.querySelectorAll('[data-testid="tela-gerador-de-massa"] tbody tr')].map((tr) => tr.textContent ?? '');
  const svg = document.querySelector('[data-testid="mini-implantacao"]');
  const caixa = svg?.getBoundingClientRect();
  // A rolagem horizontal da tabela: o contêiner que rola é o ancestral do <table> com overflow.
  let rolagem = null;
  for (let el = document.querySelector('[data-testid="tela-gerador-de-massa"] table'); el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) {
      rolagem = { scroll: el.scrollWidth, visivel: el.clientWidth };
      break;
    }
  }
  return { resumo, linhas, caminhos: svg ? svg.querySelectorAll('path').length : 0, svgAltura: caixa ? Math.round(caixa.height) : 0, rolagem };
});
await page.screenshot({ path: path.join(saida, 'massa-gerador.png'), fullPage: true });
linhas.push(`      gerador: ${tela.resumo ?? '(sem resumo)'}`);
exigir(!!tela.resumo && /\d+ combinações medidas, \d+ viáveis/.test(tela.resumo), 'a tela mostrou o resumo da varredura');
exigir(tela.linhas.length >= 3, `a tabela tem ${tela.linhas.length} implantação(ões) (uma por tipo)`);
for (const t of ['Torre única', 'Duas torres', 'Bloco longitudinal']) exigir(tela.linhas.some((l) => l.startsWith(t)), `linha "${t}" na tabela`);
exigir(!tela.rolagem, tela.rolagem ? `a tabela rola na horizontal no miolo de 1.340 px (${tela.rolagem.scroll} > ${tela.rolagem.visivel})` : 'a tabela cabe no miolo do app com a barra lateral (sem rolagem horizontal)');
exigir(tela.caminhos >= 2 && tela.svgAltura > 200, `a planta da implantação desenhou o lote e os blocos (${tela.caminhos} contornos, ${tela.svgAltura} px)`);

exigir(erros.length === 0, erros.length === 0 ? 'nenhum erro de console' : `erros: ${erros.slice(0, 3).join(' | ')}`);

console.log(linhas.join('\n'));
console.log(falhas === 0 ? '\n✅ estudo de massa desenha e mede certo' : `\n❌ ${falhas} falha(s)`);
await browser.close();
process.exit(falhas === 0 ? 0 : 1);
