// supabase/functions/planta-api/csv.ts
//
// A planilha de quantitativos em CSV (E9.2): as mesmas abas do .xlsx da tela,
// uma após a outra. Sem dependência nenhuma, para o vitest do app testar o
// mesmo arquivo que a Edge Function roda.
//
// Formato: cada aba começa com `## Nome da aba`; `;` separa colunas (o Excel
// em português espera isso); decimal com vírgula; célula com `;`, aspas ou
// quebra de linha vai entre aspas (aspas dobradas); CRLF; BOM no início para
// o Excel abrir em UTF-8 sem perguntar.

/** CSV das abas: `## Aba`, `;` como separador, decimal com vírgula, BOM. */
export function csvDasAbas(abas: { nome: string; linhas: unknown[][] }[]): string {
  const celula = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blocos = abas.map((a) => [`## ${a.nome}`, ...a.linhas.map((l) => l.map(celula).join(';'))].join('\r\n'));
  return '\uFEFF' + blocos.join('\r\n\r\n') + '\r\n';
}
