// utils/blueprintCatalogoDeTipos.ts
//
// CATÁLOGO DE TIPOS DA ORGANIZAÇÃO (20/09/2026, backlog P2 — P2.3).
//
// Os tipos de elemento são da ORGANIZAÇÃO desde a E1.1 (`blueprint_element_types`),
// mas só nasciam inline, do "salvar tipo" no painel da peça — não havia onde
// vê-los todos, renomear, desativar, saber quantas peças do desenho têm cada
// assinatura, semear os padrões nem levar o catálogo de uma organização para
// outra. Isto aqui é a parte pura dessa tela: as sementes (o "type catalog"
// do Revit: tipos prontos por família), o que falta semear, os usos por
// assinatura e o agrupamento por família. Nada aqui vai ao banco.
//
// O tipo continua MOLDE: a peça carrega o valor copiado, e "N peças com esta
// assinatura" é o único vínculo — apagar um tipo não mexe em planta nenhuma.

import type { BlueprintModel } from './blueprintKernel';
import {
  ROTULO_DA_FAMILIA_DE_TIPO,
  assinaturaDoTipo,
  propriedadesDaEscada,
  propriedadesDaEstrutura,
  propriedadesDoComponente,
  propriedadesDoTelhado,
  propriedadesDoTerminal,
  type FamiliaDeTipo,
  type PropriedadesDoTipo,
} from './blueprintTipos';

/** O mínimo de um tipo para este módulo: o que a tela lista e compara. */
export interface TipoDoCatalogo {
  id: string;
  organizationId: string;
  familia: FamiliaDeTipo;
  nome: string;
  propriedades: PropriedadesDoTipo;
  active: boolean;
}

export interface SementeDeTipo {
  nome: string;
  propriedades: PropriedadesDoTipo;
}

/**
 * Os tipos PADRÃO — medidas usuais de pré-projeto residencial, não norma:
 * pilares e vigas de concreto correntes (NBR 6118 pede pilar ≥ 19 cm de lado,
 * 14 com majoração — os dois estão aqui), laje de 12, fundação rasa; pontos
 * elétricos da NBR 5410 nas cotas usuais; escada e rampa de referência;
 * telhado cerâmico a 30 %. Quem tem outro padrão renomeia, desativa ou
 * salva o seu pelo painel da peça.
 */
export const SEMENTES_DE_TIPOS: readonly SementeDeTipo[] = [
  { nome: 'Pilar 14×30', propriedades: { familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 140, profundidadeMm: 300, alturaMm: 2800, baseMm: 0, circular: false } },
  { nome: 'Pilar 19×40', propriedades: { familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 190, profundidadeMm: 400, alturaMm: 2800, baseMm: 0, circular: false } },
  { nome: 'Pilar 20×40', propriedades: { familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 200, profundidadeMm: 400, alturaMm: 2800, baseMm: 0, circular: false } },
  { nome: 'Pilar 25×50', propriedades: { familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 250, profundidadeMm: 500, alturaMm: 2800, baseMm: 0, circular: false } },
  { nome: 'Pilar circular Ø30', propriedades: { familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0, circular: true } },
  { nome: 'Viga 14×40', propriedades: { familia: 'ESTRUTURA', kind: 'VIGA', larguraMm: 140, profundidadeMm: 400, alturaMm: 400, baseMm: 2400, circular: false } },
  { nome: 'Viga 19×50', propriedades: { familia: 'ESTRUTURA', kind: 'VIGA', larguraMm: 190, profundidadeMm: 500, alturaMm: 500, baseMm: 2300, circular: false } },
  { nome: 'Laje maciça 12', propriedades: { familia: 'ESTRUTURA', kind: 'LAJE', larguraMm: 120, profundidadeMm: 120, alturaMm: 120, baseMm: 2800, circular: false } },
  { nome: 'Viga baldrame 20×40', propriedades: { familia: 'ESTRUTURA', kind: 'VIGA_FUNDACAO', larguraMm: 200, profundidadeMm: 400, alturaMm: 400, baseMm: -400, circular: false } },
  { nome: 'Estaca Ø30 · 6 m', propriedades: { familia: 'ESTRUTURA', kind: 'ESTACA', larguraMm: 300, profundidadeMm: 300, alturaMm: 6000, baseMm: -6400, circular: true } },
  { nome: 'TUG 100 VA a 30 cm', propriedades: { familia: 'TERMINAL', disciplina: 'ELETRICA', tipo: 'Tomada baixa', cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 } },
  { nome: 'TUG 100 VA a 110 cm', propriedades: { familia: 'TERMINAL', disciplina: 'ELETRICA', tipo: 'Tomada média', cotaMm: 1100, tipoEletrico: 'TUG', potenciaW: 100 } },
  { nome: 'TUE 600 VA a 220 cm', propriedades: { familia: 'TERMINAL', disciplina: 'ELETRICA', tipo: 'Tomada de uso específico', cotaMm: 2200, tipoEletrico: 'TUE', potenciaW: 600 } },
  { nome: 'Luz de teto 100 VA', propriedades: { familia: 'TERMINAL', disciplina: 'ELETRICA', tipo: 'Luz de teto', cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100 } },
  { nome: 'Escada 1,20 m · espelho 17,5', propriedades: { familia: 'ESCADA', tipo: 'ESCADA', larguraMm: 1200, alvoEspelhoMm: 175 } },
  { nome: 'Rampa 1,20 m (NBR 9050)', propriedades: { familia: 'ESCADA', tipo: 'RAMPA', larguraMm: 1200, alvoEspelhoMm: 175 } },
  { nome: 'Telhado cerâmico 30 %', propriedades: { familia: 'TELHADO', inclinacaoPct: 30, baseMm: 2800, espessuraMm: 150 } },
  { nome: 'Telhado fibrocimento 10 %', propriedades: { familia: 'TELHADO', inclinacaoPct: 10, baseMm: 2800, espessuraMm: 100 } },
];

const chaveDe = (familia: FamiliaDeTipo, nome: string) => `${familia}::${nome.trim().toLowerCase()}`;

/** As sementes que a organização ainda não tem (por família + nome, sem distinguir maiúsculas). */
export function faltamSementes(tipos: readonly Pick<TipoDoCatalogo, 'familia' | 'nome'>[]): SementeDeTipo[] {
  const existentes = new Set(tipos.map((t) => chaveDe(t.familia, t.nome)));
  return SEMENTES_DE_TIPOS.filter((s) => !existentes.has(chaveDe(s.propriedades.familia, s.nome)));
}

/**
 * Quantas peças do desenho têm cada ASSINATURA — o vínculo que existe entre
 * tipo e instância. Estrutura, ponto, escada, telhado e componente; piso e
 * forro (por ambiente) ficam com o painel de acabamentos.
 */
export function usosPorAssinatura(model: BlueprintModel): Map<string, number> {
  const mapa = new Map<string, number>();
  const somar = (p: PropriedadesDoTipo) => {
    const a = assinaturaDoTipo(p);
    mapa.set(a, (mapa.get(a) ?? 0) + 1);
  };
  for (const s of model.structures) somar(propriedadesDaEstrutura(s));
  for (const t of model.terminais ?? []) somar(propriedadesDoTerminal(t));
  for (const e of model.stairs ?? []) somar(propriedadesDaEscada(e));
  for (const a of model.roofs ?? []) somar(propriedadesDoTelhado(a));
  for (const c of model.componentes ?? []) somar(propriedadesDoComponente(c));
  return mapa;
}

/** Quantas peças do desenho são deste tipo (mesma assinatura). */
export function usosDoTipo(tipo: Pick<TipoDoCatalogo, 'propriedades'>, usos: ReadonlyMap<string, number>): number {
  return usos.get(assinaturaDoTipo(tipo.propriedades)) ?? 0;
}

export interface GrupoDeTipos {
  familia: FamiliaDeTipo;
  rotulo: string;
  tipos: TipoDoCatalogo[];
}

/** Os tipos por família, na ordem das famílias do kernel, só as que têm tipo. */
export function agruparPorFamilia(tipos: readonly TipoDoCatalogo[]): GrupoDeTipos[] {
  const ordem = Object.keys(ROTULO_DA_FAMILIA_DE_TIPO) as FamiliaDeTipo[];
  return ordem
    .map((familia) => ({ familia, rotulo: ROTULO_DA_FAMILIA_DE_TIPO[familia], tipos: tipos.filter((t) => t.familia === familia).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
    .filter((g) => g.tipos.length > 0);
}

export function validarNomeDeTipo(nome: string, outros: readonly Pick<TipoDoCatalogo, 'familia' | 'nome' | 'id'>[], familia: FamiliaDeTipo, idAtual: string | null): string | null {
  const n = nome.trim();
  if (n.length < 2) return 'Nome com pelo menos 2 caracteres.';
  if (n.length > 80) return 'Nome maior que 80 caracteres.';
  if (outros.some((o) => o.id !== idAtual && o.familia === familia && o.nome.trim().toLowerCase() === n.toLowerCase())) return 'Já existe um tipo desta família com este nome.';
  return null;
}

/** O que copiar para outra organização: os ativos, sem id — o destino recebe (família, nome, propriedades). */
export function paraCopiar(tipos: readonly TipoDoCatalogo[]): SementeDeTipo[] {
  return tipos.filter((t) => t.active).map((t) => ({ nome: t.nome, propriedades: t.propriedades }));
}
