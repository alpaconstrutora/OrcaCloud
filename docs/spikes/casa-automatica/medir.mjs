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
  // F4: a estrutura entra entre a arquitetura e a conferência; os eixos não rodam com o lote girado (paredes oblíquas).
  const esperadas = `IMPLANTACAO:CALCULOU ARQUITETURA:LANCOU PILARES:LANCOU VIGAS:LANCOU LAJES:LANCOU FUNDACOES:LANCOU EIXOS:${graus === 0 ? 'LANCOU' : 'NADA_A_FAZER'} TELHADO:LANCOU ANCORAS:LANCOU MOBILIARIO:LANCOU LOUCAS:LANCOU PONTOS_HIDRAULICOS:LANCOU AGUA:LANCOU ESGOTO:LANCOU PLUVIAL:LANCOU PONTOS_ELETRICOS:LANCOU QUADRO:LANCOU CIRCUITOS:LANCOU CLIMATIZACAO:LANCOU DR_DPS:LANCOU ELETRODUTOS:LANCOU CONFERENCIA:CALCULOU`;
  conferir(situacoes === esperadas, `${t} etapas: ${situacoes}`);
  conferir(p.comandos > 3, `${t} um lote só com arquitetura e estrutura (${p.comandos} comandos)`);
  const es = p.estrutura;
  conferir(es.pilares >= 4 && es.blocos === es.pilares && es.estacas === es.pilares, `${t} ${es.pilares} pilares, ${es.blocos} blocos, ${es.estacas} estacas`);
  conferir(p.pilaresForaDeParede === 0, `${t} nenhum pilar fora de parede (${p.pilaresForaDeParede})`);
  conferir(es.lajes === p.ambientesNoPavimento && es.vigas > 0 && es.baldrames > 0, `${t} ${es.lajes} lajes (uma por ambiente: ${p.ambientesNoPavimento}), ${es.vigas} vigas, ${es.baldrames} baldrames`);
  // F5: telhado de duas águas cobrindo toda parede; a pluvial acha o beiral e põe calha.
  conferir(p.telhado.aguas === 2 && p.telhado.paredesCobertas, `${t} telhado: ${p.telhado.aguas} águas, paredes cobertas: ${p.telhado.paredesCobertas}`);
  conferir(p.telhado.motivoDaPluvial === null && p.telhado.calhas > 0, `${t} a pluvial lança ${p.telhado.calhas} calha(s) no beiral${p.telhado.motivoDaPluvial ? ` — ${p.telhado.motivoDaPluvial}` : ''}`);
  // F6: as peças-âncora — caixa d'água com volume, caixa de gordura e todas as vagas pedidas DENTRO da garagem.
  const an = p.ancoras;
  conferir(an.caixaDaguaL > 0 && an.caixaDeGordura, `${t} caixa d'água de ${an.caixaDaguaL} L e caixa de gordura`);
  conferir(an.vagas === an.vagasPedidas && an.vagasNaGaragem === an.vagasPedidas, `${t} ${an.vagasNaGaragem} de ${an.vagasPedidas} vagas dentro da garagem`);
  // F6b: na casa estreita, a cozinha tem janela (parede externa) — e por isso o aquecedor tem onde ficar.
  conferir(!p.pendencias.some((x) => /Cozinha exige/.test(x)) && an.aquecedor, `${t} a cozinha tem parede externa e o aquecedor foi lançado`);
  // F7: o kit hidráulico de cada ambiente molhado completo, sem (tipo, disciplina) repetido.
  const kitsRuins = p.kits.filter((k) => k.faltam.length || k.duplicados);
  conferir(p.kits.length >= 4 && kitsRuins.length === 0, `${t} ${p.kits.length} ambientes molhados com o kit completo${kitsRuins.length ? ` — ${kitsRuins.map((k) => `${k.ambiente}: falta ${k.faltam.join(', ')}${k.duplicados ? `, ${k.duplicados} duplicado(s)` : ''}`).join(' | ')}` : ''}`);
  conferir(p.pecasDeMobiliario > 10, `${t} ${p.pecasDeMobiliario} peças de mobiliário`);
  // F8: as três redes lançadas e LIGADAS (a verificação de rede do app sem ponta aberta nem trecho sem destino).
  const h = p.hidraulica;
  conferir(h.agua > 0 && h.esgoto > 0 && h.pluvial > 0, `${t} redes lançadas: água ${h.agua}, esgoto ${h.esgoto}, pluvial ${h.pluvial} tubo(s)`);
  // F8b: e COMPATÍVEIS com a estrutura — nenhuma marca: nem pilar, nem viga, nem desconector sem ventilação.
  // F8c: o alimentador enterrado só ATRAVESSA o baldrame — nenhum pedaço correndo dentro dele.
  const ab = p.alimentadorNoBaldrame;
  conferir(ab.maiorMm <= ab.larguraMm * 1.2, `${t} alimentador: ${ab.travessias} travessia(s) de baldrame, a maior com ${ab.maiorMm} mm (baldrame de ${ab.larguraMm} mm)`);
  // F9: a elétrica fecha a NBR 5410 (sem FALTA), nenhum ponto de carga sem circuito, um split por ambiente
  // climatizável (sala, suíte, 2 dormitórios) e a linha e o dreno do ar sem marca da verificação de rede.
  const el = p.eletrica;
  conferir(el.faltas === 0, `${t} NBR 5410 sem falta (${el.circuitos} circuitos; entrada ${el.entrada})${el.faltas ? ` — ${el.faltas} falta(s) em ${el.regras.join(', ')}` : ''}`);
  conferir(el.soltos === 0, `${t} nenhum ponto de carga sem circuito (${el.soltos} solto(s))`);
  conferir(el.splits === 4 && Object.keys(el.marcasDoAr).length === 0, `${t} ${el.splits} split(s); linha e dreno sem marca${Object.keys(el.marcasDoAr).length ? ` — ${JSON.stringify(el.marcasDoAr)}` : ''}`);
  conferir(Object.keys(h.porTipo).length === 0, `${t} a verificação de rede sem marca (ponta aberta, sem destino, pilar, viga, ventilação)${Object.keys(h.porTipo).length ? ` — ${JSON.stringify(h.porTipo)}` : ''}`);
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
