// Aba "Normas" do GED (ABNT e similares) — vocabulário e formatação, sem React nem
// Supabase. Plano: docs/planos/2026-10-13-ged-aba-normas.md

import type { OpuraNormaSituacao } from '../types/documents';

/** Órgãos sugeridos no campo "Órgão" (datalist). É SUGESTÃO, não lista fechada:
 * o campo aceita qualquer texto (concessionária local, norma interna, etc.).
 * `prefixa` = a convenção de citação põe a sigla antes do código
 * ("ABNT NBR 15575-1"). Os demais já trazem o prefixo no próprio código
 * ("ISO 9001", "NR-18", "IT 22") ou não têm prefixo convencional. */
export const NORMA_ORGAOS_SUGERIDOS: { value: string; prefixa: boolean }[] = [
  { value: 'ABNT', prefixa: true },
  { value: 'ISO', prefixa: false },
  { value: 'IEC', prefixa: false },
  { value: 'MTE (NR)', prefixa: false },
  { value: 'Corpo de Bombeiros (IT)', prefixa: false },
  { value: 'ASTM', prefixa: false },
  { value: 'ANVISA', prefixa: false },
  { value: 'Concessionária', prefixa: false },
];

/** Rótulo e cor de texto por situação — §8 do guia de UI: texto colorido, sem pílula. */
export const NORMA_SITUACOES: Record<OpuraNormaSituacao, { label: string; className: string }> = {
  em_vigor: { label: 'Em vigor', className: 'text-emerald-700' },
  substituida: { label: 'Substituída', className: 'text-amber-700' },
  cancelada: { label: 'Cancelada', className: 'text-red-600' },
};

export const NORMA_SITUACAO_PADRAO: OpuraNormaSituacao = 'em_vigor';

const limpar = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Referência de citação da norma, montada a partir dos campos:
 *   ('ABNT', 'NBR 15575-1', '2024') → 'ABNT NBR 15575-1:2024'
 *   ('ISO', 'ISO 9001', '2015')     → 'ISO 9001:2015'
 *   ('MTE (NR)', 'NR-18', '')        → 'NR-18'
 * Sem código não há referência (''). Não duplica sigla nem edição que o usuário
 * já tenha digitado dentro do código.
 */
export function formatarReferenciaNorma(
  orgao: string | null | undefined,
  codigo: string | null | undefined,
  edicao: string | null | undefined,
): string {
  const cod = limpar(codigo);
  if (!cod) return '';
  const org = limpar(orgao);
  const ed = limpar(edicao);

  const orgaoConhecido = NORMA_ORGAOS_SUGERIDOS.find(o => o.value.toLowerCase() === org.toLowerCase());
  const jaTemSigla = org !== '' && cod.toLowerCase().startsWith(org.toLowerCase());
  let ref = orgaoConhecido?.prefixa && !jaTemSigla ? `${orgaoConhecido.value} ${cod}` : cod;

  if (ed && !ref.toLowerCase().includes(ed.toLowerCase())) {
    // Edição que começa por ano segue a citação ABNT ("…:2024"); o resto
    // (ex.: "Portaria 3.733/2020") vai separado por espaço.
    ref += /^\d/.test(ed) ? `:${ed}` : ` ${ed}`;
  }
  return ref;
}
