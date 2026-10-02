// services/cubService.ts
//
// O CUB (NBR 12721) de UM padrão numa UF — o mês mais recente da tabela
// `cub_parametric_data` (a mesma que o Estimador Paramétrico lê), linha "Total".
//
// Nasceu no Estudo de Massa (M3) porque o Estimador só sabia calcular a partir
// de um `ProjectSettings` inteiro (área, mês, BDI…), e o estudo precisa do
// R$/m² puro. ⚠️ O mapa padrão → coluna é EXPLÍCITO: a tabela grava `pp_4_n`,
// `csl_8_n`, `cal_8_a`; montar o nome da coluna a partir da chave ("PP-N" →
// "pp_n") erra em silêncio e cai no valor estimado — o defeito que o
// `parametricService` ainda tem para esses padrões.

import { supabase } from '../lib/supabase';
import { BASE_CUB_RATES, CUB_STANDARDS_DATA } from '../constants';

export const COLUNA_DO_PADRAO_CUB: Record<string, string> = {
  PIS: 'pis',
  'PP-B': 'pp_4_b',
  'PP-N': 'pp_4_n',
  'R8-B': 'r8_b',
  'R8-N': 'r8_n',
  'R8-A': 'r8_a',
  'R16-N': 'r16_n',
  'R16-A': 'r16_a',
  'CSL8-N': 'csl_8_n',
  'CSL8-A': 'csl_8_a',
  'CSL16-N': 'csl_16_n',
  'CSL16-A': 'csl_16_a',
  'CAL8-N': 'cal_8_n',
  'CAL8-A': 'cal_8_a',
  GI: 'gi',
  'R1-B': 'r1_b',
  'R1-N': 'r1_n',
  'R1-A': 'r1_a',
  RP1Q: 'rp1q',
};

export interface CubDoPadrao {
  valorM2: number;
  /** TABELA = lido do Sinduscon; ESTIMADO = base da UF × multiplicador do padrão. */
  fonte: 'TABELA' | 'ESTIMADO';
  /** "12/2025 · Com Desoneração"; null quando estimado. */
  referencia: string | null;
}

/** O valor de reserva, dito como estimativa: base da UF × multiplicador do padrão (constants.ts). */
export function cubEstimado(uf: string, padrao: string): CubDoPadrao {
  const base = BASE_CUB_RATES[uf] ?? 2000;
  const mult = CUB_STANDARDS_DATA[padrao]?.multiplier ?? 1;
  return { valorM2: Math.round(base * mult * 100) / 100, fonte: 'ESTIMADO', referencia: null };
}

function valorDe(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** "MM/AAAA" → número comparável (AAAAMM); inválido → 0. */
function mesDe(ref: unknown): number {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(String(ref ?? '').trim());
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
}

export async function cubDoPadrao(uf: string, padrao: string, desoneracao: 'Com Desoneração' | 'Sem Desoneração' = 'Com Desoneração'): Promise<CubDoPadrao> {
  const coluna = COLUNA_DO_PADRAO_CUB[padrao];
  if (!coluna) return cubEstimado(uf, padrao);
  const { data, error } = await supabase
    .from('cub_parametric_data')
    .select(`reference_date, social_charges, ${coluna}`)
    .eq('state', uf)
    .eq('nature', 'Total')
    .eq('social_charges', desoneracao);
  if (error || !data || data.length === 0) return cubEstimado(uf, padrao);
  const linhas = (data as unknown as Record<string, unknown>[])
    .map((r) => ({ mes: mesDe(r.reference_date), ref: String(r.reference_date), valor: valorDe(r[coluna]) }))
    .filter((r) => r.mes > 0 && r.valor > 0)
    .sort((a, b) => b.mes - a.mes);
  if (linhas.length === 0) return cubEstimado(uf, padrao);
  return { valorM2: linhas[0].valor, fonte: 'TABELA', referencia: `${linhas[0].ref} · ${desoneracao}` };
}
