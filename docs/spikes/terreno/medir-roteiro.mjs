/**
 * Mede o ROTEIRO PERIMÉTRICO (A1) no navegador real, e é um PORTÃO (exit ≠ 0).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/terreno/medir-roteiro.mjs [urlBase] [pastaDeSaida]
 *
 * O que afirma, e por quê — jsdom já provou os botões; o que só o navegador
 * mostra é a TABELA com layout e o campo de nome dentro da linha do quadro:
 *
 *  1. Quadro de divisas SEM georreferência: coluna "Vértice" com os nomes
 *     provisórios (V1…) em cinza e "Azimute (des.)" — o rótulo diz que é de
 *     desenho, não o do memorial.
 *  2. COM georreferência + vértices nomeados: "Azimute" sem o "(des.)", os
 *     nomes P1…P5 nos campos, e o azimute difere do de desenho (convergência).
 *  3. A gaveta do roteiro com E/N, latitude "S", longitude "W", o memorial no
 *     textarea e a restituição do próprio memorial fechando em 0,000 m.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* env */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? 'C:/tmp';
const ALVO = `${urlBase}/docs/spikes/terreno/quadro.html`;

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

const linhas = [];
let falhas = 0;
const exigir = (ok, texto) => {
  linhas.push(`${ok ? 'ok  ' : 'FALHA'} ${texto}`);
  if (!ok) falhas += 1;
};
const abrir = async (q) => {
  await page.goto(`${ALVO}${q}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
};
const cabecalhos = () => page.$$eval('th', (ths) => ths.map((t) => t.textContent?.trim() ?? ''));

// ── 1. quadro sem georreferência ─────────────────────────────────────────────
await abrir('');
let ths = await cabecalhos();
exigir(ths.includes('Vértice'), `coluna Vértice presente (${ths.join(' | ')})`);
exigir(ths.some((t) => /^Azimute \(des\.\)$/.test(t)), 'sem georreferência o azimute é rotulado "(des.)"');
const provisorios = await page.$$eval('input[aria-label^="Nome do vértice"]', (els) => els.map((e) => e.placeholder));
exigir(provisorios.length === 5 && provisorios.every((p) => /^V\d$/.test(p)), `5 vértices provisórios V1…V5 (${provisorios.join(',')})`);
await page.screenshot({ path: path.join(saida, 'roteiro-quadro-sem-geo.png') });

// ── 2. quadro com georreferência e vértices nomeados ─────────────────────────
await abrir('?geo=1&vertices=1');
ths = await cabecalhos();
exigir(ths.some((t) => t === 'Azimute'), 'com georreferência o azimute perde o "(des.)"');
const nomes = await page.$$eval('input[aria-label^="Nome do vértice"]', (els) => els.map((e) => e.value));
exigir(nomes.length === 5 && nomes.every((n) => /^P\d$/.test(n)), `vértices nomeados P1…P5 nos campos (${nomes.join(',')})`);
const azimutes = await page.$$eval('td span[title^="Rumo"]', (els) => els.map((e) => e.textContent?.trim() ?? ''));
exigir(azimutes.length === 5 && azimutes.every((a) => /^\d+°\d{2}'\d{2}"$/.test(a)), `5 azimutes em GMS (${azimutes[0]}…)`);
await page.screenshot({ path: path.join(saida, 'roteiro-quadro-com-geo.png') });

// Editar o nome de um vértice pelo quadro: Enter grava.
const campo = (await page.$$('input[aria-label^="Nome do vértice"]'))[0];
if (campo) {
  await campo.fill('M-0001');
  await campo.press('Enter');
  await page.waitForTimeout(300);
  const depois = await page.$$eval('input[aria-label^="Nome do vértice"]', (els) => els.map((e) => e.value));
  exigir(depois[0] === 'M-0001', `renomear pelo quadro grava no kernel (${depois[0]})`);
} else {
  exigir(false, 'não há campo de nome de vértice para editar');
}

// ── 3. a gaveta do roteiro ──────────────────────────────────────────────────
await abrir('?geo=1&vertices=1&roteiro=1');
const painel = await page.$('[data-testid="painel-roteiro"]');
exigir(!!painel, 'gaveta do roteiro montou');
const texto = (await painel?.textContent()) ?? '';
exigir(/E \(m\)/.test(texto) && /N \(m\)/.test(texto), 'tabela traz E (m) e N (m)');
exigir(/\d+°\d{2}'\d{2},\d{3}" S/.test(texto), 'latitude em GMS com S');
exigir(/\d+°\d{2}'\d{2},\d{3}" W/.test(texto), 'longitude em GMS com W');
exigir(/convergência meridiana/.test(texto), 'convergência meridiana informada');
const memorial = await page.$eval('textarea[aria-label="Memorial descritivo convencional"]', (e) => e.value);
exigir(/Inicia-se a descrição no vértice P1/.test(memorial), 'memorial começa no P1');
exigir(/fechando o perímetro/.test(memorial), 'memorial fecha o perímetro');

// Restituição do PRÓPRIO memorial: cola e confere o fechamento.
await page.fill('textarea[aria-label="Texto do memorial a restituir"]', memorial);
await page.waitForTimeout(400);
const rest = (await page.$eval('[data-testid="restituicao"]', (e) => e.textContent)) ?? '';
const m = rest.match(/erro de fechamento ([\d,]+) m/);
const erroM = m ? Number(m[1].replace(',', '.')) : NaN;
exigir(/5 trecho\(s\) lido\(s\)/.test(rest), `restituição leu 5 trechos (${rest.slice(0, 60)})`);
exigir(Number.isFinite(erroM) && erroM <= 0.01, `erro de fechamento ${m?.[1] ?? '?'} m ≤ 0,010`);
// Já há lote: lançar por cima é bloqueado, e o botão DIZ por quê.
const btn = await page.$('button:has-text("Lançar")');
exigir(!!btn && (await btn.isDisabled()), 'com lote desenhado, "Lançar" fica apagado');
exigir(/apague as divisas/i.test((await btn?.getAttribute('title')) ?? ''), 'e o title explica');
await page.screenshot({ path: path.join(saida, 'roteiro-gaveta.png'), fullPage: true });

process.on('uncaughtException', (e) => { console.log(linhas.join('\n')); console.log('❌ exceção:', String(e).slice(0, 300)); process.exit(1); });
exigir(erros.length === 0, erros.length === 0 ? 'nenhum erro de console' : `erros: ${erros.slice(0, 3).join(' | ')}`);
console.log(linhas.join('\n'));
console.log(falhas === 0 ? '\n✅ roteiro perimétrico no navegador' : `\n❌ ${falhas} falha(s)`);
await browser.close();
process.exit(falhas === 0 ? 0 : 1);
