/**
 * Busca da aba Pendentes › Lançamentos. A coluna Descrição não mostra só `description`:
 * mostra o título resolvido (nome do fornecedor no boleto), o "Nº" de origem e o rótulo
 * do módulo de origem ("Contrato Parcelado", "Gestão Comercial"). A busca comparava só o
 * texto cru e dava 0 linhas para o que o usuário estava lendo na tela.
 *
 * Regra: a busca acha o que a linha MOSTRA (todos os textos abaixo) e também o texto cru.
 */
export function combinaComBusca(termo: string, textos: Array<string | null | undefined>): boolean {
    const t = termo.trim().toLowerCase();
    if (!t) return true;
    return textos.some(x => !!x && x.toLowerCase().includes(t));
}
