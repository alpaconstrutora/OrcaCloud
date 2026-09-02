import * as DOMPurifyModule from 'dompurify';

/**
 * O pacote `dompurify` publica três builds (ESM, CJS e UMD) e cada
 * empacotador resolve um. O ESM exporta a instância pronta; o CJS, passando
 * pelo interop, chega como `{ default: instancia }` — e às vezes aninhado mais
 * uma vez. Em algumas resoluções vem a FÁBRICA `createDOMPurify`, que precisa
 * receber a `window`.
 *
 * Sem este desembrulho, o Vite (browser) funciona e o Vitest quebra com
 * "default.sanitize is not a function" — ou o contrário, dependendo da versão.
 * Resolver isso aqui, uma vez, evita descobrir a diferença em produção.
 */
type Purify = { sanitize: (s: string, cfg?: unknown) => string; addHook?: (...a: unknown[]) => void };

let instancia: Purify | null = null;

function resolverDOMPurify(): Purify {
    if (instancia) return instancia;

    let candidato: any = DOMPurifyModule;
    for (let i = 0; i < 4; i++) {
        if (candidato && typeof candidato.sanitize === 'function') break;
        if (typeof candidato === 'function') {
            // É a fábrica `createDOMPurify`: precisa da window.
            if (typeof window === 'undefined') {
                throw new Error(
                    'sanitizeHtml: DOMPurify precisa de DOM. Em teste, use o docblock ' +
                    '`// @vitest-environment jsdom` no topo do arquivo.',
                );
            }
            candidato = candidato(window);
            continue;
        }
        candidato = candidato?.default;
    }

    if (!candidato || typeof candidato.sanitize !== 'function') {
        throw new Error('sanitizeHtml: nenhuma variante do dompurify expôs .sanitize()');
    }

    // `target="_blank"` sem `rel="noopener"` deixa a página aberta manipular a
    // origem por `window.opener`. DOMPurify não faz isso sozinho.
    if (typeof candidato.addHook === 'function') {
        candidato.addHook('afterSanitizeAttributes', (node: Element) => {
            if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
                node.setAttribute('rel', 'noopener noreferrer');
            }
        });
    }

    instancia = candidato as Purify;
    return instancia;
}

/**
 * Sanitização de HTML — ponto único do projeto.
 *
 * ─── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * Achados C5-01, C5-02 e C5-04 da auditoria de 2026-09-01. Até 2026-09-02 o
 * projeto **não tinha nenhuma biblioteca de sanitização** — nem DOMPurify, nem
 * helper próprio de escape — e mesmo assim injetava HTML vindo do banco em
 * quatro lugares.
 *
 * O que torna isso grave não é o `dangerouslySetInnerHTML` em si, é de ONDE vem
 * o HTML. As duas tabelas que alimentam os sinks têm policy de escrita
 * `is_org_member(...)`:
 *
 *   • `academy_lessons.conteudo_html` → renderizado para TODO colaborador
 *     matriculado que abrir a aula, incluindo owners e admins.
 *   • `contract_templates.body_html`  → injetado via `innerHTML` na geração do
 *     PDF do contrato, no contexto de quem gera (financeiro/admin).
 *
 * Ou seja: o membro de papel MAIS BAIXO da organização escreve HTML que roda na
 * sessão de um administrador. O token do Supabase é acessível ao JavaScript da
 * página, então o desfecho é sequestro de sessão privilegiada — escalada de
 * privilégio dentro do próprio tenant.
 *
 * ─── Detalhe que engana ──────────────────────────────────────────────────────
 *
 * `innerHTML` **não** executa `<script>`. Isso leva muita gente a achar que o
 * caso do PDF era inofensivo. Mas ele executa handlers: `<img src=x onerror=…>`
 * e `<svg onload=…>` disparam normalmente. E, no ContractDetailView, o elemento
 * fica fora da tela (`left:-9999px`), então a vítima não vê nada acontecer.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────
 *
 * Todo HTML que vier do banco passa por aqui antes de virar
 * `dangerouslySetInnerHTML` ou `.innerHTML`. `scripts/check-xss-sinks.sh` falha
 * o build se aparecer sink novo sem esta função.
 */

/**
 * Tags de conteúdo. A lista é de ALLOW: o que não está aqui é removido.
 * Deliberadamente ausentes: `script`, `iframe`, `object`, `embed`, `form`,
 * `input`, `style` e `link` — nenhuma delas tem uso legítimo num texto de aula
 * ou num corpo de contrato, e todas ampliam a superfície.
 */
const TAGS_PERMITIDAS = [
    'p', 'br', 'hr', 'div', 'span', 'section', 'article',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'a', 'img', 'figure', 'figcaption',
];

/**
 * Atributos permitidos. `style` entra porque template de contrato e aula usam
 * formatação inline de verdade; DOMPurify já filtra o conteúdo do style contra
 * `expression()` e afins. Nenhum `on*` está aqui — e a config abaixo os proíbe
 * explicitamente, para o caso de alguém acrescentar um por engano.
 */
const ATRIBUTOS_PERMITIDOS = [
    'href', 'src', 'alt', 'title', 'width', 'height',
    'class', 'style', 'align', 'valign',
    'colspan', 'rowspan', 'border', 'cellpadding', 'cellspacing',
    'target', 'rel',
];

const CONFIG: Record<string, unknown> = {
    ALLOWED_TAGS: TAGS_PERMITIDAS,
    ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
    // ⚠️ NÃO defina `ALLOWED_URI_REGEXP` aqui.
    //
    // Parece o lugar natural de restringir esquemas de URL, mas o DOMPurify
    // aplica esse regex ao valor de TODO atributo, não só aos de URI. Com um
    // regex de URL, `colspan="2"` e `border="1"` reprovam e são removidos —
    // ou seja, todo template de contrato com tabela perderia a formatação, em
    // silêncio. Descoberto pelos testes de preservação, não pelos de ataque.
    //
    // O default do DOMPurify já bloqueia `javascript:`, `data:` e `vbscript:`
    // (os testes deste helper cobrem os três) e é muito mais testado que
    // qualquer regex escrito aqui.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onanimationstart', 'formaction'],
    // Sem `srcdoc`, sem elementos customizados.
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: true,
};

/**
 * Limpa HTML vindo do banco. Devolve string vazia para entrada nula.
 *
 * Use SEMPRE que o HTML não tiver sido escrito nesta base de código.
 */
export function sanitizeHtml(sujo: string | null | undefined): string {
    if (!sujo) return '';
    return resolverDOMPurify().sanitize(String(sujo), CONFIG);
}

export default sanitizeHtml;
