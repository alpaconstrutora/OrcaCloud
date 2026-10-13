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

/** Famílias reconhecidas no nome do arquivo, na ordem de teste: a mais específica
 * primeiro ("NBR ISO 9001" não pode virar "ISO 9001", nem "NBR" sozinho). Número de
 * parte (ex.: "-1" de NBR 15575-1) tem 1–2 dígitos — é o que o separa do ano
 * colado ("NBR 6118-2023"). */
const FAMILIAS_NORMA: { re: RegExp; orgao: string; codigo: (m: RegExpExecArray) => string }[] = [
  { re: /\bNBR[\s\-]*ISO([\s\/\-]*IEC)?[\s\-]*(\d{3,5}(?:-\d{1,2}(?!\d))*)/i, orgao: 'ABNT', codigo: m => `NBR ISO${m[1] ? '/IEC' : ''} ${m[2]}` },
  { re: /\bNBR[\s\-]*(\d{3,5}(?:-\d{1,2}(?!\d))*)/i, orgao: 'ABNT', codigo: m => `NBR ${m[1]}` },
  { re: /\bNR\s*-?\s*(\d{1,2})(?!\d)/i, orgao: 'MTE (NR)', codigo: m => `NR-${m[1]}` },
  { re: /\bISO([\s\/\-]*IEC)?[\s\-]*(\d{3,5}(?:-\d{1,2}(?!\d))*)/i, orgao: 'ISO', codigo: m => `ISO${m[1] ? '/IEC' : ''} ${m[2]}` },
  { re: /\bIEC[\s\-]*(\d{3,5}(?:-\d{1,2}(?!\d))*)/i, orgao: 'IEC', codigo: m => `IEC ${m[1]}` },
  { re: /\bIT\s*-?\s*(\d{1,3})(?!\d)/i, orgao: 'Corpo de Bombeiros (IT)', codigo: m => `IT ${m[1]}` },
  { re: /\bASTM\s*-?\s*([A-Z]\d{1,4}(?:\/[A-Z]?\d{1,4})?)/i, orgao: 'ASTM', codigo: m => `ASTM ${m[1].toUpperCase()}` },
];

/**
 * Deduz órgão, código e edição do NOME DO ARQUIVO de uma norma — usado no upload em
 * lote para não obrigar a digitar o que o próprio arquivo já diz:
 *   'NBR 15575-1_2024.pdf'      → { orgao: 'ABNT', codigo: 'NBR 15575-1', edicao: '2024' }
 *   'NR-18.pdf'                 → { orgao: 'MTE (NR)', codigo: 'NR-18' }
 *   'ABNT_NBR_ISO_9001-2015.pdf'→ { orgao: 'ABNT', codigo: 'NBR ISO 9001', edicao: '2015' }
 * É sugestão: quem chama nunca sobrescreve o que o usuário digitou. Sem família
 * reconhecida devolve {} (o arquivo fica sem código e o usuário completa).
 */
export function extrairNormaDoNomeDoArquivo(nomeArquivo: string): { orgao?: string; codigo?: string; edicao?: string } {
  const base = nomeArquivo.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ');
  for (const f of FAMILIAS_NORMA) {
    const m = f.re.exec(base);
    if (!m) continue;
    const depois = base.slice(m.index + m[0].length);
    // Ano de 4 dígitos (1900–2099) logo depois do código, com qualquer separador.
    const ano = /^[\s:.\-]*(?:ed\.?\s*|edição\s*|edicao\s*)?((?:19|20)\d{2})(?!\d)/i.exec(depois);
    return { orgao: f.orgao, codigo: f.codigo(m), ...(ano ? { edicao: ano[1] } : {}) };
  }
  return {};
}

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
