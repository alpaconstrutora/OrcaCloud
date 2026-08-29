/**
 * Copia e cola objetos da planta num navegador de verdade e confere o que saiu.
 *
 * Pedido do usuário em 29/08/2026: "funcionalidade de copiar e colar objetos
 * (paredes, portas, janelas...)".
 *
 * Quatro medições, e a QUARTA é a que discrimina o defeito mais provável:
 *   1. Ctrl+C sem seleção não guarda nada — e diz por quê
 *   2. copiar a sala inteira e colar leva PORTA E JANELA junto, no mesmo offset
 *   3. a cópia cai NO CURSOR: a âncora (canto x mín, y mín) pousa no ponteiro,
 *      e a geometria interna do bloco fica intacta
 *   4. copiar SÓ a porta e colar sobre OUTRA parede põe a porta naquela parede,
 *      centrada no cursor — e, sem parede sob o cursor, NADA é colado e o aviso
 *      aparece. Sem a segunda metade, a primeira não prova que o canvas
 *      consultou o ponteiro: uma implementação que colasse sempre na parede
 *      original passaria.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/copiar-colar/medir.mjs [urlBase]
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
const LARGURA = 1000;
const ALTURA = 700;

// A MESMA matemática de `paraTela` do canvas: escala inicial 0,05 px/mm, margem
// de 60 px e a ORIGEM NO RODAPÉ — o Y do modelo cresce para cima, o da tela
// para baixo.
const ESCALA = 0.05;
const MARGEM = 60;
const paraTela = (p) => ({ x: MARGEM + p.x * ESCALA, y: ALTURA - MARGEM - p.y * ESCALA });

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA } });

async function abrir() {
  await page.goto(`${urlBase}/docs/spikes/copiar-colar/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Array.isArray(window.__paredes));
  // O canvas precisa do FOCO para receber Ctrl+C/Ctrl+V: o atalho é tratado no
  // `onKeyDown` dele, e não num ouvinte de `window`, justamente para não
  // sequestrar o Ctrl+C dos campos de texto dos painéis do editor.
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
}

const ler = () =>
  page.evaluate(() => ({
    paredes: window.__paredes,
    aberturas: window.__aberturas,
    selecionados: window.__selecionados,
    copiado: window.__copiado,
    aviso: window.__aviso,
  }));

/** Põe o ponteiro num ponto do MODELO — é ele que o Ctrl+V vai consultar. */
async function apontar(pontoMundo) {
  const t = paraTela(pontoMundo);
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(60);
}

async function selecionar(ids) {
  await page.evaluate((lista) => window.__selecionar?.(lista), ids);
  await page.waitForTimeout(80);
}

const atalho = async (tecla) => {
  await page.keyboard.press(`Control+${tecla}`);
  await page.waitForTimeout(120);
};

// ── 1. Ctrl+C sem seleção ───────────────────────────────────────────────────
await abrir();
await selecionar([]);
await atalho('c');
const semSelecao = await ler();

// ── 2 e 3. Copiar a sala inteira e colar no cursor ──────────────────────────
await abrir();
const inicial = await ler();
const idsDaSala = inicial.paredes.map((w) => w.id);
await selecionar(idsDaSala);
await atalho('c');
const comCopia = await ler();

// A âncora da sala é (1000, 1000) — o canto de x e y mínimos. Colando com o
// ponteiro em (1000, 9000), a sala inteira deve subir 8.000 mm e nada mais.
const DESTINO = { x: 1000, y: 9000 };

// TRAVA CONTRA O TESTE QUE APROVA A SI MESMO. Com o destino EM CIMA da âncora o
// delta seria zero: a cópia sairia por cima do original e `saiuInteiro` passaria
// com qualquer implementação — inclusive uma que ignorasse o cursor. É a mesma
// armadilha que fez a medição 6 do harness do terreno nascer retângulo, e ela
// vive aqui como condição de execução, não como comentário.
if (DESTINO.x === comCopia.copiado.ancora.x && DESTINO.y === comCopia.copiado.ancora.y) {
  await browser.close();
  console.error(
    'MEDIÇÃO 3 INVÁLIDA: o destino coincide com a âncora, então o deslocamento é\n' +
      'zero e a colagem cai sobre o original. Escolha um destino afastado.',
  );
  process.exit(1);
}
await apontar(DESTINO);
await atalho('v');
const coladoNoCursor = await ler();

// ── 4. Copiar SÓ a porta e colar noutra parede ──────────────────────────────
await abrir();
const antesDaPorta = await ler();
const paredeBaixa = antesDaPorta.paredes.find((w) => w.a.y === 1000 && w.b.y === 1000);
const paredeAlta = antesDaPorta.paredes.find((w) => w.a.y === 6000 && w.b.y === 6000);
const porta = antesDaPorta.aberturas.find((o) => o.kind === 'PORTA');

await selecionar([porta.id]);
await atalho('c');
// Ponteiro EM CIMA da parede de cima, a 5.000 mm da origem em x.
await apontar({ x: 5000, y: 6000 });
await atalho('v');
const portaColada = await ler();

// A metade que discrimina: mesmo gesto, ponteiro no VAZIO.
await abrir();
await selecionar([porta.id]);
await atalho('c');
await apontar({ x: 5000, y: 12_000 });
await atalho('v');
const portaNoVazio = await ler();

await browser.close();

// ── Veredito ────────────────────────────────────────────────────────────────
const nadaCopiado =
  semSelecao.copiado === null && /Nada que se possa copiar/.test(semSelecao.aviso ?? '');

const copiouAncoraCerta =
  comCopia.copiado?.wallIds.length === 4 &&
  comCopia.copiado?.ancora.x === 1000 &&
  comCopia.copiado?.ancora.y === 1000;

// A sala dobrou, e as aberturas TAMBÉM — sem ninguém as ter pedido.
const dobrou = coladoNoCursor.paredes.length === 8 && coladoNoCursor.aberturas.length === 4;

// Cada parede nova é uma das antigas 8.000 mm acima. Conferir uma coordenada só
// passaria mesmo se o bloco tivesse sido deformado.
const DY = DESTINO.y - 1000;
const chave = (w) => `${w.a.x},${w.a.y}→${w.b.x},${w.b.y}`;
const antigas = new Set(inicial.paredes.map(chave));
const esperadas = new Set(
  inicial.paredes.map((w) =>
    chave({ a: { x: w.a.x, y: w.a.y + DY }, b: { x: w.b.x, y: w.b.y + DY } }),
  ),
);
const saiuInteiro =
  coladoNoCursor.paredes.every((w) => antigas.has(chave(w)) || esperadas.has(chave(w))) &&
  [...esperadas].every((k) => coladoNoCursor.paredes.some((w) => chave(w) === k));

// A cópia nasce selecionada: é ela que a pessoa vai ajustar em seguida, e sem
// isso o próximo arraste pegaria o original de volta. São SEIS ids — as 4
// paredes e as 2 aberturas que vieram junto —, e nenhum deles é do original.
const idsAntigos = new Set([
  ...idsDaSala,
  ...inicial.aberturas.map((o) => o.id),
]);
const copiaSelecionada =
  coladoNoCursor.selecionados.length === 6 &&
  coladoNoCursor.selecionados.every((id) => !idsAntigos.has(id));

const novaPorta = portaColada.aberturas.find((o) => !antesDaPorta.aberturas.some((a) => a.id === o.id));
// Porta de 900 centrada em 5.000 mm ao longo do eixo da parede de cima. Essa
// parede vai de (9000,6000) para (1000,6000): o eixo corre da DIREITA para a
// esquerda, então 5.000 mm em x é 9000 − 5000 = 4.000 mm de eixo, e a porta
// começa em 4000 − 450 = 3550.
const portaFoiParaOutraParede =
  portaColada.aberturas.length === 3 &&
  novaPorta?.wallId === paredeAlta.id &&
  novaPorta?.wallId !== paredeBaixa.id &&
  novaPorta?.offsetMm === 3550;

const vazioNaoCola =
  portaNoVazio.aberturas.length === 2 && /sobre uma parede/.test(portaNoVazio.aviso ?? '');

console.log(`
1. SEM SELEÇÃO   copiado ${JSON.stringify(semSelecao.copiado)} · aviso "${semSelecao.aviso}"
2. COPIAR SALA   paredes ${comCopia.copiado?.wallIds.length}/4 · âncora (${comCopia.copiado?.ancora.x},${comCopia.copiado?.ancora.y}) esperado (1000,1000)
3. COLAR         paredes ${coladoNoCursor.paredes.length}/8 · aberturas ${coladoNoCursor.aberturas.length}/4 · bloco intacto ${saiuInteiro} · cópia selecionada ${coladoNoCursor.selecionados.length}/6 ${copiaSelecionada}
4. PORTA AVULSA  aberturas ${portaColada.aberturas.length}/3 · parede destino ${novaPorta?.wallId === paredeAlta.id ? 'a de cima ✓' : 'ERRADA'} · offset ${novaPorta?.offsetMm} (esperado 3550)
   no vazio      aberturas ${portaNoVazio.aberturas.length}/2 · aviso "${portaNoVazio.aviso}"
`);

console.log(
  `Ctrl+C sem seleção avisa:   ${nadaCopiado ? 'sim' : 'NÃO'}\n` +
    `âncora no canto:            ${copiouAncoraCerta ? 'sim' : 'NÃO'}\n` +
    `porta e janela vêm junto:   ${dobrou ? 'sim' : 'NÃO'}\n` +
    `cola no cursor, sem deformar: ${saiuInteiro ? 'sim' : 'NÃO'}\n` +
    `cópia nasce selecionada:    ${copiaSelecionada ? 'sim' : 'NÃO'}\n` +
    `porta avulsa vai para a parede sob o cursor: ${portaFoiParaOutraParede ? 'sim' : 'NÃO'}\n` +
    `no vazio não cola e avisa:  ${vazioNaoCola ? 'sim' : 'NÃO — o teste não discrimina'}`,
);

process.exit(
  nadaCopiado &&
    copiouAncoraCerta &&
    dobrou &&
    saiuInteiro &&
    copiaSelecionada &&
    portaFoiParaOutraParede &&
    vazioNaoCola
    ? 0
    : 1,
);
