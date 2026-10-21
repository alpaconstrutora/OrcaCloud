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

import type { Boundary } from './blueprintKernel';
import { areaEmM2, medidasPorPapel, type Terreno } from './blueprintTerreno';

export interface MedidasDaPlanta {
  areaM2: number | null;
  frenteM: number | null;
  fundosM: number | null;
  lateralDireitaM: number | null;
  lateralEsquerdaM: number | null;
  profundidadeM: number | null;
}

/** Colunas da ficha que a Planta mede. */
export type CampoDaFicha =
  | 'terreno_area'
  | 'terreno_frente'
  | 'terreno_fundos'
  | 'terreno_profundidade'
  | 'terreno_lateral_direita'
  | 'terreno_lateral_esquerda';

export type FichaDoTerreno = Partial<Record<CampoDaFicha, number | null | undefined>>;

const DA_PLANTA: Record<CampoDaFicha, keyof MedidasDaPlanta> = {
  terreno_area: 'areaM2',
  terreno_frente: 'frenteM',
  terreno_fundos: 'fundosM',
  terreno_profundidade: 'profundidadeM',
  terreno_lateral_direita: 'lateralDireitaM',
  terreno_lateral_esquerda: 'lateralEsquerdaM',
};

/** Rótulo de cada coluna, para a confirmação e o aviso de preenchimento. */
export const ROTULO_DA_COLUNA: Record<CampoDaFicha, string> = {
  terreno_area: 'Área total',
  terreno_frente: 'Testada / frente',
  terreno_fundos: 'Fundos',
  terreno_profundidade: 'Profundidade',
  terreno_lateral_direita: 'Lateral direita',
  terreno_lateral_esquerda: 'Lateral esquerda',
};

/** Os quatro que a tela da ficha mostra (Torres & Unidades › Terreno), na mesma ordem. */
export const CAMPOS_DA_FICHA: { campo: CampoDaFicha; rotulo: string; unidade: 'm²' | 'm' }[] = [
  { campo: 'terreno_area', rotulo: 'Área total', unidade: 'm²' },
  { campo: 'terreno_frente', rotulo: 'Testada / frente', unidade: 'm' },
  { campo: 'terreno_fundos', rotulo: 'Fundos', unidade: 'm' },
  { campo: 'terreno_profundidade', rotulo: 'Profundidade', unidade: 'm' },
];

const TOLERANCIA = 0.01;
const SEM_MEDIDAS: MedidasDaPlanta = { areaM2: null, frenteM: null, fundosM: null, lateralDireitaM: null, lateralEsquerdaM: null, profundidadeM: null };
const duasCasas = (v: number) => Math.round(v * 100) / 100;
const temValor = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

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
  };
}

export type SituacaoDoCampo = 'IGUAL' | 'DIFERENTE' | 'SO_PLANTA' | 'SO_FICHA' | 'NENHUM';

export interface LinhaDaComparacao {
  campo: CampoDaFicha;
  rotulo: string;
  unidade: 'm²' | 'm';
  planta: number | null;
  ficha: number | null;
  situacao: SituacaoDoCampo;
}

function situacao(planta: number | null, ficha: number | null): SituacaoDoCampo {
  if (planta === null && ficha === null) return 'NENHUM';
  if (planta === null) return 'SO_FICHA';
  if (ficha === null) return 'SO_PLANTA';
  return Math.abs(planta - ficha) <= TOLERANCIA ? 'IGUAL' : 'DIFERENTE';
}

/** Os quatro campos da ficha lado a lado com a Planta. */
export function compararComFicha(planta: MedidasDaPlanta | null, ficha: FichaDoTerreno | null): LinhaDaComparacao[] {
  const p = planta ?? SEM_MEDIDAS;
  return CAMPOS_DA_FICHA.map(({ campo, rotulo, unidade }) => {
    const vp = p[DA_PLANTA[campo]];
    const vf = temValor(ficha?.[campo]) ? (ficha![campo] as number) : null;
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
export function patchDaPlantaParaFicha(planta: MedidasDaPlanta, ficha: FichaDoTerreno | null, modo: 'SO_VAZIOS' | 'TUDO'): Partial<Record<CampoDaFicha, number>> {
  const patch: Partial<Record<CampoDaFicha, number>> = {};
  for (const campo of Object.keys(DA_PLANTA) as CampoDaFicha[]) {
    const vp = planta[DA_PLANTA[campo]];
    if (vp === null) continue;
    const vf = ficha?.[campo];
    if (modo === 'SO_VAZIOS' ? !temValor(vf) : !temValor(vf) || Math.abs(vp - vf) > TOLERANCIA) patch[campo] = vp;
  }
  return patch;
}
