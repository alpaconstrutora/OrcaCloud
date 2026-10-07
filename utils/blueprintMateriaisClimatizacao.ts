/**
 * A LISTA DE MATERIAIS DA CLIMATIZAÇÃO (E9.1/E9.3 do roadmap de climatização,
 * 07/10/2026). Molde: `blueprintListaDeMateriaisIncendio.ts`.
 *
 * O que vem do QUANTITATIVO do desenho (o mesmo `computeQuantities` do
 * orçamento e da planilha — quant-1.25.0): equipamentos por tipo ×
 * especificação (capacidade, vazão), linha frigorígena pelo par de diâmetros e
 * o isolamento, dreno por DN, duto por seção, terminais de ar, conexões.
 *
 * O que a COMPRA acrescenta, derivado aqui e dito como tal:
 *  - o COBRE por diâmetro — cada trecho da linha são DOIS tubos (líquido e
 *    sucção), e o mesmo Ø serve às duas;
 *  - o ISOLAMENTO por diâmetro × espessura (o tubo de espuma é um por tubo; no
 *    duto é manta, em m² de chapa);
 *  - a CHAPA do duto rígido em m² (perímetro × comprimento) e em kg (espessura
 *    pela maior dimensão — tabela típica, CONFERIR), com a perda declarada;
 *  - o CABO DE INTERLIGAÇÃO por sistema (pelo caminho da linha + a sobra);
 *  - a CARGA ADICIONAL DE GÁS do split (a faixa da E5 — HIPÓTESE);
 *  - os SUPORTES pelo espaçamento declarado.
 * Toda folga e espaçamento é hipótese editável do estudo (`hip.materiais`).
 */
import { POLITICA_PADRAO, ROTULO_DA_CONEXAO, TIPOS_DE_CLIMATIZACAO, TIPOS_DE_EVAPORADORA, computeQuantities, medidaDaBitola, type BlueprintModel, type QuantidadePorBitola, type TipoDeConexao, type TipoDePontoHidraulico } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import type { HipotesesClimatizacao } from './blueprintClimatizacao';
import { linhaExistente, linhasConferidas, sistemasDoNivel, ehSplit } from './blueprintLinhaFrigorigena';
import { analisesDoNivel } from './blueprintVrf';
import { numeracaoDeClimatizacao } from './blueprintNumeracaoClimatizacao';
import { ehEquipamentoDeClimatizacao, perimetroDoDutoM } from './blueprintBudget';

type Quant = ReturnType<typeof computeQuantities>;

export type GrupoDeMaterialDeClimatizacao = 'Equipamentos' | 'Linha frigorígena' | 'Dreno' | 'Dutos' | 'Terminais de ar' | 'Isolamento' | 'Conexões' | 'Interligação e gás' | 'Suportes';
export type UnidadeDeMaterial = 'm' | 'm²' | 'kg' | 'g' | 'un';

export interface LinhaDeMaterialDeClimatizacao {
  grupo: GrupoDeMaterialDeClimatizacao;
  item: string;
  quantidade: number;
  unidade: UnidadeDeMaterial;
  itemCode: string | null;
  /** Como saiu, quando não é a contagem/medida direta do desenho. */
  nota?: string;
}

export interface SistemaNaLista {
  /** "CD-1" (o número do desenho), ou o rótulo da condensadora. */
  nome: string;
  tipo: 'SPLIT' | 'VRF';
  evaporadoras: number;
  /** Σ das evaporadoras declaradas; `null` se alguma não declara. */
  capacidadeBtuH: number | null;
  /** O caminho da linha (split) ou a árvore (VRF), m; `null` sem linha. */
  linhaM: number | null;
  caboM: number | null;
  /** Só no split (a faixa da E5); `null` no VRF e sem linha. */
  gasG: number | null;
}

export interface MateriaisDeClimatizacao {
  totais: LinhaDeMaterialDeClimatizacao[];
  porPavimento: { nome: string; linhaM: number; drenoM: number; dutoM: number; equipamentos: number; terminais: number }[];
  porSistema: SistemaNaLista[];
  avisos: string[];
}

const ORDEM: GrupoDeMaterialDeClimatizacao[] = ['Equipamentos', 'Linha frigorígena', 'Dreno', 'Dutos', 'Terminais de ar', 'Isolamento', 'Conexões', 'Interligação e gás', 'Suportes'];
const DISCIPLINAS = ['FRIGORIGENA', 'DRENO_AC', 'MECANICA'];
const ehDaClimatizacao = (c: string | null) => !!c && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(c);

/** O cobre se compra em POLEGADA: o kernel guarda o mm inteiro (convenção da E5). */
const POLEGADA_DO_COBRE: Record<number, string> = { 6: '1/4"', 10: '3/8"', 13: '1/2"', 16: '5/8"', 19: '3/4"', 22: '7/8"', 28: '1 1/8"', 35: '1 3/8"', 42: '1 5/8"' };
export const nomeDoCobre = (mm: number) => (POLEGADA_DO_COBRE[mm] ? `${POLEGADA_DO_COBRE[mm]} (${mm} mm)` : `${mm} mm`);

/**
 * A espessura da chapa galvanizada pela MAIOR dimensão do duto (bitola típica
 * de dutos de baixa pressão, transcrita de memória — HIPÓTESE, CONFERIR NA
 * NORMA/no padrão da instaladora). Aço: 7,85 kg/m² por mm de espessura.
 */
export const ESPESSURA_DA_CHAPA: readonly { ateMm: number; espessuraMm: number; bitola: string }[] = [
  { ateMm: 300, espessuraMm: 0.5, bitola: '#26' },
  { ateMm: 750, espessuraMm: 0.65, bitola: '#24' },
  { ateMm: 1400, espessuraMm: 0.8, bitola: '#22' },
  { ateMm: 2100, espessuraMm: 0.95, bitola: '#20' },
  { ateMm: Infinity, espessuraMm: 1.25, bitola: '#18' },
];
export const chapaDoDuto = (b: Pick<QuantidadePorBitola, 'bitolaMm' | 'alturaDutoMm'>) => ESPESSURA_DA_CHAPA.find((c) => Math.max(b.bitolaMm, b.alturaDutoMm ?? 0) <= c.ateMm)!;
const KG_POR_M2_POR_MM = 7.85;

const nomeDaPeca = (classificacao: string | null, tipo: string) => (classificacao ? (FICHA_DO_PONTO_HIDRAULICO[classificacao as TipoDePontoHidraulico]?.rotulo ?? tipo) : tipo);
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Soma numa chave (para juntar o mesmo Ø vindo do líquido de uma linha e da sucção de outra). */
function somar<K>(m: Map<K, number>, k: K, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

/** A lista inteira; `quant` é recalculado quando não vem. */
export function materiaisDeClimatizacao(model: BlueprintModel, hip: HipotesesClimatizacao, quant: Quant = computeQuantities(model, POLITICA_PADRAO)): MateriaisDeClimatizacao {
  const t = quant.totais;
  const totais: LinhaDeMaterialDeClimatizacao[] = [];
  const avisos: string[] = [];
  const hm = hip.materiais;
  const bitolas = (t.porBitola ?? []).filter((b) => DISCIPLINAS.includes(b.disciplina) && b.comprimentoM > 0);

  // ── Equipamentos e terminais de ar, pela especificação (quant-1.25.0) ──────
  for (const p of (t.porTerminal ?? []).filter((x) => ehDaClimatizacao(x.classificacao) || (x.disciplina === 'MECANICA' && !x.classificacao))) {
    const nome = nomeDaPeca(p.classificacao, p.tipo);
    const equip = ehEquipamentoDeClimatizacao(p.classificacao);
    totais.push({ grupo: equip ? 'Equipamentos' : 'Terminais de ar', item: p.especificacao ? `${nome} — ${p.especificacao}` : nome, quantidade: p.quantidade, unidade: 'un', itemCode: p.itemCode });
  }
  const semCapacidade = (model.terminais ?? []).filter((x) => x.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(x.tipoHidraulico) && x.capacidadeBtuH == null).length;
  if (semCapacidade) avisos.push(`${semCapacidade} evaporadora(s) sem capacidade declarada: a compra pede o modelo.`);

  // ── Linha frigorígena: a linha (o par) e o cobre por diâmetro ─────────────
  const cobre = new Map<number, number>();
  const isolTubo = new Map<string, { mm: number; esp: number; m: number }>();
  for (const b of bitolas.filter((x) => x.disciplina === 'FRIGORIGENA')) {
    totais.push({ grupo: 'Linha frigorígena', item: `Linha ${medidaDaBitola(b)}`, quantidade: b.comprimentoM, unidade: 'm', itemCode: b.itemCode, nota: 'par líquido/sucção, comprimento real' });
    const succao = b.bitolaSuccaoMm ?? b.bitolaMm;
    somar(cobre, b.bitolaMm, b.comprimentoM);
    somar(cobre, succao, b.comprimentoM);
    if (b.isolamentoMm) {
      for (const mm of [b.bitolaMm, succao]) {
        const k = `${mm}|${b.isolamentoMm}`;
        const a = isolTubo.get(k) ?? { mm, esp: b.isolamentoMm, m: 0 };
        a.m += b.comprimentoM;
        isolTubo.set(k, a);
      }
    }
  }
  for (const [mm, m] of [...cobre].sort((a, b) => a[0] - b[0])) {
    totais.push({ grupo: 'Linha frigorígena', item: `Tubo de cobre ${nomeDoCobre(mm)}`, quantidade: m, unidade: 'm', itemCode: null, nota: 'cada trecho da linha são dois tubos (líquido e sucção)' });
  }
  const linhaSemIsolamento = bitolas.filter((x) => x.disciplina === 'FRIGORIGENA' && !x.isolamentoMm).reduce((s, b) => s + b.comprimentoM, 0);
  if (linhaSemIsolamento > 0) avisos.push(`${r2(linhaSemIsolamento).toLocaleString('pt-BR')} m de linha frigorígena sem isolamento declarado — o isolamento dela não está na lista.`);

  // ── Dreno ──────────────────────────────────────────────────────────────────
  for (const b of bitolas.filter((x) => x.disciplina === 'DRENO_AC')) {
    const mat = b.material ? (FICHA_DO_MATERIAL[b.material as keyof typeof FICHA_DO_MATERIAL]?.rotulo ?? b.material) : 'material não declarado';
    totais.push({ grupo: 'Dreno', item: `Tubo ${mat} ${medidaDaBitola(b)}`, quantidade: b.comprimentoM, unidade: 'm', itemCode: b.itemCode });
    if (b.isolamentoMm) {
      const k = `${b.bitolaMm}|${b.isolamentoMm}|dreno`;
      const a = isolTubo.get(k) ?? { mm: b.bitolaMm, esp: b.isolamentoMm, m: 0 };
      a.m += b.comprimentoM;
      isolTubo.set(k, a);
    }
  }

  // ── Dutos: rígido em m² e kg, flexível em m; o isolamento do duto em m² ───
  const isolDuto = new Map<number, number>();
  for (const b of bitolas.filter((x) => x.disciplina === 'MECANICA')) {
    const flexivel = b.material === 'DUTO_FLEXIVEL';
    const mat = b.material ? (FICHA_DO_MATERIAL[b.material as keyof typeof FICHA_DO_MATERIAL]?.rotulo ?? b.material) : 'Chapa galvanizada (material não declarado)';
    totais.push({ grupo: 'Dutos', item: `Duto ${medidaDaBitola(b)} — ${mat}`, quantidade: b.comprimentoM, unidade: 'm', itemCode: b.itemCode });
    if (flexivel) continue;
    const area = perimetroDoDutoM(b) * b.comprimentoM;
    // A chapa é a mesma com ou sem manta: o isolamento é item próprio (grupo Isolamento).
    const secao = medidaDaBitola({ ...b, isolamentoMm: undefined });
    const comPerda = area * (1 + hm.perdaDaChapaPct / 100);
    totais.push({ grupo: 'Dutos', item: `Chapa — duto ${secao}`, quantidade: comPerda, unidade: 'm²', itemCode: null, nota: `perímetro × comprimento = ${r2(area).toLocaleString('pt-BR')} m² + ${hm.perdaDaChapaPct} % de perda` });
    if (b.material !== 'PAINEL_PREISOLADO') {
      const c = chapaDoDuto(b);
      totais.push({ grupo: 'Dutos', item: `Aço galvanizado ${c.bitola} (${String(c.espessuraMm).replace('.', ',')} mm) — duto ${secao}`, quantidade: comPerda * c.espessuraMm * KG_POR_M2_POR_MM, unidade: 'kg', itemCode: null, nota: 'espessura pela maior dimensão — HIPÓTESE, CONFERIR' });
    }
    if (b.isolamentoMm) somar(isolDuto, b.isolamentoMm, area);
  }
  for (const a of [...isolTubo.values()].sort((x, y) => x.mm - y.mm || x.esp - y.esp)) {
    totais.push({ grupo: 'Isolamento', item: `Isolamento elastomérico ${a.esp} mm para tubo ${nomeDoCobre(a.mm)}`, quantidade: a.m, unidade: 'm', itemCode: null });
  }
  for (const [esp, m2] of [...isolDuto].sort((a, b) => a[0] - b[0])) {
    totais.push({ grupo: 'Isolamento', item: `Manta isolante ${esp} mm para duto`, quantidade: m2, unidade: 'm²', itemCode: null, nota: 'área externa do duto, sem perda' });
  }

  // ── Conexões (a curva do cobre é tubo curvado, não peça) ──────────────────
  for (const c of (t.porConexao ?? []).filter((x) => DISCIPLINAS.includes(x.disciplina))) {
    const curvaDoCobre = c.disciplina === 'FRIGORIGENA' && (c.tipo === 'JOELHO_90' || c.tipo === 'JOELHO_45');
    if (curvaDoCobre) continue;
    const rede = c.disciplina === 'FRIGORIGENA' ? 'linha' : c.disciplina === 'DRENO_AC' ? 'dreno' : 'duto';
    totais.push({ grupo: 'Conexões', item: `${ROTULO_DA_CONEXAO[c.tipo as TipoDeConexao] ?? c.tipo} ${rede} ${c.disciplina === 'MECANICA' ? '' : 'DN '}${c.bitolaMm}${c.paraMm != null ? ` × ${c.paraMm}` : ''}`.replace('  ', ' '), quantidade: c.quantidade, unidade: 'un', itemCode: null });
  }
  const curvas = (t.porConexao ?? []).filter((c) => c.disciplina === 'FRIGORIGENA' && (c.tipo === 'JOELHO_90' || c.tipo === 'JOELHO_45')).reduce((s, c) => s + c.quantidade, 0);
  if (curvas) avisos.push(`${curvas} mudança(s) de direção na linha frigorígena: cobre CURVADO (raio mínimo na conferência da linha), não joelho — sem peça na lista.`);

  // ── Sistemas: cabo de interligação e gás ──────────────────────────────────
  const numeros = numeracaoDeClimatizacao(model);
  const porSistema: SistemaNaLista[] = [];
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  for (const l of niveis) {
    const gasDe = new Map(linhasConferidas(model, l.id, hip.linha).map((x) => [x.evaporadoraId, x.gasAdicionalG]));
    for (const s of sistemasDoNivel(model, l.id).filter(ehSplit)) {
      const linha = linhaExistente(model, s);
      const linhaM = linha ? linha.mm / 1000 : null;
      porSistema.push({
        nome: `${numeros.get(s.condensadora.id)?.numero ?? 'Condensadora'} ← ${numeros.get(s.evaporadora.id)?.numero ?? 'evaporadora'}`,
        tipo: 'SPLIT',
        evaporadoras: 1,
        capacidadeBtuH: s.evaporadora.capacidadeBtuH ?? null,
        linhaM,
        caboM: linhaM != null ? linhaM + hm.folgaDoCaboM : null,
        gasG: linha ? (gasDe.get(s.evaporadora.id) ?? null) : null,
      });
    }
    for (const a of analisesDoNivel(model, l.id)) {
      const caps = a.sistema.evaporadoras.map((e) => e.capacidadeBtuH);
      porSistema.push({
        nome: numeros.get(a.sistema.condensadora.id)?.numero ?? a.sistema.nome,
        tipo: 'VRF',
        evaporadoras: a.sistema.evaporadoras.length,
        capacidadeBtuH: caps.length && caps.every((c) => c != null) ? caps.reduce((x, c) => x + (c ?? 0), 0) : null,
        linhaM: a.comprimentoTotalM,
        // O cabo de comunicação do VRF segue a árvore: o total dela + a sobra em cada evaporadora.
        caboM: a.comprimentoTotalM != null ? a.comprimentoTotalM + hm.folgaDoCaboM * a.sistema.evaporadoras.length : null,
        gasG: null,
      });
    }
  }
  const comCabo = porSistema.filter((s) => s.caboM != null);
  if (comCabo.length) totais.push({ grupo: 'Interligação e gás', item: 'Cabo de interligação (alimentação e comando) — evaporadora × condensadora', quantidade: comCabo.reduce((s, x) => s + x.caboM!, 0), unidade: 'm', itemCode: null, nota: `caminho da linha + ${String(hm.folgaDoCaboM).replace('.', ',')} m de sobra por sistema/evaporadora` });
  const semLinha = porSistema.filter((s) => s.linhaM == null);
  if (semLinha.length) avisos.push(`${semLinha.length} sistema(s) sem linha frigorígena traçada (${semLinha.map((s) => s.nome).join(', ')}): cabo e gás deles fora da lista.`);
  const gas = porSistema.filter((s) => s.gasG != null).reduce((s, x) => s + x.gasG!, 0);
  if (porSistema.some((s) => s.tipo === 'SPLIT' && s.gasG != null)) totais.push({ grupo: 'Interligação e gás', item: 'Carga adicional de gás refrigerante (split)', quantidade: gas / 1000, unidade: 'kg', itemCode: null, nota: `linha além de ${hip.linha.preCargaM} m de pré-carga × g/m da faixa — HIPÓTESE, CONFERIR com o fabricante` });
  if (porSistema.some((s) => s.tipo === 'VRF')) avisos.push('VRF: a carga adicional de gás sai do cálculo do fabricante (não estimada aqui).');

  // ── Suportes pelo espaçamento ─────────────────────────────────────────────
  const metrosDe = (d: string) => bitolas.filter((b) => b.disciplina === d).reduce((s, b) => s + b.comprimentoM, 0);
  const suportes: [string, string, number][] = [
    ['FRIGORIGENA', 'Suporte/abraçadeira da linha frigorígena', hm.espacamentoSuporteLinhaM],
    ['DRENO_AC', 'Suporte/abraçadeira do dreno', hm.espacamentoSuporteDrenoM],
    ['MECANICA', 'Suporte do duto (perfilado e tirante)', hm.espacamentoSuporteDutoM],
  ];
  for (const [d, item, esp] of suportes) {
    const m = metrosDe(d);
    if (m > 0) totais.push({ grupo: 'Suportes', item, quantidade: Math.ceil(m / esp), unidade: 'un', itemCode: null, nota: `${r2(m).toLocaleString('pt-BR')} m ÷ 1 a cada ${String(esp).replace('.', ',')} m` });
  }

  totais.sort((a, b) => ORDEM.indexOf(a.grupo) - ORDEM.indexOf(b.grupo));

  // ── Por pavimento: o comprimento REAL do quantitativo ─────────────────────
  const nivelDoTrecho = new Map((model.trechos ?? []).map((x) => [x.id, x.levelId]));
  const metros = (d: string, levelId: string) => quant.trechos.filter((q) => q.disciplina === d && nivelDoTrecho.get(q.trechoId) === levelId).reduce((s, q) => s + q.comprimentoM, 0);
  const porPavimento = niveis
    .map((l) => {
      const pecas = (model.terminais ?? []).filter((x) => x.levelId === l.id && ehDaClimatizacao(x.tipoHidraulico ?? null));
      return {
        nome: l.name,
        linhaM: metros('FRIGORIGENA', l.id),
        drenoM: metros('DRENO_AC', l.id),
        dutoM: metros('MECANICA', l.id),
        equipamentos: pecas.filter((x) => ehEquipamentoDeClimatizacao(x.tipoHidraulico ?? null)).length,
        terminais: pecas.filter((x) => !ehEquipamentoDeClimatizacao(x.tipoHidraulico ?? null)).length,
      };
    })
    .filter((p) => p.linhaM + p.drenoM + p.dutoM > 0 || p.equipamentos + p.terminais > 0);
  return { totais, porPavimento, porSistema, avisos };
}

/** Tem o que listar? (a folha e a aba só entram com isso) */
export const temMateriaisDeClimatizacao = (model: BlueprintModel) =>
  (model.trechos ?? []).some((t) => DISCIPLINAS.includes(t.disciplina)) || (model.terminais ?? []).some((t) => ehDaClimatizacao(t.tipoHidraulico ?? null));

const fmt = (v: number, un: UnidadeDeMaterial) => (un === 'un' ? String(Math.round(v)) : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));

/** A aba do XLSX: o total (com o código e a nota), os sistemas e os pavimentos. */
export function abaDaListaDeMateriaisClimatizacao(m: MateriaisDeClimatizacao): { nome: string; linhas: (string | number)[][] } {
  return {
    nome: 'Climatização — materiais',
    linhas: [
      ['Lista de materiais — climatização'],
      ['Grupo', 'Item', 'Quantidade', 'Unidade', 'Código', 'Como saiu'],
      ...m.totais.map((l) => [l.grupo, l.item, r2(l.quantidade), l.unidade, l.itemCode ?? '', l.nota ?? '']),
      [],
      ['Sistema', 'Tipo', 'Evaporadoras', 'Capacidade (BTU/h)', 'Linha (m)', 'Cabo (m)', 'Gás adicional (g)'],
      ...m.porSistema.map((s) => [s.nome, s.tipo, s.evaporadoras, s.capacidadeBtuH ?? '', s.linhaM != null ? r2(s.linhaM) : '', s.caboM != null ? r2(s.caboM) : '', s.gasG ?? '']),
      [],
      ['Pavimento', 'Linha (m)', 'Dreno (m)', 'Duto (m)', 'Equipamentos (un)', 'Terminais (un)'],
      ...m.porPavimento.map((p) => [p.nome, r2(p.linhaM), r2(p.drenoM), r2(p.dutoM), p.equipamentos, p.terminais]),
      ...(m.avisos.length ? [[], ['Avisos'], ...m.avisos.map((a) => [a])] : []),
    ],
  };
}

/**
 * Desenha a lista em colunas (item · qtd · un.), fluindo para a coluna
 * seguinte quando a de baixo acaba; devolve quantas linhas escreveu.
 */
export function desenharListaDeMateriaisClimatizacao(d: Desenhista, m: MateriaisDeClimatizacao, x0: number, y0: number, largura: number, altura: number): number {
  const COR_FRACA = '#555555';
  const PASSO = 3.6;
  const larguraDaColuna = Math.min(125, largura / Math.max(1, Math.floor(largura / 125)));
  let col = 0;
  let y = y0;
  let escritas = 0;
  const x = () => x0 + col * larguraDaColuna;
  const quebra = (h: number) => {
    if (y + h > y0 + altura) {
      col += 1;
      y = y0;
    }
  };
  const titulo = (t: string) => {
    quebra(PASSO * 3);
    y += 2;
    d.texto(x(), y, t, 2.6);
    y += PASSO + 0.6;
    d.texto(x(), y, 'Item', 1.9, COR_FRACA);
    d.texto(x() + larguraDaColuna - 30, y, 'Qtd.', 1.9, COR_FRACA);
    d.texto(x() + larguraDaColuna - 12, y, 'Un.', 1.9, COR_FRACA);
    y += PASSO;
  };
  const linha = (l: { item: string; quantidade: number; unidade: UnidadeDeMaterial }) => {
    quebra(PASSO);
    d.texto(x(), y, l.item.length > 52 ? `${l.item.slice(0, 51)}…` : l.item, 1.9);
    d.texto(x() + larguraDaColuna - 30, y, fmt(l.quantidade, l.unidade), 1.9);
    d.texto(x() + larguraDaColuna - 12, y, l.unidade, 1.9);
    y += PASSO;
    escritas += 1;
  };
  if (m.totais.length === 0) {
    d.texto(x0, y0 + 4, 'Sem instalação de climatização no desenho.', 2.2, COR_FRACA);
    return 0;
  }
  titulo('TOTAL DO DESENHO');
  let grupo = '';
  for (const l of m.totais) {
    if (l.grupo !== grupo) {
      quebra(PASSO);
      d.texto(x(), y, l.grupo, 2.0, COR_FRACA);
      y += PASSO;
      grupo = l.grupo;
    }
    linha(l);
  }
  if (m.porSistema.length) {
    titulo('POR SISTEMA');
    for (const s of m.porSistema) {
      linha({ item: `${s.nome} (${s.tipo === 'VRF' ? `VRF, ${s.evaporadoras} evap.` : 'split'}) — linha`, quantidade: s.linhaM ?? 0, unidade: 'm' });
      if (s.caboM != null) linha({ item: `${s.nome} — cabo de interligação`, quantidade: s.caboM, unidade: 'm' });
      if (s.gasG != null) linha({ item: `${s.nome} — gás adicional`, quantidade: s.gasG, unidade: 'g' });
    }
  }
  if (m.porPavimento.length) {
    titulo('POR PAVIMENTO');
    for (const p of m.porPavimento) {
      if (p.linhaM) linha({ item: `${p.nome} — linha frigorígena`, quantidade: p.linhaM, unidade: 'm' });
      if (p.drenoM) linha({ item: `${p.nome} — dreno`, quantidade: p.drenoM, unidade: 'm' });
      if (p.dutoM) linha({ item: `${p.nome} — duto`, quantidade: p.dutoM, unidade: 'm' });
      linha({ item: `${p.nome} — equipamentos e terminais`, quantidade: p.equipamentos + p.terminais, unidade: 'un' });
    }
  }
  quebra(PASSO * (2 + m.avisos.length));
  d.texto(x(), y + 2, 'Do quantitativo do desenho (o mesmo do orçamento); cobre, isolamento, chapa, cabo, gás e suportes derivados pelas premissas do estudo — HIPÓTESE.', 1.7, COR_FRACA);
  m.avisos.forEach((a, i) => d.texto(x(), y + 2 + (i + 1) * 2.6, `• ${a.length > 110 ? `${a.slice(0, 109)}…` : a}`, 1.6, COR_FRACA));
  return escritas;
}
