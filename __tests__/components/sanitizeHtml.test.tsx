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

    it('entrada nula ou vazia vira string vazia, nunca "null"', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml(undefined)).toBe('');
        expect(sanitizeHtml('')).toBe('');
    });
});

describe('sanitizeHtml · preserva o conteúdo legítimo', () => {
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
