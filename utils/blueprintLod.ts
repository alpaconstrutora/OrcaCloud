/**
 * LOD — NÍVEL DE DESENVOLVIMENTO POR ELEMENTO (21/09/2026, backlog P2 — "LOD
 * elevado"). O LOD (AIA G202 / BIMForum) diz quanto se pode CONFIAR num
 * elemento: 100 conceito, 200 aproximado, 300 geometria e informação precisas,
 * 350 com interfaces e identificação do material, 400 fabricação.
 *
 * ─── DERIVADO, NÃO DECLARADO ────────────────────────────────────────────────
 *
 * Aqui o LOD não é um campo que alguém escolhe: é LIDO do que o elemento já
 * tem. Uma parede com composição em camadas é 300; com o material de cada
 * camada identificado (item do catálogo) é 350. Declarar "LOD 350" numa parede
 * sem camadas seria mentira que o orçamento cobraria depois. O que o usuário
 * declara é o ALVO por família — e o painel lista o que falta para chegar lá,
 * peça a peça, com o requisito por extenso.
 *
 * ─── TETO POR FAMÍLIA (declarado) ───────────────────────────────────────────
 *
 * O sistema avalia LOD 400 (fabricação) SÓ em estrutura — pela armadura por
 * peça (P2.30): 350 quando a pessoa declarou a armadura da peça (barras,
 * bitola, estribo — `HipotesesDeArmadura.porPeca`), 400 quando ela está
 * completa e sem avisos (dá lista de barras). Telhado para em 300. O teto de
 * cada família está em `FICHA_DA_FAMILIA_LOD.teto`, e o quadro o mostra para
 * ninguém cobrar do desenho o que ele não representa.
 *
 * ─── ONDE VAI ───────────────────────────────────────────────────────────────
 *
 * Painel Analisar › LOD (quadro + pendências), e o IFC leva
 * `LevelOfDevelopment` no `Pset_OpuraPlanta` de cada elemento (opcional em
 * `OpcoesIfc.lodPorUid`, para as goldens não mudarem).
 */
import type { BlueprintModel, ObjectId, Opening, Space, Structural, Terminal, Trecho, Wall } from './blueprintKernel';
import type { ArmaduraDaPeca, ArmaduraManual } from './blueprintArmadura';
import { acabamentosDoAmbiente, nomeDoTipoDeAbertura, nomeDoTipoEstrutural, rotuloCurto } from './blueprintKernel';
import { etiquetaDoAmbiente } from './blueprintDistribuicao';

/** Rotulo curto pelo uid; modelos antigos/fixtures sem uid caem no id. */
const curto = (uid: string | undefined, familia: Parameters<typeof rotuloCurto>[1], id: string) => (uid ? rotuloCurto(uid, familia) : id);

export const NIVEIS_DE_LOD = [100, 200, 300, 350, 400] as const;
export type NivelDeLod = (typeof NIVEIS_DE_LOD)[number];

export const FICHA_DO_LOD: Record<NivelDeLod, { rotulo: string; descricao: string }> = {
  100: { rotulo: 'LOD 100 · conceito', descricao: 'Símbolo ou volume genérico; dimensões indicativas.' },
  200: { rotulo: 'LOD 200 · aproximado', descricao: 'Geometria aproximada: posição, forma e dimensões gerais.' },
  300: { rotulo: 'LOD 300 · preciso', descricao: 'Geometria e informação precisas: composição, tipo, classificação.' },
  350: { rotulo: 'LOD 350 · coordenação', descricao: 'Interfaces e identificação: material/item de catálogo, circuito, esquadria com código.' },
  400: { rotulo: 'LOD 400 · fabricação', descricao: 'Detalhamento para fabricação e montagem — avaliado só em estrutura (armadura completa por peça, sem avisos).' },
};

export const FAMILIAS_LOD = ['parede', 'abertura', 'estrutura', 'telhado', 'ambiente', 'terminal', 'trecho'] as const;
export type FamiliaLod = (typeof FAMILIAS_LOD)[number];

export const FICHA_DA_FAMILIA_LOD: Record<FamiliaLod, { rotulo: string; teto: NivelDeLod; criterio300: string; criterio350: string | null; criterio400: string | null }> = {
  parede: { rotulo: 'Paredes', teto: 350, criterio300: 'composição em camadas (ou cortina de vidro) declarada', criterio350: 'item de catálogo em toda camada', criterio400: null },
  abertura: { rotulo: 'Portas e janelas', teto: 350, criterio300: 'esquadria (tipo) atribuída', criterio350: 'esquadria com item de catálogo', criterio400: null },
  estrutura: { rotulo: 'Estrutura', teto: 400, criterio300: 'peça identificada (rótulo P1, V2…)', criterio350: 'armadura declarada por peça (barras, bitola, estribo)', criterio400: 'armadura completa e sem avisos — viga e laje com a armadura superior (lista de barras)' },
  telhado: { rotulo: 'Telhado', teto: 300, criterio300: 'inclinação e espessura declaradas', criterio350: null, criterio400: null },
  ambiente: { rotulo: 'Ambientes', teto: 350, criterio300: 'nome e tipo de ambiente', criterio350: 'acabamentos (piso/forro/rodapé) declarados', criterio400: null },
  terminal: { rotulo: 'Pontos (elétrica/hidráulica)', teto: 350, criterio300: 'tipo fechado e ponto confirmado (não sugerido)', criterio350: 'elétrica: circuito ligado · hidráulica: item de catálogo', criterio400: null },
  trecho: { rotulo: 'Trechos (eletrodutos/tubos/dutos)', teto: 350, criterio300: 'bitola definida e trecho confirmado', criterio350: 'elétrica: circuito(s) atribuído(s) · demais: item de catálogo', criterio400: null },
};

/** O que o LOD precisa saber além do modelo: a armadura por peça (P2.30). */
export interface ContextoDeLod {
  /** `ArmaduraDaPeca` por `uid` da peça estrutural — `armaduraDoModelo(...).pecas`. */
  armaduraPorUid?: ReadonlyMap<string, ArmaduraDaPeca>;
  /** A armadura MANUAL declarada por `uid` — `HipotesesDeArmadura.porPeca`. */
  manualPorUid?: Readonly<Record<string, ArmaduraManual>>;
}

export interface LodDoElemento {
  familia: FamiliaLod;
  id: ObjectId;
  uid: string;
  levelId: ObjectId | null;
  rotulo: string;
  lod: NivelDeLod;
  /** O que falta para o PRÓXIMO nível (vazio no teto da família). */
  falta: string[];
}

const lodDaParede = (w: Wall): Pick<LodDoElemento, 'lod' | 'falta'> => {
  if (w.cortina) {
    return { lod: 350, falta: [] };
  }
  if (!w.camadas || w.camadas.length === 0) return { lod: 200, falta: ['declarar a composição em camadas (Arquitetura › Camadas) ou marcar como cortina de vidro'] };
  const semItem = w.camadas.filter((c) => !c.itemCode.trim());
  if (semItem.length > 0) return { lod: 300, falta: [`item de catálogo em ${semItem.length} camada(s): ${semItem.map((c) => c.descricao || c.funcao).join(', ')}`] };
  return { lod: 350, falta: [] };
};

const lodDaAbertura = (o: Opening): Pick<LodDoElemento, 'lod' | 'falta'> => {
  if (o.kind === 'passage') return { lod: 300, falta: [] };
  if (!o.esquadria) return { lod: 200, falta: ['atribuir uma esquadria (tipo) ao vão'] };
  if (!o.esquadria.itemCode.trim()) return { lod: 300, falta: [`item de catálogo na esquadria "${o.esquadria.nome}"`] };
  return { lod: 350, falta: [] };
};

/**
 * ESTRUTURA (P2.30): 200 sem rótulo · 300 com rótulo · 350 com armadura DECLARADA
 * por peça (origem MANUAL: barras, bitola, estribo) · 400 quando essa armadura
 * está completa (viga/laje/viga de fundação com a superior) e sem avisos da
 * NBR 6118 — o que uma lista de barras exige. Sem contexto de armadura, para em 300.
 */
const lodDaEstrutura = (s: Structural, armadura?: ArmaduraDaPeca, manual?: ArmaduraManual | null): Pick<LodDoElemento, 'lod' | 'falta'> => {
  if (!s.rotulo?.trim()) return { lod: 200, falta: ['identificar a peça (rótulo, ex.: P1, V2, L1)'] };
  if (!armadura || armadura.origem !== 'MANUAL') return { lod: 300, falta: ['declarar a armadura da peça (barras, bitola, estribo) no painel da peça — hoje ela segue o esquema/taxa'] };
  const falta: string[] = [];
  if (armadura.avisos.length > 0) falta.push(`resolver os avisos da armadura: ${armadura.avisos.join('; ')}`);
  // Viga: a superior (negativos) tem de ser DECLARADA, não a automática de 2 barras. Laje: a malha manual é a armadura inteira.
  const precisaSuperior = s.kind === 'VIGA' || s.kind === 'VIGA_FUNDACAO';
  const temSuperior = !!manual && (manual.nSuperior ?? 0) > 0 && (manual.bitolaSuperiorMm ?? 0) > 0;
  if (precisaSuperior && !temSuperior) falta.push('declarar a armadura superior (negativos): n e bitola');
  if (!(armadura.comprimentoLongitudinalM > 0)) falta.push('a lista de barras ficou vazia (comprimento longitudinal zero)');
  return falta.length ? { lod: 350, falta } : { lod: 400, falta: [] };
};

const lodDoTerminal = (t: Terminal): Pick<LodDoElemento, 'lod' | 'falta'> => {
  const falta: string[] = [];
  if (t.sugerida) falta.push('confirmar o ponto (está sugerido)');
  const tipado = t.disciplina === 'ELETRICA' ? !!t.tipoEletrico : !!t.tipoHidraulico;
  if (!tipado) falta.push(t.disciplina === 'ELETRICA' ? 'classificar o ponto elétrico (tomada, iluminação, interruptor…)' : 'classificar o ponto hidráulico (torneira, vaso, ralo…)');
  if (falta.length) return { lod: 200, falta };
  if (t.disciplina === 'ELETRICA') return t.circuitoId ? { lod: 350, falta: [] } : { lod: 300, falta: ['ligar o ponto a um circuito'] };
  return t.itemCode?.trim() ? { lod: 350, falta: [] } : { lod: 300, falta: ['item de catálogo no ponto'] };
};

const lodDoTrecho = (t: Trecho): Pick<LodDoElemento, 'lod' | 'falta'> => {
  const falta: string[] = [];
  if (t.sugerido) falta.push('confirmar o trecho (está sugerido)');
  if (!(t.bitolaMm > 0)) falta.push('definir a bitola');
  if (falta.length) return { lod: 200, falta };
  if (t.disciplina === 'ELETRICA') return t.circuitoIds && t.circuitoIds.length > 0 ? { lod: 350, falta: [] } : { lod: 300, falta: ['atribuir circuito(s) ao eletroduto'] };
  return t.itemCode?.trim() ? { lod: 350, falta: [] } : { lod: 300, falta: ['item de catálogo no trecho'] };
};

const lodDoAmbiente = (model: BlueprintModel, s: Space): Pick<LodDoElemento, 'lod' | 'falta'> => {
  const et = etiquetaDoAmbiente(s, model.labels);
  const falta: string[] = [];
  if (!s.name?.trim()) falta.push('nomear o ambiente');
  if (!et?.tipoDeAmbiente) falta.push('classificar o tipo de ambiente (NBR 5410)');
  if (falta.length) return { lod: 200, falta };
  const acab = acabamentosDoAmbiente(model, s);
  if (!acab || (!acab.piso && !acab.forro && acab.rodape === undefined)) return { lod: 300, falta: ['declarar piso, forro e rodapé (Arquitetura › Piso e forro)'] };
  return { lod: 350, falta: [] };
};

/** O LOD de cada elemento do modelo (ou do pavimento). */
export function lodDosElementos(model: BlueprintModel, levelId?: ObjectId | null, contexto: ContextoDeLod = {}): LodDoElemento[] {
  const saida: LodDoElemento[] = [];
  const noNivel = (id: ObjectId | null | undefined) => !levelId || id === levelId;
  const nivelDaParede = new Map(model.walls.map((w) => [w.id, w.levelId]));
  for (const w of model.walls) if (noNivel(w.levelId)) saida.push({ familia: 'parede', id: w.id, uid: w.uid, levelId: w.levelId, rotulo: `Parede ${curto(w.uid, 'wall', w.id)}`, ...lodDaParede(w) });
  for (const o of model.openings) {
    const lv = nivelDaParede.get(o.wallId) ?? null;
    if (noNivel(lv)) saida.push({ familia: 'abertura', id: o.id, uid: o.uid, levelId: lv, rotulo: `${nomeDoTipoDeAbertura(o.kind)} ${curto(o.uid, 'opening', o.id)}`, ...lodDaAbertura(o) });
  }
  for (const s of model.structures ?? []) if (noNivel(s.levelId)) saida.push({ familia: 'estrutura', id: s.id, uid: s.uid, levelId: s.levelId, rotulo: `${nomeDoTipoEstrutural(s.kind)} ${s.rotulo?.trim() || curto(s.uid, 'structural', s.id)}`, ...lodDaEstrutura(s, contexto.armaduraPorUid?.get(s.uid), contexto.manualPorUid?.[s.uid] ?? null) });
  for (const a of model.roofs ?? []) if (noNivel(a.levelId)) saida.push({ familia: 'telhado', id: a.id, uid: a.uid, levelId: a.levelId, rotulo: `Água ${curto(a.uid, 'roof', a.id)}`, lod: a.inclinacaoPct > 0 && a.espessuraMm > 0 ? 300 : 200, falta: a.inclinacaoPct > 0 && a.espessuraMm > 0 ? [] : ['declarar inclinação e espessura'] });
  model.spaces.forEach((s, i) => {
    if (!noNivel(s.levelId) || s.ring.length < 3) return;
    const et = etiquetaDoAmbiente(s, model.labels);
    saida.push({ familia: 'ambiente', id: s.id, uid: et?.uid ?? s.id, levelId: s.levelId, rotulo: s.name?.trim() || `Ambiente ${i + 1}`, ...lodDoAmbiente(model, s) });
  });
  for (const t of model.terminais ?? []) if (noNivel(t.levelId)) saida.push({ familia: 'terminal', id: t.id, uid: t.uid, levelId: t.levelId, rotulo: `${t.rotulo?.trim() || t.tipo || 'Ponto'} ${curto(t.uid, 'terminal', t.id)}`, ...lodDoTerminal(t) });
  for (const t of model.trechos ?? []) if (noNivel(t.levelId)) saida.push({ familia: 'trecho', id: t.id, uid: t.uid, levelId: t.levelId, rotulo: `${t.rotulo?.trim() || 'Trecho'} ${curto(t.uid, 'trecho', t.id)}`, ...lodDoTrecho(t) });
  return saida;
}

/** LOD por uid — para o IFC. */
export function lodPorUid(model: BlueprintModel, contexto: ContextoDeLod = {}): Map<string, NivelDeLod> {
  const m = new Map<string, NivelDeLod>();
  for (const e of lodDosElementos(model, null, contexto)) if (e.familia !== 'ambiente') m.set(e.uid, e.lod);
  return m;
}

export type AlvoDeLod = Record<FamiliaLod, NivelDeLod>;
export const ALVO_DE_LOD_PADRAO: AlvoDeLod = { parede: 300, abertura: 300, estrutura: 300, telhado: 300, ambiente: 300, terminal: 300, trecho: 300 };

export interface LinhaDoQuadroDeLod {
  familia: FamiliaLod;
  rotulo: string;
  pecas: number;
  porNivel: Record<NivelDeLod, number>;
  alvo: NivelDeLod;
  teto: NivelDeLod;
  /** Peças com LOD ≥ alvo (alvo acima do teto conta contra o teto). */
  noAlvo: number;
  pct: number;
  /** O LOD "do conjunto": o menor entre as peças (uma peça a 200 puxa a família para 200). */
  minimo: NivelDeLod | null;
}

/** O quadro por família com a conferência contra o alvo. Famílias sem peça não entram. */
export function quadroDeLod(elementos: readonly LodDoElemento[], alvo: AlvoDeLod = ALVO_DE_LOD_PADRAO): LinhaDoQuadroDeLod[] {
  const linhas: LinhaDoQuadroDeLod[] = [];
  for (const f of FAMILIAS_LOD) {
    const lista = elementos.filter((e) => e.familia === f);
    if (lista.length === 0) continue;
    const porNivel = { 100: 0, 200: 0, 300: 0, 350: 0, 400: 0 } as Record<NivelDeLod, number>;
    for (const e of lista) porNivel[e.lod]++;
    const teto = FICHA_DA_FAMILIA_LOD[f].teto;
    const meta = Math.min(alvo[f], teto) as NivelDeLod;
    const noAlvo = lista.filter((e) => e.lod >= meta).length;
    linhas.push({
      familia: f,
      rotulo: FICHA_DA_FAMILIA_LOD[f].rotulo,
      pecas: lista.length,
      porNivel,
      alvo: alvo[f],
      teto,
      noAlvo,
      pct: Math.round((noAlvo / lista.length) * 1000) / 10,
      minimo: lista.reduce<NivelDeLod | null>((m, e) => (m === null || e.lod < m ? e.lod : m), null),
    });
  }
  return linhas;
}

/** As peças abaixo do alvo da família (limitado ao teto), com o que falta, piores primeiro. */
export function pendenciasDeLod(elementos: readonly LodDoElemento[], alvo: AlvoDeLod = ALVO_DE_LOD_PADRAO): LodDoElemento[] {
  return elementos
    .filter((e) => e.lod < Math.min(alvo[e.familia], FICHA_DA_FAMILIA_LOD[e.familia].teto))
    .sort((a, b) => a.lod - b.lod || a.familia.localeCompare(b.familia) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** O LOD do estudo numa frase: o menor nível entre as famílias com peça, e quantas peças estão abaixo do alvo. */
export function resumoDeLod(elementos: readonly LodDoElemento[], alvo: AlvoDeLod = ALVO_DE_LOD_PADRAO): { minimo: NivelDeLod | null; pendentes: number; pecas: number } {
  const q = quadroDeLod(elementos, alvo);
  return {
    minimo: q.reduce<NivelDeLod | null>((m, l) => (l.minimo !== null && (m === null || l.minimo < m) ? l.minimo : m), null),
    pendentes: pendenciasDeLod(elementos, alvo).length,
    pecas: elementos.length,
  };
}
