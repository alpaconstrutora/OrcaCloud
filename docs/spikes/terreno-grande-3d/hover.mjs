/**
 * PORTÃO DO HOVER DAS CURVAS NO 3D (25/11/2026, o reel da Hektar).
 *
 * Abre o terreno grande com as curvas, fotografa SEM o mouse no relevo e de novo com o mouse
 * pousado nele, e conta os pixels quase pretos (a curva acesa é `#1c1917`, 3 px; o rótulo tem
 * texto escuro). Passa se a foto com o mouse ganhar pelo menos `MINIMO` pixels escuros e voltar
 * ao normal quando o mouse sai. Sai com 1 se falhar.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/terreno-grande-3d/hover.mjs [urlBase] [pastaDeSaida] [queryExtra]
 *
 * `queryExtra`, por exemplo `&estilo=MAQUETE`: o mesmo portão em outro estilo do 3D.
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

const urlBase = process.argv[2] ?? 'http://localhost:3201';
const saida = process.argv[3] ?? 'C:/tmp';
const queryExtra = process.argv[4] ?? '';
const MINIMO = Number(process.env.MINIMO ?? 300);

const browser = await (await loadChromium()).launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => m.type() === 'error' && erros.push('CONSOLE ' + m.text()));
await page.goto(`${urlBase}/docs/spikes/terreno-grande-3d/index.html?curvas=1${queryExtra}`);
await page.waitForSelector('canvas');
await page.waitForTimeout(Number(process.env.ESPERA ?? 5000));

const caixa = await page.locator('canvas').first().boundingBox();
const escuros = async (nome) => {
  const png = await page.screenshot({ path: `${saida}/${nome}`, clip: caixa });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 50 && d[i + 1] < 50 && d[i + 2] < 50) n++;
    return n;
  }, png.toString('base64'));
};

// Mouse fora do relevo (canto de cima, céu), depois no centro do canvas (o relevo enquadrado).
await page.mouse.move(caixa.x + 10, caixa.y + 10);
await page.waitForTimeout(600);
const antes = await escuros('hover-3d-antes.png');
await page.mouse.move(caixa.x + caixa.width / 2 - 4, caixa.y + caixa.height / 2 - 4);
await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { steps: 4 });
await page.waitForTimeout(800);
const com = await escuros('hover-3d-com-mouse.png');
await page.mouse.move(caixa.x + 10, caixa.y + 10);
await page.waitForTimeout(800);
const depois = await escuros('hover-3d-depois.png');

const passou = com - antes >= MINIMO && Math.abs(depois - antes) < MINIMO / 3 && erros.length === 0;
console.log(JSON.stringify({ antes, com, depois, minimo: MINIMO, erros }));
console.log(passou ? '✅ hover acende a curva e o rótulo, e apaga ao sair' : '❌ hover 3D falhou');
await browser.close();
process.exit(passou ? 0 : 1);
