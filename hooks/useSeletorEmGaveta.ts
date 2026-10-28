import React from 'react';

/**
 * Peças dos seletores em gaveta (`ClientSelect`, `SupplierSelect`, `UnitSelect`…):
 * busca no topo e uma tabela de opções em que clicar na linha escolhe.
 *
 * Por que existe (28/10/2026, crítica 2 da Central de Clientes): as linhas eram
 * `<tr onClick>` sem foco — escolher cliente, fornecedor ou unidade era impossível
 * sem mouse, contra o "teclado completo" do PRODUCT.md. E o foco inicial na busca
 * vinha de `autoFocus`, que dispara na MONTAGEM: esses seletores montam o `Sheet`
 * fechado (que desde o #213 é `inert`) e abrem um quadro depois — o navegador recusa
 * foco dentro de `inert`, e a busca abria sem cursor.
 */

/** Foca o campo quando a gaveta termina de abrir (`shown`), não quando monta. */
export function useFocoAoAbrir(shown: boolean, ref: React.RefObject<HTMLElement | null>) {
    React.useEffect(() => {
        if (!shown) return;
        // Um respiro depois do `inert` sair: no mesmo quadro o foco ainda é recusado.
        const t = window.setTimeout(() => {
            const campo = ref.current;
            if (!campo) return;
            // Não rouba foco de quem já agiu DENTRO da gaveta nesses 50 ms (ex.:
            // clicou "Novo" e começou a digitar o nome — o resto do texto caía na
            // busca; pego pelo teste do BuildingSystemSelect). O `Sheet` põe o foco
            // no próprio painel ao abrir; só esse caso (ou foco fora) é substituído.
            const painel = campo.closest('[role="dialog"]');
            const ativo = document.activeElement;
            if (painel && ativo && ativo !== painel && painel.contains(ativo)) return;
            campo.focus();
        }, 50);
        return () => window.clearTimeout(t);
    }, [shown, ref]);
}

/** Classes do foco da linha — mesmo anel interno das tabelas (`StandardTable`). */
export const FOCO_DA_LINHA = 'focus:outline-none focus-visible:bg-blue-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40';

/**
 * Lista de escolha pelo teclado: Tab chega às linhas; Enter/Espaço escolhem;
 * ↓/↑ andam entre as linhas (↑ na primeira volta para a busca); na busca, ↓ entra
 * na lista e Enter (com algo digitado) escolhe o primeiro resultado.
 *
 * Uso: `ref={corpoRef}` no `<tbody>`; `{...linha(() => escolher(x))}` em cada `<tr>`
 * escolhível (linha bloqueada não recebe); `onKeyDown={busca(escolherPrimeiro)}` na busca.
 */
export function useListaDeEscolhaPorTeclado(buscaRef: React.RefObject<HTMLInputElement | null>) {
    const corpoRef = React.useRef<HTMLTableSectionElement>(null);
    const opcoes = React.useCallback(
        () => [...(corpoRef.current?.querySelectorAll<HTMLElement>('tr[data-opcao]') ?? [])],
        [],
    );

    const linha = React.useCallback((escolher: () => void) => ({
        'data-opcao': '',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(); return; }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const lista = opcoes();
            const i = lista.indexOf(e.currentTarget);
            if (e.key === 'ArrowUp' && i <= 0) { buscaRef.current?.focus(); return; }
            lista[Math.min(lista.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))]?.focus();
        },
    }), [opcoes, buscaRef]);

    const busca = React.useCallback((escolherPrimeiro: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); opcoes()[0]?.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); escolherPrimeiro(); }
    }, [opcoes]);

    return { corpoRef, linha, busca };
}
