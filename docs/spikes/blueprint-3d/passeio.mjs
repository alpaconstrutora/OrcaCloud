/**
 * Passeio pela vista 3D do harness.
 *
 *   node docs/spikes/blueprint-3d/passeio.mjs [urlBase]
 *
 * Assume `npm run dev` já rodando (porta 3100). Confere que a cena carrega, que
 * o chunk do three só entra ao montar a aba, e falha o exit em QUALQUER
 * `pageerror` ou erro de console — a rede de segurança do `@ts-nocheck`.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE ou instale playwright-core');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });

const erros = [];
const requisicoes = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));
page.on('request', (r) => requisicoes.push(r.url()));

async function cena(qs, nome, esperaMs = 1800) {
  await page.goto(`${urlBase}/docs/spikes/blueprint-3d/index.html?${qs}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(esperaMs);
  await page.screenshot({ path: path.join(aqui, `saida-${nome}.png`) });
}

await cena('laje=1&arestas=1', 'casa');
const usouThree = requisicoes.some((u) => /three|3d-viewer|Blueprint3DViewer/i.test(u));

await cena('niveis=terreo&laje=1', 'terreo');
// O LOTE como plano de chão. `terreno=0` é o mesmo modelo sem ele — as duas
// imagens lado a lado é o que prova que o toggle desliga de verdade.
await cena('laje=1&arestas=1&terreno=1', 'lote-on');
await cena('laje=1&arestas=1&terreno=0', 'lote-off');
// O CANTO em close — a imagem que prova a junção. Ver `construirCanto` no
// main.tsx: um canto reto e um obtuso, longe da origem. Antes da correção de
// 30/08/2026 aparecia um entalhe na face externa dos dois; depois, não.
// Esta é a única saída do passeio que o exit 0 NÃO cobre: é para olhar.
await cena('cena=canto&arestas=1', 'canto');
// Parede em CAMADAS, composição assimétrica (10/140/40). Ver 
// em main.tsx: com reboco simétrico um empilhamento invertido seria invisível.
await cena('cena=camadas&arestas=1', 'camadas');

// O OLHO da lista de Componentes (01/09/2026). Mesmo par on/off do lote: uma
// imagem sozinha não prova filtro nenhum.
//
// `cena=pilar&fino=1&cede=1` é a única em que o corte do concreto é visível (ver
// `construirPilarEmbutido`), e por isso é ela que confere a decisão de projeto:
// escondendo o pilar, o concreto some e o RASGO que ele abriu na parede FICA —
// o corte é do quantitativo (`cedeSobreposicao`), não do desenho da peça.
await cena('cena=pilar&fino=1&cede=1&arestas=1', 'ocultar-off');
await cena('cena=pilar&fino=1&cede=1&arestas=1&ocultar=pilares', 'ocultar-pilares');
// Esquadria escondida FECHA o vão: a janela é o vazio, então tirá-la devolve
// alvenaria inteira.
await cena('laje=1&arestas=1', 'ocultar-esquadrias-off');
await cena('laje=1&arestas=1&ocultar=esquadrias', 'ocultar-esquadrias');
await cena('laje=1&arestas=1&ocultar=paredes', 'ocultar-paredes');

await cena('paredes=150', 'stress', 2500);

await browser.close();

console.log(usouThree ? 'chunk three carregado ao abrir a aba (esperado)' : 'AVISO: não vi request de chunk three');
if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('sem erro de console · prints em docs/spikes/blueprint-3d/');
