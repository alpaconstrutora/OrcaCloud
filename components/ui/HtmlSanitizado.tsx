import React, { useMemo } from 'react';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

/**
 * HtmlSanitizado — o ÚNICO lugar do app que põe HTML de fora no DOM.
 *
 * ─── Por que não basta `sanitizeHtml()` ──────────────────────────────────────
 *
 * Achado F70 da varredura de 15/11/2026. `sanitizeHtml` tira script e handler,
 * mas deixa passar `style` e `class` — e precisa deixar: template de contrato e
 * texto de aula usam formatação inline de verdade (marca-d'água, tabela
 * alinhada, posicionamento de modelo). O DOMPurify não lê CSS.
 *
 * Com isso, um membro de papel baixo (que escreve `academy_lessons`,
 * `contract_templates`, ajuda do portal...) planta uma camada de tela inteira
 * com link por cima da tela de um administrador:
 *
 *     <a href="https://phish…" style="position:fixed;inset:0;z-index:99999">
 *     <div class="fixed inset-0 z-[9999]">   ← classes do Tailwind que o app já compilou
 *
 * Filtrar declarações de CSS não fecha: a classe faz o mesmo que o style, e
 * tirar `fixed`/`inset-*`/`z-*` quebraria os modelos legítimos.
 *
 * ─── O que fecha ─────────────────────────────────────────────────────────────
 *
 * O invólucro, não o conteúdo:
 *
 *   • `contain: paint` — o invólucro vira o bloco de contenção de todo
 *     `position: fixed`/`absolute` de dentro e o navegador NÃO pinta nada fora
 *     da caixa dele. `inset:0` passa a significar "a caixa do conteúdo", não a
 *     tela. Vale para style inline e para classe, igual.
 *   • `overflow: auto` — o que é mais largo que o quadro ROLA dentro dele em vez
 *     de ser cortado: tabela larga de aula no celular, e-mail de 600px na
 *     prévia do Dunning, link longo na ajuda. A altura continua a do conteúdo
 *     (o invólucro não tem altura fixa), então não nasce rolagem vertical.
 *
 * A contenção vem DEPOIS do `style` de quem chama, para que nenhuma tela a
 * desligue sem querer.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────
 *
 *   JSX:        <HtmlSanitizado className="prose …" html={valorDoBanco} />
 *   imperativo: preencherComHtmlSanitizado(elemento, valorDoBanco)
 *
 * Passe o HTML CRU — a sanitização é feita aqui. `scripts/check-xss-sinks.sh`
 * (CI) recusa qualquer `dangerouslySetInnerHTML` / `.innerHTML =` fora deste
 * arquivo, mesmo com `sanitizeHtml()`.
 *
 * Efeitos de layout conhecidos (aceitos ao escolher "conter e rolar"):
 *   • conteúdo mais largo que o quadro ganha barra de rolagem horizontal;
 *   • o invólucro passa a conter floats e margens dos filhos (vira contexto de
 *     formatação próprio) — um float no fim do texto aumenta a altura do quadro
 *     em vez de vazar por baixo dele;
 *   • contorno de foco/sombra de um elemento colado na borda é cortado na borda.
 */

/** As duas declarações que contêm o HTML. Fonte única para o JSX e o imperativo. */
const CONTENCAO = { contain: 'paint', overflow: 'auto' } as const;

export const ESTILO_HTML_CONTIDO: React.CSSProperties = CONTENCAO;

type Props = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & {
    /** HTML como veio do banco (ou do formulário). É sanitizado aqui. */
    html: string | null | undefined;
};

export function HtmlSanitizado({ html, style, ...resto }: Props) {
    const limpo = useMemo(() => sanitizeHtml(html), [html]);
    return (
        <div
            {...resto}
            style={{ ...style, ...ESTILO_HTML_CONTIDO }}
            dangerouslySetInnerHTML={{ __html: limpo }}
        />
    );
}

/**
 * Versão imperativa, para quem monta o elemento à mão (ex.: o container fora
 * da tela que o html2canvas fotografa para o PDF do contrato).
 *
 * Aplica a contenção propriedade a propriedade — não sobrescreve o
 * `style.cssText` que o chamador já definiu. Por isso mesmo, chame DEPOIS de
 * mexer em `cssText`: um `cssText = …` posterior apagaria a contenção.
 */
export function preencherComHtmlSanitizado(elemento: HTMLElement, html: string | null | undefined): void {
    for (const [propriedade, valor] of Object.entries(CONTENCAO)) {
        elemento.style.setProperty(propriedade, valor);
    }
    elemento.innerHTML = sanitizeHtml(html);
}

export default HtmlSanitizado;
