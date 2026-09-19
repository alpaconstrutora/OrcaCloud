/**
 * TIPOS DE ELEMENTO — tipo × instância para estrutura, ponto de instalação,
 * escada e telhado (18/09/2026, roadmap E1.1: *"Tipo × instância — P0"*).
 *
 * ─── A DECISÃO QUE JÁ EXISTIA, GENERALIZADA ─────────────────────────────────
 *
 * Parede (`CamadaParede`) e esquadria (`Esquadria`) decidiram, e o kernel
 * documenta nos dois cabeçalhos: o tipo é MOLDE no catálogo da organização, a
 * peça carrega o VALOR COPIADO no payload canônico, e "duas peças são do mesmo
 * tipo" é uma pergunta de ASSINATURA — nunca um `tipoId` no snapshot, que
 * faria "o pilar P3 da revisão 2" mudar de seção quando alguém editasse o
 * catálogo hoje. Este módulo estende exatamente isso às outras famílias, sem
 * campo novo no kernel e sem bump: só define **quais propriedades de cada
 * família são "o tipo"**, como extraí-las de uma peça, como aplicá-las de volta
 * e como assiná-las.
 *
 * O que entra no tipo é o que se repete de peça para peça e não depende de onde
 * ela está: seção, altura, base, classificação, potência, cota, largura da
 * escada, inclinação do telhado. Posição, rotação, pavimento, rótulo e vínculo
 * (circuito, parede) ficam de fora — são da instância.
 */
import type { Agua, Componente, Escada, Structural, Terminal } from './blueprintKernel';
import { CATALOGO_DE_COMPONENTES, nomeDoTipoEstrutural } from './blueprintKernel';

export type FamiliaDeTipo = 'ESTRUTURA' | 'TERMINAL' | 'ESCADA' | 'TELHADO' | 'COMPONENTE';

export const ROTULO_DA_FAMILIA_DE_TIPO: Record<FamiliaDeTipo, string> = {
  ESTRUTURA: 'estrutura',
  TERMINAL: 'ponto de instalação',
  ESCADA: 'escada / rampa',
  TELHADO: 'água de telhado',
  COMPONENTE: 'componente (mobiliário, louça…)',
};

export interface PropriedadesDeEstrutura {
  familia: 'ESTRUTURA';
  kind: Structural['kind'];
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  baseMm: number;
  circular: boolean;
}
export interface PropriedadesDeTerminal {
  familia: 'TERMINAL';
  disciplina: Terminal['disciplina'];
  tipo: string;
  cotaMm: number;
  tipoEletrico?: Terminal['tipoEletrico'];
  tipoHidraulico?: Terminal['tipoHidraulico'];
  potenciaW?: number | null;
  interruptor?: Terminal['interruptor'];
  larguraMm?: number | null;
  alturaMm?: number | null;
  profundidadeMm?: number | null;
  volumeL?: number | null;
}
export interface PropriedadesDeEscada {
  familia: 'ESCADA';
  tipo: Escada['tipo'];
  larguraMm: number;
  alvoEspelhoMm: number;
}
export interface PropriedadesDeTelhado {
  familia: 'TELHADO';
  inclinacaoPct: number;
  baseMm: number;
  espessuraMm: number;
}
export interface PropriedadesDeComponente {
  familia: 'COMPONENTE';
  tipoId: Componente['tipoId'];
  familiaDoComponente: Componente['familia'];
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
}
export type PropriedadesDoTipo = PropriedadesDeEstrutura | PropriedadesDeTerminal | PropriedadesDeEscada | PropriedadesDeTelhado | PropriedadesDeComponente;

// ─── Extrair da instância ────────────────────────────────────────────────────

export function propriedadesDaEstrutura(s: Structural): PropriedadesDeEstrutura {
  return {
    familia: 'ESTRUTURA',
    kind: s.kind,
    larguraMm: s.larguraMm,
    profundidadeMm: s.profundidadeMm,
    alturaMm: s.alturaMm,
    baseMm: s.baseMm,
    circular: !!s.circular,
  };
}
export function propriedadesDoTerminal(t: Terminal): PropriedadesDeTerminal {
  return {
    familia: 'TERMINAL',
    disciplina: t.disciplina,
    tipo: t.tipo,
    cotaMm: t.cotaMm,
    tipoEletrico: t.tipoEletrico ?? undefined,
    tipoHidraulico: t.tipoHidraulico ?? undefined,
    potenciaW: t.potenciaW ?? null,
    interruptor: t.interruptor ?? undefined,
    larguraMm: t.larguraMm ?? null,
    alturaMm: t.alturaMm ?? null,
    profundidadeMm: t.profundidadeMm ?? null,
    volumeL: t.volumeL ?? null,
  };
}
export function propriedadesDaEscada(e: Escada): PropriedadesDeEscada {
  return { familia: 'ESCADA', tipo: e.tipo, larguraMm: e.larguraMm, alvoEspelhoMm: e.alvoEspelhoMm };
}
export function propriedadesDoTelhado(a: Agua): PropriedadesDeTelhado {
  return { familia: 'TELHADO', inclinacaoPct: a.inclinacaoPct, baseMm: a.baseMm, espessuraMm: a.espessuraMm };
}

// ─── Assinatura e rótulo ─────────────────────────────────────────────────────

/**
 * A assinatura é o JSON com as chaves em ordem fixa e `null`/`undefined`
 * normalizados — duas peças com as mesmas propriedades têm a mesma string, e é
 * isso que responde "quantas peças são deste tipo" sem id nenhum.
 */
export function assinaturaDoTipo(p: PropriedadesDoTipo): string {
  const plano = p as unknown as Record<string, unknown>;
  // Vazio (null/undefined) NÃO entra: o catálogo devolve JSON, que perde as
  // chaves undefined, e a assinatura de ida tem de ser a de volta.
  return Object.keys(plano)
    .filter((k) => plano[k] !== undefined && plano[k] !== null)
    .sort()
    .map((k) => `${k}=${String(plano[k])}`)
    .join('|');
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');
const cm = (mm: number) => String(Math.round(mm / 10));

/** O que o seletor mostra ao lado do nome — as medidas que distinguem o tipo. */
export function resumoDoTipo(p: PropriedadesDoTipo): string {
  switch (p.familia) {
    case 'ESTRUTURA':
      return p.circular
        ? `${nomeDoTipoEstrutural(p.kind)} Ø${cm(p.larguraMm)} · ${m(p.alturaMm)} m`
        : `${nomeDoTipoEstrutural(p.kind)} ${cm(p.larguraMm)}×${cm(p.profundidadeMm || p.alturaMm)} · ${m(p.alturaMm)} m`;
    case 'TERMINAL':
      return `${p.tipo}${p.potenciaW ? ` ${p.potenciaW} VA` : ''} · ${cm(p.cotaMm)} cm`;
    case 'ESCADA':
      return `${p.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${m(p.larguraMm)} m${p.tipo === 'ESCADA' ? ` · espelho ${p.alvoEspelhoMm} mm` : ''}`;
    case 'TELHADO':
      return `${p.inclinacaoPct} % · base ${m(p.baseMm)} m`;
    case 'COMPONENTE':
      return `${CATALOGO_DE_COMPONENTES[p.tipoId]?.rotulo ?? p.tipoId} ${cm(p.larguraMm)}×${cm(p.profundidadeMm)} · ${m(p.alturaMm)} m`;
  }
}

/** Nome sugerido ao salvar — o usuário edita antes de gravar. */
export function nomeSugeridoDoTipo(p: PropriedadesDoTipo): string {
  return resumoDoTipo(p);
}

// ─── Aplicar de volta: os campos que os comandos `Set*Props` aceitam ─────────

export function camposDaEstrutura(p: PropriedadesDeEstrutura) {
  return {
    larguraMm: p.larguraMm,
    profundidadeMm: p.profundidadeMm,
    alturaMm: p.alturaMm,
    baseMm: p.baseMm,
    circular: p.circular,
  };
}
export function camposDoTerminal(p: PropriedadesDeTerminal) {
  return {
    tipo: p.tipo,
    cotaMm: p.cotaMm,
    tipoEletrico: p.tipoEletrico ?? null,
    tipoHidraulico: p.tipoHidraulico ?? null,
    potenciaW: p.potenciaW ?? null,
    interruptor: p.interruptor ?? null,
    larguraMm: p.larguraMm ?? null,
    alturaMm: p.alturaMm ?? null,
    profundidadeMm: p.profundidadeMm ?? null,
    volumeL: p.volumeL ?? null,
  };
}

export function camposDaEscada(p: PropriedadesDeEscada) {
  return { tipo: p.tipo, larguraMm: p.larguraMm, alvoEspelhoMm: p.alvoEspelhoMm };
}
export function camposDoTelhado(p: PropriedadesDeTelhado) {
  return { inclinacaoPct: p.inclinacaoPct, baseMm: p.baseMm, espessuraMm: p.espessuraMm };
}
export function propriedadesDoComponente(c: Componente): PropriedadesDeComponente {
  return { familia: 'COMPONENTE', tipoId: c.tipoId, familiaDoComponente: c.familia, larguraMm: c.larguraMm, profundidadeMm: c.profundidadeMm, alturaMm: c.alturaMm };
}
export function camposDoComponente(p: PropriedadesDeComponente) {
  return { tipoId: p.tipoId, familia: p.familiaDoComponente, larguraMm: p.larguraMm, profundidadeMm: p.profundidadeMm, alturaMm: p.alturaMm };
}
