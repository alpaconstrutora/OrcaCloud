// utils/html2canvasCores.ts
//
// html2canvas 1.4 não entende as funções de cor do CSS moderno (oklch, oklab,
// lab, lch, color-mix) que o Tailwind v4 usa em TODA a paleta. Ao encontrar uma,
// a captura inteira aborta com 'Attempting to parse an unsupported color
// function "oklch"' — achado em 2026-10-12 na exportação de PDF do Resumo
// Executivo dos Estudos de Viabilidade (o botão não gerava nada).
//
// Saída sem perder o visual: no `onclone` do html2canvas, cada elemento da CÓPIA
// recebe inline as propriedades de cor já calculadas, com cada função moderna
// trocada por rgba(). A tela original não é tocada.
//
// Uso:  html2canvas(el, { ...opcoes, onclone: (_doc, raiz) => coresCompativeisNaCopia(raiz) })

const PROPRIEDADES = [
    'color', 'background-color', 'background-image',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'outline-color', 'text-decoration-color', 'box-shadow', 'text-shadow',
    'fill', 'stroke', 'caret-color', 'column-rule-color',
    // html2canvas também interpreta esta como cor (CSSParsedDeclaration). O padrão
    // é currentcolor e acompanha `color`, mas um valor explícito escaparia.
    '-webkit-text-stroke-color',
];

const FUNCAO_MODERNA = /\b(oklch|oklab|lab|lch|color-mix)\(/i;

/** Acha `oklch(...)` etc. respeitando parênteses aninhados (color-mix tem funções dentro). */
function trocarFuncoes(valor: string, converter: (cor: string) => string): string {
    let saida = '';
    let i = 0;
    const re = /\b(oklch|oklab|lab|lch|color-mix)\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(valor)) !== null) {
        const inicio = m.index;
        let prof = 0;
        let fim = inicio + m[0].length - 1;
        for (; fim < valor.length; fim++) {
            if (valor[fim] === '(') prof++;
            else if (valor[fim] === ')') { prof--; if (prof === 0) break; }
        }
        saida += valor.slice(i, inicio) + converter(valor.slice(inicio, fim + 1));
        i = fim + 1;
        re.lastIndex = i;
    }
    return saida + valor.slice(i);
}

/** Converte qualquer cor CSS em rgba() pintando 1 pixel num canvas e lendo o pixel. */
function criarConversor(doc: Document): (cor: string) => string {
    const canvas = doc.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const cache = new Map<string, string>();
    return (cor: string) => {
        const pronto = cache.get(cor);
        if (pronto) return pronto;
        let rgba = 'rgba(0, 0, 0, 0)';
        if (ctx) {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = '#000';
            ctx.fillStyle = cor; // cor inválida: fica o #000 anterior
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            rgba = `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
        }
        cache.set(cor, rgba);
        return rgba;
    };
}

/**
 * No `onclone` do html2canvas: fixa inline, na cópia, as cores calculadas de
 * cada elemento sob `raiz`, sem funções de cor que o html2canvas não entende.
 * Devolve quantas propriedades foram reescritas (útil em teste).
 */
export function coresCompativeisNaCopia(raiz: HTMLElement, opcoes: { semSombra?: boolean } = {}): number {
    const doc = raiz.ownerDocument;
    const view = doc.defaultView;
    if (!view) return 0;
    const converter = criarConversor(doc);
    let reescritas = 0;
    // <html> e <body> da cópia entram também: o html2canvas SEMPRE lê a cor de
    // fundo dos dois (parseBackgroundColor), mesmo com `backgroundColor` informado
    // e mesmo capturando só um elemento lá dentro. No app o body tem fundo oklch —
    // a 1ª versão desta correção só tratava a subárvore e o PDF seguia abortando.
    const extremos = [doc.documentElement, doc.body].filter((e): e is HTMLElement => !!e && e !== raiz);
    const elementos: Element[] = [...extremos, raiz, ...Array.from(raiz.querySelectorAll('*'))];
    for (const el of elementos) {
        const estilo = view.getComputedStyle(el);
        const alvo = (el as HTMLElement | SVGElement).style;
        if (!alvo) continue;
        // html2canvas desenha box-shadow sobre gradiente como um retângulo interno
        // escuro; em documento impresso a sombra não acrescenta nada.
        if (opcoes.semSombra && estilo.getPropertyValue('box-shadow') !== 'none') {
            alvo.setProperty('box-shadow', 'none', 'important');
        }
        for (const prop of PROPRIEDADES) {
            if (opcoes.semSombra && prop === 'box-shadow') continue;
            const valor = estilo.getPropertyValue(prop);
            if (!valor || !FUNCAO_MODERNA.test(valor)) continue;
            alvo.setProperty(prop, trocarFuncoes(valor, converter), 'important');
            reescritas++;
        }
    }
    return reescritas;
}

/** Exposto para teste: troca as funções de cor de um valor CSS com um conversor dado. */
export const __trocarFuncoesParaTeste = trocarFuncoes;
