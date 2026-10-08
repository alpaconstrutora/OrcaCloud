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

/**
 * O CLIQUE QUE SELECIONA (06/09/2026, "3D útil").
 *
 * A lógica de "clique ou órbita" está travada em teste de unidade; o que só um
 * clique de verdade responde é se o raio ACERTA a geometria. O passeio clica no
 * centro do canvas — onde a casa está, porque a câmera acabou de enquadrá-la — e
 * confere que a barra passou a mostrar um id.
 *
 * Depois ARRASTA a partir do mesmo ponto: girar a cena não pode selecionar, e
 * esse é o defeito que passaria despercebido porque só aparece com o mouse na
 * mão.
 */
await cena('laje=1&arestas=1&clicar=1', 'clique-antes');
const caixa = await page.locator('canvas').boundingBox();
const meio = { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };

await page.mouse.click(meio.x, meio.y);
await page.waitForTimeout(300);
const depoisDoClique = await page.locator('#barra').innerText();
if (!/SELECIONADO: wal_/.test(depoisDoClique)) {
  erros.push(`clique no 3D não selecionou nada — barra: "${depoisDoClique}"`);
}
await page.screenshot({ path: path.join(aqui, 'saida-clique.png') });

// ORBITAR NÃO SELECIONA. Parte de um ponto vazio para não haver o que pegar
// mesmo se a guarda falhasse pela metade.
await page.goto(`${urlBase}/docs/spikes/blueprint-3d/index.html?laje=1&arestas=1&clicar=1`, {
  waitUntil: 'networkidle',
});
await page.waitForSelector('canvas');
await page.waitForTimeout(1500);
await page.mouse.move(meio.x, meio.y);
await page.mouse.down();
await page.mouse.move(meio.x + 90, meio.y + 40, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);
const depoisDoArraste = await page.locator('#barra').innerText();
if (!/SELECIONADO: \(nenhum\)/.test(depoisDoArraste)) {
  erros.push(`orbitar selecionou peça — barra: "${depoisDoArraste}"`);
}

/**
 * O MODO PERCORRER (06/09/2026).
 *
 * Andar é gesto: teclado, trava de ponteiro e um laço por quadro. Nada disso
 * um teste de unidade alcança — a conta do passo está coberta em
 * `blueprint3dWalk.test.ts`, e o que falta é a cena responder.
 *
 * Dois sinais, e o segundo é o que importa: a DICA muda (prova que o modo
 * entrou) e o QUADRO muda ao apertar W (prova que a câmera andou). Só o
 * primeiro passaria com um botão que acende e não faz nada.
 */
await cena('laje=1&arestas=1', 'walk-antes');
const dicaOrbitar = await page.locator('text=Arraste para orbitar').count();
if (dicaOrbitar !== 1) erros.push('a dica de órbita não estava na tela antes de percorrer');

await page.click('button[title*="Percorrer"]');
await page.waitForTimeout(1200);
const dicaAndar = await page.locator('text=WASD ou setas').count();
if (dicaAndar !== 1) {
  erros.push('entrar em percorrer não trocou a dica — o modo não engatou');
}
const antesDeAndar = (await page.locator('canvas').screenshot()).toString('base64');

await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(aqui, 'saida-walk-andou.png') });
const depoisDeAndar = (await page.locator('canvas').screenshot()).toString('base64');

/**
 * ⚠️ NÃO comparar os PNG byte a byte.
 *
 * A primeira versão deste portão fazia `antes === depois`, e ele passava com o
 * defeito plantado: medido em 06/09/2026, com a câmera IMÓVEL os dois PNG saem
 * com 716.768 e 716.772 bytes — diferentes. A captura passa pelo compositor do
 * Chromium, e a rasterização tem ruído; igualdade exata nunca dispara.
 *
 * O sinal de verdade é a FRAÇÃO DE PIXELS. Medido nas duas direções:
 * câmera andando muda ~55% da tela; câmera parada muda ~0%. O corte a 5% está
 * uma ordem de grandeza acima do ruído e uma abaixo do sinal.
 */
const fracaoDiferente = await page.evaluate(async ([a, b]) => {
  const carregar = (b64) =>
    new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.src = `data:image/png;base64,${b64}`;
    });
  const [ia, ib] = await Promise.all([carregar(a), carregar(b)]);
  const pintar = (img) => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  };
  if (ia.width !== ib.width || ia.height !== ib.height) return 1;
  const da = pintar(ia);
  const db = pintar(ib);
  let n = 0;
  for (let i = 0; i < da.length; i += 4) {
    // 8 níveis de tolerância: abaixo disso é ruído de antisserrilhado.
    if (
      Math.abs(da[i] - db[i]) > 8 ||
      Math.abs(da[i + 1] - db[i + 1]) > 8 ||
      Math.abs(da[i + 2] - db[i + 2]) > 8
    )
      n++;
  }
  return n / (da.length / 4);
}, [antesDeAndar, depoisDeAndar]);

if (fracaoDiferente < 0.05) {
  erros.push(
    `apertar W não moveu a câmera — só ${(fracaoDiferente * 100).toFixed(2)}% da tela mudou (mínimo 5%)`,
  );
}
console.log(
  `modo percorrer: W mudou ${(fracaoDiferente * 100).toFixed(1)}% da tela (mínimo 5%)`,
);

/**
 * A CAIXA DE CORTE (E10.3, 08/10/2026).
 *
 * Três quadros da mesma câmera: sem caixa, com a caixa recém-ligada (nasce
 * envolvendo tudo — a geometria não pode sumir) e com o fim leste–oeste puxado
 * até o meio (metade da casa sai). O sinal é a fração de pixels de geometria,
 * não a igualdade de PNG (ver o modo percorrer acima).
 */
await cena('laje=1&arestas=1', 'caixa-sem');
const semCaixa = await fracaoPintada();
await page.click('button[title*="Caixa de corte"]');
await page.waitForTimeout(600);
if ((await page.locator('[data-testid="caixa-de-corte"]').count()) !== 1) {
  erros.push('ligar a caixa de corte não abriu o painel dos planos');
}
const caixaInteira = await fracaoPintada();
await page.evaluate(() => {
  const el = document.querySelector('[aria-label="Leste–oeste (X) fim"]');
  const meio = (Number(el.min) + Number(el.max)) / 2;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(meio));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(aqui, 'saida-caixa-cortada.png') });
const caixaCortada = await fracaoPintada();
if (caixaInteira < semCaixa * 0.8) {
  erros.push(`a caixa recém-ligada já cortou geometria: ${(semCaixa * 100).toFixed(1)}% → ${(caixaInteira * 100).toFixed(1)}%`);
}
if (caixaCortada > caixaInteira * 0.8) {
  erros.push(`puxar o plano até o meio não cortou: ${(caixaInteira * 100).toFixed(1)}% → ${(caixaCortada * 100).toFixed(1)}%`);
}
console.log(
  `caixa de corte: ${(semCaixa * 100).toFixed(1)}% sem · ${(caixaInteira * 100).toFixed(1)}% inteira · ` +
    `${(caixaCortada * 100).toFixed(1)}% cortada ao meio`,
);

/**
 * MOVER NO 3D E DESFAZER (E10.3).
 *
 * A alça é o `PivotControls` do drei: seta VERMELHA = X do 3D = x da planta.
 * O passeio acha a seta pelos pixels (#ff2060), agarra o centro dela e arrasta
 * ao longo da própria seta. Pronto quando: a parede andou em x e NÃO em y (a
 * seta é de um eixo só) e o Ctrl+Z a devolveu a 0,0 — um passo de histórico.
 */
await cena('editar=1', 'mover-antes', 2200);
const lerParede = async () => {
  const m = /PAREDE: (-?\d+),(-?\d+)/.exec(await page.locator('#barra').innerText());
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};
const antesDeMover = await lerParede();
const quadro = await page.locator('canvas').boundingBox();
const png = (await page.locator('canvas').screenshot()).toString('base64');
const seta = await page.evaluate(async (b64) => {
  const img = new Image();
  await new Promise((ok) => {
    img.onload = ok;
    img.src = `data:image/png;base64,${b64}`;
  });
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 215 && d[i + 1] < 90 && d[i + 2] > 50 && d[i + 2] < 150) pts.push([(i / 4) % c.width, Math.floor(i / 4 / c.width)]);
  }
  if (pts.length < 30) return { n: pts.length };
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { n: pts.length, mx, my, dx: Math.cos(ang), dy: Math.sin(ang), escala: img.width };
}, png);
if (!antesDeMover || antesDeMover.x !== 0 || antesDeMover.y !== 0) {
  erros.push(`editar=1 não nasceu com a parede em 0,0 — barra: "${await page.locator('#barra').innerText()}"`);
} else if (!seta.mx) {
  erros.push(`a alça de mover não apareceu (pixels vermelhos da seta X: ${seta.n})`);
} else {
  const k = quadro.width / seta.escala;
  const px = quadro.x + seta.mx * k;
  const py = quadro.y + seta.my * k;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + seta.dx * 90, py + seta.dy * 90, { steps: 15 });
  await page.screenshot({ path: path.join(aqui, 'saida-mover-arrastando.png') });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const depoisDeMover = await lerParede();
  await page.screenshot({ path: path.join(aqui, 'saida-mover-depois.png') });
  if (!depoisDeMover || depoisDeMover.x === 0 || depoisDeMover.y !== 0) {
    erros.push(`arrastar a seta X não moveu a parede só em x — antes 0,0, depois ${JSON.stringify(depoisDeMover)}`);
  }
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const desfeito = await lerParede();
  if (!desfeito || desfeito.x !== 0 || desfeito.y !== 0) {
    erros.push(`Ctrl+Z não desfez o mover do 3D — ficou ${JSON.stringify(desfeito)}`);
  }
  console.log(`mover no 3D: parede 0,0 → ${depoisDeMover?.x},${depoisDeMover?.y} → Ctrl+Z → ${desfeito?.x},${desfeito?.y}`);
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
