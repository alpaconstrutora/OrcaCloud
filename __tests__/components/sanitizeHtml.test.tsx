// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

/**
 * Trava do helper de sanitização (achados C5-01, C5-02, C5-04).
 *
 * Vive em `__tests__/components/` porque é o único diretório que o
 * `vite.config.ts` roda em `jsdom` — DOMPurify precisa de DOM.
 *
 * Os payloads abaixo não são genéricos: cada um corresponde a um caminho real
 * de exploração descrito no relatório da auditoria.
 */
describe('sanitizeHtml · neutraliza o que chega das tabelas org-scoped', () => {
    it('remove <script>', () => {
        const limpo = sanitizeHtml('<p>oi</p><script>alert(1)</script>');
        expect(limpo).toContain('oi');
        expect(limpo.toLowerCase()).not.toContain('<script');
        expect(limpo).not.toContain('alert(1)');
    });

    it('remove onerror de <img> — o vetor real, já que innerHTML não roda <script>', () => {
        const limpo = sanitizeHtml('<img src=x onerror="alert(document.cookie)">');
        expect(limpo.toLowerCase()).not.toContain('onerror');
        expect(limpo).not.toContain('alert');
    });

    it('remove onload de <svg>', () => {
        const limpo = sanitizeHtml('<svg onload="alert(1)"></svg>');
        expect(limpo.toLowerCase()).not.toContain('onload');
    });

    it('remove href="javascript:"', () => {
        const limpo = sanitizeHtml('<a href="javascript:alert(1)">clique</a>');
        expect(limpo.toLowerCase()).not.toContain('javascript:');
        expect(limpo).toContain('clique');   // o texto fica; só o link cai
    });

    it('remove <iframe>', () => {
        const limpo = sanitizeHtml('<iframe src="https://exemplo.test"></iframe>');
        expect(limpo.toLowerCase()).not.toContain('<iframe');
    });

    it('remove href="data:text/html" — o vetor real de data: URI', () => {
        const limpo = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">clique</a>');
        expect(limpo.toLowerCase()).not.toContain('data:');
        expect(limpo).toContain('clique');
    });

    it('remove href="vbscript:"', () => {
        expect(sanitizeHtml('<a href="vbscript:alert(1)">x</a>').toLowerCase())
            .not.toContain('vbscript:');
    });

    /**
     * `data:` em `<img src>` é MANTIDO, e isso é correto — não é o teste sendo
     * frouxo. O navegador carrega SVG por `<img>` em modo estático seguro:
     * script não executa e referência externa é bloqueada. É por isso que o
     * DOMPurify libera `data:` só no conjunto `DATA_URI_TAGS` (img, video,
     * audio...) e nunca em `<a href>`, como o teste acima comprova.
     *
     * A primeira versão deste arquivo afirmava o contrário e falhava. A
     * tentação era "consertar" com `ALLOWED_URI_REGEXP` — que de fato removeria
     * o `data:`, mas ao custo de apagar `colspan` e `border` de toda tabela,
     * porque o DOMPurify aplica esse regex ao valor de TODO atributo.
     */
    it('mantém data: em <img src> — SVG via <img> não executa script', () => {
        const limpo = sanitizeHtml('<img src="data:image/svg+xml,<svg onload=alert(1)></svg>">');
        expect(limpo).toContain('<img');
    });

    it('acrescenta rel=noopener em target=_blank', () => {
        const limpo = sanitizeHtml('<a href="https://exemplo.test" target="_blank">ir</a>');
        expect(limpo).toContain('noopener');
    });

    /** Lê o `rel` do primeiro <a> da saída — `null` se não houver. */
    const relDe = (html: string): string | null => {
        const div = document.createElement('div');
        div.innerHTML = sanitizeHtml(html);
        return div.querySelector('a')?.getAttribute('rel') ?? null;
    };

    it('target=_blank mantém a saída de sempre: rel="noopener noreferrer"', () => {
        expect(relDe('<a href="https://exemplo.test" target="_blank">ir</a>')).toBe('noopener noreferrer');
        expect(relDe('<a href="https://exemplo.test" target="_blank" rel="opener">ir</a>')).toBe('noopener noreferrer');
    });

    it('target nomeado também ganha noopener — janela nova herda window.opener', () => {
        expect(relDe('<a href="https://atacante.test" target="doc">ir</a>')).toBe('noopener noreferrer');
    });

    it('_blank em outra caixa ou com espaço ganha noopener, mesmo com rel="opener"', () => {
        for (const target of ['_BLANK', '_Blank', ' _blank', '_blank ']) {
            const rel = relDe(`<a href="https://atacante.test" target="${target}" rel="opener">ir</a>`);
            const tokens = (rel ?? '').split(/\s+/);
            expect(tokens).toContain('noopener');
            expect(tokens).toContain('noreferrer');
        }
    });

    it('target com espaço em volta é decidido pelo valor aparado que sai', () => {
        // O DOMPurify apara o atributo; o rel tem de bater com o target emitido.
        const saida = (target: string) => {
            const div = document.createElement('div');
            div.innerHTML = sanitizeHtml(`<a href="https://exemplo.test" target="${target}">ir</a>`);
            const a = div.querySelector('a')!;
            return { target: a.getAttribute('target'), rel: a.getAttribute('rel') };
        };
        expect(saida(' _self ')).toEqual({ target: '_self', rel: null });
        expect(saida(' ')).toEqual({ target: '', rel: null });
        expect(saida(' _BLANK')).toEqual({ target: '_BLANK', rel: 'noopener noreferrer' });
        expect(saida(' doc ')).toEqual({ target: 'doc', rel: 'noopener noreferrer' });
    });

    it('acrescenta ao rel existente sem apagar os outros tokens', () => {
        expect(relDe('<a href="https://exemplo.test" target="doc" rel="nofollow">ir</a>'))
            .toBe('nofollow noopener noreferrer');
        expect(relDe('<a href="https://exemplo.test" target="doc" rel="NoOpener">ir</a>'))
            .toBe('NoOpener noreferrer');
    });

    it('_self, _top, _parent e target vazio ficam como estão', () => {
        for (const target of ['_self', '_SELF', '_top', '_parent', '']) {
            expect(relDe(`<a href="https://exemplo.test" target="${target}">ir</a>`)).toBeNull();
            expect(relDe(`<a href="https://exemplo.test" target="${target}" rel="nofollow">ir</a>`)).toBe('nofollow');
        }
        expect(relDe('<a href="https://exemplo.test">ir</a>')).toBeNull();
    });

    it('entrada nula ou vazia vira string vazia, nunca "null"', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml(undefined)).toBe('');
        expect(sanitizeHtml('')).toBe('');
    });
});

/**
 * Resto do F70 (varredura de 15/11/2026): `style` passa no DOMPurify sem que
 * ele leia o CSS, e `background-image:url(https://…)` faz o navegador de quem
 * ABRE a aula/o modelo/a ajuda buscar o endereço — o autor fica sabendo quem
 * abriu, quando e de que IP. O helper tira a DECLARAÇÃO que busca recurso e
 * mantém as outras.
 */
describe('sanitizeHtml · style não busca recurso externo (rastreio por url())', () => {
    /** `style` do primeiro elemento que casa com o seletor — `null` se não houver. */
    const styleDe = (html: string, seletor = '[data-alvo], p, div, span, td, li, a'): string | null => {
        const div = document.createElement('div');
        div.innerHTML = sanitizeHtml(html);
        return div.querySelector(seletor)?.getAttribute('style') ?? null;
    };

    it('tira background-image:url(https://…) e mantém o texto', () => {
        const limpo = sanitizeHtml('<div style="background-image:url(https://rastreio.test/p.gif)">Aula 1</div>');
        expect(limpo).not.toContain('rastreio.test');
        expect(limpo).toContain('Aula 1');
    });

    it('tira só a declaração com url(); as outras ficam', () => {
        const style = styleDe('<p style="color:red; background:url(\'https://rastreio.test/a\') no-repeat; font-weight:bold">x</p>');
        expect(style).not.toBeNull();
        expect(style).not.toContain('rastreio.test');
        expect(style).toContain('color:red');
        expect(style).toContain('font-weight:bold');
    });

    it('style que só tinha url() sai sem o atributo', () => {
        expect(styleDe('<span style="background:url(https://rastreio.test/x)">x</span>')).toBeNull();
    });

    it.each([
        ['image-set', 'background-image:image-set("https://rastreio.test/a.png" 1x)'],
        ['-webkit-image-set', 'background-image:-webkit-image-set(url(https://rastreio.test/a.png) 1x)'],
        ['cursor', 'cursor:url(https://rastreio.test/c.cur), auto'],
        ['list-style-image', 'list-style-image:url(https://rastreio.test/b.png)'],
        ['list-style (atalho)', 'list-style:square url(https://rastreio.test/b.png)'],
        ['border-image', 'border-image:url(https://rastreio.test/b.png) 30 round'],
        ['content', 'content:url(https://rastreio.test/c.png)'],
        ['mask', 'mask-image:url(https://rastreio.test/m.svg)'],
        ['@import', '@import url(https://rastreio.test/x.css)'],
        ['caixa alta', 'BACKGROUND:URL(https://rastreio.test/x)'],
        ['espaço antes do parêntese', 'background:url (https://rastreio.test/x)'],
        ['escape hexadecimal', 'background:\\75 rl(https://rastreio.test/x)'],
        ['escape de letra', 'background:u\\rl(https://rastreio.test/x)'],
        ['comentário no meio', 'background:ur/**/l(https://rastreio.test/x)'],
        ['propriedade customizada', '--fundo:url(https://rastreio.test/x)'],
        ['protocolo relativo', 'background:url(//rastreio.test/x)'],
        ['data: (hoje sem uso nos modelos)', 'background:url(data:image/png;base64,iVBORw0KGgo=)'],
    ])('tira %s', (_nome, declaracao) => {
        const html = `<div data-alvo style="color:blue; ${declaracao.replace(/"/g, '&quot;')}">x</div>`;
        const limpo = sanitizeHtml(html);
        expect(limpo).not.toContain('rastreio.test');
        expect(limpo).not.toContain('base64');
        expect(styleDe(html, '[data-alvo], div')).toBe('color:blue');
    });

    it('";" dentro de aspas não esconde a declaração com url()', () => {
        const style = styleDe('<p style=\'font-family:"a;b"; background:url(https://rastreio.test/x)\'>x</p>');
        expect(style).toBe('font-family:"a;b"');
    });

    it('aspas sem fechar engolem o resto — e o resto com url() sai junto', () => {
        const limpo = sanitizeHtml('<p style=\'color:red; font-family:"a; background:url(https://rastreio.test/x)\'>x</p>');
        expect(limpo).not.toContain('rastreio.test');
        expect(styleDe('<p style=\'color:red; font-family:"a; background:url(https://rastreio.test/x)\'>x</p>')).toBe('color:red');
    });
});

describe('sanitizeHtml · preserva o conteúdo legítimo', () => {
    it('style sem url() sai idêntico, byte a byte', () => {
        const div = document.createElement('div');
        const style = 'width:50%;  text-align: center ;font-family: "Times New Roman", serif; border:1px solid #000;';
        div.innerHTML = sanitizeHtml(`<table><tr><td style='${style}'>Cláusula</td></tr></table>`);
        expect(div.querySelector('td')?.getAttribute('style')).toBe(style);
    });

    it('mantém formatação de texto de aula', () => {
        const original = '<p><strong>Importante</strong>: leia o <em>manual</em>.</p><ul><li>um</li><li>dois</li></ul>';
        const limpo = sanitizeHtml(original);
        expect(limpo).toContain('<strong>');
        expect(limpo).toContain('<em>');
        expect(limpo).toContain('<li>');
        expect(limpo).toContain('Importante');
    });

    it('mantém tabela e estilo inline — template de contrato depende disso', () => {
        const original = '<table border="1"><tr><td style="width:50%" colspan="2">Cláusula</td></tr></table>';
        const limpo = sanitizeHtml(original);
        expect(limpo).toContain('<table');
        expect(limpo).toContain('colspan');
        expect(limpo).toContain('style');
        expect(limpo).toContain('Cláusula');
    });

    it('mantém link http e imagem https', () => {
        const limpo = sanitizeHtml('<a href="https://exemplo.test">site</a><img src="https://exemplo.test/a.png">');
        expect(limpo).toContain('https://exemplo.test');
        expect(limpo).toContain('<img');
    });

    it('preserva acentuação', () => {
        expect(sanitizeHtml('<p>Instalação e manutenção da fundação</p>'))
            .toContain('Instalação e manutenção da fundação');
    });
});
