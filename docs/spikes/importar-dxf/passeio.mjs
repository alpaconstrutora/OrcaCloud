/**
 * O portão da IMPORTAÇÃO DE DXF.
 *
 * O Playwright entrega o arquivo direto ao `input[type=file]`, então o DXF de
 * 8,3 MB não precisa ser servido nem versionado, e nada aqui passa por login.
 *
 * ⚠️ Servidor RECÉM-REINICIADO. Módulo em cache do Vite já fez este projeto
 * medir o código antigo e declarar corrigido o que não estava.
 *
 * Uso:
 *   node docs/spikes/importar-dxf/passeio.mjs http://localhost:3100 [arquivo.dxf]
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? 'http://localhost:3100';
const ARQUIVO =
  process.argv[3] ??
  'C:/D/ALPA/0 - PROJETOS/1 - PROJETOS/1 - PROJETO ARQUITETÔNICO/APROVADO/EMITIDO/projeto_de_Altair_Prefeitura_e_retificado_para_plotar - 20-02-17 - Cópia.dxf';

if (!existsSync(ARQUIVO)) {
  console.error(`DXF não encontrado: ${ARQUIVO}`);
  process.exit(2);
}

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

const erros = [];
const chromium = await carregarChromium();
const navegador = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
const page = await contexto.newPage();
page.on('console', (m) => {
  // O painel do editor lista arquivos digitais da organização, e o harness não
  // tem sessão — o 401 é esperado e não diz nada sobre o DXF.
  if (m.type() === 'error' && !/401/.test(m.text())) erros.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => erros.push(`página: ${e.message}`));

async function importar(vista) {
  await page.goto(`${base}/docs/spikes/importar-dxf/index.html${vista ? `?vista=${vista}` : ''}`, {
    waitUntil: 'networkidle',
  });
  await page.setInputFiles('#importar-dxf-arquivo', ARQUIVO);
  // 22 mil traços: a leitura e o pareamento levam alguns segundos.
  await page.waitForSelector('select[aria-label="Camada que contém as paredes"]', {
    timeout: 120_000,
  });
  const unidade = await page
    .locator('select[aria-label="Unidade em que o arquivo foi desenhado"]')
    .locator('option')
    .first()
    .innerText();
  await page.selectOption('select[aria-label="Camada que contém as paredes"]', 'PAREDE');
  await page.waitForTimeout(3000);
  const rotulo = await page.locator('button:has-text("Importar")').innerText();
  await page.click('button:has-text("Importar")');
  await page.waitForTimeout(3000);
  return { barra: await page.locator('#barra').innerText(), unidade, rotulo };
}

const { barra, unidade, rotulo } = await importar(null);
console.log(barra);
console.log(`unidade sugerida: ${unidade.trim()}`);
await page.screenshot({ path: path.join(aqui, 'saida-planta.png') });

const numero = (chave) => {
  const m = barra.match(new RegExp(`${chave}: (-?[0-9]+)`));
  return m ? Number(m[1]) : null;
};

// 1. A UNIDADE MEDIDA É METRO. ⚠️ O arquivo DECLARA milímetro. Se algum dia o
//    produto voltar a acreditar no cabeçalho, a casa entra mil vezes menor com
//    a forma perfeita — e é este caso que denuncia.
if (!/metro/.test(unidade) || /milímetro|centímetro/.test(unidade)) {
  erros.push(`a unidade sugerida foi "${unidade.trim()}", e o arquivo está em metro`);
}

// 2. AS PAREDES ENTRARAM. Medido: 572 da camada PAREDE.
if (!(numero('PAREDES') >= 400)) {
  erros.push(`entraram ${numero('PAREDES')} paredes, e a camada PAREDE tem mais de 400`);
}

// 2b. OS AMBIENTES FECHARAM. É a prova de que a MITRAGEM funcionou: o eixo
//     pareado abrange só a sobreposição das faces e para antes do canto, e sem
//     esticá-lo nenhum anel fecha. Medido: 50 ambientes.
if (!(numero('AMBIENTES') >= 30)) {
  erros.push(`só ${numero('AMBIENTES')} ambientes fecharam — a mitragem não está encostando`);
}

// 3. A PEGADA TEM TAMANHO DE PRÉDIO. Errar a escala dá 13 cm ou 134 km com o
//    desenho parecendo certo — só a ordem de grandeza denuncia.
const lados = barra.match(/PEGADA: ([0-9]+) x ([0-9]+)/) ?? [];
const maior = Math.max(Number(lados[1] ?? 0), Number(lados[2] ?? 0));
if (!(maior > 20_000 && maior < 300_000)) {
  erros.push(`a pegada tem ${maior} mm de lado — um projeto tem entre 20 e 300 m`);
}

// 4. AS ESPESSURAS SÃO DE PAREDE. É a prova de que escala e pareamento estão
//    certos ao mesmo tempo, e ela não é um cálculo: 10 a 40 cm é o que se
//    constrói.
const espessuras = (barra.match(/ESPESSURAS: ([0-9,]+)/)?.[1] ?? '')
  .split(',')
  .map(Number)
  .filter(Boolean);
if (espessuras.length === 0 || espessuras.some((e) => e < 50 || e > 500)) {
  erros.push(`espessuras fora da faixa de parede: ${espessuras.join(',')}`);
}

await navegador.close();

if (erros.length > 0) {
  console.error('\nERROS:');
  for (const e of erros) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`espessuras: ${espessuras.join(', ')} mm`);
console.log('sem erro de console · prints em docs/spikes/importar-dxf/');
