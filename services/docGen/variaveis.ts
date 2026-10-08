/**
 * Variáveis `{{grupo.campo}}` em texto livre (cabeçalho, rodapé, assunto).
 * Puro — sem React, sem Supabase. Os nós `variavel` do editor usam a mesma
 * chave, mas lá a chave vive em `attrs.chave`, não em texto.
 */
const RE_VARIAVEL = /\{\{\s*([a-zA-Z_][\w]*(?:\.[\w]+)+)\s*\}\}/g;

/** Chaves `{{a.b}}` presentes num texto, sem repetição, na ordem em que aparecem. */
export function chavesNoTexto(texto: string | null | undefined): string[] {
    if (!texto) return [];
    const vistas = new Set<string>();
    for (const m of texto.matchAll(RE_VARIAVEL)) vistas.add(m[1]);
    return [...vistas];
}

/**
 * Troca cada `{{chave}}` pelo valor. Chave sem valor (ausente ou vazia) fica
 * como `[[chave]]`: o leitor vê o buraco em vez de um espaço em branco mudo.
 */
export function substituirVariaveis(texto: string, valores: Record<string, string | undefined>): string {
    return texto.replace(RE_VARIAVEL, (_, chave: string) => {
        const v = valores[chave];
        return v && v.trim() ? v : `[[${chave}]]`;
    });
}

/** Chaves cujo valor está ausente ou vazio. */
export function chavesPendentes(chaves: Iterable<string>, valores: Record<string, string | undefined>): string[] {
    const out: string[] = [];
    for (const c of chaves) if (!(valores[c] && valores[c]!.trim())) out.push(c);
    return out;
}
