/**
 * Cor do CABEÇALHO de tabela/grade — fonte única (12/10/2026; plano
 * docs/planos/2026-10-12-cabecalhos-sem-cinza.md). Pedido do usuário: *"Nenhum header deve
 * estar na cor cinza!"* e, depois de eu ter inventado um azul que NÃO existia nos
 * cabeçalhos do app: *"mesma cor do texto ja usada nas tabelas"*.
 *
 * Então: fundo BRANCO (sem preenchimento — o cinza claro lia como "desabilitado") e o texto do
 * cabeçalho na MESMA cor do texto das células (§7 do guia: `text-gray-700`), em semibold para
 * se distinguir do corpo, com uma linha embaixo. O destaque de cor fica para o que é estado:
 * a coluna ordenada e o ícone de ordenação ativa seguem azul (`blue-600`), como já eram.
 *
 * As classes aparecem por extenso porque o Tailwind só gera o que lê escrito. Telas novas
 * importam daqui em vez de copiar a cor; `__tests__/cabecalhoSemCinzaGuard.test.ts` trava
 * cabeçalho com FUNDO cinza.
 */
export const CABECALHO_TABELA = {
    /** Fundo da linha de cabeçalho: branco, sem preenchimento. */
    fundo: 'bg-white',
    /** Linha embaixo do cabeçalho. */
    linhaDeBaixo: 'border-gray-200',
    /** Divisória vertical entre as células do cabeçalho. */
    divisoria: 'border-gray-100',
    /** Texto do rótulo: o mesmo das células (§7). */
    texto: 'text-gray-700',
    /** Texto secundário (subrótulo de data, ícone de ordenação em repouso). */
    textoSecundario: 'text-gray-500',
} as const;
