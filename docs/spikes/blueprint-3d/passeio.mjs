/**
 * Passeio pela vista 3D do harness.
 *
 *   node docs/spikes/blueprint-3d/passeio.mjs [urlBase]
 *
 * Assume `npm run dev` já rodando (porta 3100). Confere que a cena carrega, que
 * o chunk do three só entra ao montar a aba, e falha o exit em QUALQUER
 * `pageerror` ou erro de console — a rede de segurança do `@ts-nocheck`.
 *
 * ⚠️ SERVIDOR NOVO. O dev server serve o que tinha em memória quando subiu: já
 * houve passeio verde COM o defeito no disco. Reinicie o vite (e apague
 * `node_modules/.vite`) antes de confiar num exit 0 daqui.
 *
 * ⚠️ Erro de console NÃO é a única forma de quebrar o 3D. Em 05/09/2026 o
 * enquadramento ignorava estrutura e escada: a cena montava, o console ficava
 * limpo, e a câmera olhava para o vazio a vinte metros do modelo. Por isso
 * `cena=estrutura` passou a ser medida em PIXEL, e não só fotografada.
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

/**
 * Quanto do canvas está coberto por GEOMETRIA, de 0 a 1.
 *
 * Conta pixels com canal máximo < 160: é a faixa do concreto e da alvenaria
 * sombreada. Deixa de fora o fundo (240+) e as linhas da grade (176–224), que
 * aparecem mesmo quando a câmera olha para o nada — foi justamente uma tela só
 * de grade que o usuário viu e relatou como "o IFC não aparece".
 *
 * A leitura é feita pelo próprio navegador: o PNG do `screenshot` volta como
 * data URL, é desenhado num canvas 2D e lido com `getImageData`. Ler o canvas
 * WebGL direto não serve — sem `preserveDrawingBuffer` ele volta em branco.
 */
/**
 * Energia de alta frequência no TERÇO SUPERIOR do canvas — onde a grade
 * distante cai.
 *
 * É a assinatura do moiré: linhas de grade menores que um pixel viram
 * interferência, e ao orbitar aquela faixa anda. Um quadro parado já denuncia,
 * porque a interferência aparece como bordas finas demais para a cena.
 */
async function energiaDoHorizonte() {
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, erro) => {
      img.onload = ok;
      img.onerror = erro;
      img.src = `data:image/png;base64,${b64}`;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { width: W, height: H } = c;
    const d = ctx.getImageData(0, 0, W, H).data;
    let soma = 0;
    let n = 0;
    for (let y = Math.floor(H * 0.06); y < Math.floor(H * 0.42); y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        soma += Math.abs(d[i] - d[i + 4]);
        n++;
      }
    }
    return soma / n;
  }, png.toString('base64'));
}

async function fracaoPintada() {
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, erro) => {
      img.onload = ok;
      img.onerror = erro;
      img.src = `data:image/png;base64,${b64}`;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let geometria = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) < 160) geometria++;
    }
    return geometria / (d.length / 4);
  }, png.toString('base64'));
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
// AS QUATRO JUNÇÕES (03/09/2026): canto igual, canto de espessuras diferentes, T
// perpendicular e vértice de três pontas. Antes da mitra, cada uma aparecia com
// as paredes se invadindo — e a do T com a divisória saindo do outro lado.
// Também é só para olhar: o exit 0 não vê sobreposição.
await cena('cena=juncoes&arestas=1', 'juncoes');
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

/**
 * SÓ ESTRUTURA, longe da origem — a forma do que a importação de IFC traz.
 *
 * Medido em pixel porque é o único jeito de o exit ver o defeito de 05/09/2026:
 * com o enquadramento cego a estrutura, esta mesma cena rende 0,1 % (só grade),
 * contra 8,4 % com ele enxergando. O piso de 3 % fica no meio dessa distância —
 * larga o bastante para não quebrar com mudança de sombreamento, apertada o
 * bastante para acusar uma câmera olhando para o vazio.
 */
await cena('cena=estrutura&arestas=1', 'estrutura');
const pintado = await fracaoPintada();
if (pintado < 0.03) {
  erros.push(
    `cena=estrutura quase vazia: ${(pintado * 100).toFixed(2)}% de geometria ` +
      `(mínimo 3%). A câmera provavelmente não enquadrou — ver ` +
      `utils/blueprint3dEnquadramento.ts.`,
  );
}

/**
 * A planta do usuário: paredes na origem + estrutura de IFC vinte metros
 * adiante. É só para OLHAR, e deliberadamente não tem piso de pixel.
 *
 * Tentei pôr um: a folga antiga (`spread × 1,7`) rende ~1,7% aqui e a conta
 * nova ~2,3%. Um piso entre os dois passa mais perto do ruído de sombreamento
 * do que da diferença que deveria acusar — seria um portão intermitente, que é
 * pior que nenhum. O APERTO do enquadramento está travado com exatidão em
 * `__tests__/blueprint3dEnquadramento.test.ts` ("cabe inteiro" + "e APERTA"),
 * onde a conta é determinística. O que se olha aqui é outra coisa: quanto do
 * vazio é honesto, porque dois objetos pequenos a vinte metros um do outro não
 * preenchem tela nenhuma — e isso o enquadramento não tem como curar.
 */
await cena('cena=disperso&arestas=1', 'disperso');
// A GRADE NÃO PODE TREMER. Célula de 1 m desenhada a centenas de metros vira
// sub-pixel e a faixa do horizonte cintila (relato de 06/09/2026). Aqui a
// energia de borda ali era 2,74 com a grade fixa e é ~0,71 com o passo ligado à
// escala — quase 4× de separação, folgada o bastante para um piso em 1,5.
const horizonte = await energiaDoHorizonte();
if (horizonte > 1.5) {
  erros.push(
    `grade tremendo em cena=disperso: energia ${horizonte.toFixed(2)} no horizonte ` +
      `(máximo 1,5). Ver gradeDaCena em utils/blueprint3dEnquadramento.ts.`,
  );
}

await cena('paredes=150', 'stress', 2500);

await browser.close();

console.log(usouThree ? 'chunk three carregado ao abrir a aba (esperado)' : 'AVISO: não vi request de chunk three');
if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log(
  `cena=estrutura com ${(pintado * 100).toFixed(1)}% de geometria em tela (mínimo 3%) · ` +
    `horizonte de cena=disperso a ${horizonte.toFixed(2)} de energia (máximo 1,5)`,
);
console.log('sem erro de console · prints em docs/spikes/blueprint-3d/');
