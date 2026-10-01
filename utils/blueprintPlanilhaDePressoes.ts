/**
 * A PLANILHA E O DIAGRAMA DE PRESSÕES (01/10/2026, E8.2 do roadmap de incêndio).
 *
 *  - PLANILHA: o cenário que governa a bomba (E2/E5), trecho a trecho na ordem
 *    do CAMINHO CRÍTICO primeiro (fonte → peça mais desfavorável) e depois o
 *    resto: papel, DN, material, L, Leq, Q, V, J, hf e a pressão nas duas
 *    pontas; e as peças abertas com a vazão, a pressão e o exigido. A mesma
 *    tabela vai para a folha do conjunto e para a aba do XLSX.
 *  - CAMINHO CRÍTICO: os trechos da fonte até a peça aberta de MENOR folga —
 *    destacado na planta de hidrantes/sprinklers.
 *  - CURVA DA BOMBA: a curva da bomba, a do sistema, o ponto de projeto e o de
 *    operação, desenhados na folha.
 * Tudo derivado; vem do MESMO cálculo da tela (`calculoDeIncendio`).
 */
import type { BlueprintModel, ObjectId } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { ROTULO_DO_PAPEL, calculoDeIncendio, redeDeIncendio, type CalculoDeIncendio, type ReservaDeTabela } from './blueprintCalculoIncendio';
import { desenhoPrefereMangotinho, sistemaDeHidrantesMG } from './blueprintIncendioHidrantesMG';
import { analisarBomba, type AnaliseDaBomba } from './blueprintBombeamentoIncendio';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import { criterioDeSprinklers } from './blueprintSprinklersIncendio';
import { classificarEdificacao, type ClassificacaoDaEdificacao, type HipotesesIncendio } from './blueprintIncendioClassificacao';
import { numeracaoDeIncendio } from './blueprintNumeracaoIncendio';

/** D1.2: a reserva de tabela do regulamento — MG: IT 17, Tabela 4 (pelo que o desenho lançou: só mangotinho = tipo 1). */
export function reservaDeTabelaDoEstudo(model: BlueprintModel, c: ClassificacaoDaEdificacao): ReservaDeTabela | null {
  if (c.preset !== 'MG_CBMMG') return null;
  const s = sistemaDeHidrantesMG(c, desenhoPrefereMangotinho(model));
  return 'tipo' in s ? { litros: s.reservaM3 * 1000, descricao: s.motivo, fonte: s.fonte } : null;
}

/** O cálculo com as premissas do estudo — o mesmo que a tela faz (critério dos sprinklers pela divisão). */
export function calculoDoEstudo(model: BlueprintModel, hip: HipotesesIncendio): { calculo: CalculoDeIncendio; bomba: AnaliseDaBomba | null } {
  const classificacao = classificarEdificacao(model, hip.classificacao);
  const divisao = classificacao.divisao.valor;
  const calculo = calculoDeIncendio(model, hip.hidraulica, criterioDeSprinklers(hip.sprinklers, divisao), reservaDeTabelaDoEstudo(model, classificacao));
  return { calculo, bomba: calculo.cenario ? analisarBomba(model, calculo.hip, hip.bombeamento, calculo) : null };
}

/** Os trechos da fonte até a peça aberta de menor folga (a mais desfavorável no cenário que governa). */
export function caminhoCritico(model: BlueprintModel, c: CalculoDeIncendio): { trechos: ObjectId[]; pecaId: ObjectId | null } {
  if (!c.cenario || !c.cenario.terminais.length) return { trechos: [], pecaId: null };
  const folga = (t: (typeof c.cenario.terminais)[number]) => (t.exigidoLmin ? t.vazaoLmin / t.exigidoLmin : t.pressaoNoBicoKpa / (t.exigidoKpa || 1));
  const pior = c.cenario.terminais.reduce((a, b) => (folga(b) < folga(a) ? b : a));
  const rede = redeDeIncendio(model);
  const alvo = rede.noDoTerminal.get(pior.terminalId);
  if (!rede.noDaFonte || !alvo) return { trechos: [], pecaId: pior.terminalId };
  const adj = new Map<string, { para: string; id: ObjectId }[]>();
  for (const x of rede.tubos) {
    adj.set(x.de, [...(adj.get(x.de) ?? []), { para: x.para, id: x.trecho.id }]);
    adj.set(x.para, [...(adj.get(x.para) ?? []), { para: x.de, id: x.trecho.id }]);
  }
  const pai = new Map<string, { de: string; id: ObjectId }>();
  const vistos = new Set([rede.noDaFonte]);
  const fila = [rede.noDaFonte];
  while (fila.length) {
    const u = fila.shift()!;
    if (u === alvo) break;
    for (const e of adj.get(u) ?? []) {
      if (vistos.has(e.para)) continue;
      vistos.add(e.para);
      pai.set(e.para, { de: u, id: e.id });
      fila.push(e.para);
    }
  }
  const trechos: ObjectId[] = [];
  for (let k = alvo; pai.has(k); k = pai.get(k)!.de) trechos.unshift(pai.get(k)!.id);
  return { trechos, pecaId: pior.terminalId };
}

export interface PlanilhaDePressoes {
  /** Uma linha de resumo: o sistema que governa, a vazão e a carga na fonte. */
  resumo: string[];
  cabecalhoTrechos: string[];
  trechos: string[][];
  cabecalhoPecas: string[];
  pecas: string[][];
  /** Por que não há planilha (sem fonte, sem cálculo). */
  motivo: string | null;
}

const n = (v: number, k = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: k, maximumFractionDigits: k });
const ROTULO_DO_SISTEMA = { HIDRANTES: 'hidrantes', SPRINKLERS: 'sprinklers', COMBINADO: 'sprinklers e hidrantes (demanda combinada)' } as const;

export function planilhaDePressoes(model: BlueprintModel, c: CalculoDeIncendio): PlanilhaDePressoes {
  const vazia = (motivo: string): PlanilhaDePressoes => ({ resumo: [], cabecalhoTrechos: [], trechos: [], cabecalhoPecas: [], pecas: [], motivo });
  if (!c.cenario) return vazia(c.motivo ?? 'sem cálculo');
  const cen = c.cenario;
  const numeros = numeracaoDeIncendio(model);
  const { trechos: caminho } = caminhoCritico(model, c);
  const naOrdem = [...cen.trechos].sort((a, b) => {
    const ia = caminho.indexOf(a.trechoId);
    const ib = caminho.indexOf(b.trechoId);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || b.vazaoLmin - a.vazaoLmin;
  });
  const resumo = [
    `Governa a bomba: ${c.sistema ? ROTULO_DO_SISTEMA[c.sistema] : '—'}`,
    `Vazão na fonte: ${n(cen.vazaoNaFonteLmin, 0)} L/min`,
    c.porGravidade ? `Por gravidade (carga necessária acima do fundo: ${c.cargaNecessariaM != null ? `${n(c.cargaNecessariaM)} mca` : '—'})` : `Altura manométrica: ${n(c.cargaNecessariaM ?? 0)} mca (${n((c.cargaNecessariaM ?? 0) * 9.80665, 0)} kPa)`,
    `Fórmula: ${c.hip.formula === 'HAZEN_WILLIAMS' ? 'Hazen-Williams' : c.hip.formula === 'UNIVERSAL' ? 'universal' : 'Fair-Whipple-Hsiao'}`,
  ];
  const trechos = naOrdem.map((t, i) => {
    const total = t.lM + t.leqM;
    return [
      `${caminho.includes(t.trechoId) ? '*' : ''}${i + 1}`,
      ROTULO_DO_PAPEL[c.papel.get(t.trechoId) ?? 'RAMAL'],
      `${t.dn}`,
      FICHA_DO_MATERIAL[t.material].rotulo,
      n(t.lM, 2),
      n(t.leqM, 2),
      n(t.vazaoLmin, 1),
      n(t.velocidadeMs, 2),
      total > 0 ? n(t.perdaMca / total, 4) : '—',
      n(t.perdaMca, 3),
      n(t.pressaoDeKpa, 0),
      n(t.pressaoParaKpa, 0),
    ];
  });
  const pecas = cen.terminais.map((t) => [
    numeros.get(t.terminalId)?.numero ?? t.terminalId,
    n(t.vazaoLmin, 1),
    n(t.pressaoNoKpa, 0),
    n(t.pressaoNoBicoKpa, 0),
    t.exigidoLmin != null ? `>= ${n(t.exigidoLmin, 0)} L/min` : `>= ${n(t.exigidoKpa ?? 0, 0)} kPa`,
    t.atende ? 'atende' : 'NÃO ATENDE',
  ]);
  return {
    resumo,
    cabecalhoTrechos: ['Trecho', 'Papel', 'DN', 'Material', 'L (m)', 'Leq (m)', 'Q (L/min)', 'V (m/s)', 'J (m/m)', 'hf (mca)', 'P início (kPa)', 'P fim (kPa)'],
    trechos,
    cabecalhoPecas: ['Peça', 'Q (L/min)', 'P no nó (kPa)', 'P no esguicho/bico (kPa)', 'Exigido', 'Situação'],
    pecas,
    motivo: null,
  };
}

/** A aba do XLSX: o resumo, a tabela dos trechos e a das peças, uma embaixo da outra. */
export function abaDaPlanilhaDePressoes(p: PlanilhaDePressoes): { nome: string; linhas: (string | number)[][] } {
  if (p.motivo) return { nome: 'Incêndio — pressões', linhas: [['Planilha de pressões'], [p.motivo]] };
  return {
    nome: 'Incêndio — pressões',
    linhas: [['Planilha de pressões — incêndio'], ...p.resumo.map((r) => [r]), [], ['* = trecho do caminho crítico (fonte → peça mais desfavorável)'], p.cabecalhoTrechos, ...p.trechos, [], p.cabecalhoPecas, ...p.pecas],
  };
}

// ─── A folha ─────────────────────────────────────────────────────────────────

const COR = '#000000';
const COR_FRACA = '#555555';
const LARANJA = '#ea580c';
const AZUL = '#3b82f6';
const CINZA = '#94a3b8';

/** Uma tabela simples: colunas de larguras proporcionais ao cabeçalho; devolve a altura. Corta as linhas que não cabem. */
function tabela(d: Desenhista, x0: number, y0: number, largura: number, cab: string[], linhas: string[][], alturaMax: number, alturaTexto = 1.7): { altura: number; cortadas: number } {
  const passo = alturaTexto * 1.75;
  const pesos = cab.map((h, i) => Math.max(h.length, ...linhas.map((l) => (l[i] ?? '').length)) + 2);
  const soma = pesos.reduce((a, b) => a + b, 0);
  const xs: number[] = [];
  let acc = x0;
  for (const p of pesos) {
    xs.push(acc);
    acc += (p / soma) * largura;
  }
  let y = y0;
  cab.forEach((h, i) => d.texto(xs[i], y, h, alturaTexto, COR));
  y += 1.2;
  d.linha(x0, y, x0 + largura, y, { espessuraMm: 0.18, cor: COR_FRACA });
  y += passo;
  let cortadas = 0;
  for (const l of linhas) {
    if (y - y0 > alturaMax) {
      cortadas++;
      continue;
    }
    l.forEach((c, i) => d.texto(xs[i], y, c, alturaTexto, c === 'NÃO ATENDE' ? '#b91c1c' : COR));
    y += passo;
  }
  return { altura: y - y0, cortadas };
}

/** A curva da bomba × a do sistema, num retângulo (x0, y0, w, h) em mm de papel. */
function desenharCurva(d: Desenhista, x0: number, y0: number, w: number, h: number, curva: { vazaoLmin: number; alturaMm: number }[], b: AnaliseDaBomba): void {
  const pts = [...curva.map((p) => ({ q: p.vazaoLmin, h: p.alturaMm / 1000 })), ...b.curvaDoSistema.map((p) => ({ q: p.vazaoLmin, h: p.alturaM }))];
  if (b.projeto) pts.push({ q: b.projeto.vazaoLmin, h: b.projeto.alturaM });
  const qMax = Math.max(...pts.map((p) => p.q), 1) * 1.1;
  const hMax = Math.max(...pts.map((p) => p.h), 1) * 1.1;
  const X = (q: number) => x0 + (q / qMax) * w;
  const Y = (hh: number) => y0 + h - (hh / hMax) * h;
  d.linha(x0, y0 + h, x0 + w, y0 + h, { espessuraMm: 0.25, cor: COR });
  d.linha(x0, y0, x0, y0 + h, { espessuraMm: 0.25, cor: COR });
  for (let i = 0; i <= 4; i++) {
    const q = (qMax / 4) * i;
    const hh = (hMax / 4) * i;
    d.texto(X(q) - 2, y0 + h + 3.5, n(q, 0), 1.6, COR_FRACA);
    d.texto(x0 - 9, Y(hh) + 0.6, n(hh, 0), 1.6, COR_FRACA);
  }
  d.texto(x0 + w / 2 - 6, y0 + h + 7.5, 'Vazão (L/min)', 1.8, COR);
  d.texto(x0 - 9, y0 - 3, 'Altura (m)', 1.8, COR);
  const traco = (lista: { q: number; h: number }[], cor: string) => lista.slice(1).forEach((p, i) => d.linha(X(lista[i].q), Y(lista[i].h), X(p.q), Y(p.h), { espessuraMm: 0.4, cor }));
  traco(curva.map((p) => ({ q: p.vazaoLmin, h: p.alturaMm / 1000 })), AZUL);
  traco(b.curvaDoSistema.map((p) => ({ q: p.vazaoLmin, h: p.alturaM })), CINZA);
  const marca = (q: number, hh: number, cor: string) => d.retangulo(X(q) - 0.9, Y(hh) - 0.9, 1.8, 1.8, { espessuraMm: 0.4, cor });
  if (b.projeto) marca(b.projeto.vazaoLmin, b.projeto.alturaM, LARANJA);
  if (b.operacao) marca(b.operacao.vazaoLmin, b.operacao.alturaM, '#16a34a');
  // A legenda, abaixo.
  const ly = y0 + h + 12;
  d.linha(x0, ly - 0.6, x0 + 5, ly - 0.6, { espessuraMm: 0.4, cor: AZUL });
  d.texto(x0 + 6, ly, 'Curva da bomba', 1.7, COR);
  d.linha(x0 + 34, ly - 0.6, x0 + 39, ly - 0.6, { espessuraMm: 0.4, cor: CINZA });
  d.texto(x0 + 40, ly, 'Curva do sistema', 1.7, COR);
  if (b.projeto) d.texto(x0, ly + 4, `Projeto: ${n(b.projeto.vazaoLmin, 0)} L/min a ${n(b.projeto.alturaM)} m`, 1.7, LARANJA);
  d.texto(x0, ly + 8, b.operacao ? `Operação: ${n(b.operacao.vazaoLmin, 0)} L/min a ${n(b.operacao.alturaM)} m${b.operacao.atende ? '' : ' — não atende'}` : 'Operação: a bomba não alcança a vazão da rede', 1.7, b.operacao?.atende ? '#16a34a' : '#b91c1c');
}

/** A folha: resumo, planilha dos trechos, peças e — com bomba e curva — o gráfico. */
export function desenharFolhaDePressoes(d: Desenhista, model: BlueprintModel, c: CalculoDeIncendio, bomba: AnaliseDaBomba | null, x0: number, y0: number, largura: number, altura: number): void {
  const p = planilhaDePressoes(model, c);
  d.texto(x0, y0, 'PLANILHA DE PRESSÕES — INCÊNDIO', 3.2, COR);
  if (p.motivo) {
    d.texto(x0, y0 + 8, `Sem planilha: ${p.motivo}.`, 2.2, '#b91c1c');
    return;
  }
  let y = y0 + 7;
  for (const r of p.resumo) {
    d.texto(x0, y, r, 2.0, COR);
    y += 3.6;
  }
  const curva = bomba && (model.terminais ?? []).find((t) => t.id === bomba.terminalId)?.curvaBomba;
  const larguraTabela = curva ? largura * 0.66 : largura;
  y += 2;
  d.texto(x0, y, '* = trecho do caminho crítico (fonte → peça mais desfavorável), na ordem.', 1.7, COR_FRACA);
  y += 4;
  const t = tabela(d, x0, y, larguraTabela, p.cabecalhoTrechos, p.trechos, altura * 0.55);
  y += t.altura + 3;
  if (t.cortadas) {
    d.texto(x0, y, `+${t.cortadas} trecho(s) não couberam nesta folha — a planilha completa vai no XLSX.`, 1.8, '#b91c1c');
    y += 4;
  }
  d.texto(x0, y, 'PEÇAS ABERTAS NO CÁLCULO', 2.4, COR);
  y += 4;
  tabela(d, x0, y, larguraTabela * 0.8, p.cabecalhoPecas, p.pecas, Math.max(10, y0 + altura - y - 4));
  if (curva && bomba) {
    const gx = x0 + larguraTabela + 18;
    const gw = largura - larguraTabela - 22;
    d.texto(gx - 9, y0 + 12, 'CURVA DA BOMBA × CURVA DO SISTEMA', 2.4, COR);
    desenharCurva(d, gx, y0 + 20, gw, Math.min(gw * 0.8, altura * 0.5), curva, bomba);
  }
}
