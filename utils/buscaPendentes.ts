/**
 * Busca da aba Pendentes (Extrato e Lançamentos).
 *
 * 1. A busca acha o que a linha MOSTRA, não só o texto cru. Na tabela de Lançamentos a coluna
 *    Descrição mostra o título resolvido (nome do fornecedor no boleto), o "Nº" de origem e o
 *    rótulo do módulo ("Contrato Parcelado", "Gestão Comercial"); comparar só `description`
 *    dava 0 linhas para o que o usuário estava lendo.
 * 2. Várias palavras, em qualquer ordem: "energisa 153" = fornecedor E código. Cada palavra
 *    precisa aparecer em ALGUM dos textos da linha (não precisa ser o mesmo campo).
 */
export function combinaComBusca(termo: string, textos: Array<string | null | undefined>): boolean {
    const palavras = termo.toLowerCase().split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return true;
    const minusculos = textos.filter((x): x is string => !!x).map(x => x.toLowerCase());
    return palavras.every(p => minusculos.some(x => x.includes(p)));
}
