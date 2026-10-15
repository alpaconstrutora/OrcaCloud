/**
 * Portão da "Casa automática" — exit ≠ 0 reprova.
 *
 * F0: a página abre sem erro de JS, o canvas aparece e o lote de prova tem 4 divisas
 * TERRENO com uma FRENTE. Cada fase seguinte acrescenta aqui as suas conferências
 * (ver "Verificação ponta a ponta" no plano): ambientes atendidos, TO ≤ zona, luz e
 * tomada por ambiente, circuitos, conflitos bloqueantes, `criados` = `diff.created`.
 *
 *   npx vite --port 3192
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/casa-automatica/medir.mjs [url] [pasta-dos-prints]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://127.0.0.1:3192';
const saida = process.argv[3] ?? 'C:/tmp';
fs.mkdirSync(saida, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
await ctx.route(/supabase\.co\//, (r) => r.abort());
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
const falhas = [];
const conferir = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas.push(msg); };

for (const graus of [0, 30]) {
  erros.length = 0;
  await page.goto(`${urlBase}/docs/spikes/casa-automatica/index.html?graus=${graus}`);
  await page.locator('canvas').first().waitFor();
  await page.waitForTimeout(700);
  const e = await page.evaluate(() => window.__estado);
  const p = e?.plano;
  const t = `[${graus}°]`;
  conferir(erros.length === 0, `${t} sem erro de JS na página${erros.length ? `: ${erros.join(' | ')}` : ''}`);
  conferir(e?.divisas === 4 && e?.frente === 1, `${t} lote de prova com 4 divisas e uma FRENTE`);
  conferir(!!p, `${t} o plano existe`);
  if (!p) continue;
  const situacoes = p.etapas.map((x) => `${x.id}:${x.situacao}`).join(' ');
  conferir(situacoes === 'IMPLANTACAO:CALCULOU ARQUITETURA:LANCOU CONFERENCIA:CALCULOU', `${t} etapas: ${situacoes}`);
  conferir(p.comandos === 3, `${t} três comandos de lote (${p.comandos})`);
  conferir(p.ambientesAtendidos === p.ambientesPedidos, `${t} ambientes do programa atendidos: ${p.ambientesAtendidos} de ${p.ambientesPedidos}`);
  conferir(p.ambientesNomeados >= p.ambientesPedidos, `${t} ambientes nomeados no desenho: ${p.ambientesNomeados} (nenhum fundido)`);
  conferir(p.aberturasCriadas === p.aberturasPedidas, `${t} aberturas: ${p.aberturasCriadas} criadas de ${p.aberturasPedidas} pedidas`);
  conferir(p.toPct != null && p.toPct <= p.toMaxPct, `${t} TO ${p.toPct} % ≤ ${p.toMaxPct} %`);
  conferir(!p.pendencias.some((x) => /Legislação: (Taxa de ocupação|Coeficiente)/.test(x)), `${t} nenhuma regra de lote violada`);
  // F3b (15/10/2026): antes, a melhor semente violava 5 regras de ambiente (banheiro de 0,80 m, dormitório de 2,0 m).
  conferir(p.regrasVioladas === 0, `${t} nenhuma regra de severidade ERRO violada (${p.regrasVioladas})`);
  conferir(p.conferido, `${t} a trava aprova: reaplicado no original dá os mesmos ids e o mesmo modelo`);
  console.log(`   pendências ${t}: ${p.pendencias.length ? p.pendencias.join(' | ') : 'nenhuma'}`);
  await page.screenshot({ path: path.join(saida, `casa-automatica-${graus}.png`) });
}

await browser.close();
if (falhas.length) {
  console.log(`\n❌ ${falhas.length} conferência(s) reprovada(s)`);
  process.exit(1);
}
console.log('\n✅ portão aprovado');
