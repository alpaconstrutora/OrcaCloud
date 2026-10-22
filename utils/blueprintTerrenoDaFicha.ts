// utils/blueprintTerrenoDaFicha.ts
//
// O terreno da Planta × a ficha do Empreendimento (Torres & Unidades › Terreno). Pedido de
// 21/10/2026: "Área total, Testada / frente, Fundos, Profundidade … devem ser sincronizadas com
// planta inteligente > terreno > dados do lote". Plano: docs/planos/2026-10-21-terreno-ficha-planta.md.
//
// Decisões do usuário, e por isso aqui:
// - o número da Planta é o DESENHADO (área do contorno, soma dos lados por papel) — a escritura
//   fica como conferência no Quadro de divisas;
// - profundidade = MÉDIA das laterais (lote irregular não tem uma só); uma lateral só vale ela;
// - os dois lados mostram o número do outro e a pessoa escolhe; automático só preenche VAZIO.
//
// Puro: o editor (Dados do lote) e o Empreendimento (TowerEditor) usam as mesmas contas.

import type { Boundary, BoundaryPapel, Command } from './blueprintKernel';
import { areaEmM2, medidasPorPapel, type Terreno } from './blueprintTerreno';

export interface MedidasDaPlanta {
  areaM2: number | null;
  frenteM: number | null;
  fundosM: number | null;
  lateralDireitaM: number | null;
  lateralEsquerdaM: number | null;
  profundidadeM: number | null;
  /** Regular (4 lados em esquadro) ou Irregular — os mesmos rótulos do select da ficha (22/10/2026). */
  tipo: string | null;
}

/** Os rótulos do select "Tipo de terreno" da ficha (Torres & Unidades › Terreno). */
export const TIPO_REGULAR = 'Regular (Retangular)';
export const TIPO_IRREGULAR = 'Irregular (Geometria complexa)';

/** Colunas da ficha que a Planta mede. */
export type CampoDaFicha =
  | 'terreno_tipo'
  | 'terreno_area'
  | 'terreno_frente'
  | 'terreno_fundos'
  | 'terreno_profundidade'
  | 'terreno_lateral_direita'
  | 'terreno_lateral_esquerda';

export type ValorDaFicha = number | string;
export type FichaDoTerreno = Partial<Record<CampoDaFicha, ValorDaFicha | null | undefined>>;

const DA_PLANTA: Record<CampoDaFicha, keyof MedidasDaPlanta> = {
  terreno_tipo: 'tipo',
  terreno_area: 'areaM2',
  terreno_frente: 'frenteM',
  terreno_fundos: 'fundosM',
  terreno_profundidade: 'profundidadeM',
  terreno_lateral_direita: 'lateralDireitaM',
  terreno_lateral_esquerda: 'lateralEsquerdaM',
};

/** Rótulo de cada coluna, para a confirmação e o aviso de preenchimento. */
export const ROTULO_DA_COLUNA: Record<CampoDaFicha, string> = {
  terreno_tipo: 'Tipo de terreno',
  terreno_area: 'Área total',
  terreno_frente: 'Testada / frente',
  terreno_fundos: 'Fundos',
  terreno_profundidade: 'Profundidade',
  terreno_lateral_direita: 'Lateral direita',
  terreno_lateral_esquerda: 'Lateral esquerda',
};

/** Os campos que a tela da ficha mostra (Torres & Unidades › Terreno), na mesma ordem. */
export const CAMPOS_DA_FICHA: { campo: CampoDaFicha; rotulo: string; unidade: 'm²' | 'm' | '' }[] = [
  { campo: 'terreno_tipo', rotulo: 'Tipo de terreno', unidade: '' },
  { campo: 'terreno_area', rotulo: 'Área total', unidade: 'm²' },
  { campo: 'terreno_frente', rotulo: 'Testada / frente', unidade: 'm' },
  { campo: 'terreno_fundos', rotulo: 'Fundos', unidade: 'm' },
  { campo: 'terreno_profundidade', rotulo: 'Profundidade', unidade: 'm' },
];

const TOLERANCIA = 0.01;
const SEM_MEDIDAS: MedidasDaPlanta = { areaM2: null, frenteM: null, fundosM: null, lateralDireitaM: null, lateralEsquerdaM: null, profundidadeM: null, tipo: null };
const duasCasas = (v: number) => Math.round(v * 100) / 100;
const temValor = (v: ValorDaFicha | null | undefined): v is ValorDaFicha =>
  (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '');
const iguais = (a: ValorDaFicha, b: ValorDaFicha): boolean =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= TOLERANCIA : String(a).trim() === String(b).trim();

/** Esquadro: o cosseno do ângulo de cada canto até 0,5° de 90°. */
const COS_TOLERANCIA = Math.cos(((90 - 0.5) * Math.PI) / 180);

/**
 * Regular = 4 lados com os 4 cantos em esquadro (± 0,5°); qualquer outra forma é Irregular.
 * Contorno aberto ou sem lote: `null` (não há o que afirmar).
 */
export function tipoDoTerreno(terreno: Terreno | null): string | null {
  if (!terreno || !terreno.fechado) return null;
  const a = terreno.anel;
  if (a.length !== 4) return TIPO_IRREGULAR;
  for (let i = 0; i < 4; i++) {
    const p = a[i];
    const ant = a[(i + 3) % 4];
    const seg = a[(i + 1) % 4];
    const u = { x: ant.x - p.x, y: ant.y - p.y };
    const v = { x: seg.x - p.x, y: seg.y - p.y };
    const cos = Math.abs(u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
    if (cos > COS_TOLERANCIA) return TIPO_IRREGULAR;
  }
  return TIPO_REGULAR;
}

/** As medidas DESENHADAS do lote, na unidade da ficha. Contorno aberto ou sem lote: tudo `null`. */
export function medidasDaPlantaParaFicha(terreno: Terreno | null, limites: Boundary[]): MedidasDaPlanta {
  if (!terreno || !terreno.fechado) return { ...SEM_MEDIDAS };
  const mm = medidasPorPapel(terreno, limites);
  const m = (v: number | undefined) => (v === undefined ? null : duasCasas(v / 1000));
  const ld = m(mm.LATERAL_DIREITA);
  const le = m(mm.LATERAL_ESQUERDA);
  const profundidade = ld !== null && le !== null ? duasCasas((ld + le) / 2) : (ld ?? le);
  return {
    areaM2: duasCasas(areaEmM2(terreno)),
    frenteM: m(mm.FRENTE),
    fundosM: m(mm.FUNDOS),
    lateralDireitaM: ld,
    lateralEsquerdaM: le,
    profundidadeM: profundidade,
    tipo: tipoDoTerreno(terreno),
  };
}

export type SituacaoDoCampo = 'IGUAL' | 'DIFERENTE' | 'SO_PLANTA' | 'SO_FICHA' | 'NENHUM';

export interface LinhaDaComparacao {
  campo: CampoDaFicha;
  rotulo: string;
  unidade: 'm²' | 'm' | '';
  planta: ValorDaFicha | null;
  ficha: ValorDaFicha | null;
  situacao: SituacaoDoCampo;
}

function situacao(planta: ValorDaFicha | null, ficha: ValorDaFicha | null): SituacaoDoCampo {
  if (planta === null && ficha === null) return 'NENHUM';
  if (planta === null) return 'SO_FICHA';
  if (ficha === null) return 'SO_PLANTA';
  return iguais(planta, ficha) ? 'IGUAL' : 'DIFERENTE';
}

/** Os campos da ficha lado a lado com a Planta. */
export function compararComFicha(planta: MedidasDaPlanta | null, ficha: FichaDoTerreno | null): LinhaDaComparacao[] {
  const p = planta ?? SEM_MEDIDAS;
  return CAMPOS_DA_FICHA.map(({ campo, rotulo, unidade }) => {
    const vp = p[DA_PLANTA[campo]] ?? null; // medida ausente (objeto antigo, sem `tipo`) = sem valor
    const bruto = ficha?.[campo];
    const vf = temValor(bruto) ? bruto : null;
    return { campo, rotulo, unidade, planta: vp, ficha: vf, situacao: situacao(vp, vf) };
  });
}

/**
 * O que gravar na ficha a partir da Planta.
 * - `SO_VAZIOS`: só as colunas que a ficha não tem — o automático; nunca troca valor existente.
 * - `TUDO`: "Levar à ficha", pedido pela pessoa — o que difere.
 * Em nenhum caso entra o que a Planta não mede (papel sem lado): não vai zero nem null por cima
 * do que alguém digitou na ficha. Inclui as laterais (colunas da ficha que a tela não mostra).
 */
export function patchDaPlantaParaFicha(planta: MedidasDaPlanta, ficha: FichaDoTerreno | null, modo: 'SO_VAZIOS' | 'TUDO'): Partial<Record<CampoDaFicha, ValorDaFicha>> {
  const patch: Partial<Record<CampoDaFicha, ValorDaFicha>> = {};
  for (const campo of Object.keys(DA_PLANTA) as CampoDaFicha[]) {
    const vp = planta[DA_PLANTA[campo]] ?? null;
    if (vp === null) continue;
    const vf = ficha?.[campo];
    if (modo === 'SO_VAZIOS' ? !temValor(vf) : !temValor(vf) || !iguais(vp, vf)) patch[campo] = vp;
  }
  return patch;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITURA ← FICHA (22/10/2026, plano docs/planos/2026-10-22-planta-empreendimento-pendencias.md, item 3)
//
// A "Área da escritura" e a medida da escritura de cada lado (Quadro de divisas) são o número da
// MATRÍCULA — o mesmo que a ficha do empreendimento guarda. Só o que está VAZIO na escritura é
// preenchido, e por lado só quando há exatamente UM lado com aquele papel (com dois trechos de
// fundos, a ficha não diz como se divide). Profundidade não é medida de lado: não entra.
// ─────────────────────────────────────────────────────────────────────────────

const LADO_DA_FICHA: [BoundaryPapel, CampoDaFicha][] = [
  ['FRENTE', 'terreno_frente'],
  ['FUNDOS', 'terreno_fundos'],
  ['LATERAL_DIREITA', 'terreno_lateral_direita'],
  ['LATERAL_ESQUERDA', 'terreno_lateral_esquerda'],
];

const positivo = (v: ValorDaFicha | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Os comandos que levam a ficha para a escritura do desenho — vazio se não há o que preencher. */
export function comandosDaEscrituraPelaFicha(
  areaEscrituraMm2: number | null | undefined,
  limites: Boundary[],
  ficha: FichaDoTerreno | null,
): Command[] {
  if (!ficha) return [];
  const cmds: Command[] = [];
  const area = positivo(ficha.terreno_area);
  if ((areaEscrituraMm2 === null || areaEscrituraMm2 === undefined) && area !== null) {
    cmds.push({ type: 'SetAreaEscritura', areaMm2: Math.round(area * 1_000_000) });
  }
  const doLote = limites.filter((b) => b.kind === 'TERRENO');
  for (const [papel, campo] of LADO_DA_FICHA) {
    const v = positivo(ficha[campo]);
    if (v === null) continue;
    const lados = doLote.filter((b) => b.papel === papel);
    if (lados.length !== 1) continue;
    const lado = lados[0];
    if (lado.medidaEscrituraMm !== null && lado.medidaEscrituraMm !== undefined) continue;
    cmds.push({ type: 'SetBoundaryEscritura', boundaryId: lado.id, medidaMm: Math.round(v * 1000), confrontante: lado.confrontante ?? null });
  }
  return cmds;
}

/**
 * As divisas do lote do PRIMEIRO pavimento que tem lote — o editor mede por pavimento, e fora dele
 * (Empreendimento, sincronização) o lote tem de sair do mesmo lugar. Sem pavimento com lote: todas.
 */
export function divisasDoLoteDoModelo(boundaries: Boundary[], niveis: { id: string }[]): Boundary[] {
  const doLote = boundaries.filter((b) => b.kind === 'TERRENO');
  for (const n of niveis) {
    const doNivel = doLote.filter((b) => b.levelId === n.id);
    if (doNivel.length > 0) return doNivel;
  }
  return doLote;
}
