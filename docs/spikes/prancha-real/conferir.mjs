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
  // Lido na MESMA visita: a cena `vetor` produz os dois, e reabrir só para as
  // portas custaria outro raster de 35 MP.
  const pt = await page.evaluate(() => window.__portas);
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

  // O spike em Node mede 58 EIXOS nesta região, e não filtra nada. A producao
  // descarta os topos de parede por esbeltez (ver ESBELTEZ_MINIMA), e sobram
  // 28 -- metade da contagem, 96% do comprimento. A folga de ±4 cobre o
  // arredondamento para milimetro inteiro, que o spike nao faz.
  //
  // As DUAS metades importam: cair muito abaixo de 28 significa que o filtro
  // comecou a comer parede; subir para perto de 58 significa que ele parou de
  // funcionar.
  registrar(
    'gera as paredes esbeltas (28 dos 58 eixos do spike)',
    Math.abs(v.paredes - 28) <= 4,
    `${v.paredes} paredes · ${v.comprimentoTotalM} m · ` +
      `escala ${v.mmPorPt.toFixed(1)} mm/pt`,
  );

  // ── Fase 2: a volta pelo arquivo guardado ─────────────────────────────
  //
  // O vetor gravado na importação tem as coordenadas arredondadas em 0,01 pt.
  // Em teoria isso é 0,35 mm a 1:100 e não muda nada — mas "em teoria" é como
  // se perde precisao sem perceber, porque o agrupamento de colineares compara
  // offsets com uma casa decimal e um arredondamento anterior pode empurrar um
  // traco para o grupo vizinho.
  registrar(
    'o vetor guardado gera exatamente as mesmas paredes',
    v.guardado.paredes === v.paredes && v.guardado.difComprimentoMm < 1,
    `${v.guardado.paredes} paredes (cru: ${v.paredes}) · ` +
      `diferenca de comprimento ${v.guardado.difComprimentoMm.toFixed(2)} mm · ` +
      `${v.guardado.segmentos} tracos em ${v.guardado.kb} KB`,
  );

  // ── A INVARIANTE QUE FALTAVA ─────────────────────────────────────────
  //
  // Conferir a CONTAGEM de paredes aprova um resultado inteiramente fora do
  // lugar. Esta conferência nasceu de um defeito que chegou a producao: a
  // prancha tem page.rotate = 270, a conversao ignorava o giro, e as paredes
  // caiam dezenas de metros ACIMA do desenho.
  registrar(
    'toda parede gerada cai DENTRO da imagem',
    v.foraDaImagem === 0,
    v.foraDaImagem === 0
      ? `${v.paredes} paredes, nenhuma fora · caixa da imagem ` +
        `x ${v.caixaImagem.x0.toFixed(0)}..${v.caixaImagem.x1.toFixed(0)} · ` +
        `y ${v.caixaImagem.y0.toFixed(0)}..${v.caixaImagem.y1.toFixed(0)} mm`
      : `${v.foraDaImagem} de ${v.paredes} paredes FORA da imagem`,
  );

  // A mitragem de canto, medida. Sem ela eram 2 pontas soltas por parede --
  // nenhuma encostava em outra. Com ela, as que sobram sao vao de porta.
  // FAIXA, e nao teto. Medido nesta regiao: 1,46 por parede, contra 2,00 sem
  // mitragem. Nao chega perto de zero porque esta planta tem porta de verdade,
  // e porta TEM de continuar aberta -- o limite de 30 cm da mitragem nao a
  // alcanca, de proposito.
  //
  // Subir para perto de 2,00 = a mitragem parou de funcionar.
  // Cair para perto de 0 = ela ficou generosa e fechou vao de porta com
  // parede, que e o erro invisivel: a planta fecha bonito com um comodo a
  // menos.
  const porParede = v.soltas / v.paredes;
  registrar(
    'as paredes se encontram nos cantos, e a porta continua aberta',
    porParede > 0.8 && porParede < 1.7,
    `${v.soltas} pontas soltas em ${v.paredes} paredes ` +
      `(${porParede.toFixed(2)} por parede; sem mitragem seriam 2,00)`,
  );

  const dominantes = v.espessuras.slice(0, 3).map((e) => e.mm);
  registrar(
    'as espessuras dominantes são de construção (20/15/10 cm)',
    dominantes.length === 3 && dominantes.every((mm) => [100, 150, 200].includes(mm)),
    v.espessuras.map((e) => `${e.mm / 10} cm ×${e.n}`).join(' · '),
  );

  // ── 5 · PORTAS pelo arco de giro ────────────────────────────────────────
  console.log('\n5 · Gerar portas do arco (caminho do app, no navegador)');

  // O build NORMAL do pdfjs entrega curva? O spike de Node usa o `legacy`, e
  // curva e justamente o que as rodadas 1-4 descartavam. Se o build do app
  // devolvesse `curveTo` de outra forma, a porta sumiria em producao com
  // todo teste de unidade verde.
  registrar(
    'o pdfjs do navegador entrega as curvas do PDF',
    pt.totalArcos > 1500,
    `${pt.totalArcos} arcos na folha (spike em Node: 1722)`,
  );

  // Os 5 candidatos por raio sao os mesmos que o Spike C (rodada 5) mediu
  // nesta regiao. Separar candidato de porta casada e o que distingue "o
  // detector nao viu" de "nao havia parede onde pendurar".
  registrar(
    'o detector acha os candidatos por raio de folha na regiao',
    pt.candidatosPorRaio === 5,
    `${pt.candidatosPorRaio} candidatos por raio (Spike C: 5)`,
  );

  // 3 de 5, e nao 5: os outros dois sao portas cuja parede hospedeira nao foi
  // gerada. Subir para 5 aqui significaria que a folga da dobradica ficou
  // generosa e passou a pendurar porta em parede que nao e a dela.
  registrar(
    'as portas casam com a parede que as hospeda',
    pt.portas === 3,
    `${pt.portas} portas · larguras ${pt.larguras.join(', ')} mm`,
  );

  // Largura de folha de verdade: 730 e 832 mm sao as medidas do desenho.
  registrar(
    'a largura do vao e a folha real, nao um numero qualquer',
    pt.larguras.length > 0 && pt.larguras.every((mm) => mm >= 550 && mm <= 1700),
    pt.larguras.map((mm) => `${mm} mm`).join(' · '),
  );

  // A INVARIANTE QUE A PAGINA GIRADA ENSINOU: contagem certa com posicao
  // errada aprova em teste de unidade, no spike e no harness -- os tres
  // usavam a mesma conversao defeituosa e erravam juntos. A porta tem de
  // cair DENTRO da imagem, como a parede.
  registrar(
    'toda porta gerada cai DENTRO da imagem',
    pt.foraDaImagem === 0,
    `${pt.portas} portas, ${pt.foraDaImagem} ponta(s) de vao fora da imagem`,
  );
}

// ── 6 · A JANELA DE REGIAO (Fase 4) ─────────────────────────────────────────
//
// Gesto puro: nenhum teste de unidade alcanca "arrastar 300x200 px na tela
// vira um retangulo em milimetro do modelo". A conversao tela->modelo e a
// mesma que ja errou uma vez aqui (pagina girada), entao contar nao basta --
// o retangulo tem de BATER com o que a propria vista diz.
console.log('\n6 · Marcar a regiao arrastando no desenho');
{
  const page = await abrir('janela');
  const caixa = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  // Um clique CURTO primeiro: e desistencia, nao regiao de area zero.
  const cx = caixa.x + caixa.w / 2;
  const cy = caixa.y + caixa.h / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 2, cy + 2);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const depoisDoClique = await page.evaluate(() => ({
    regiao: window.__regiao,
    nulls: window.__regiaoNulls ?? 0,
  }));
  registrar(
    'clique sem arrastar NAO vira regiao de area zero',
    depoisDoClique.regiao === null && depoisDoClique.nulls >= 1,
    `regiao ${depoisDoClique.regiao === null ? 'null' : 'DEFINIDA'} · ${depoisDoClique.nulls} desistencia(s)`,
  );

  // Agora o arraste de verdade.
  const x0 = caixa.x + caixa.w * 0.25;
  const y0 = caixa.y + caixa.h * 0.25;
  const x1 = caixa.x + caixa.w * 0.75;
  const y1 = caixa.y + caixa.h * 0.65;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 8 });
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const r = await page.evaluate(() => window.__regiao);
  registrar(
    'o arraste marca uma regiao',
    !!r && r.x1 > r.x0 && r.y1 > r.y0,
    r ? `${Math.round(r.x1 - r.x0)} x ${Math.round(r.y1 - r.y0)} mm` : 'nenhuma',
  );

  // A PROVA DE POSICAO. `onVistaMudou` da o retangulo VISIVEL em mm; o
  // arraste cobriu de 25% a 75% da largura e de 25% a 65% da altura da tela.
  // Logo a regiao tem de medir ~50% da largura visivel e ~40% da altura --
  // com o Y invertido do modelo, a proporcao e o que se compara, nao o sinal.
  const vista = await page.evaluate(() => window.__vista ?? null);
  if (vista && r) {
    const fx = (r.x1 - r.x0) / (vista.x1 - vista.x0);
    const fy = (r.y1 - r.y0) / (vista.y1 - vista.y0);
    registrar(
      'a regiao cobre a fracao da tela que foi arrastada',
      Math.abs(fx - 0.5) < 0.06 && Math.abs(fy - 0.4) < 0.06,
      `largura ${(fx * 100).toFixed(1)}% (esperado 50%) · altura ${(fy * 100).toFixed(1)}% (esperado 40%)`,
    );
  } else {
    registrar(
      'a regiao cobre a fracao da tela que foi arrastada',
      false,
      'a cena nao expos __vista — sem referencia para comparar',
    );
  }

  // ESCAPE NAO APAGA a regiao confirmada. Foi a decisao de desenho da Fase 4,
  // e e o tipo de coisa que se perde numa refatoracao sem ninguem notar.
  const antes = await page.evaluate(() => window.__regiao);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const depois = await page.evaluate(() => window.__regiao);
  registrar(
    'Escape desiste do gesto e PRESERVA a regiao marcada',
    !!depois && JSON.stringify(antes) === JSON.stringify(depois),
    depois ? 'regiao intacta depois do Escape' : 'a regiao SUMIU',
  );

  await page.close();
}

await browser.close();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} conferências passaram.`);
if (falhas.length > 0) console.log('Reprovadas: ' + falhas.map((f) => f.nome).join(', '));
process.exit(falhas.length === 0 ? 0 : 1);
