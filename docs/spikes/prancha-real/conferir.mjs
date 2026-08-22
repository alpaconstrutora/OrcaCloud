/**
 * Confere a planta de fundo com uma PRANCHA A0 REAL, em Chrome de verdade.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/prancha-real/conferir.mjs [urlBase] [caminho.pdf]
 *
 * Complementa `docs/spikes/medicoes/passeio.mjs`, que prova a matemática com
 * uma imagem fabricada de 400×300. Aqui as perguntas são as que só uma prancha
 * de projeto responde — rasterizar 35 megapixels, e o que o usuário vê logo
 * depois de importar.
 *
 * NADA de constante copiada do componente. A escala da vista é DEDUZIDA do
 * próprio render (largura na tela ÷ largura em pixel da imagem): harness que
 * duplica constante do componente envelhece calado — foi o que aconteceu em
 * `docs/spikes/arrastar-ponta/`, que mirava 580 px acima da alça e relatava
 * defeito onde não havia.
 */
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
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

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3103';
const pdfPath =
  process.argv[3] ?? 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';

const pdfB64 = readFileSync(pdfPath).toString('base64');
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});

/**
 * Caixas das duas camadas no canvas: a tinta da prancha e o traço da medição.
 *
 * A ordem dos testes importa. O azul do traço (#2563eb) tem R e G baixos; um
 * "escuro" testado antes engoliria o traço e as duas caixas viriam iguais por
 * construção — medição que não mede nada.
 */
const LEITOR = () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const dpr = window.devicePixelRatio || 1;
  const d = ctx.getImageData(0, 0, w, h).data;

  const vazio = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity, n: 0 };
  const c = { tinta: { ...vazio }, forma: { ...vazio } };
  const porLinha = new Array(h).fill(0);

  const somar = (a, x, y) => {
    a.x1 = Math.min(a.x1, x);
    a.y1 = Math.min(a.y1, y);
    a.x2 = Math.max(a.x2, x);
    a.y2 = Math.max(a.y2, y);
    a.n += 1;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (b > 150 && r < 120 && g < 140) somar(c.forma, x / dpr, y / dpr);
      // Tinta da prancha, separada por NEUTRALIDADE, não por escuridão.
      //
      // Reduzir 35 MP para menos de 900 px de tela transforma traço preto de
      // 1 px em cinza CLARO — um limiar de escuridão acha só os trechos mais
      // densos (o carimbo, uma hachura) e devolve uma caixa que não é a da
      // folha. Foi assim que a primeira versão desta medição relatou 32 px de
      // afastamento numa prancha que a captura mostrava alinhada.
      //
      // O que separa as camadas de verdade é a COR: a tinta do projeto é
      // neutra (r≈g≈b), a grade do canvas é azulada (#cbd5e1: b−r = 22) e o
      // papel é branco puro.
      else if (Math.max(r, g, b) - Math.min(r, g, b) < 12 && r < 235) {
        somar(c.tinta, x / dpr, y / dpr);
        porLinha[y] += 1;
      }
    }
  }

  // O perfil sai em pixel de DISPOSITIVO (a linha `y` do laço), e é normalizado
  // logo em seguida — o dpr se cancela, então não há conversão a fazer aqui.
  const faixas = 24;
  const perfil = new Array(faixas).fill(0);
  if (c.tinta.n > 0) {
    const yA = Math.round(c.tinta.y1 * dpr);
    const yB = Math.round(c.tinta.y2 * dpr);
    const altura = yB - yA + 1;
    let total = 0;
    for (let y = yA; y <= yB; y++) {
      const f = Math.min(faixas - 1, Math.floor(((y - yA) / altura) * faixas));
      perfil[f] += porLinha[y] ?? 0;
      total += porLinha[y] ?? 0;
    }
    if (total > 0) for (let i = 0; i < faixas; i++) perfil[i] /= total;
  }

  return {
    ...c,
    perfil,
    tela: { w: w / dpr, h: h / dpr },
  };
};

/** Distância entre dois perfis normalizados: soma das diferenças absolutas. */
const distanciaPerfil = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);


const resultados = [];
const registrar = (nome, ok, detalhe) => {
  resultados.push({ nome, ok, detalhe });
  console.log(`  ${ok ? '✓' : '✖'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

async function abrir(cena, defeito = null) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', (e) => console.log('     PAGE ERROR:', e.message));
  await page.addInitScript((b64) => {
    window.__PDF_B64 = b64;
  }, pdfB64);
  const q = `?cena=${cena}${defeito ? `&defeito=${defeito}` : ''}`;
  await page.goto(`${urlBase}/docs/spikes/prancha-real/index.html${q}`, {
    waitUntil: 'domcontentloaded',
  });
  // Rasterizar um A0 leva segundos — o padrão de 30 s reprovaria por relógio.
  await page.waitForSelector('body[data-pronto]', { timeout: 180000 });
  const erro = await page.evaluate(() => window.__erro ?? null);
  if (erro) {
    await page.close();
    throw new Error(erro);
  }
  await page.waitForSelector('canvas');
  await page.waitForTimeout(400);
  return page;
}

const capturas = process.env.CAPTURAS ?? null;

// ── 1 — um A0 rasteriza no navegador ────────────────────────────────────────
console.log('\n1 · Rasterizar a prancha A0 (o caminho real de importação)');
let diag;
{
  const page = await abrir('importada');
  diag = await page.evaluate(() => window.__diag);

  registrar(
    'a página 1 vira imagem sem estourar o canvas',
    diag.larguraPx > 0 && diag.alturaPx > 0 && diag.blobKb > 0,
    `${diag.larguraPx}×${diag.alturaPx} px (${diag.megapixels} MP) · ` +
      `papel ${diag.papelMm.largura}×${diag.papelMm.altura} mm · ` +
      `PNG ${diag.blobKb} KB · ${diag.msRaster} ms · ${diag.totalPaginas} página(s)`,
  );

  await page.close();
}

// ── 2 — o que aparece na tela logo depois de importar ───────────────────────
//
// A prancha nasce SEM aferição (`mmPorPixel = 1`), de propósito. O que se
// exige aqui não é escala certa — é que a prancha apareça INTEIRA e legível,
// em vez da mancha de 300×59 px encostada no rodapé que o editor mostrava
// até 22/08/2026.
console.log('\n2 · Recém-importada, sem aferição (é o que o app grava)');

for (const [rotulo, defeito, esperaCoube] of [
  ['prancha enquadrada', null, true],
  ['sem enquadrar (defeito)', 'sem-enquadrar', false],
]) {
  const page = await abrir('importada', defeito);
  const c = await page.evaluate(LEITOR);
  if (capturas) {
    await page.screenshot({ path: `${capturas}/01_importada_${defeito ?? 'ok'}.png` });
  }
  await page.close();

  if (c.tinta.n === 0) {
    registrar(rotulo, false, 'nenhum pixel de tinta na tela');
    continue;
  }

  const larguraTela = c.tinta.x2 - c.tinta.x1;
  const alturaTela = c.tinta.y2 - c.tinta.y1;
  // Escala DEDUZIDA do render, não copiada do componente: quantos pixels de
  // tela cada pixel da imagem ocupou na horizontal.
  const porPixelImagem = larguraTela / (diag.tinta.caixa.x2 - diag.tinta.caixa.x1);
  const alturaEsperada = (diag.tinta.caixa.y2 - diag.tinta.caixa.y1) * porPixelImagem;
  const visivel = alturaTela / alturaEsperada;

  // Duas exigências, e a segunda é a que pega o caso ruim de verdade: caber
  // não basta se couber pequeno demais para se enxergar. A mancha antiga
  // ocupava 2,8% da área da tela.
  const areaDaTela = (larguraTela * alturaTela) / (c.tela.w * c.tela.h);
  const coube = visivel > 0.95 && areaDaTela > 0.3;

  registrar(
    `${rotulo}: a prancha inteira aparece na vista inicial`,
    coube === esperaCoube,
    `${(visivel * 100).toFixed(0)}% da altura visível · ocupa ` +
      `${larguraTela.toFixed(0)}×${alturaTela.toFixed(0)} px ` +
      `(${(areaDaTela * 100).toFixed(0)}% da tela ${c.tela.w}×${c.tela.h}) · ` +
      `y ${c.tinta.y1.toFixed(0)}..${c.tinta.y2.toFixed(0)}`,
  );
}

// ── 3 — aferida: alinhamento e orientação ───────────────────────────────────
console.log('\n3 · Aferida a 1:100 — alinhamento com o que se traça por cima');

for (const [rotulo, defeito, esperaAlinhado, esperaNaOrdem] of [
  ['prancha aferida', null, true, true],
  ['aferição 10% errada (defeito)', 'escala', false, true],
  ['imagem virada na vertical (defeito)', 'espelho', true, false],
]) {
  console.log(`\n   ${rotulo}`);
  const page = await abrir('aferida', defeito);

  // Afasta o zoom até a prancha caber. É o gesto real (roda do mouse), e de
  // quebra repete com imagem REAL a pergunta "continua colada no zoom?".
  const centro = { x: 450, y: 350 };
  await page.mouse.move(centro.x, centro.y);
  let c = null;
  let notches = 0;
  for (; notches < 30; notches++) {
    c = await page.evaluate(LEITOR);
    const dentro =
      c.tinta.n > 0 &&
      c.tinta.x1 > 4 &&
      c.tinta.y1 > 4 &&
      c.tinta.x2 < c.tela.w - 4 &&
      c.tinta.y2 < c.tela.h - 4;
    if (dentro) break;
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(90);
  }
  c = await page.evaluate(LEITOR);
  if (capturas) {
    await page.screenshot({ path: `${capturas}/02_aferida_${defeito ?? 'ok'}.png` });
  }
  await page.close();

  const afastamento =
    c.tinta.n === 0 || c.forma.n === 0
      ? null
      : Math.max(
          Math.abs(c.tinta.x1 - c.forma.x1),
          Math.abs(c.tinta.y1 - c.forma.y1),
          Math.abs(c.tinta.x2 - c.forma.x2),
          Math.abs(c.tinta.y2 - c.forma.y2),
        );

  // Tolerância em pixel de TELA. A prancha está reduzida ~90× aqui, então um
  // pixel de tela vale ~90 px de imagem: exigir menos que isso seria exigir
  // precisão que a tela não tem para dar.
  const alinhado = afastamento !== null && afastamento <= 6;
  registrar(
    `${rotulo}: o traçado coincide com a prancha`,
    alinhado === esperaAlinhado,
    afastamento === null
      ? `camada faltando — tinta ${c.tinta.n} px, traço ${c.forma.n} px`
      : `afastamento ${afastamento.toFixed(0)} px · ${notches} passos de roda`,
  );

  // ORIENTAÇÃO. A caixa coincidir não prova NADA sobre espelhamento: uma
  // moldura virada de cabeça para baixo ocupa exatamente a mesma caixa. O que
  // denuncia é o FORMATO da distribuição da tinta ao longo da altura —
  // comparado contra ele mesmo virado, que é o único par em que a diferença de
  // resolução entre tela e origem se cancela.
  const naOrdem = distanciaPerfil(c.perfil, diag.tinta.perfil);
  const virado = distanciaPerfil(c.perfil, [...diag.tinta.perfil].reverse());

  const naOrdemVence = c.tinta.n > 0 && naOrdem < virado;
  registrar(
    `${rotulo}: a imagem não sai espelhada na vertical`,
    naOrdemVence === esperaNaOrdem,
    c.tinta.n === 0
      ? 'sem tinta'
      : `perfil na ordem ${naOrdem.toFixed(3)} · virado ${virado.toFixed(3)} — ` +
        `${naOrdemVence ? 'na ordem' : 'VIRADA'}, por ` +
        `${(Math.abs(virado - naOrdem) / Math.max(virado, naOrdem) * 100).toFixed(0)}%`,
  );
}

// ── 4 — gerar parede a partir do vetor, no navegador ────────────────────────
//
// O algoritmo já é medido por teste de unidade e pelo spike em Node. O que só
// esta cena cobre é `extrairSegmentosPdf` com o pdfjs do NAVEGADOR: o spike usa
// o build `legacy`, o app usa o normal.
console.log('\n4 · Gerar paredes do vetor (caminho do app, no navegador)');
{
  const page = await abrir('vetor');
  const v = await page.evaluate(() => window.__vetor);
  await page.close();

  // 19923 é a contagem EXATA do spike em Node. Bater no número cheio é o que
  // prova que os dois builds do pdfjs leem a mesma folha.
  //
  // `doGrupo` NÃO se compara com os 147 do spike: aqui a espessura é filtrada
  // na folha inteira e a região é recortada depois, dentro de `gerarParedes`;
  // lá a região vem primeiro. Ordem diferente, mesmo resultado final — foi
  // esta asserção que reprovou primeiro, e o errado era ela.
  registrar(
    'o pdfjs do navegador extrai os mesmos traços que o de Node',
    v.totalSegmentos === 19923,
    `${v.totalSegmentos} traços na folha (spike: 19923) · ${v.doGrupo} de 0,60 pt na FOLHA · ` +
      `página ${Math.round(v.paginaPt.largura)}×${Math.round(v.paginaPt.altura)} pt · ${v.msVetor} ms`,
  );

  // O spike em Node mede 58 eixos nesta mesma região. Uma folga de ±4 cobre o
  // arredondamento para milímetro inteiro, que o spike não faz; divergência
  // maior significa que os dois caminhos deixaram de concordar.
  registrar(
    'gera o mesmo número de paredes que o spike (58)',
    Math.abs(v.paredes - 58) <= 4,
    `${v.paredes} paredes · ${v.comprimentoTotalM} m · ` +
      `escala ${v.mmPorPt.toFixed(1)} mm/pt`,
  );

  const dominantes = v.espessuras.slice(0, 3).map((e) => e.mm);
  registrar(
    'as espessuras dominantes são de construção (20/15/10 cm)',
    dominantes.length === 3 && dominantes.every((mm) => [100, 150, 200].includes(mm)),
    v.espessuras.map((e) => `${e.mm / 10} cm ×${e.n}`).join(' · '),
  );
}

await browser.close();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} conferências passaram.`);
if (falhas.length > 0) console.log('Reprovadas: ' + falhas.map((f) => f.nome).join(', '));
process.exit(falhas.length === 0 ? 0 : 1);
