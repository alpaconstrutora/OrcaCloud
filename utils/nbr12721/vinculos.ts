/**
 * ÁREAS NBR 12721 — QUAL UNIDADE DO EMPREENDIMENTO É QUAL UNIDADE DA PLANTA
 * (14/10/2026, Fase 9 do plano `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * A fração da versão aprovada volta ao Empreendimento pela chave gravada em
 * `empreendimento_units.blueprint_unidade_chave`. Esta função só PROPÕE: o
 * vínculo que já existe fica; a unidade sem vínculo ganha a da Planta com o
 * MESMO número (sem acento, caixa nem espaço) quando há uma só de cada lado;
 * o resto fica sem par. Quem confirma é a pessoa, na tela — nada é inferido
 * calado (a RPC `devolver_nbr12721_ao_empreendimento` grava só os pares que
 * a tela manda).
 */
import type { UnidadeCongelada } from '../blueprintNbr12721';

export interface UnidadeDoEmpreendimentoParaVincular {
  id: string;
  nome: string;
  chave: string | null;
  origem: 'MOTOR' | 'CONVENCAO' | null;
}

export type SituacaoDoVinculo = 'GRAVADO' | 'PROPOSTO' | 'SEM_PAR';

export interface VinculoProposto {
  unitId: string;
  nome: string;
  chave: string | null;
  situacao: SituacaoDoVinculo;
  /** Fração de convenção: o vínculo grava, a fração NÃO (o cartório manda). */
  convencao: boolean;
}

export interface PropostaDeVinculos {
  vinculos: VinculoProposto[];
  /** Unidades da Planta que nenhuma do Empreendimento pegou. */
  plantaSemPar: UnidadeCongelada[];
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');

export function propostaDeVinculos(empreendimento: readonly UnidadeDoEmpreendimentoParaVincular[], planta: readonly UnidadeCongelada[]): PropostaDeVinculos {
  const chavesDaVersao = new Set(planta.map((u) => u.chave));
  const usadas = new Set<string>();
  const vinculos: VinculoProposto[] = empreendimento.map((u) => {
    const gravada = u.chave && chavesDaVersao.has(u.chave) && !usadas.has(u.chave) ? u.chave : null;
    if (gravada) usadas.add(gravada);
    return { unitId: u.id, nome: u.nome, chave: gravada, situacao: gravada ? 'GRAVADO' : 'SEM_PAR', convencao: u.origem === 'CONVENCAO' };
  });

  // Número → unidades, dos dois lados; só casa o que é único dos dois lados (nada de palpite entre "101" e "101").
  const contar = <T,>(xs: readonly T[], k: (x: T) => string) => xs.reduce((m, x) => m.set(k(x), (m.get(k(x)) ?? 0) + 1), new Map<string, number>());
  const nosDoEmp = contar(empreendimento, (u) => normalizar(u.nome));
  const naPlanta = contar(planta, (u) => normalizar(u.numero));
  const plantaPorNumero = new Map(planta.map((u) => [normalizar(u.numero), u] as const));
  for (const v of vinculos) {
    if (v.chave) continue;
    const n = normalizar(v.nome);
    const p = plantaPorNumero.get(n);
    if (!p || nosDoEmp.get(n) !== 1 || naPlanta.get(n) !== 1 || usadas.has(p.chave)) continue;
    v.chave = p.chave;
    v.situacao = 'PROPOSTO';
    usadas.add(p.chave);
  }
  return { vinculos, plantaSemPar: planta.filter((u) => !usadas.has(u.chave)) };
}

/** Os pares que a RPC recebe — TODAS as unidades, para o vínculo desfeito também ir (chave `null`). */
export function paresParaDevolver(vinculos: readonly Pick<VinculoProposto, 'unitId' | 'chave'>[]): { unit_id: string; chave: string | null }[] {
  return vinculos.map((v) => ({ unit_id: v.unitId, chave: v.chave }));
}
