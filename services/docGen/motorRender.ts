import type { Column, Content, ContentColumns, ContentText, TDocumentDefinitions, Alignment } from 'pdfmake/interfaces';
import type { DocTipTap, LayoutModelo, NoTipTap } from '../../types/docGen';
import { chavesNoTexto, substituirVariaveis } from './variaveis';

/**
 * Motor de render: documento TipTap + valores das variáveis + layout →
 * `docDefinition` do pdfmake. PURO e determinístico: o mesmo input dá o mesmo
 * JSON (o teste `docGenMotorRender.test.ts` garante). Não importa pdfmake em
 * runtime — só os tipos — para poder rodar em qualquer lugar (vitest/node).
 *
 * Nós que o editor acrescenta ao TipTap padrão:
 *   - `variavel`   (inline, atom)  attrs { chave }         → valor ou `[[chave]]` pendente
 *   - `campoLivre` (block,  atom)  attrs { nome, rotulo }  → conteúdo digitado no documento
 *   - `assinaturas`(block,  atom)                          → bloco com os signatários
 *   - `anexos`     (block,  atom)                          → "Anexos" numerados
 */

export interface AssinaturaRender {
    nome: string;
    cargo?: string | null;
    registroProfissional?: string | null;
    imagemDataUrl?: string | null;
    /** F4: quando assinou eletronicamente (texto já formatado, "10/10/2026 14:32"). Sem ele, só a linha. */
    assinadoEm?: string | null;
}

export interface EntradaRender {
    conteudo: DocTipTap;
    layout: LayoutModelo;
    /** chave → valor. Ausente ou vazio = pendente, impresso como `[[chave]]`. */
    valores: Record<string, string | undefined>;
    /** nome do campo livre → documento TipTap digitado (ou null, ainda não escrito). */
    camposLivres?: Record<string, DocTipTap | null | undefined>;
    assinaturas?: AssinaturaRender[];
    anexos?: string[];
    logoDataUrl?: string | null;
    titulo?: string;
    /** F5: bloco de autenticidade no fim do texto — QR Code + endereço da validação pública. */
    validacao?: { url: string } | null;
    /** F5: anexos do GED DENTRO do PDF — páginas já rasterizadas, uma por imagem, depois do texto. */
    paginasAnexas?: AnexoRasterizado[] | null;
}

/** Um anexo pronto para entrar no PDF: título e as páginas como imagem (data URL). */
export interface AnexoRasterizado {
    titulo: string;
    paginas: { dataUrl: string; largura: number; altura: number }[];
    /** Arquivo que não vira imagem (ex.: .docx) — entra só uma página dizendo onde consultar. */
    aviso?: string | null;
}

// ─── Unidades e cores ──────────────────────────────────────────────────────────
/** 1 mm = 72/25.4 pt. */
export const mmParaPt = (mm: number): number => Math.round((mm * 72) / 25.4 * 100) / 100;

const A4 = { largura: 595.28, altura: 841.89 };
const COR_PENDENTE = '#b45309';
const FUNDO_PENDENTE = '#fef3c7';
const COR_LINK = '#1d4ed8';
const COR_TEXTO = '#111827';
const COR_SUAVE = '#6b7280';
const ALTURA_CABECALHO_MM = 22;
const ALTURA_RODAPE_MM = 14;

// ─── Variáveis usadas pelo modelo ──────────────────────────────────────────────
function percorrer(no: NoTipTap | undefined, visita: (n: NoTipTap) => void): void {
    if (!no) return;
    visita(no);
    no.content?.forEach(filho => percorrer(filho, visita));
}

/** Chaves de variável que o modelo usa (nós + cabeçalho + rodapé), sem repetição. */
export function chavesDoModelo(conteudo: DocTipTap, layout?: LayoutModelo): string[] {
    const chaves = new Set<string>();
    percorrer(conteudo, n => {
        if (n.type === 'variavel' && typeof n.attrs?.chave === 'string') chaves.add(n.attrs.chave);
    });
    if (layout?.cabecalho.mostrar) chavesNoTexto(layout.cabecalho.texto).forEach(c => chaves.add(c));
    if (layout?.rodape.mostrar) chavesNoTexto(layout.rodape.texto).forEach(c => chaves.add(c));
    return [...chaves];
}

/** Campos livres declarados no modelo, na ordem em que aparecem. */
export function camposLivresDoModelo(conteudo: DocTipTap): { nome: string; rotulo: string }[] {
    const out: { nome: string; rotulo: string }[] = [];
    const vistos = new Set<string>();
    percorrer(conteudo, n => {
        if (n.type !== 'campoLivre') return;
        const nome = String(n.attrs?.nome ?? '').trim();
        if (!nome || vistos.has(nome)) return;
        vistos.add(nome);
        out.push({ nome, rotulo: String(n.attrs?.rotulo ?? nome) });
    });
    return out;
}

/** O modelo tem um bloco de assinaturas / de anexos? (para o validador e o preview) */
export function modeloTem(conteudo: DocTipTap, tipo: 'assinaturas' | 'anexos'): boolean {
    let achou = false;
    percorrer(conteudo, n => { if (n.type === tipo) achou = true; });
    return achou;
}

// ─── Conversão de nós ──────────────────────────────────────────────────────────
interface Estado {
    e: EntradaRender;
    /** Tamanho-base do corpo, para derivar títulos. */
    base: number;
}

const alinhamento = (attrs?: Record<string, unknown>): Alignment | undefined => {
    const a = attrs?.textAlign;
    return a === 'left' || a === 'center' || a === 'right' || a === 'justify' ? a : undefined;
};

function textoDaVariavel(chave: string, st: Estado): ContentText {
    const v = st.e.valores[chave];
    if (v && v.trim()) return { text: v };
    return { text: `[[${chave}]]`, color: COR_PENDENTE, background: FUNDO_PENDENTE };
}

/** Inlines de um parágrafo → array de `ContentText` (ou string vazia). */
function inlines(nos: NoTipTap[] | undefined, st: Estado): Array<ContentText | string> {
    const out: Array<ContentText | string> = [];
    for (const n of nos ?? []) {
        if (n.type === 'text') {
            const t: ContentText = { text: n.text ?? '' };
            for (const m of n.marks ?? []) {
                if (m.type === 'bold') t.bold = true;
                else if (m.type === 'italic') t.italics = true;
                else if (m.type === 'underline') t.decoration = 'underline';
                else if (m.type === 'strike') t.decoration = 'lineThrough';
                else if (m.type === 'link' && typeof m.attrs?.href === 'string') {
                    t.link = m.attrs.href;
                    t.color = COR_LINK;
                    t.decoration = 'underline';
                }
            }
            out.push(t);
        } else if (n.type === 'variavel') {
            const chave = String(n.attrs?.chave ?? '');
            const t = textoDaVariavel(chave, st);
            // Marcas aplicadas ao nó (negrito no número do ofício, por exemplo).
            for (const m of n.marks ?? []) {
                if (m.type === 'bold') t.bold = true;
                else if (m.type === 'italic') t.italics = true;
                else if (m.type === 'underline') t.decoration = 'underline';
            }
            out.push(t);
        } else if (n.type === 'hardBreak') {
            out.push('\n');
        }
    }
    return out.length ? out : [''];
}

function paragrafo(n: NoTipTap, st: Estado, extra?: Partial<ContentText>): ContentText {
    return {
        text: inlines(n.content, st),
        alignment: alinhamento(n.attrs),
        margin: [0, 0, 0, st.e.layout.espacoParagrafo],
        ...extra,
    };
}

function titulo(n: NoTipTap, st: Estado): ContentText {
    const nivel = Number(n.attrs?.level ?? 1);
    const fator = nivel <= 1 ? 1.5 : nivel === 2 ? 1.25 : 1.1;
    return paragrafo(n, st, { bold: true, fontSize: Math.round(st.base * fator * 10) / 10, margin: [0, st.e.layout.espacoParagrafo, 0, st.e.layout.espacoParagrafo] });
}

function itemDeLista(n: NoTipTap, st: Estado): Content {
    const blocos = (n.content ?? []).map(f => bloco(f, st)).filter((b): b is Content => b !== null);
    // Um parágrafo só → o próprio texto, para o marcador alinhar com a primeira linha.
    if (blocos.length === 1) return blocos[0];
    return { stack: blocos };
}

function tabela(n: NoTipTap, st: Estado): Content {
    const linhas = (n.content ?? []).filter(r => r.type === 'tableRow');
    const colunas = Math.max(1, ...linhas.map(r => (r.content ?? []).length));
    const body = linhas.map(r => {
        const celulas = (r.content ?? []).map(c => {
            const conteudo = (c.content ?? []).map(f => bloco(f, st)).filter((b): b is Content => b !== null);
            const cabecalho = c.type === 'tableHeader';
            const celula: Record<string, unknown> = {
                stack: conteudo.length ? conteudo : [{ text: '' }],
                margin: [2, 2, 2, 2] as [number, number, number, number],
            };
            if (cabecalho) { celula.bold = true; celula.fillColor = '#f1f5f9'; }
            const colspan = Number(c.attrs?.colspan ?? 1);
            if (colspan > 1) celula.colSpan = colspan;
            return celula as unknown as Content;
        });
        while (celulas.length < colunas) celulas.push({ text: '' });
        return celulas;
    });
    return {
        table: { widths: Array.from({ length: colunas }, () => '*'), body: body.length ? body : [[{ text: '' }]] },
        layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1',
        },
        margin: [0, 0, 0, st.e.layout.espacoParagrafo],
    };
}

function campoLivre(n: NoTipTap, st: Estado): Content {
    const nome = String(n.attrs?.nome ?? '').trim();
    const rotulo = String(n.attrs?.rotulo ?? nome);
    const doc = st.e.camposLivres?.[nome];
    if (doc && doc.content && doc.content.length) {
        const blocos = doc.content.map(f => bloco(f, st)).filter((b): b is Content => b !== null);
        return { stack: blocos.length ? blocos : [{ text: '' }] };
    }
    return {
        text: `[[${rotulo}]]`,
        italics: true,
        color: COR_PENDENTE,
        background: FUNDO_PENDENTE,
        margin: [0, 0, 0, st.e.layout.espacoParagrafo],
    };
}

function blocoAssinaturas(st: Estado): Content | null {
    const lista = st.e.assinaturas ?? [];
    if (!lista.length) {
        return { text: '[[assinaturas]]', italics: true, color: COR_PENDENTE, background: FUNDO_PENDENTE, margin: [0, 12, 0, 0] };
    }
    const colunas = lista.map((a): Column => {
        const stack: Content[] = [];
        if (a.imagemDataUrl) {
            stack.push({ image: a.imagemDataUrl, fit: [150, 50], alignment: 'center', margin: [0, 0, 0, 2] });
        } else {
            stack.push({ text: ' ', margin: [0, 0, 0, 28] });
        }
        stack.push({ canvas: [{ type: 'line', x1: 20, y1: 0, x2: 180, y2: 0, lineWidth: 0.6, lineColor: COR_TEXTO }] });
        stack.push({ text: a.nome, bold: true, alignment: 'center', margin: [0, 4, 0, 0] });
        if (a.cargo) stack.push({ text: a.cargo, alignment: 'center', color: COR_SUAVE });
        if (a.registroProfissional) stack.push({ text: a.registroProfissional, alignment: 'center', color: COR_SUAVE });
        if (a.assinadoEm) {
            stack.push({ text: `Assinado eletronicamente por ${a.nome} em ${a.assinadoEm}`, alignment: 'center', color: COR_SUAVE, fontSize: 7, italics: true, margin: [0, 3, 0, 0] });
        }
        return { stack, width: '*' };
    });
    // Até 3 por linha; mais que isso quebra em novas linhas de colunas.
    const linhas: Content[] = [];
    for (let i = 0; i < colunas.length; i += 3) {
        const grupo: ContentColumns = { columns: colunas.slice(i, i + 3), columnGap: 16, margin: [0, 18, 0, 0] };
        linhas.push(grupo);
    }
    return linhas.length === 1 ? linhas[0] : { stack: linhas };
}

function blocoAnexos(st: Estado): Content | null {
    const anexos = st.e.anexos ?? [];
    if (!anexos.length) return null;
    return {
        stack: [
            { text: 'Anexos', bold: true, margin: [0, st.e.layout.espacoParagrafo, 0, 2] },
            { ol: anexos.map(a => ({ text: a })) },
        ],
        margin: [0, 0, 0, st.e.layout.espacoParagrafo],
    };
}

function bloco(n: NoTipTap, st: Estado): Content | null {
    switch (n.type) {
        case 'paragraph': return paragrafo(n, st);
        case 'heading': return titulo(n, st);
        case 'bulletList': return { ul: (n.content ?? []).map(i => itemDeLista(i, st)), margin: [0, 0, 0, st.e.layout.espacoParagrafo] };
        case 'orderedList': return { ol: (n.content ?? []).map(i => itemDeLista(i, st)), margin: [0, 0, 0, st.e.layout.espacoParagrafo] };
        case 'listItem': return itemDeLista(n, st);
        case 'blockquote': return { stack: (n.content ?? []).map(f => bloco(f, st)).filter((b): b is Content => b !== null), margin: [20, 0, 0, st.e.layout.espacoParagrafo], color: COR_SUAVE };
        case 'horizontalRule': {
            const largura = A4.largura - mmParaPt(st.e.layout.margens.esquerda) - mmParaPt(st.e.layout.margens.direita);
            return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: largura, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }], margin: [0, 4, 0, st.e.layout.espacoParagrafo] };
        }
        case 'table': return tabela(n, st);
        case 'campoLivre': return campoLivre(n, st);
        case 'assinaturas': return blocoAssinaturas(st);
        case 'anexos': return blocoAnexos(st);
        case 'hardBreak': return { text: '\n' };
        case 'text': return { text: inlines([n], st) };
        default:
            // Nó desconhecido: renderiza o que houver dentro, sem perder texto.
            if (n.content?.length) {
                const filhos = n.content.map(f => bloco(f, st)).filter((b): b is Content => b !== null);
                return filhos.length ? { stack: filhos } : null;
            }
            return null;
    }
}

// ─── Cabeçalho e rodapé ────────────────────────────────────────────────────────
function textoComVariaveis(texto: string, st: Estado): Array<ContentText | string> {
    // `substituirVariaveis` já marca pendentes como [[chave]]; aqui só colore essas marcas.
    const substituido = substituirVariaveis(texto, st.e.valores);
    const partes = substituido.split(/(\[\[[^\]]+\]\])/g).filter(Boolean);
    return partes.map(p => /^\[\[.+\]\]$/.test(p) ? { text: p, color: COR_PENDENTE, background: FUNDO_PENDENTE } : p);
}

function cabecalho(st: Estado): Content | undefined {
    const cfg = st.e.layout.cabecalho;
    if (!cfg.mostrar) return undefined;
    const m = st.e.layout.margens;
    const texto: ContentText = {
        text: textoComVariaveis(cfg.texto, st),
        alignment: cfg.alinhamento,
        fontSize: Math.max(7, st.base - 2),
        color: COR_SUAVE,
        lineHeight: 1.1,
    };
    const colunas: Column[] = [];
    if (cfg.logo === 'organizacao' && st.e.logoDataUrl) {
        colunas.push({ image: st.e.logoDataUrl, fit: [110, 42], width: 110 });
    }
    colunas.push({ ...texto, width: '*' });
    return {
        columns: colunas,
        columnGap: 12,
        margin: [mmParaPt(m.esquerda), mmParaPt(m.superior) - 4, mmParaPt(m.direita), 0],
    };
}

function rodape(st: Estado): ((pagina: number, total: number) => Content) | undefined {
    const cfg = st.e.layout.rodape;
    if (!cfg.mostrar) return undefined;
    const m = st.e.layout.margens;
    return (pagina: number, total: number): Content => {
        const colunas: Column[] = [
            { text: textoComVariaveis(cfg.texto, st), alignment: cfg.alinhamento, width: '*' },
        ];
        if (cfg.paginacao) colunas.push({ text: `Página ${pagina} de ${total}`, alignment: 'right', width: 'auto' });
        return {
            columns: colunas,
            columnGap: 12,
            fontSize: Math.max(7, st.base - 3),
            color: COR_SUAVE,
            margin: [mmParaPt(m.esquerda), 6, mmParaPt(m.direita), 0],
        };
    };
}

// ─── Entrada principal ─────────────────────────────────────────────────────────
/** QR + endereço da validação pública. Inquebrável: o QR nunca fica numa página e o texto noutra. */
function blocoValidacao(url: string): Content {
    return {
        unbreakable: true,
        margin: [0, 18, 0, 0],
        columns: [
            { qr: url, fit: 62, width: 'auto' },
            {
                width: '*',
                margin: [10, 4, 0, 0],
                stack: [
                    { text: 'Autenticidade', bold: true, fontSize: 8, color: COR_TEXTO },
                    { text: 'Confira número, emitente, data e o hash deste PDF pelo QR Code ou em:', fontSize: 7, color: COR_SUAVE },
                    { text: url, fontSize: 7, color: COR_LINK, link: url },
                ],
            },
        ],
    } as Content;
}

/** Páginas de um anexo: cada imagem numa página, a primeira com o título do anexo. */
function paginasDoAnexo(anexo: AnexoRasterizado, largura: number, altura: number): Content[] {
    const titulo = (texto: string): Content => ({ text: texto, fontSize: 8, color: COR_SUAVE, margin: [0, 0, 0, 6], pageBreak: 'before' });
    if (!anexo.paginas.length) {
        return [titulo(anexo.titulo), { text: anexo.aviso || 'Arquivo não incorporado — consulte o anexo no GED.', fontSize: 10, color: COR_SUAVE }];
    }
    const out: Content[] = [];
    anexo.paginas.forEach((p, i) => {
        out.push(titulo(anexo.paginas.length > 1 ? `${anexo.titulo} — página ${i + 1} de ${anexo.paginas.length}` : anexo.titulo));
        out.push({ image: p.dataUrl, fit: [largura, altura], alignment: 'center' });
    });
    return out;
}

export function montarDocDefinition(e: EntradaRender): TDocumentDefinitions {
    const st: Estado = { e, base: e.layout.tamanhoFonte };
    const m = e.layout.margens;
    const topo = mmParaPt(m.superior) + (e.layout.cabecalho.mostrar ? mmParaPt(ALTURA_CABECALHO_MM) : 0);
    const base = mmParaPt(m.inferior) + (e.layout.rodape.mostrar ? mmParaPt(ALTURA_RODAPE_MM) : 0);

    const corpo = (e.conteudo.content ?? []).map(n => bloco(n, st)).filter((b): b is Content => b !== null);
    if (e.validacao?.url) corpo.push(blocoValidacao(e.validacao.url));
    const largura = A4.largura - mmParaPt(m.esquerda) - mmParaPt(m.direita);
    const altura = A4.altura - topo - base - 24;   // 24 pt: a linha de título do anexo
    for (const anexo of e.paginasAnexas ?? []) corpo.push(...paginasDoAnexo(anexo, largura, altura));

    const def: TDocumentDefinitions = {
        pageSize: 'A4',
        pageMargins: [mmParaPt(m.esquerda), topo, mmParaPt(m.direita), base],
        defaultStyle: {
            font: e.layout.fonte,
            fontSize: e.layout.tamanhoFonte,
            lineHeight: e.layout.entrelinha,
            color: COR_TEXTO,
        },
        info: { title: e.titulo ?? 'Documento', creator: 'ÒPURA', producer: 'ÒPURA' },
        content: corpo.length ? corpo : [{ text: '' }],
    };
    const cab = cabecalho(st);
    if (cab) def.header = cab;
    const rod = rodape(st);
    if (rod) def.footer = rod;
    return def;
}
