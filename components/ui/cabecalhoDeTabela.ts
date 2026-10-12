/**
 * Cor do CABEÇALHO de tabela/grade — fonte única (12/10/2026; plano
 * docs/planos/2026-10-12-cabecalhos-sem-cinza.md). Pedido do usuário: *"Nenhum header deve
 * estar na cor cinza!"* — cinza em cabeçalho lê como "desabilitado/vazio".
 *
 * É o azul-claro que o app já usava em cabeçalho (`bg-blue-50`, ex.: colunas ES/EF) e a
 * mesma família do azul de ação (botões, aba ativa). Texto `blue-800`: contraste AA sobre o
 * fundo — o `gray-400/500` antigo não passava.
 *
 * As classes aparecem por extenso porque o Tailwind só gera o que lê escrito. Telas novas
 * importam daqui em vez de copiar a cor; `__tests__/cabecalhoSemCinzaGuard.test.ts` trava
 * cabeçalho cinza.
 */
export const CABECALHO_TABELA = {
    /** Fundo da linha de cabeçalho. */
    fundo: 'bg-blue-50',
    /** Linha embaixo do cabeçalho. */
    linhaDeBaixo: 'border-blue-200',
    /** Divisória vertical entre as células do cabeçalho. */
    divisoria: 'border-blue-100',
    /** Texto do rótulo. */
    texto: 'text-blue-800',
    /** Texto secundário (subrótulo de data, ícone de ordenação em repouso). */
    textoSecundario: 'text-blue-600',
} as const;
