import React from 'react';

/**
 * Rola para o topo ao MONTAR uma tela in-flow.
 *
 * O padrão de "tela" deste app é o pai devolver outra tela no lugar da sua
 * (`if (algo) return <OutraTela/>`), sem overlay. Trocar o conteúdo assim **não
 * mexe no scroll do container** — então a tela nova nasce na posição em que a
 * anterior estava, e se a anterior estava rolada o próprio cabeçalho dela
 * (o "Voltar" e o `h1`) já entra fora de vista.
 *
 * Medido em 05/09/2026 no Portal do Condômino: a lista "Acessos ao portal"
 * estava rolada, e a prévia "Como X vê o portal" abriu direto no meio do portal
 * embutido, sem o botão de voltar à vista — parecia que a tela tinha perdido o
 * cabeçalho.
 *
 * Sobe pelos ancestrais procurando quem de fato rola (`overflow-y` `auto`/`scroll`
 * com conteúdo maior que a caixa). No app isso costuma ser o `<main>` do
 * `Layout`, mas pode ser um invólucro próprio — o `DealModal`, por exemplo, tem
 * o dele. Se não achar nenhum, cai na janela.
 *
 * É o inverso do §22 (que PRESERVA o scroll ao VOLTAR de uma edição): aqui o
 * destino é uma tela diferente, e começar no meio dela nunca é o que se quer.
 *
 *   const raiz = React.useRef<HTMLDivElement>(null);
 *   useScrollAoTopo(raiz);
 *   return <div ref={raiz} className="space-y-6">…</div>;
 */
export function useScrollAoTopo(ref: React.RefObject<HTMLElement | null>) {
    React.useEffect(() => {
        let no: HTMLElement | null = ref.current?.parentElement ?? null;
        while (no) {
            const estilo = getComputedStyle(no);
            const rola = /(auto|scroll)/.test(estilo.overflowY) && no.scrollHeight > no.clientHeight;
            if (rola) { no.scrollTop = 0; return; }
            no = no.parentElement;
        }
        window.scrollTo({ top: 0 });
    }, [ref]);
}
