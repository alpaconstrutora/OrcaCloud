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
    // Substitui tokens com chaves de tamanho específico
    .replace(/\\\[OBRA\\\{([0-9,]+)\\\}\\\]/gi, '([A-Z0-9]{$1})')
    .replace(/\\\[DISCIPLINA\\\{([0-9,]+)\\\}\\\]/gi, '([A-Z]{$1})')
    .replace(/\\\[NUMERO\\\{([0-9,]+)\\\}\\\]/gi, '([0-9]{$1})')
    .replace(/\\\[REVISAO\\\{([0-9,]+)\\\}\\\]/gi, '([A-Z0-9]{$1})')
    // Substitui tokens sem chaves
    .replace(/\\\[OBRA\\\]/gi, '([A-Z0-9]+)')
    .replace(/\\\[DISCIPLINA\\\]/gi, '([A-Z]+)')
    .replace(/\\\[NUMERO\\\]/gi, '([0-9]+)')
    .replace(/\\\[REVISAO\\\]/gi, '([A-Z0-9]+)');

  const regex = new RegExp(`^${pattern}$`, 'i');
  
  // Extrair apenas o nome do arquivo, removendo a extensão (.pdf, .dwg, etc.)
  const fileNameWithoutExt = fileName.includes('.') ? fileName.split('.').slice(0, -1).join('.') : fileName;
  
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
  // Regex que aceita tanto [OBRA] quanto [OBRA{3}]
  const regexTokens = /\[(OBRA|DISCIPLINA|NUMERO|REVISAO)(?:\{[0-9,]+\})?\]/gi;
  let match;
  while ((match = regexTokens.exec(mask)) !== null) {
    tokensInOrder.push(match[0].toUpperCase()); // Normaliza para maiúsculo
  }

  // Acha o index do token que contém o nome procurado (ex: "DISCIPLINA")
  const cleanTokenName = token.replace(/[\[\]]/g, '').toUpperCase(); // ex: "DISCIPLINA"
  const targetIndex = tokensInOrder.findIndex(t => t.includes(cleanTokenName));
  if (targetIndex === -1) return null;

  const pattern = mask
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') // Escapa tudo
    // Substitui tokens com chaves
    .replace(/\\\[OBRA\\\{([0-9,]+)\\\}\\\]/gi, '([A-Z0-9]{$1})')
    .replace(/\\\[DISCIPLINA\\\{([0-9,]+)\\\}\\\]/gi, '([A-Z]{$1})')
    .replace(/\\\[NUMERO\\\{([0-9,]+)\\\}\\\]/gi, '([0-9]{$1})')
    .replace(/\\\[REVISAO\\\{([0-9,]+)\\\}\\\]/gi, '([A-Z0-9]{$1})')
    // Substitui tokens sem chaves
    .replace(/\\\[OBRA\\\]/gi, '([A-Z0-9]+)')
    .replace(/\\\[DISCIPLINA\\\]/gi, '([A-Z]+)')
    .replace(/\\\[NUMERO\\\]/gi, '([0-9]+)')
    .replace(/\\\[REVISAO\\\]/gi, '([A-Z0-9]+)');

  const regex = new RegExp(`^${pattern}$`, 'i');
  const fileNameWithoutExt = fileName.includes('.') ? fileName.split('.').slice(0, -1).join('.') : fileName;
  const result = regex.exec(fileNameWithoutExt);

  if (!result) return null;

  return result[targetIndex + 1] || null;
}

/**
 * Reconstrói o nome do arquivo injetando os tokens fornecidos dentro da máscara.
 * @param mask A máscara de nomenclatura (ex: "[OBRA]-[DISCIPLINA]")
 * @param tokens Objeto chave-valor com os tokens e valores digitados
 * @param originalExtension Extensão original (ex: "pdf", "docx")
 */
export function generateFileNameFromMask(mask: string, tokens: Record<string, string>, originalExtension: string): string {
  let finalName = mask;
  const knownTokens = ['[OBRA]', '[DISCIPLINA]', '[NUMERO]', '[REVISAO]'];
  
  knownTokens.forEach(t => {
    const rawVal = tokens[t];
    if (rawVal !== undefined) {
      // Regex que acha o token, com ou sem a formatação de tamanho, ex: [OBRA] ou [OBRA{3}]
      const tokenName = t.replace(/[\[\]]/g, ''); // "OBRA"
      const regex = new RegExp(`\\[${tokenName}(?:\\{([0-9,]+)\\})?\\]`, 'gi');
      finalName = finalName.replace(regex, (match, p1) => {
        if (p1) {
          const length = parseInt(p1, 10);
          return rawVal.padStart(length, '0');
        }
        return rawVal;
      });
    }
  });

  return `${finalName}.${originalExtension}`;
}

/**
 * Retorna uma lista limpa dos tokens contidos na máscara.
 * @param mask A máscara de nomenclatura
 * @returns Array de tokens, ex: ["[OBRA]", "[DISCIPLINA]"]
 */
export function extractMaskTokens(mask: string): string[] {
  const tokens: string[] = [];
  const regexTokens = /\[(OBRA|DISCIPLINA|NUMERO|REVISAO)(?:\{[0-9,]+\})?\]/gi;
  let match;
  while ((match = regexTokens.exec(mask)) !== null) {
    tokens.push(`[${match[1].toUpperCase()}]`);
  }
  return tokens;
}

/**
 * Analisa os documentos existentes na pasta, extrai o NUMERO, e retorna o próximo formatado.
 */
export function getNextSequentialNumber(
  docsInFolder: { nome: string }[],
  mask: string
): string {
  if (!mask) return '';
  // Descobre o tamanho esperado para o [NUMERO]
  const sizeMatch = /\[NUMERO(?:\{(\d+)\})?\]/i.exec(mask);
  const padLength = sizeMatch && sizeMatch[1] ? parseInt(sizeMatch[1], 10) : 3;

  let maxNum = 0;
  for (const doc of docsInFolder) {
    const numStr = extractTokenFromFileName(doc.nome, mask, '[NUMERO]');
    if (numStr) {
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return nextNum.toString().padStart(padLength, '0');
}

/**
 * Retorna a REVISAO formatada para inicio (ex: 00).
 */
export function getInitialRevision(mask: string): string {
  if (!mask) return '';
  const sizeMatch = /\[REVISAO(?:\{(\d+)\})?\]/i.exec(mask);
  const padLength = sizeMatch && sizeMatch[1] ? parseInt(sizeMatch[1], 10) : 2;
  return '0'.padStart(padLength, '0');
}
