/**
 * O portão do FUNDO VETORIAL (E10.4c).
 *
 *   node docs/spikes/fundo-vetorial/passeio.mjs [urlBase]
 *
 * Duas perguntas, cada uma com um número:
 *
 * 1. O vetor cai ONDE o PNG cai? A caixa dos pixels escuros (o traço do fundo)
 *    com o PNG e com o vetor, no enquadramento da prancha — cada borda a até
 *    4 px uma da outra.
 * 2. O vetor é NÍTIDO? Depois do mesmo zoom forte nos dois, o traço do PNG
 *    engorda com a imagem esticada e o do vetor fica em ~1 px: a fração de
 *    pixels escuros do vetor tem de ser menos da metade da do PNG.
 *
 * Falha também em qualquer erro de console.
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
const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

async function medir() {
  const png = (await page.locator('canvas').first().screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
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
    let n = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) >= 150) continue;
      n++;
      const x = (i / 4) % c.width;
      const y = Math.floor(i / 4 / c.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { fracao: n / (d.length / 4), caixa: [minX, minY, maxX, maxY] };
  }, png);
}

async function abrir(vetor) {
  await page.goto(`${urlBase}/docs/spikes/fundo-vetorial/index.html?vetor=${vetor}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => /PRONTO|ERRO/.test(document.querySelector('#barra')?.textContent ?? ''), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  return page.locator('#barra').innerText();
}

async function zoomForte() {
  const caixa = await page.locator('canvas').first().boundingBox();
  // Um terço da largura: cai sobre a parede do meio (x = 3 m de 8 m).
  await page.mouse.move(caixa.x + caixa.width * 0.4, caixa.y + caixa.height / 2);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(600);
}

const barraPng = await abrir(0);
const png = await medir();
await page.screenshot({ path: path.join(aqui, 'saida-png.png') });
await zoomForte();
const pngPerto = await medir();
await page.screenshot({ path: path.join(aqui, 'saida-png-perto.png') });

const barraVetor = await abrir(1);
const vetor = await medir();
await page.screenshot({ path: path.join(aqui, 'saida-vetor.png') });
await zoomForte();
const vetorPerto = await medir();
await page.screenshot({ path: path.join(aqui, 'saida-vetor-perto.png') });
await browser.close();

if (!/VETOR: não · BATEU: sim/.test(barraPng)) erros.push(`com o PNG, a barra devia dizer "VETOR: não · BATEU: sim": "${barraPng}"`);
if (!/VETOR: sim · BATEU: sim/.test(barraVetor)) erros.push(`com o vetor, a barra devia dizer "VETOR: sim · BATEU: sim": "${barraVetor}"`);
const desvio = Math.max(...png.caixa.map((v, i) => Math.abs(v - vetor.caixa[i])));
if (!(desvio <= 4)) erros.push(`o vetor não caiu onde o PNG cai: caixa PNG ${png.caixa} × vetor ${vetor.caixa} (desvio ${desvio} px, máximo 4)`);
if (!(vetorPerto.fracao < pngPerto.fracao * 0.5)) {
  erros.push(`de perto o vetor não ficou mais fino: ${(vetorPerto.fracao * 100).toFixed(2)}% escuro × PNG ${(pngPerto.fracao * 100).toFixed(2)}%`);
}
console.log(`alinhamento: caixa PNG ${png.caixa} × vetor ${vetor.caixa} (desvio ${desvio} px)`);
console.log(`de perto: PNG ${(pngPerto.fracao * 100).toFixed(2)}% escuro × vetor ${(vetorPerto.fracao * 100).toFixed(2)}%`);
if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('sem erro de console · prints em docs/spikes/fundo-vetorial/');
