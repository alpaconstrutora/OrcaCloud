import {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HighlightColor, ImageRun, LevelFormat, Packer,
    PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, convertMillimetersToTwip,
    type FileChild, type ParagraphChild,
} from 'docx';
import type { NoTipTap } from '../../types/docGen';
import type { EntradaRender } from './motorRender';
import { avaliarCondicao } from './condicional';
import { substituirVariaveis } from './variaveis';

/**
 * Saída em Word (.docx) do motor de documentos (pedido de 10/10: "saída em
 * DOCX"). Mesma entrada do PDF (`EntradaRender`): modelo TipTap, valores,
 * layout, assinaturas, anexos, condições e tabelas dinâmicas — a cópia em Word
 * diz o mesmo que o PDF. É uma cópia EDITÁVEL: o documento oficial continua
 * sendo o PDF/A arquivado no GED com o hash (a `nota` diz isso no rodapé).
 *
 * Puro até `gerarDocx`: `montarDocx` só monta a árvore do `docx` (testável em node).
 */
export interface EntradaDocx extends EntradaRender {
    /** Linha final no rodapé ("Cópia editável do Ofício nº … — o oficial é o PDF/A, SHA-256 …"). */
    nota?: string | null;
}

const COR_PENDENTE_TEXTO = 'B45309';
const COR_SUAVE = '6B7280';
const COR_LINK = '1D4ED8';
const pt = (n: number) => Math.round(n * 20);           // ponto → twip
const meioPonto = (n: number) => Math.round(n * 2);     // ponto → meio-ponto (tamanho de fonte)

const ALINHAMENTO = {
    left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
} as const;
const alinhamento = (a?: unknown) => ALINHAMENTO[(typeof a === 'string' ? a : 'left') as keyof typeof ALINHAMENTO] ?? AlignmentType.LEFT;

// ─── Imagens (data URL → bytes + tamanho) ────────────────────────────────────

/** Largura e altura em pixels de um PNG ou JPEG (cabeçalho do arquivo). Puro. */
export function dimensoesDaImagem(b: Uint8Array): { largura: number; altura: number } | null {
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
        return { largura: v.getUint32(16), altura: v.getUint32(20) };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
        let i = 2;
        while (i + 9 < b.length) {
            if (b[i] !== 0xff) { i++; continue; }
            const marcador = b[i + 1];
            const tam = (b[i + 2] << 8) | b[i + 3];
            if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
                return { altura: (b[i + 5] << 8) | b[i + 6], largura: (b[i + 7] << 8) | b[i + 8] };
            }
            i += 2 + tam;
        }
    }
    return null;
}

interface ImagemDocx { dados: Uint8Array; tipo: 'png' | 'jpg'; largura: number; altura: number }

function imagemDeDataUrl(dataUrl: string | null | undefined): ImagemDocx | null {
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl ?? '');
    if (!m) return null;
    const bin = atob(m[2]);
    const dados = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) dados[i] = bin.charCodeAt(i);
    const d = dimensoesDaImagem(dados);
    if (!d) return null;
    return { dados, tipo: m[1].toLowerCase() === 'png' ? 'png' : 'jpg', ...d };
}

/** ImageRun cabendo na caixa (em pixels), sem distorcer. */
function imagemNaCaixa(img: ImagemDocx, maxL: number, maxA: number): ImageRun {
    const f = Math.min(maxL / img.largura, maxA / img.altura, 1);
    return new ImageRun({ type: img.tipo, data: img.dados, transformation: { width: Math.round(img.largura * f), height: Math.round(img.altura * f) } });
}

// ─── Texto ────────────────────────────────────────────────────────────────────

interface Estado { e: EntradaDocx; base: number }

const pendente = (texto: string) => new TextRun({ text: texto, italics: true, color: COR_PENDENTE_TEXTO, highlight: HighlightColor.YELLOW });

function textoDaVariavel(chave: string, st: Estado): { texto: string; pendente: boolean } {
    const v = st.e.valores[chave];
    return v && v.trim() ? { texto: v, pendente: false } : { texto: `[[${chave}]]`, pendente: true };
}

/** Texto com quebras de linha → runs (a quebra vira `break`). */
function runsDeTexto(texto: string, opts: Record<string, unknown> = {}): TextRun[] {
    return texto.split('\n').map((linha, i) => new TextRun({ text: linha, break: i > 0 ? 1 : 0, ...opts }));
}

function inlines(nos: NoTipTap[] | undefined, st: Estado): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    for (const n of nos ?? []) {
        if (n.type === 'text') {
            const marcas = new Set((n.marks ?? []).map(m => m.type));
            const link = (n.marks ?? []).find(m => m.type === 'link' && typeof m.attrs?.href === 'string');
            const opts = {
                bold: marcas.has('bold') || undefined,
                italics: marcas.has('italic') || undefined,
                underline: marcas.has('underline') || link ? {} : undefined,
                strike: marcas.has('strike') || undefined,
                color: link ? COR_LINK : undefined,
            };
            const runs = runsDeTexto(n.text ?? '', opts);
            if (link) out.push(new ExternalHyperlink({ link: String(link.attrs!.href), children: runs }));
            else out.push(...runs);
        } else if (n.type === 'variavel') {
            const { texto, pendente: falta } = textoDaVariavel(String(n.attrs?.chave ?? ''), st);
            if (falta) { out.push(pendente(texto)); continue; }
            const marcas = new Set((n.marks ?? []).map(m => m.type));
            out.push(...runsDeTexto(texto, { bold: marcas.has('bold') || undefined, italics: marcas.has('italic') || undefined, underline: marcas.has('underline') ? {} : undefined }));
        } else if (n.type === 'hardBreak') {
            out.push(new TextRun({ text: '', break: 1 }));
        }
    }
    return out;
}

const espacamento = (st: Estado, antes = 0) => ({ before: pt(antes), after: pt(st.e.layout.espacoParagrafo), line: Math.round(240 * st.e.layout.entrelinha) });

function paragrafo(n: NoTipTap, st: Estado, extra: Record<string, unknown> = {}): Paragraph {
    return new Paragraph({ children: inlines(n.content, st), alignment: alinhamento(n.attrs?.textAlign), spacing: espacamento(st), ...extra });
}

// ─── Blocos ───────────────────────────────────────────────────────────────────

function itensDeLista(n: NoTipTap, st: Estado, referencia: 'marcadores' | 'numeros', nivel: number): FileChild[] {
    const out: FileChild[] = [];
    for (const item of n.content ?? []) {
        for (const filho of item.content ?? []) {
            if (filho.type === 'paragraph') {
                out.push(new Paragraph({ children: inlines(filho.content, st), numbering: { reference: referencia, level: Math.min(nivel, 2) }, spacing: { after: pt(2) } }));
            } else if (filho.type === 'bulletList' || filho.type === 'orderedList') {
                out.push(...itensDeLista(filho, st, filho.type === 'bulletList' ? 'marcadores' : 'numeros', nivel + 1));
            } else {
                out.push(...bloco(filho, st));
            }
        }
    }
    return out;
}

interface Borda { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string }
const BORDA: Borda = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const SEM_BORDA: Borda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const bordas = (b: Borda) => ({ top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b });

function tabela(n: NoTipTap, st: Estado): Table {
    const linhas = (n.content ?? []).filter(r => r.type === 'tableRow');
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: bordas(BORDA),
        rows: linhas.map(r => new TableRow({
            children: (r.content ?? []).map(c => {
                const filhos = (c.content ?? []).flatMap(f => bloco(f, st));
                return new TableCell({
                    children: filhos.length ? (filhos as (Paragraph | Table)[]) : [new Paragraph('')],
                    columnSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined,
                    shading: c.type === 'tableHeader' ? { fill: 'F1F5F9' } : undefined,
                });
            }),
        })),
    });
}

function tabelaDinamica(n: NoTipTap, st: Estado): FileChild[] {
    const fonte = String(n.attrs?.fonte ?? '');
    const t = st.e.tabelas?.[fonte];
    if (!t) return [new Paragraph({ children: [pendente(`[[tabela: ${fonte || '?'}]]`)], spacing: espacamento(st) })];
    if (!t.linhas.length) return [new Paragraph({ children: [new TextRun({ text: t.vazia || 'Sem dados.', italics: true, color: COR_SUAVE })], spacing: espacamento(st) })];
    const linha = (cels: string[], negrito: boolean, fundo?: string) => new TableRow({
        tableHeader: !!fundo,
        children: t.colunas.map((_, i) => new TableCell({
            shading: fundo ? { fill: fundo } : undefined,
            children: [new Paragraph({ alignment: alinhamento(t.alinhamento[i]), children: [new TextRun({ text: cels[i] ?? '', bold: negrito || undefined, size: meioPonto(Math.max(8, st.base - 1)) })] })],
        })),
    });
    return [
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordas(BORDA),
            rows: [linha(t.colunas, true, 'F1F5F9'), ...t.linhas.map(l => linha(l, false)), ...(t.total ? [linha(t.total, true)] : [])],
        }),
        new Paragraph({ spacing: { after: pt(st.e.layout.espacoParagrafo) } }),
    ];
}

function blocoAssinaturas(st: Estado): FileChild[] {
    const lista = st.e.assinaturas ?? [];
    if (!lista.length) return [new Paragraph({ children: [pendente('[[assinaturas]]')], spacing: { before: pt(12) } })];
    const celula = (a: (typeof lista)[number]) => {
        const img = imagemDeDataUrl(a.imagemDataUrl);
        const p = (filhos: ParagraphChild[], extra: Record<string, unknown> = {}) => new Paragraph({ alignment: AlignmentType.CENTER, children: filhos, ...extra });
        return new TableCell({
            borders: bordas(SEM_BORDA),
            children: [
                img ? p([imagemNaCaixa(img, 200, 66)]) : p([new TextRun('')], { spacing: { before: pt(28) } }),
                p([new TextRun({ text: a.nome, bold: true })], { border: { top: { style: BorderStyle.SINGLE, size: 6, color: '111827', space: 4 } } }),
                ...(a.cargo ? [p([new TextRun({ text: a.cargo, color: COR_SUAVE })])] : []),
                ...(a.registroProfissional ? [p([new TextRun({ text: a.registroProfissional, color: COR_SUAVE })])] : []),
                ...(a.assinadoEm ? [p([new TextRun({ text: `Assinado eletronicamente por ${a.nome} em ${a.assinadoEm}`, italics: true, size: 14, color: COR_SUAVE })])] : []),
            ],
        });
    };
    const out: FileChild[] = [new Paragraph({ spacing: { before: pt(18) } })];
    // Até 3 por linha, como no PDF.
    for (let i = 0; i < lista.length; i += 3) {
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: bordas(SEM_BORDA), rows: [new TableRow({ children: lista.slice(i, i + 3).map(celula) })] }));
    }
    return out;
}

function blocoAnexos(st: Estado): FileChild[] {
    const anexos = st.e.anexos ?? [];
    if (!anexos.length) return [];
    return [
        new Paragraph({ children: [new TextRun({ text: 'Anexos', bold: true })], spacing: { before: pt(st.e.layout.espacoParagrafo), after: pt(2) } }),
        ...anexos.map(a => new Paragraph({ children: [new TextRun(a)], numbering: { reference: 'numeros', level: 0 }, spacing: { after: pt(2) } })),
    ];
}

function bloco(n: NoTipTap, st: Estado): FileChild[] {
    switch (n.type) {
        case 'paragraph': return [paragrafo(n, st)];
        case 'heading': {
            const nivel = Number(n.attrs?.level ?? 1);
            const fator = nivel <= 1 ? 1.5 : nivel === 2 ? 1.25 : 1.1;
            return [new Paragraph({
                children: inlines(n.content, st),
                alignment: alinhamento(n.attrs?.textAlign),
                spacing: espacamento(st, st.e.layout.espacoParagrafo),
                run: { bold: true, size: meioPonto(st.base * fator) },
            })];
        }
        case 'bulletList': return itensDeLista(n, st, 'marcadores', 0);
        case 'orderedList': return itensDeLista(n, st, 'numeros', 0);
        case 'blockquote': return (n.content ?? []).flatMap(f => bloco(f, st));
        case 'horizontalRule': return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 1 } }, spacing: espacamento(st) })];
        case 'table': return [tabela(n, st), new Paragraph({ spacing: { after: pt(st.e.layout.espacoParagrafo) } })];
        case 'campoLivre': {
            const nome = String(n.attrs?.nome ?? '').trim();
            const doc = st.e.camposLivres?.[nome];
            if (doc?.content?.length) return doc.content.flatMap(f => bloco(f, st));
            return [new Paragraph({ children: [pendente(`[[${String(n.attrs?.rotulo ?? nome)}]]`)], spacing: espacamento(st) })];
        }
        case 'assinaturas': return blocoAssinaturas(st);
        case 'anexos': return blocoAnexos(st);
        case 'condicional': {
            const r = avaliarCondicao(String(n.attrs?.expressao ?? ''), st.e.valores);
            return !r.erro && r.valor ? (n.content ?? []).flatMap(f => bloco(f, st)) : [];
        }
        case 'tabelaDinamica': return tabelaDinamica(n, st);
        default:
            return (n.content ?? []).flatMap(f => bloco(f, st));
    }
}

// ─── Cabeçalho, rodapé, documento ──────────────────────────────────────────────

/** Texto com {{variáveis}} → runs; o que ficou pendente sai marcado. */
function runsComVariaveis(texto: string, st: Estado, opts: Record<string, unknown>): TextRun[] {
    const substituido = substituirVariaveis(texto, st.e.valores);
    const out: TextRun[] = [];
    substituido.split('\n').forEach((linha, i) => {
        linha.split(/(\[\[[^\]]+\]\])/g).filter(Boolean).forEach((parte, j) => {
            const quebra = i > 0 && j === 0 ? 1 : 0;
            out.push(/^\[\[.+\]\]$/.test(parte)
                ? new TextRun({ text: parte, italics: true, color: COR_PENDENTE_TEXTO, break: quebra, ...opts })
                : new TextRun({ text: parte, break: quebra, ...opts }));
        });
    });
    return out;
}

function cabecalho(st: Estado): Header | undefined {
    const cfg = st.e.layout.cabecalho;
    if (!cfg.mostrar) return undefined;
    const logo = cfg.logo === 'organizacao' ? imagemDeDataUrl(st.e.logoDataUrl) : null;
    const opts = { size: meioPonto(Math.max(7, st.base - 2)), color: COR_SUAVE };
    const texto = new Paragraph({ alignment: alinhamento(cfg.alinhamento), children: runsComVariaveis(cfg.texto, st, opts) });
    if (!logo) return new Header({ children: [texto] });
    return new Header({
        children: [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordas(SEM_BORDA),
            rows: [new TableRow({ children: [
                new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, borders: bordas(SEM_BORDA), children: [new Paragraph({ children: [imagemNaCaixa(logo, 147, 56)] })] }),
                new TableCell({ borders: bordas(SEM_BORDA), children: [texto] }),
            ] })],
        })],
    });
}

function rodape(st: Estado): Footer | undefined {
    const cfg = st.e.layout.rodape;
    const nota = st.e.nota?.trim();
    if (!cfg.mostrar && !nota) return undefined;
    const tam = meioPonto(Math.max(7, st.base - 3));
    const filhos: Paragraph[] = [];
    if (cfg.mostrar) {
        filhos.push(new Paragraph({ alignment: alinhamento(cfg.alinhamento), children: runsComVariaveis(cfg.texto, st, { size: tam, color: COR_SUAVE }) }));
        if (cfg.paginacao) {
            filhos.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: tam, color: COR_SUAVE })] }));
        }
    }
    if (nota) filhos.push(new Paragraph({ children: [new TextRun({ text: nota, italics: true, size: tam, color: COR_PENDENTE_TEXTO })] }));
    return new Footer({ children: filhos });
}

/** Árvore do documento Word. PURO (não gera bytes). */
export function montarDocx(e: EntradaDocx): Document {
    const st: Estado = { e, base: e.layout.tamanhoFonte };
    const m = e.layout.margens;
    const corpo = (e.conteudo.content ?? []).flatMap(n => bloco(n, st));
    if (e.validacao?.url) {
        corpo.push(new Paragraph({
            spacing: { before: pt(18) },
            children: [
                new TextRun({ text: 'Autenticidade: ', bold: true, size: 16 }),
                new TextRun({ text: 'confira número, emitente, data e o hash do PDF oficial em ', size: 16, color: COR_SUAVE }),
                new ExternalHyperlink({ link: e.validacao.url, children: [new TextRun({ text: e.validacao.url, size: 16, color: COR_LINK, underline: {} })] }),
            ],
        }));
    }
    const nivelLista = (formato: (typeof LevelFormat)[keyof typeof LevelFormat], textos: string[]) =>
        textos.map((text, level) => ({ level, format: formato, text, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } }));
    return new Document({
        title: e.titulo ?? 'Documento',
        creator: 'ÒPURA',
        styles: { default: { document: { run: { font: e.layout.fonte, size: meioPonto(e.layout.tamanhoFonte) } } } },
        numbering: {
            config: [
                { reference: 'marcadores', levels: nivelLista(LevelFormat.BULLET, ['•', '◦', '▪']) },
                { reference: 'numeros', levels: nivelLista(LevelFormat.DECIMAL, ['%1.', '%2.', '%3.']) },
            ],
        },
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: convertMillimetersToTwip(m.superior + (e.layout.cabecalho.mostrar ? 22 : 0)),
                        bottom: convertMillimetersToTwip(m.inferior + (e.layout.rodape.mostrar ? 14 : 0)),
                        left: convertMillimetersToTwip(m.esquerda),
                        right: convertMillimetersToTwip(m.direita),
                        header: convertMillimetersToTwip(m.superior),
                        footer: convertMillimetersToTwip(m.inferior),
                    },
                },
            },
            headers: (() => { const h = cabecalho(st); return h ? { default: h } : undefined; })(),
            footers: (() => { const f = rodape(st); return f ? { default: f } : undefined; })(),
            children: corpo.length ? corpo : [new Paragraph('')],
        }],
    });
}

/** Bytes do .docx (Blob no navegador). */
export async function gerarDocxBlob(e: EntradaDocx): Promise<Blob> {
    return Packer.toBlob(montarDocx(e));
}
