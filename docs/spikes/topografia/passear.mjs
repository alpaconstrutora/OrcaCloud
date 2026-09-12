/**
 * Fase 14 — prova de que o passeio a pé no 3D ACOMPANHA O RELEVO.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/topografia/passear.mjs [urlBase] [pastaDeSaida]
 *
 * Abre a vista 3D do harness, entra em "Percorrer", anda com W e D e, a cada
 * parada, compara a altura da câmera com a cota do chão sob ela (lida da
 * MESMA grade) + 1,6 m. É um PORTÃO: sai com 1 se a câmera não estiver à
 * altura do olho sobre o relevo, ou se andar não mudar a altura (relevo
 * ignorado — o bug que o modo tinha antes da fase 2).
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

const ALTURA_DO_OLHO_M = 1.6;
const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? 'C:/tmp';

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) falhas++;
};

await page.goto(`${urlBase}/docs/spikes/topografia/index.html?vista=3d`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

const ler = () =>
  page.evaluate(() => {
    const t = window.__topografia;
    const c = t?.camera?.() ?? null;
    return c ? { x: c[0], y: c[1], z: c[2], chao: t?.chao?.(c[0], c[2]) ?? null } : null;
  });

const antes = await ler();
ok(antes !== null, `câmera legível antes de entrar: ${JSON.stringify(antes)}`);

await page.locator('button[title^="Percorrer a pé"]').click();
await page.waitForTimeout(600);
const entrada = await ler();
console.log('   ao entrar:', JSON.stringify(entrada));
ok(
  entrada && entrada.chao !== null && Math.abs(entrada.y - (entrada.chao + ALTURA_DO_OLHO_M)) < 0.02,
  `ao entrar, o olho está 1,6 m acima do chão (y=${entrada?.y.toFixed(3)}, chão=${entrada?.chao?.toFixed(3)})`,
);

// Anda 1,5 s em duas direções; a cada parada, a altura tem de ser chão + 1,6.
const paradas = [entrada];
for (const tecla of ['KeyW', 'KeyD', 'KeyS']) {
  await page.keyboard.down(tecla);
  await page.waitForTimeout(1500);
  await page.keyboard.up(tecla);
  await page.waitForTimeout(200);
  const p = await ler();
  paradas.push(p);
  const dist = Math.hypot(p.x - paradas[paradas.length - 2].x, p.z - paradas[paradas.length - 2].z);
  console.log(`   após ${tecla}: ${JSON.stringify(p)} · andou ${dist.toFixed(2)} m`);
  ok(dist > 1, `${tecla} move a câmera no plano (${dist.toFixed(2)} m)`);
  ok(
    p.chao !== null && Math.abs(p.y - (p.chao + ALTURA_DO_OLHO_M)) < 0.02,
    `${tecla}: olho a 1,6 m do chão sob a câmera (y=${p.y.toFixed(3)}, chão=${p.chao?.toFixed(3)})`,
  );
}
const ys = paradas.map((p) => p.y);
const amplitude = Math.max(...ys) - Math.min(...ys);
ok(amplitude > 0.1, `a altura variou ${amplitude.toFixed(2)} m ao andar — o relevo é acompanhado, não ignorado`);

await page.screenshot({ path: path.join(saida, 'topografia-3d-passeio.png') });
const ruido = erros.filter((e) => !/WebGL|GPU|swiftshader|Pointer ?Lock|pointerlock/i.test(e));
ok(ruido.length === 0, `sem erros de console (${ruido.length})`);
for (const e of ruido) console.log('   ' + e.slice(0, 200));

await browser.close();
process.exit(falhas > 0 ? 1 : 0);
