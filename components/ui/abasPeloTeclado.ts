import type React from 'react';

/**
 * Teclado de um trilho de abas (`role="tablist"`), no padrão do WAI-ARIA:
 * setas ←/→ vão para a aba vizinha (dando a volta), Home/End para a primeira e
 * a última. A aba de destino recebe o foco E é escolhida (ativação automática:
 * o `click()` passa pelo mesmo `onClick` do mouse, então nenhuma tela precisa
 * repetir a regra de "o que acontece ao escolher a aba").
 *
 * Par de `tabIndexDaAba`: só a aba ativa fica na ordem do Tab — o Tab entra no
 * trilho uma vez e sai dele, em vez de parar em cada uma das 8 abas.
 *
 * Até 10/11/2026 só a negociação (`DealModal`) andava pelas setas; `TabsBar`
 * (~50 telas), `TabsList` e os trilhos feitos à mão tinham o papel de aba para o
 * leitor de tela, mas o teclado parava em cada botão e ignorava as setas.
 */
const PASSO: Record<string, number | 'primeira' | 'ultima'> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    Home: 'primeira',
    End: 'ultima',
};

/** `onKeyDown` do elemento com `role="tablist"`. */
export function moverEntreAbas(e: React.KeyboardEvent<HTMLElement>): void {
    const passo = PASSO[e.key];
    if (passo === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    const trilho = e.currentTarget;
    // Só as abas DESTE trilho (um trilho pode morar dentro de outro painel com abas).
    const abas = Array.from(trilho.querySelectorAll<HTMLElement>('[role="tab"]'))
        .filter(a => a.closest('[role="tablist"]') === trilho && !a.hasAttribute('disabled'));
    const atual = abas.indexOf(document.activeElement as HTMLElement);
    if (atual < 0 || abas.length < 2) return;
    const destino = passo === 'primeira' ? 0
        : passo === 'ultima' ? abas.length - 1
        : (atual + passo + abas.length) % abas.length;
    e.preventDefault();
    if (destino === atual) return;
    abas[destino].focus();
    abas[destino].click();
}

/**
 * `tabIndex` de uma aba. Sem nenhuma ativa (valor fora da lista), a primeira
 * fica alcançável — senão o trilho inteiro sumiria da ordem do Tab.
 */
export function tabIndexDaAba(ativa: boolean, indice: number, algumaAtiva: boolean): 0 | -1 {
    return ativa || (!algumaAtiva && indice === 0) ? 0 : -1;
}
