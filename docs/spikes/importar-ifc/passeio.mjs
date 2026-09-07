/**
 * O portão da IMPORTAÇÃO DE PAREDES.
 *
 * O Playwright entrega o IFC direto ao `input[type=file]`, então o arquivo não
 * precisa ser servido nem versionado, e nada aqui passa por login.
 *
 * ⚠️ Servidor RECÉM-REINICIADO. Módulo em cache do Vite já fez este projeto
 * medir o código antigo e declarar corrigido o que não estava.
 *
 * Uso:
 *   node docs/spikes/importar-ifc/passeio.mjs http://localhost:3100 [pasta-dos-ifc]
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? 'http://localhost:3100';
const pasta = process.argv[3] ?? 'C:/D/ORÇACLOUD/bim-spike/samples';
const CASA = path.join(pasta, 'AC20-FZK-Haus.ifc');

if (!existsSync(CASA)) {
  console.error(`arquivo de amostra não encontrado: ${CASA}`);
  process.exit(2);
}

// Mesmo carregamento dos outros harnesses: caminho absoluto do Windows tem de
// virar `file://` antes de `import()`.
async function carregarChromium() {
  const pegar = (m) => m?.chromium ?? m?.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pegar(local)) return pegar(local);
  } catch {
    /* segue */
  }
  const raiz = process.env.PLAYWRIGHT_CORE;
  if (!raiz) throw new Error('defina PLAYWRIGHT_CORE ou instale playwright-core');
  return pegar(await import(pathToFileURL(path.join(raiz, 'index.js')).href));
}
const chromium = await carregarChromium();

const erros = [];
const navegador = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
const page = await contexto.newPage();
page.on('console', (m) => {
  // O painel lista arquivos digitais da organização, e o harness não tem
  // sessão — o 401 é esperado e não diz nada sobre a importação.
  if (m.type() === 'error' && !/401/.test(m.text())) erros.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => erros.push(`página: ${e.message}`));

/** Importa o arquivo e devolve o texto da barra. */
async function importar(vista) {
  await page.goto(`${base}/docs/spikes/importar-ifc/index.html${vista ? `?vista=${vista}` : ''}`, {
    waitUntil: 'networkidle',
  });
  await page.setInputFiles('#importar-ifc-arquivo', CASA);
  // O parser carrega um wasm de ~7 MB na primeira vez.
  await page.waitForSelector('button:has-text("Importar")', { timeout: 60_000 });
  await page.click('button:has-text("Importar")');
  await page.waitForTimeout(2500);
  return page.locator('#barra').innerText();
}

const barra = await importar(null);
console.log(barra);
await page.screenshot({ path: path.join(aqui, 'saida-planta.png') });

// ⚠️ Sem `\d` aqui: dentro de template literal ele vira a letra `d`, e o
// portão passou a não achar nenhum número — dizendo "entraram null paredes"
// enquanto a tela mostrava 13. Classe explícita não tem esse buraco.
const numero = (rotulo) => {
  const m = barra.match(new RegExp(`${rotulo}: (-?[0-9]+)`));
  return m ? Number(m[1]) : null;
};

// 1. AS PAREDES ENTRARAM. Treze é o que os dois leitores medem no arquivo.
if (numero('PAREDES') !== 13) {
  erros.push(`entraram ${numero('PAREDES')} paredes, e o arquivo tem 13`);
}

// 2. A PEGADA TEM TAMANHO DE CASA. Errar a unidade dá 12 mm ou 12 km com o
//    desenho parecendo certo — só a escala denuncia.
const lados = barra.match(/PEGADA: ([0-9]+) x ([0-9]+)/) ?? [];
const largura = Math.max(Number(lados[1] ?? 0), Number(lados[2] ?? 0));
if (!(largura > 8000 && largura < 30000)) {
  erros.push(`a pegada tem ${largura} mm de lado — uma casa tem entre 8 e 30 m`);
}

// 3. A PLANTA FECHOU EM AMBIENTES. É o teste mais duro de todos: ambiente só
//    nasce quando as paredes se ENCONTRAM. Meia espessura fora, eixo espelhado
//    ou parede encolhida deixam o anel aberto, e o número cai para zero.
// ⚠️ O número subiu de 2 para 4 quando as pontas passaram a ser levadas da
// FACE ao EIXO (07/09/2026). Antes disso o desenho fechava só duas regiões, e
// uma delas caía FORA da casa. Mínimo em 4 para que uma regressão no encosto
// apareça aqui, e não no orçamento de alguém.
if (!(numero('AMBIENTES') >= 4)) {
  erros.push(
    `só ${numero('AMBIENTES')} ambientes fecharam (mínimo 4) — as pontas não estão encostando`,
  );
}

// 4. A COMPOSIÇÃO VEIO JUNTO.
if (numero('COM CAMADAS') !== 13) {
  erros.push(`${numero('COM CAMADAS')} paredes com camadas, e deveriam ser 13`);
}

// 5. E O 3D DESENHA. Um modelo que fecha em planta e some no 3D já aconteceu.
await importar('3d');
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(aqui, 'saida-3d.png') });
// ⚠️ NÃO usar `drawImage` direto no canvas do WebGL: sem
// `preserveDrawingBuffer` ele volta em branco, e o portão media 0,0% com a cena
// desenhada. A captura do Playwright passa pelo compositor e enxerga o quadro.
const png = await page.locator('canvas').screenshot();
const pintado = await page.evaluate(async (b64) => {
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

if (!(pintado > 0.03)) {
  erros.push(`o 3D só pintou ${(pintado * 100).toFixed(1)}% da tela (mínimo 3%)`);
}

await navegador.close();

if (erros.length > 0) {
  console.error('\nERROS:');
  for (const e of erros) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`3D pintou ${(pintado * 100).toFixed(1)}% da tela`);
console.log('sem erro de console · prints em docs/spikes/importar-ifc/');
