// utils/ordemDosLancamentos.ts
//
// Ordem das cobranças da Negociação (aba Parcelas) pela data do lançamento (14/11/2026).
// Duas das três ordenações do DealModal faziam `a.transaction_date.localeCompare(...)` sem
// proteção: um lançamento sem data derrubava a tela inteira. Em produção a coluna é NOT NULL,
// mas dado de teste (e qualquer resposta incompleta) não é — e foi assim que a CI caiu de forma
// intermitente (dealModalAvisoReceitaFinanceira). Uma regra só, usada nos três lugares.

/** Mais antiga primeiro; sem data vai para o fim (não para o começo, onde pareceria a 1ª parcela). */
export function porDataDoLancamento(
  a: { transaction_date?: string | null },
  b: { transaction_date?: string | null },
): number {
  const da = a.transaction_date || '';
  const db = b.transaction_date || '';
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db);
}
