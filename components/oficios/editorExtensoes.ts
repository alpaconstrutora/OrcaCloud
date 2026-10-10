import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Nós próprios do editor de documentos (Documentos › Ofícios). O que eles
 * gravam no JSON é exatamente o que `services/docGen/motorRender.ts` lê:
 *   variavel     { chave }         inline, atômico
 *   campoLivre   { nome, rotulo }  bloco, atômico
 *   assinaturas  —                 bloco, atômico
 *   anexos       —                 bloco, atômico
 *   condicional  { expressao }     bloco COM conteúdo (F6) — o conteúdo só entra se a condição valer
 *   tabelaDinamica { fonte }       bloco, atômico (F6) — tabela montada do documento
 *
 * Nenhum deles usa `innerHTML`: o TipTap monta o DOM a partir de `renderHTML`,
 * e o texto do chip é um filho string — não há sink de XSS aqui
 * (`scripts/check-xss-sinks.sh`).
 */

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        variavel: { inserirVariavel: (chave: string) => ReturnType };
        campoLivre: { inserirCampoLivre: (nome: string, rotulo: string) => ReturnType };
        assinaturas: { inserirAssinaturas: () => ReturnType };
        anexos: { inserirAnexos: () => ReturnType };
        condicional: {
            /** Envolve os blocos selecionados numa condição (sem seleção: um parágrafo novo). */
            inserirCondicional: (expressao: string) => ReturnType;
            definirCondicao: (expressao: string) => ReturnType;
        };
        tabelaDinamica: { inserirTabelaDinamica: (fonte: string, rotulo?: string) => ReturnType };
    }
}

export const Variavel = Node.create({
    name: 'variavel',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return { chave: { default: '' } };
    },

    parseHTML() {
        return [{
            tag: 'span[data-variavel]',
            getAttrs: el => ({ chave: (el as HTMLElement).getAttribute('data-variavel') ?? '' }),
        }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const chave = String(node.attrs.chave ?? '');
        return ['span', mergeAttributes(HTMLAttributes, {
            'data-variavel': chave,
            class: 'variavel-chip',
            title: chave,
            contenteditable: 'false',
        }), `{{${chave}}}`];
    },

    renderText({ node }) {
        return `{{${String(node.attrs.chave ?? '')}}}`;
    },

    addCommands() {
        return {
            inserirVariavel: (chave: string) => ({ commands }) =>
                commands.insertContent({ type: this.name, attrs: { chave } }),
        };
    },
});

export const CampoLivre = Node.create({
    name: 'campoLivre',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        return { nome: { default: 'conteudo' }, rotulo: { default: 'Conteúdo' } };
    },

    parseHTML() {
        return [{
            tag: 'div[data-campo-livre]',
            getAttrs: el => ({
                nome: (el as HTMLElement).getAttribute('data-campo-livre') ?? 'conteudo',
                rotulo: (el as HTMLElement).getAttribute('data-rotulo') ?? 'Conteúdo',
            }),
        }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const nome = String(node.attrs.nome ?? '');
        const rotulo = String(node.attrs.rotulo ?? nome);
        return ['div', mergeAttributes(HTMLAttributes, {
            'data-campo-livre': nome,
            'data-rotulo': rotulo,
            class: 'campo-livre-bloco',
            contenteditable: 'false',
        }), `Campo livre: ${rotulo} ({{${nome}}})`];
    },

    renderText({ node }) {
        return `[[${String(node.attrs.rotulo ?? node.attrs.nome ?? '')}]]`;
    },

    addCommands() {
        return {
            inserirCampoLivre: (nome: string, rotulo: string) => ({ commands }) =>
                commands.insertContent([{ type: this.name, attrs: { nome, rotulo } }, { type: 'paragraph' }]),
        };
    },
});

function blocoFixo(nome: 'assinaturas' | 'anexos', rotulo: string, comando: 'inserirAssinaturas' | 'inserirAnexos') {
    return Node.create({
        name: nome,
        group: 'block',
        atom: true,
        selectable: true,
        draggable: true,

        parseHTML() {
            return [{ tag: `div[data-bloco="${nome}"]` }];
        },

        renderHTML({ HTMLAttributes }) {
            return ['div', mergeAttributes(HTMLAttributes, {
                'data-bloco': nome,
                class: 'bloco-fixo',
                contenteditable: 'false',
            }), rotulo];
        },

        renderText() {
            return `[[${nome}]]`;
        },

        addCommands() {
            return {
                [comando]: () => ({ commands }) =>
                    commands.insertContent([{ type: nome }, { type: 'paragraph' }]),
            } as Record<string, () => ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) => boolean>;
        },
    });
}

export const Assinaturas = blocoFixo('assinaturas', 'Bloco de assinaturas (os signatários do documento)', 'inserirAssinaturas');
export const Anexos = blocoFixo('anexos', 'Lista de anexos (numerada automaticamente)', 'inserirAnexos');

export const Condicional = Node.create({
    name: 'condicional',
    group: 'block',
    content: 'block+',
    defining: true,

    addAttributes() {
        return { expressao: { default: '' } };
    },

    parseHTML() {
        return [{
            tag: 'div[data-condicional]',
            contentElement: 'div[data-condicional-conteudo]',
            getAttrs: el => ({ expressao: (el as HTMLElement).getAttribute('data-condicional') ?? '' }),
        }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const expressao = String(node.attrs.expressao ?? '');
        return ['div', mergeAttributes(HTMLAttributes, { 'data-condicional': expressao, class: 'condicional-bloco' }),
            ['span', { class: 'condicional-rotulo', contenteditable: 'false' }, `Se: ${expressao || '(sem condição)'}`],
            ['div', { 'data-condicional-conteudo': '' }, 0]];
    },

    addCommands() {
        return {
            inserirCondicional: (expressao: string) => ({ state, commands }) => {
                if (state.selection.empty) {
                    return commands.insertContent({ type: this.name, attrs: { expressao }, content: [{ type: 'paragraph' }] });
                }
                return commands.wrapIn(this.name, { expressao });
            },
            definirCondicao: (expressao: string) => ({ commands }) => commands.updateAttributes(this.name, { expressao }),
        };
    },
});

export const TabelaDinamica = Node.create({
    name: 'tabelaDinamica',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        return { fonte: { default: '' }, rotulo: { default: '' } };
    },

    parseHTML() {
        return [{
            tag: 'div[data-tabela-dinamica]',
            getAttrs: el => ({
                fonte: (el as HTMLElement).getAttribute('data-tabela-dinamica') ?? '',
                rotulo: (el as HTMLElement).getAttribute('data-rotulo') ?? '',
            }),
        }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const fonte = String(node.attrs.fonte ?? '');
        const rotulo = String(node.attrs.rotulo || fonte);
        return ['div', mergeAttributes(HTMLAttributes, {
            'data-tabela-dinamica': fonte,
            'data-rotulo': rotulo,
            class: 'bloco-fixo tabela-dinamica-bloco',
            contenteditable: 'false',
        }), `Tabela do documento: ${rotulo}`];
    },

    renderText({ node }) {
        return `[[tabela: ${String(node.attrs.fonte ?? '')}]]`;
    },

    addCommands() {
        return {
            inserirTabelaDinamica: (fonte: string, rotulo?: string) => ({ commands }) =>
                commands.insertContent([{ type: this.name, attrs: { fonte, rotulo: rotulo ?? fonte } }, { type: 'paragraph' }]),
        };
    },
});
