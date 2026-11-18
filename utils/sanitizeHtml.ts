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

/** Elementos cujo `target` navega outra janela. Hoje só `a` passa na allowlist. */
const TAGS_COM_TARGET = new Set(['A', 'AREA', 'FORM']);

/** Targets que ficam na própria aba — não expõem `window.opener`. */
const TARGETS_MESMA_ABA = new Set(['', '_self', '_top', '_parent']);

/**
 * Funções de CSS que fazem o navegador BUSCAR um recurso: `url()` (vale para
 * `background`, `cursor`, `list-style`, `border-image`, `content`, `mask`,
 * propriedade customizada…), `image-set()`/`-webkit-image-set()`, `image()`,
 * `cross-fade()`, `element()`, `src()` — mais `@import` e o `expression()`
 * do IE antigo. Lido sobre a declaração já normalizada (`cssNormalizado`).
 *
 * Errar para o lado de tirar é barato: o `\s*` antes do parêntese pega também
 * `url (…)`, que o navegador nem lê como função. Não há uso legítimo de nada
 * disso nos textos que passam por aqui — contado no banco em 18/11/2026:
 * nenhuma ocorrência de `url(`, `image-set` ou `@import` em
 * contract_templates, academy_lessons, portal_help_items e dunning_rules.
 * Por isso `url(data:…)` também sai: não busca nada pela rede, mas não tem quem
 * use, e abrir exceção é mais um caminho para errar.
 */
const CSS_QUE_BUSCA_RECURSO = /(?:url|image-set|image|cross-fade|element|src|expression)\s*\(|@import/;

/**
 * Lê a declaração como o navegador lê o NOME de uma função: sem comentários e
 * com os escapes resolvidos (`\75 rl(` e `u\rl(` são `url(`), em minúsculas.
 * Tirar o comentário junta `ur/**\/l(` em `url(` — que o navegador NÃO lê como
 * função; a leitura aqui é mais desconfiada que a dele, de propósito.
 */
function cssNormalizado(declaracao: string): string {
    return declaracao
        .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
        .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_m, hex: string) => {
            const cp = parseInt(hex, 16);
            return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : String.fromCharCode(0xfffd);
        })
        .replace(/\\([\s\S])/g, '$1')
        .toLowerCase();
}

/**
 * Parte o `style` nas declarações, no `;` de fora de aspas, parênteses e
 * comentários — `font-family:"a;b"` é UMA declaração. Aspas ou comentário sem
 * fechar engolem o resto do texto numa declaração só (e, se o resto tiver
 * `url(`, ele sai inteiro).
 */
function declaracoesDoStyle(style: string): string[] {
    const partes: string[] = [];
    let atual = '';
    let aspas: string | null = null;
    let profundidade = 0;
    for (let i = 0; i < style.length; i++) {
        const c = style[i];
        if (c === '\\') {
            atual += c + (style[i + 1] ?? '');
            i++;
            continue;
        }
        if (aspas) {
            atual += c;
            if (c === aspas) aspas = null;
            continue;
        }
        if (c === '/' && style[i + 1] === '*') {
            const fim = style.indexOf('*/', i + 2);
            const ate = fim < 0 ? style.length : fim + 2;
            atual += style.slice(i, ate);
            i = ate - 1;
            continue;
        }
        if (c === '"' || c === "'") aspas = c;
        else if (c === '(') profundidade++;
        else if (c === ')' && profundidade > 0) profundidade--;
        else if (c === ';' && profundidade === 0) {
            partes.push(atual);
            atual = '';
            continue;
        }
        atual += c;
    }
    partes.push(atual);
    return partes;
}

/**
 * O `style` sem as declarações que buscam recurso pela rede.
 *
 * Por que importa (resto do F70, varredura de 15/11/2026): o DOMPurify NÃO lê
 * o conteúdo do `style`. `<div style="background-image:url(https://…)">` numa
 * aula, num modelo de contrato ou na ajuda do portal faz o navegador de quem
 * ABRE buscar o endereço — o autor (um membro de papel baixo, ou quem escreve a
 * ajuda) fica sabendo quem abriu, quando e de que IP. O `HtmlSanitizado` contém
 * a camada de tela inteira, mas não impede a requisição.
 *
 * Devolve o texto ORIGINAL, idêntico, quando não há o que tirar (modelos
 * legítimos não mudam nem de espaço); `null` quando não sobra declaração.
 */
export function styleSemRecursoExterno(style: string): string | null {
    const partes = declaracoesDoStyle(style);
    const mantidas = partes.filter((p) => !CSS_QUE_BUSCA_RECURSO.test(cssNormalizado(p)));
    if (mantidas.length === partes.length) return style;
    const texto = mantidas.map((p) => p.trim()).filter(Boolean).join('; ');
    return texto || null;
}

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

    // Os dois ganchos abaixo são proteção, não enfeite: sem `addHook`, o HTML
    // sairia com `url()` no style e `target` sem noopener. Todas as builds do
    // DOMPurify 3 expõem `addHook`; se um dia faltar, falha alto aqui em vez de
    // sanitizar pela metade em silêncio.
    if (typeof candidato.addHook !== 'function') {
        throw new Error('sanitizeHtml: a variante do dompurify não expôs .addHook()');
    }

    // `style` que busca recurso pela rede (resto do F70, rastreio de quem abre):
    // sai a declaração, ficam as outras. Ver `styleSemRecursoExterno`.
    candidato.addHook('afterSanitizeAttributes', (node: Element) => {
        if (typeof node.getAttribute !== 'function') return;
        const style = node.getAttribute('style');
        if (style === null) return;
        const limpo = styleSemRecursoExterno(style);
        if (limpo === null) node.removeAttribute('style');
        else if (limpo !== style) node.setAttribute('style', limpo);
    });

    // `target="_blank"` sem `rel="noopener"` deixa a página aberta manipular a
    // origem por `window.opener`. DOMPurify não faz isso sozinho.
    //
    // E não é só `_blank`: QUALQUER target que abra ou reaproveite outra janela
    // (`target="doc"`, `target="_BLANK"`, `target=" _blank"`) entrega o
    // `window.opener` — e o navegador só aplica o noopener implícito ao `_blank`
    // exato, que `rel="opener"` ainda desliga. Só `_self`/`_top`/`_parent` e o
    // vazio ficam na mesma aba. A comparação é sem caixa e sobre o valor JÁ
    // aparado: o DOMPurify apara o atributo e regrava antes deste hook, então o
    // que se compara aqui é exatamente o target que vai para o navegador (que
    // não apara — por isso não se apara de novo aqui).
    candidato.addHook('afterSanitizeAttributes', (node: Element) => {
        if (!TAGS_COM_TARGET.has(node.tagName)) return;
        const target = node.getAttribute('target');
        if (target === null) return;
        if (target === '_blank') {
            // Caso histórico: saída mantida idêntica.
            node.setAttribute('rel', 'noopener noreferrer');
            return;
        }
        if (TARGETS_MESMA_ABA.has(target.toLowerCase())) return;
        // Acrescenta sem apagar os tokens que o autor já pôs (`nofollow`...).
        // `noopener`/`noreferrer` prevalecem sobre `opener` pela spec.
        const tokens = (node.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean);
        const presentes = new Set(tokens.map((t) => t.toLowerCase()));
        for (const obrigatorio of ['noopener', 'noreferrer']) {
            if (!presentes.has(obrigatorio)) tokens.push(obrigatorio);
        }
        node.setAttribute('rel', tokens.join(' '));
    });

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
 * Todo HTML que vier do banco entra no DOM por `components/ui/HtmlSanitizado.tsx`
 * (`<HtmlSanitizado>` ou `preencherComHtmlSanitizado`), que chama esta função E
 * contém o resultado (`contain: paint` + `overflow: auto`, achado F70).
 * `scripts/check-xss-sinks.sh` (CI e build do Vercel) recusa qualquer
 * `dangerouslySetInnerHTML` / `.innerHTML =` fora daquele arquivo — chamar
 * `sanitizeHtml()` direto num sink deixou de bastar.
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
 * formatação inline de verdade. O DOMPurify NÃO lê o conteúdo do `style` — passa
 * o texto como veio. Por isso duas defesas de fora dele: o gancho
 * `styleSemRecursoExterno` (acima) tira a declaração que busca recurso pela
 * rede (`url()`, `image-set()`, `@import`…), e o `HtmlSanitizado` contém o que
 * sobra (camada `position:fixed` de tela inteira fica presa no quadro). Nenhum
 * `on*` está aqui — e a config abaixo os proíbe explicitamente, para o caso de
 * alguém acrescentar um por engano.
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
    // O default do DOMPurify já bloqueia `javascript:` e `vbscript:`, e `data:`
    // fora das tags de mídia (`<a href="data:…">` sai; `<img src="data:…">`
    // fica, e é seguro — os testes deste helper cobrem os casos) e é muito mais
    // testado que qualquer regex escrito aqui.
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
