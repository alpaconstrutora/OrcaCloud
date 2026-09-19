/**
 * IA CONVERSACIONAL DA PLANTA (19/09/2026, roadmap E6.4) — a parte PURA.
 *
 * O pedido em linguagem natural NUNCA vira geometria: vira MUDANÇAS
 * ESTRUTURADAS no programa (E4.1), nas hipóteses do gerador (E6.2) e nos
 * pesos da avaliação (E5.2); o gerador re-gera e a resposta é o DELTA dos
 * indicadores ("suíte +2 m²; sala −1,5 m²; nota 84 → 87"). Quem traduz o
 * pedido em mudanças é a Edge Function `planta-ia` (Claude, com esquema
 * fechado) — e, sem IA configurada, o INTÉRPRETE LOCAL abaixo, que entende
 * os pedidos comuns por padrão de texto ("suíte +2 m²", "aumente a sala em
 * 3 m²", "3 dormitórios", "corredor de 1,20", "tire a varanda", "sem
 * automáticos", "peso da insolação 8"). Os dois emitem o MESMO `MudancasDaIa`,
 * validado e aplicado aqui — a IA propõe, o código decide.
 *
 * "Explicar solução" é determinístico: as decisões do gerador + os
 * indicadores com explicação (E5.2) + as sugestões (E5.3).
 */
import type { Avaliacao, ChaveDoIndicador, HipotesesDaAvaliacao } from './blueprintAvaliacao';
import { CHAVES_DOS_INDICADORES, ROTULO_DO_INDICADOR } from './blueprintAvaliacao';
import type { HipotesesDoGerador } from './blueprintGerador';
import { adicionarItem, atualizarItem, FICHA_DO_USO, novoItem, removerItem, USOS_DO_AMBIENTE, usoDoNome, type Programa, type UsoDoAmbiente } from './blueprintPrograma';
import { sugerirMelhorias } from './blueprintSugestoes';

// ─── Esquema das mudanças (o que a IA pode pedir) ────────────────────────────

export type MudancaDeItem =
  | { op: 'ajustar_area'; alvo: string; deltaM2?: number; areaIdealM2?: number }
  | { op: 'definir_quantidade'; alvo: string; quantidade: number }
  | { op: 'adicionar'; uso: UsoDoAmbiente; nome?: string; quantidade?: number; areaIdealM2?: number }
  | { op: 'remover'; alvo: string }
  | { op: 'exigir'; alvo: string; iluminacao?: boolean; ventilacao?: boolean; fachada?: boolean };

export interface MudancasDaIa {
  itens?: MudancaDeItem[];
  programa?: { circulacaoMaxPct?: number; percursoMaxM?: number | null };
  gerador?: Partial<Pick<HipotesesDoGerador, 'sementes' | 'iteracoes' | 'larguraCorredorMm' | 'peDireitoMm' | 'automaticos'>> & { retanguloSemEnvelope?: { larguraMm?: number; profundidadeMm?: number } };
  pesos?: Partial<Record<ChaveDoIndicador, number>>;
  /** O que a IA (ou o intérprete) entendeu — mostrado ao usuário. */
  entendimento: string;
}

export interface ResultadoDaAplicacao {
  programa: Programa;
  gerador: HipotesesDoGerador;
  avaliacao: HipotesesDaAvaliacao;
  /** Frases do que foi aplicado. */
  aplicadas: string[];
  /** O que foi pedido e não pôde ser feito (alvo inexistente, valor fora da faixa). */
  recusadas: string[];
}

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** O item do programa que o texto designa (nome, uso ou rótulo do uso). */
export function itemPorAlvo(programa: Programa, alvo: string) {
  const a = normalizar(alvo);
  const porNome = programa.itens.find((i) => normalizar(i.nome) === a) ?? programa.itens.find((i) => normalizar(i.nome).includes(a) || a.includes(normalizar(i.nome)));
  if (porNome) return porNome;
  const uso = (USOS_DO_AMBIENTE as readonly string[]).includes(alvo.toUpperCase()) ? (alvo.toUpperCase() as UsoDoAmbiente) : usoDoNome(alvo);
  if (uso) return programa.itens.find((i) => i.uso === uso) ?? null;
  return null;
}

/** Aplica as mudanças com validação. Nunca lança: o que não dá, vai para `recusadas`. */
export function aplicarMudancas(m: MudancasDaIa, programa: Programa, gerador: HipotesesDoGerador, avaliacao: HipotesesDaAvaliacao): ResultadoDaAplicacao {
  let p = programa;
  let g = { ...gerador, retanguloSemEnvelope: { ...gerador.retanguloSemEnvelope } };
  const av = { ...avaliacao, pesos: { ...avaliacao.pesos } };
  const aplicadas: string[] = [];
  const recusadas: string[] = [];
  for (const it of m.itens ?? []) {
    if (it.op === 'adicionar') {
      if (!(USOS_DO_AMBIENTE as readonly string[]).includes(it.uso)) {
        recusadas.push(`uso desconhecido: ${it.uso}`);
        continue;
      }
      const q = Math.max(1, Math.min(99, Math.round(it.quantidade ?? 1)));
      const novo = novoItem(it.uso, it.nome, q);
      if (it.areaIdealM2 != null && it.areaIdealM2 > 0) novo.areaIdealM2 = it.areaIdealM2;
      p = adicionarItem(p, novo);
      aplicadas.push(`+ ${q} × ${novo.nome} (${f2(novo.areaIdealM2)} m² ideal)`);
      continue;
    }
    const item = itemPorAlvo(p, it.alvo);
    if (!item) {
      recusadas.push(`não achei "${it.alvo}" no programa`);
      continue;
    }
    if (it.op === 'ajustar_area') {
      const nova = it.areaIdealM2 != null ? it.areaIdealM2 : item.areaIdealM2 + (it.deltaM2 ?? 0);
      if (!(nova > 0) || nova > 500) {
        recusadas.push(`${item.nome}: área ${f2(nova)} m² fora da faixa`);
        continue;
      }
      const areaMin = Math.min(item.areaMinM2, nova);
      const areaMax = item.areaMaxM2 != null ? Math.max(item.areaMaxM2, nova) : null;
      p = atualizarItem(p, item.id, { areaIdealM2: Math.round(nova * 100) / 100, areaMinM2: areaMin, areaMaxM2: areaMax });
      aplicadas.push(`${item.nome}: área ideal ${f2(item.areaIdealM2)} → ${f2(nova)} m²`);
    } else if (it.op === 'definir_quantidade') {
      const q = Math.round(it.quantidade);
      if (q < 0 || q > 99) {
        recusadas.push(`${item.nome}: quantidade ${q} fora da faixa`);
        continue;
      }
      if (q === 0) {
        p = removerItem(p, item.id);
        aplicadas.push(`− ${item.nome} (quantidade zero)`);
      } else {
        p = atualizarItem(p, item.id, { quantidade: q });
        aplicadas.push(`${item.nome}: ${item.quantidade} → ${q}`);
      }
    } else if (it.op === 'remover') {
      p = removerItem(p, item.id);
      aplicadas.push(`− ${item.nome}`);
    } else if (it.op === 'exigir') {
      const mud: Partial<typeof item> = {};
      if (it.iluminacao != null) mud.exigeIluminacao = it.iluminacao;
      if (it.ventilacao != null) mud.exigeVentilacao = it.ventilacao;
      if (it.fachada != null) mud.exigeFachada = it.fachada;
      p = atualizarItem(p, item.id, mud);
      aplicadas.push(`${item.nome}: exige ${Object.entries(mud).map(([k, v]) => `${k.replace('exige', '').toLowerCase()}=${v ? 'sim' : 'não'}`).join(', ')}`);
    }
  }
  if (m.programa?.circulacaoMaxPct != null) {
    const v = m.programa.circulacaoMaxPct;
    if (v >= 0 && v <= 100) {
      p = { ...p, circulacaoMaxPct: v };
      aplicadas.push(`circulação máxima ${v} %`);
    } else recusadas.push(`circulação máxima ${v} % fora de 0–100`);
  }
  if (m.programa && 'percursoMaxM' in m.programa) {
    const v = m.programa.percursoMaxM ?? null;
    if (v === null || v > 0) {
      p = { ...p, percursoMaxM: v };
      aplicadas.push(v === null ? 'percurso máximo até a saída: não confere' : `percurso máximo até a saída ${f2(v)} m`);
    } else recusadas.push('percurso máximo deve ser > 0');
  }
  if (m.gerador) {
    const ger = m.gerador;
    if (ger.sementes != null) {
      const v = Math.round(ger.sementes);
      if (v >= 1 && v <= 12) {
        g.sementes = v;
        aplicadas.push(`${v} semente(s)`);
      } else recusadas.push(`sementes ${v} fora de 1–12`);
    }
    if (ger.iteracoes != null) {
      const v = Math.round(ger.iteracoes);
      if (v >= 20 && v <= 5000) {
        g.iteracoes = v;
        aplicadas.push(`${v} iterações`);
      } else recusadas.push(`iterações ${v} fora de 20–5000`);
    }
    if (ger.larguraCorredorMm != null) {
      const v = Math.round(ger.larguraCorredorMm);
      if (v >= 800 && v <= 3000) {
        g.larguraCorredorMm = v;
        aplicadas.push(`corredor de ${f2(v / 1000)} m`);
      } else recusadas.push(`corredor ${f2(v / 1000)} m fora de 0,80–3,00`);
    }
    if (ger.peDireitoMm != null) {
      const v = Math.round(ger.peDireitoMm);
      if (v >= 2300 && v <= 6000) {
        g.peDireitoMm = v;
        aplicadas.push(`pé-direito ${f2(v / 1000)} m`);
      } else recusadas.push(`pé-direito ${f2(v / 1000)} m fora de 2,30–6,00`);
    }
    if (ger.automaticos != null) {
      g.automaticos = ger.automaticos;
      aplicadas.push(ger.automaticos ? 'automáticos ligados' : 'automáticos desligados');
    }
    if (ger.retanguloSemEnvelope) {
      const r = ger.retanguloSemEnvelope;
      if (r.larguraMm != null && r.larguraMm >= 4000) g.retanguloSemEnvelope.larguraMm = Math.round(r.larguraMm);
      if (r.profundidadeMm != null && r.profundidadeMm >= 4000) g.retanguloSemEnvelope.profundidadeMm = Math.round(r.profundidadeMm);
      aplicadas.push(`retângulo sem lote ${f2(g.retanguloSemEnvelope.larguraMm / 1000)} × ${f2(g.retanguloSemEnvelope.profundidadeMm / 1000)} m`);
    }
  }
  for (const [k, v] of Object.entries(m.pesos ?? {})) {
    if (!(CHAVES_DOS_INDICADORES as readonly string[]).includes(k)) {
      recusadas.push(`indicador desconhecido: ${k}`);
      continue;
    }
    if (typeof v !== 'number' || v < 0 || v > 10) {
      recusadas.push(`peso de ${k} fora de 0–10`);
      continue;
    }
    av.pesos[k as ChaveDoIndicador] = Math.round(v);
    aplicadas.push(`peso de ${ROTULO_DO_INDICADOR[k as ChaveDoIndicador]} = ${Math.round(v)}`);
  }
  return { programa: p, gerador: g, avaliacao: av, aplicadas, recusadas };
}

// ─── Intérprete local (sem IA) ───────────────────────────────────────────────

const NUM = '(\\d+(?:[.,]\\d+)?)';
const num = (s: string) => Number(s.replace(',', '.'));

/** Os pedidos comuns por padrão de texto. `null` quando não entendeu nada. */
export function interpretarPedidoLocal(pedido: string, programa: Programa): MudancasDaIa | null {
  const t = normalizar(pedido);
  const itens: MudancaDeItem[] = [];
  const m: MudancasDaIa = { entendimento: '' };
  const frases: string[] = [];
  let r: RegExpMatchArray | null;
  // "suíte +2 m²" / "sala -1,5 m2" / "dormitório 1 + 3"
  const maisMenos = new RegExp(`([a-zç ]+?)\\s*([+-])\\s*${NUM}\\s*m(?:²|2)?`, 'g');
  while ((r = maisMenos.exec(t))) {
    const alvo = r[1].trim();
    if (!itemPorAlvo(programa, alvo)) continue;
    const d = (r[2] === '-' ? -1 : 1) * num(r[3]);
    itens.push({ op: 'ajustar_area', alvo, deltaM2: d });
    frases.push(`${alvo} ${d >= 0 ? '+' : ''}${f2(d)} m²`);
  }
  // "aumente/aumentar/amplie a sala em 3 m²" / "reduza a cozinha em 2 m2"
  const aumentar = new RegExp(`(aument|ampli|cres|reduz|diminu|encolh)\\w*\\s+(?:a |o |as |os )?([a-zç ]+?)\\s+(?:em|para)\\s+${NUM}\\s*m(?:²|2)?`, 'g');
  while ((r = aumentar.exec(t))) {
    const alvo = r[2].trim();
    if (!itemPorAlvo(programa, alvo)) continue;
    const reduz = /^(reduz|diminu|encolh)/.test(r[1]);
    const para = / para /.test(r[0]);
    if (para) itens.push({ op: 'ajustar_area', alvo, areaIdealM2: num(r[3]) });
    else itens.push({ op: 'ajustar_area', alvo, deltaM2: (reduz ? -1 : 1) * num(r[3]) });
    frases.push(para ? `${alvo} = ${f2(num(r[3]))} m²` : `${alvo} ${reduz ? '−' : '+'}${f2(num(r[3]))} m²`);
  }
  // "3 dormitórios" / "2 banheiros" / "quero 4 quartos"
  const quantidade = new RegExp(`(\\d+)\\s+([a-zç]+)s?\\b`, 'g');
  while ((r = quantidade.exec(t))) {
    const palavra = r[2].replace(/s$/, '');
    if (/^(m|m2|metro|iteraco|semente|cm|mm)/.test(palavra)) continue;
    const uso = usoDoNome(palavra);
    if (!uso || uso === 'CIRCULACAO') continue;
    const existente = programa.itens.find((i) => i.uso === uso);
    const q = Number(r[1]);
    if (existente) itens.push({ op: 'definir_quantidade', alvo: existente.nome, quantidade: q });
    else itens.push({ op: 'adicionar', uso, quantidade: q });
    frases.push(`${q} × ${FICHA_DO_USO[uso].rotulo.toLowerCase()}`);
  }
  // "mais um(a) X" / "adicione um escritório" / "sem varanda" / "tire a varanda" / "remova o lavabo"
  const adicionar = /(?:mais um[a]?\s+|adicion\w*\s+(?:um[a]?\s+)?|acrescent\w*\s+(?:um[a]?\s+)?|inclu\w*\s+(?:um[a]?\s+)?)([a-zç]+)/g;
  while ((r = adicionar.exec(t))) {
    const uso = usoDoNome(r[1]);
    if (!uso) continue;
    const existente = programa.itens.find((i) => i.uso === uso);
    if (existente) itens.push({ op: 'definir_quantidade', alvo: existente.nome, quantidade: existente.quantidade + 1 });
    else itens.push({ op: 'adicionar', uso, quantidade: 1 });
    frases.push(`+1 ${FICHA_DO_USO[uso].rotulo.toLowerCase()}`);
  }
  const remover = /(?:sem|tire|tira|remov\w*|exclu\w*|apag\w*)\s+(?:a |o |as |os )?([a-zç]+(?: de [a-zç]+)?)/g;
  while ((r = remover.exec(t))) {
    const alvo = r[1];
    if (/^(automatico|semente|iteraco)/.test(alvo)) continue;
    const item = itemPorAlvo(programa, alvo);
    if (!item) continue;
    itens.push({ op: 'remover', alvo: item.nome });
    frases.push(`− ${item.nome}`);
  }
  // corredor / pé-direito / sementes / iterações / automáticos / circulação máxima / percurso
  if ((r = t.match(new RegExp(`corredor\\D*${NUM}`)))) {
    const v = num(r[1]);
    m.gerador = { ...m.gerador, larguraCorredorMm: v < 10 ? Math.round(v * 1000) : Math.round(v) };
    frases.push(`corredor ${f2(m.gerador.larguraCorredorMm! / 1000)} m`);
  }
  if ((r = t.match(new RegExp(`pe[- ]direito\\D*${NUM}`)))) {
    const v = num(r[1]);
    m.gerador = { ...m.gerador, peDireitoMm: v < 10 ? Math.round(v * 1000) : Math.round(v) };
    frases.push(`pé-direito ${f2(m.gerador.peDireitoMm! / 1000)} m`);
  }
  if ((r = t.match(/(\d+)\s*sementes?/))) {
    m.gerador = { ...m.gerador, sementes: Number(r[1]) };
    frases.push(`${r[1]} semente(s)`);
  }
  if ((r = t.match(/(\d+)\s*iteraco/))) {
    m.gerador = { ...m.gerador, iteracoes: Number(r[1]) };
    frases.push(`${r[1]} iterações`);
  }
  if (/sem automatico|desligu\w* (?:os )?automatico|so (?:a )?geometria/.test(t)) {
    m.gerador = { ...m.gerador, automaticos: false };
    frases.push('sem automáticos');
  } else if (/com automatico|ligu\w* (?:os )?automatico/.test(t)) {
    m.gerador = { ...m.gerador, automaticos: true };
    frases.push('com automáticos');
  }
  if ((r = t.match(new RegExp(`circulacao\\D*${NUM}\\s*%`)))) {
    m.programa = { ...m.programa, circulacaoMaxPct: num(r[1]) };
    frases.push(`circulação máxima ${r[1]} %`);
  }
  if ((r = t.match(new RegExp(`percurso\\D*${NUM}\\s*m`)))) {
    m.programa = { ...m.programa, percursoMaxM: num(r[1]) };
    frases.push(`percurso até a saída ≤ ${f2(num(r[1]))} m`);
  }
  // "peso da insolação 8" / "priorize custo"
  for (const k of CHAVES_DOS_INDICADORES) {
    const rot = normalizar(ROTULO_DO_INDICADOR[k]).split(' ')[0];
    const rp = t.match(new RegExp(`peso d[aeo]s? ${rot}\\w*\\D*(\\d+)`));
    if (rp) {
      m.pesos = { ...m.pesos, [k]: Number(rp[1]) };
      frases.push(`peso de ${ROTULO_DO_INDICADOR[k]} = ${rp[1]}`);
    } else if (new RegExp(`prioriz\\w* (?:a |o )?${rot}`).test(t)) {
      m.pesos = { ...m.pesos, [k]: 10 };
      frases.push(`prioriza ${ROTULO_DO_INDICADOR[k]} (peso 10)`);
    }
  }
  if (itens.length) m.itens = itens;
  if (frases.length === 0) return null;
  m.entendimento = `Entendi (intérprete local): ${frases.join('; ')}.`;
  return m;
}

// ─── Delta de indicadores e explicação ───────────────────────────────────────

export interface DeltaDeIndicadores {
  notaAntes: number | null;
  notaDepois: number | null;
  linhas: { chave: ChaveDoIndicador; rotulo: string; antes: number | null; depois: number | null; delta: number | null }[];
  texto: string;
}

export function deltaDeIndicadores(antes: Avaliacao | null, depois: Avaliacao): DeltaDeIndicadores {
  const linhas = CHAVES_DOS_INDICADORES.map((k) => {
    const a = antes?.indicadores.find((i) => i.chave === k)?.nota ?? null;
    const d = depois.indicadores.find((i) => i.chave === k)?.nota ?? null;
    return { chave: k, rotulo: ROTULO_DO_INDICADOR[k], antes: a, depois: d, delta: a != null && d != null ? d - a : null };
  });
  const mudaram = linhas.filter((l) => l.delta != null && l.delta !== 0).sort((p, q) => Math.abs(q.delta!) - Math.abs(p.delta!));
  const notaAntes = antes?.notaGeral ?? null;
  const notaDepois = depois.notaGeral;
  const partes: string[] = [];
  partes.push(notaAntes == null ? `nota ${notaDepois ?? '—'}` : `nota ${notaAntes} → ${notaDepois ?? '—'}${notaDepois != null ? ` (${notaDepois - notaAntes >= 0 ? '+' : ''}${notaDepois - notaAntes})` : ''}`);
  for (const l of mudaram.slice(0, 5)) partes.push(`${l.rotulo} ${l.antes} → ${l.depois} (${l.delta! > 0 ? '+' : ''}${l.delta})`);
  if (antes && mudaram.length === 0) partes.push('nenhum indicador mudou');
  return { notaAntes, notaDepois, linhas, texto: partes.join(' · ') };
}

/** Delta de áreas por ambiente entre dois resultados do gerador (pelo nome). */
export function deltaDeAreas(antes: { nome: string; areaM2: number }[] | null, depois: { nome: string; areaM2: number }[]): string {
  if (!antes) return depois.map((a) => `${a.nome} ${f2(a.areaM2)} m²`).join(' · ');
  const partes: string[] = [];
  for (const d of depois) {
    const a = antes.find((x) => x.nome === d.nome);
    if (!a) partes.push(`${d.nome} +${f2(d.areaM2)} m² (novo)`);
    else if (Math.abs(d.areaM2 - a.areaM2) >= 0.05) partes.push(`${d.nome} ${d.areaM2 - a.areaM2 > 0 ? '+' : ''}${f2(d.areaM2 - a.areaM2)} m²`);
  }
  for (const a of antes) if (!depois.some((d) => d.nome === a.nome)) partes.push(`${a.nome} removido (−${f2(a.areaM2)} m²)`);
  return partes.length ? partes.join(' · ') : 'áreas iguais';
}

/** "Explicar solução": decisões do gerador + indicadores + sugestões, em texto corrido determinístico. */
export function explicarSolucao(decisoes: readonly string[], avaliacao: Avaliacao, avisos: readonly string[] = []): string {
  const linhas: string[] = [];
  linhas.push(`Nota geral ${avaliacao.notaGeral ?? '—'} (${avaliacao.avaliados} indicador(es) avaliado(s)${avaliacao.naoAvaliados ? `, ${avaliacao.naoAvaliados} sem dado` : ''}).`);
  if (decisoes.length) {
    linhas.push('', 'Como a planta foi decidida:');
    decisoes.forEach((d, i) => linhas.push(`${i + 1}. ${d}`));
  }
  if (avisos.length) {
    linhas.push('', 'Avisos:');
    for (const a of avisos) linhas.push(`- ${a}`);
  }
  const piores = avaliacao.piores;
  if (piores.length) {
    linhas.push('', 'O que pesa para baixo:');
    for (const i of piores) linhas.push(`- ${i.rotulo} (${i.nota}): ${i.explicacao}`);
  }
  const melhores = avaliacao.indicadores.filter((i) => i.nota != null && i.nota >= 90).slice(0, 4);
  if (melhores.length) linhas.push('', `Pontos fortes: ${melhores.map((i) => `${i.rotulo} (${i.nota})`).join(', ')}.`);
  const sug = sugerirMelhorias(avaliacao).filter((s) => !s.desbloqueio).slice(0, 5);
  if (sug.length) {
    linhas.push('', 'Próximos passos sugeridos:');
    for (const s of sug) linhas.push(`- ${s.titulo}${s.alvo ? ` — ${s.alvo.rotulo}` : ''}`);
  }
  return linhas.join('\n');
}

/** Valida um objeto vindo de fora (a Edge Function) como `MudancasDaIa`. Descarta o que não reconhece. */
export function mudancasDaResposta(raw: unknown): MudancasDaIa | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: MudancasDaIa = { entendimento: typeof r.entendimento === 'string' ? r.entendimento : 'Mudanças propostas pela IA.' };
  if (Array.isArray(r.itens)) {
    out.itens = r.itens.filter((x): x is MudancaDeItem => !!x && typeof x === 'object' && typeof (x as { op?: unknown }).op === 'string');
  }
  if (r.programa && typeof r.programa === 'object') out.programa = r.programa as MudancasDaIa['programa'];
  if (r.gerador && typeof r.gerador === 'object') out.gerador = r.gerador as MudancasDaIa['gerador'];
  if (r.pesos && typeof r.pesos === 'object') out.pesos = r.pesos as MudancasDaIa['pesos'];
  return out;
}
