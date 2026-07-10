/**
 * Valida se o nome físico do arquivo atende à máscara de nomenclatura definida na pasta.
 * Substitui os tokens canônicos [OBRA], [DISCIPLINA], [NUMERO], [REVISAO] por expressões regulares.
 *
 * @param fileName Nome do arquivo com extensão (ex: "ALPA-ESTR-001-R2.pdf")
 * @param mask A máscara configurada na pasta (ex: "[OBRA]-[DISCIPLINA]-[NUMERO]-R[REVISAO]")
 */
export function validateFileNameAgainstMask(fileName: string, mask: string): boolean {
  if (!mask) return true; // Sem máscara = livre

  const pattern = mask
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') // Escapa caracteres especiais de Regex
    .replace(/\\\[OBRA\\\]/g, '([A-Z0-9]+)')
    .replace(/\\\[DISCIPLINA\\\]/g, '([A-Z]+)')
    .replace(/\\\[NUMERO\\\]/g, '([0-9]+)')
    .replace(/\\\[REVISAO\\\]/g, '([A-Z0-9]+)');

  const regex = new RegExp(`^${pattern}$`, 'i');
  
  // Extrair apenas o nome do arquivo, removendo a extensão (.pdf, .dwg, etc.)
  const fileNameWithoutExt = fileName.split('.').slice(0, -1).join('.');
  
  return regex.test(fileNameWithoutExt);
}

/**
 * Extrai o valor de um token específico (ex: [DISCIPLINA]) do nome do arquivo com base na máscara.
 */
export function extractTokenFromFileName(
  fileName: string,
  mask: string,
  token: '[OBRA]' | '[DISCIPLINA]' | '[NUMERO]' | '[REVISAO]'
): string | null {
  if (!mask) return null;

  const tokensInOrder: string[] = [];
  const regexTokens = /\[OBRA\]|\[DISCIPLINA\]|\[NUMERO\]|\[REVISAO\]/g;
  let match;
  while ((match = regexTokens.exec(mask)) !== null) {
    tokensInOrder.push(match[0]);
  }

  const targetIndex = tokensInOrder.indexOf(token);
  if (targetIndex === -1) return null;

  const pattern = mask
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    .replace(/\\\[OBRA\\\]/g, '([A-Z0-9]+)')
    .replace(/\\\[DISCIPLINA\\\]/g, '([A-Z]+)')
    .replace(/\\\[NUMERO\\\]/g, '([0-9]+)')
    .replace(/\\\[REVISAO\\\]/g, '([A-Z0-9]+)');

  const regex = new RegExp(`^${pattern}$`, 'i');
  const fileNameWithoutExt = fileName.split('.').slice(0, -1).join('.');
  const result = regex.exec(fileNameWithoutExt);

  if (!result) return null;

  return result[targetIndex + 1] || null;
}
