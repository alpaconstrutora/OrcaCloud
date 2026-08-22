/**
 * Desenha um terreno num navegador de verdade e confere o que saiu.
 *
 * Cinco medições, e a SEGUNDA é a que discrimina:
 *   1. cinco cliques + clique no 1º vértice FECHAM o anel (5 divisas, área certa)
 *   2. com orto o lado enviesado sai RETO — e SEM orto sai TORTO. Sem a segunda
 *      metade, a primeira não prova nada: um lado que já fosse reto passaria com
 *      ou sem trava
 *   3. arrastar o lote inteiro preserva TODOS os comprimentos
 *   4. mudar o comprimento de um lado ARRASTA A VIZINHA JUNTO, e o anel continua
 *      fechado — sem isso o canto abre e o lote deixa de ter área
 *   5. apontar a FRENTE classifica os cinco lados, e o LESTE sai como lateral
 *      direita — quem está na rua ao sul tem o leste à direita. É o par que
 *      denuncia um anel percorrido no sentido contrário: o desenho fica idêntico
 *      e a escritura sai espelhada
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/terreno/medir.mjs [urlBase]
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

// A MESMA matemática de `paraTela`: escala inicial 0,05 px/mm, margem de 60 px e
// a ORIGEM NO RODAPÉ — o Y do modelo cresce para cima, o da tela para baixo.
const ESCALA = 0.05;
const MARGEM = 60;
const paraTela = (p) => ({ x: MARGEM + p.x * ESCALA, y: ALTURA - MARGEM - p.y * ESCALA });

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA } });

async function abrir({ orto = true, tool = 'terreno' } = {}) {
  await page.goto(
    `${urlBase}/docs/spikes/terreno/index.html?orto=${orto ? 1 : 0}&tool=${tool}`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(() => Array.isArray(window.__limites));
  await page.waitForTimeout(150);
}

const ler = () =>
  page.evaluate(() => ({
    limites: window.__limites,
    terreno: window.__terreno,
    selecionados: window.__selecionados,
  }));

async function clicarEm(pontoMundo) {
  const t = paraTela(pontoMundo);
  await page.mouse.move(t.x, t.y);
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(60);
}

/** Desenha o contorno clicando cada vértice e fechando no primeiro. */
async function desenhar(cantos) {
  for (const c of cantos) await clicarEm(c);
  await clicarEm(cantos[0]);
  await page.waitForTimeout(120);
}

const comprimento = (b) => Math.round(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y));

// ── 1. Cinco lados fecham o lote ────────────────────────────────────────────
// Lote de 5 lados desiguais — o caso que a ferramenta Polígono (regular) não
// desenhava. Vértices em múltiplos de 100 mm, o passo da grade.
//
// ⚠️ AS MEDIDAS CABEM NA TELA DE PROPÓSITO. Na vista inicial, y = 14.000 mm cai
// em `640 − 700 = −60` px, ACIMA da borda: o clique não chega ao canvas e o
// vértice some do contorno sem nenhum erro — foi o que aconteceu na segunda
// execução deste harness (4 divisas em vez de 5, com um lado ligando os vértices
// errados). Com y máximo de 10.000 mm o desenho inteiro fica visível.
//
// Área pelo laço do agrimensor sobre os cinco cantos:
//   (0,0)→(12000,0)            0·0        − 12000·0   =           0
//   (12000,0)→(15000,6000)     12000·6000 − 15000·0   =  72.000.000
//   (15000,6000)→(6000,10000)  15000·10000 − 6000·6000 = 114.000.000
//   (6000,10000)→(0,7000)      6000·7000  − 0·10000   =  42.000.000
//   (0,7000)→(0,0)             0·0        − 0·7000    =           0
//   soma 228.000.000 ÷ 2 → 114.000.000 mm² = 114 m²
const CANTOS = [
  { x: 0, y: 0 },
  { x: 12_000, y: 0 },
  { x: 15_000, y: 6000 },
  { x: 6000, y: 10_000 },
  { x: 0, y: 7000 },
];

// ⚠️ Orto DESLIGADO para traçar o lote irregular: com a trava, cada lado é
// forçado ao eixo e o pentágono vira retângulo — foi o que este harness pegou na
// primeira execução (4 divisas, 96 m² em vez de 5 e 156 m²). Traçar lote torto é
// justamente o caso de usar sem trava; o teste 2 cobre a trava.
await abrir({ orto: false });
await desenhar(CANTOS);
const fechado = await ler();

// ── 2. A trava ortogonal discrimina ─────────────────────────────────────────
// Dois cliques com um desvio de 300 mm no Y. Com orto, o lado sai reto; sem
// orto, sai torto. É o mesmo desvio nos dois — só a trava muda.
await abrir({ orto: true });
await clicarEm({ x: 0, y: 0 });
await clicarEm({ x: 8000, y: 300 });
const comOrto = await ler();

await abrir({ orto: false });
await clicarEm({ x: 0, y: 0 });
await clicarEm({ x: 8000, y: 300 });
const semOrto = await ler();

// ── 3. Arrastar o lote inteiro ──────────────────────────────────────────────
await abrir({ orto: false });
await desenhar(CANTOS);
const antesDoArraste = await ler();
// Trocar de ferramenta SEM recarregar: recarregar apagaria o lote recém-desenhado
// e o arraste passaria em branco, sem nada para arrastar.
await page.evaluate(() => {
  window.__ferramenta?.('selecionar');
  window.__selecionar?.(window.__limites.map((b) => b.id));
});
await page.waitForTimeout(120);
{
  // Pega o lote por um ponto EM CIMA de uma divisa já selecionada.
  // Destino escolhido para o lote INTEIRO continuar dentro da tela depois de
  // andar — arrastar para fora não provaria nada além de que o clique some.
  const de = paraTela({ x: 6000, y: 0 });
  const para = paraTela({ x: 8000, y: 2000 });
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(para.x, para.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const depoisDoArraste = await ler();

// ── 4. Mudar a medida de um lado arrasta a vizinha ──────────────────────────
await abrir({ orto: false });
await desenhar(CANTOS);
const antesDeEsticar = await ler();
const ladoSul = antesDeEsticar.limites.find((b) => b.a.y === 0 && b.b.y === 0);
await page.evaluate((id) => window.__esticar?.(id, 14_000), ladoSul.id);
await page.waitForTimeout(150);
const depoisDeEsticar = await ler();

// ── 5. Apontar a frente classifica o lote inteiro ───────────────────────────
// O teste de unidade de `papeisSugeridos` monta o anel por helper, em ordem
// conhecida. O que só o navegador prova é que o anel saído do GESTO — cliques em
// pixels, fechamento no primeiro vértice — chega ao mesmo resultado. Se o
// caminhamento devolvesse os lados em outro sentido, as laterais sairiam
// trocadas: erro que não aparece no desenho, só na escritura.
await abrir({ orto: false });
await desenhar(CANTOS);
const antesDosPapeis = await ler();
const sulParaClassificar = antesDosPapeis.limites.find((b) => b.a.y === 0 && b.b.y === 0);
await page.evaluate((id) => window.__apontarFrente?.(id), sulParaClassificar.id);
await page.waitForTimeout(150);
const classificado = await ler();

await browser.close();

// ── Veredito ────────────────────────────────────────────────────────────────
const AREA_ESPERADA_MM2 = 114_000_000; // laço do agrimensor — a conta está junto de CANTOS

const loteFecha =
  fechado.limites.length === 5 &&
  fechado.limites.every((b) => b.kind === 'TERRENO') &&
  fechado.terreno?.fechado === true &&
  fechado.terreno?.areaMm2 === AREA_ESPERADA_MM2 &&
  fechado.terreno?.erroFechamentoMm === 0;

const reto = (r) => r.limites.length === 1 && r.limites[0].a.y === r.limites[0].b.y;
const ortoDiscrimina = reto(comOrto) && !reto(semOrto);

const compsAntes = antesDoArraste.limites.map(comprimento).sort((a, b) => a - b);
const compsDepois = depoisDoArraste.limites.map(comprimento).sort((a, b) => a - b);
// TODO vértice andou pelo MESMO vetor — é isso que distingue mover de deformar.
// Conferir uma coordenada só passaria mesmo se o lote tivesse sido esticado.
const DELTA = { x: 2000, y: 2000 };
const andouTodoMundo = antesDoArraste.limites.every((antes) => {
  const depois = depoisDoArraste.limites.find((d) => d.id === antes.id);
  return (
    depois &&
    depois.a.x === antes.a.x + DELTA.x &&
    depois.a.y === antes.a.y + DELTA.y &&
    depois.b.x === antes.b.x + DELTA.x &&
    depois.b.y === antes.b.y + DELTA.y
  );
});
const arrastouRigido =
  JSON.stringify(compsAntes) === JSON.stringify(compsDepois) &&
  depoisDoArraste.terreno?.fechado === true &&
  andouTodoMundo;

const sulDepois = depoisDeEsticar.limites.find((b) => b.id === ladoSul.id);
const esticouEFechou =
  comprimento(sulDepois) === 14_000 &&
  depoisDeEsticar.terreno?.fechado === true &&
  depoisDeEsticar.terreno?.erroFechamentoMm === 0;

// A frente é o lado sul; quem está na rua ao sul olhando o lote tem o LESTE à
// direita e o OESTE à esquerda. É esse par que denuncia um anel percorrido no
// sentido contrário — o desenho fica idêntico e a escritura sai espelhada.
const papelDe = (achar) => classificado.limites.find(achar)?.papel ?? null;
const papelSul = papelDe((b) => b.a.y === 0 && b.b.y === 0);
const papelLeste = papelDe((b) => b.a.x >= 12_000 && b.b.x >= 12_000);
const papelOeste = papelDe((b) => b.a.x === 0 && b.b.x === 0);
const todosComPapel = classificado.limites.every((b) => b.papel !== null);
const temUmFundo = classificado.limites.filter((b) => b.papel === 'FUNDOS').length === 1;

const classificou =
  todosComPapel &&
  temUmFundo &&
  papelSul === 'FRENTE' &&
  papelLeste === 'LATERAL_DIREITA' &&
  papelOeste === 'LATERAL_ESQUERDA';

console.log(`
1. FECHAR    divisas ${fechado.limites.length}/5 · fechado ${fechado.terreno?.fechado} · área ${fechado.terreno?.areaMm2} (esperado ${AREA_ESPERADA_MM2}) · erro ${fechado.terreno?.erroFechamentoMm} mm
2. ORTO      com trava: a=(${comOrto.limites[0]?.a.x},${comOrto.limites[0]?.a.y}) b=(${comOrto.limites[0]?.b.x},${comOrto.limites[0]?.b.y})  ${reto(comOrto) ? '✓ reto' : '✖ TORTO'}
             sem trava: a=(${semOrto.limites[0]?.a.x},${semOrto.limites[0]?.a.y}) b=(${semOrto.limites[0]?.b.x},${semOrto.limites[0]?.b.y})  ${reto(semOrto) ? '✖ reto (não discrimina)' : '✓ torto, como esperado'}
3. ARRASTAR  comprimentos antes ${compsAntes.join('/')} · depois ${compsDepois.join('/')} · fechado ${depoisDoArraste.terreno?.fechado}
4. ESTICAR   lado sul ${comprimento(ladoSul)} → ${comprimento(sulDepois)} mm · fechado ${depoisDeEsticar.terreno?.fechado} · erro ${depoisDeEsticar.terreno?.erroFechamentoMm} mm
5. PAPÉIS    sul ${papelSul} · leste ${papelLeste} · oeste ${papelOeste} · com papel ${classificado.limites.filter((b) => b.papel).length}/5
`);

console.log(
  `lote fecha com área certa:  ${loteFecha ? 'sim' : 'NÃO'}\n` +
    `orto discrimina:            ${ortoDiscrimina ? 'sim' : 'NÃO — o teste aprovaria os dois'}\n` +
    `arraste é rígido:           ${arrastouRigido ? 'sim' : 'NÃO'}\n` +
    `esticar mantém o anel:      ${esticouEFechou ? 'sim' : 'NÃO — o canto abriu'}\n` +
    `apontar a frente classifica: ${classificou ? 'sim' : 'NÃO — laterais espelhadas ou lado sem papel'}`,
);

process.exit(
  loteFecha && ortoDiscrimina && arrastouRigido && esticouEFechou && classificou ? 0 : 1,
);
