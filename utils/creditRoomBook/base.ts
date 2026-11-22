/**
 * Base do book de crédito: constantes, formatadores (ausente = "n/d", nunca zero),
 * contexto de página e as peças que toda seção usa (texto, KPIs, tabela, foto).
 * Ver `index.ts` para as regras do book.
 */
import { jsPDF } from 'jspdf';
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable';
import { formatDateBR, formatMoney } from '../../components/ui/Format';

export interface ExtrasDoBook {
    room: { code: string; name: string; institutionName: string | null };
    /** url da foto → dataURL (JPEG); ausente = sem foto. */
    imagens: Record<string, string>;
    documentos: { nome: string; categoria: string; empresa: string | null }[];
    /** "email · dd/mm/aaaa hh:mm" quando o credor baixa. */
    marcaDagua?: string;
}

export const MARGEM = 14;
export const FIM_UTIL = 16; // reserva do rodapé
export const MAX_FOTOS = 4;

export const COR = {
    escuro: [15, 23, 42] as const, texto: [51, 65, 85] as const, suave: [100, 116, 139] as const,
    cartao: [241, 245, 249] as const, destaque: [225, 85, 60] as const, vermelho: [185, 28, 28] as const,
    vendas: '#3b82f6', alugueis: '#d97706', servico: '#1e293b', grade: '#e5e7eb',
};

export const N_D = 'n/d';

// ── Texto e formatação ───────────────────────────────────────────────────────

/** Só Latin-1: o que a fonte padrão do PDF desenha sem virar UTF-16. */
export const limpo = (t: string): string => t
    .replace(/[–—]/g, '-').replace(/−/g, '-')
    .replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/•/g, '·').replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/[^\u0000-ÿ]/g, '?');

export const money = (v: number | null | undefined) => (v == null ? N_D : formatMoney(v));
export const pct = (v: number | null | undefined) =>
    v == null ? N_D : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
export const vezes = (v: number | null | undefined) =>
    v == null ? N_D : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
export const anos = (v: number | null | undefined) =>
    v == null ? N_D : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`;
export const inteiro = (v: number | null | undefined) => (v == null ? N_D : v.toLocaleString('pt-BR'));
export const data = (v: string | null | undefined) => (v ? formatDateBR(v) : N_D);
export const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export const FRASE_SCHEMA_1 = 'versão congelada antes da capacidade de pagamento';

export const formatoDaImagem = (dataUrl: string): 'PNG' | 'JPEG' | null =>
    /^data:image\/png/i.test(dataUrl) ? 'PNG' : /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : null;

// ── Contexto de página ───────────────────────────────────────────────────────

export interface Ctx { doc: jsPDF; y: number }

export const larguraUtil = (doc: jsPDF) => doc.internal.pageSize.getWidth() - 2 * MARGEM;
export const altura = (doc: jsPDF) => doc.internal.pageSize.getHeight();

export const garantir = (c: Ctx, h: number) => {
    if (c.y + h > altura(c.doc) - FIM_UTIL) { c.doc.addPage(); c.y = MARGEM; }
};
export const novaPagina = (c: Ctx) => { c.doc.addPage(); c.y = MARGEM; };

export function texto(c: Ctx, t: string, o: { tamanho?: number; negrito?: boolean; cor?: readonly number[]; recuo?: number } = {}) {
    const { tamanho = 9, negrito = false, cor = COR.texto, recuo = 0 } = o;
    c.doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    c.doc.setFontSize(tamanho);
    c.doc.setTextColor(cor[0], cor[1], cor[2]);
    const linhas = c.doc.splitTextToSize(limpo(t), larguraUtil(c.doc) - recuo) as string[];
    const passo = tamanho * 0.45;
    garantir(c, linhas.length * passo + 1);
    c.doc.text(linhas, MARGEM + recuo, c.y + passo * 0.8);
    c.y += linhas.length * passo + 1.5;
}

export function secao(c: Ctx, titulo: string, subtitulo?: string) {
    garantir(c, 22);
    texto(c, titulo, { tamanho: 14, negrito: true, cor: COR.escuro });
    c.doc.setFillColor(COR.destaque[0], COR.destaque[1], COR.destaque[2]);
    c.doc.rect(MARGEM, c.y - 0.5, 16, 0.8, 'F');
    c.y += 3;
    if (subtitulo) texto(c, subtitulo, { tamanho: 8.5, cor: COR.suave });
}

export const subtitulo = (c: Ctx, t: string) => { c.y += 1.5; texto(c, t, { tamanho: 10.5, negrito: true, cor: COR.escuro }); };
export const aviso = (c: Ctx, t: string) => texto(c, t, { tamanho: 9, cor: COR.suave });

export interface Kpi { rotulo: string; valor: string; hint?: string; alerta?: boolean }

export function kpis(c: Ctx, itens: Kpi[], colunas: number) {
    const { doc } = c;
    const gap = 4;
    const w = (larguraUtil(doc) - gap * (colunas - 1)) / colunas;
    for (let i = 0; i < itens.length; i += colunas) {
        const linha = itens.slice(i, i + colunas);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const hints = linha.map(k => (k.hint ? doc.splitTextToSize(limpo(k.hint), w - 8) as string[] : []));
        const h = 19 + Math.max(...hints.map(x => x.length)) * 3.1;
        garantir(c, h + 3);
        linha.forEach((k, j) => {
            const x = MARGEM + j * (w + gap);
            doc.setFillColor(COR.cartao[0], COR.cartao[1], COR.cartao[2]);
            doc.roundedRect(x, c.y, w, h, 2, 2, 'F');
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
            doc.text(limpo(k.rotulo), x + 4, c.y + 6);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
            const cor = k.alerta ? COR.vermelho : COR.escuro;
            doc.setTextColor(cor[0], cor[1], cor[2]);
            doc.text(limpo(k.valor), x + 4, c.y + 13.5);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
            doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
            doc.text(hints[j], x + 4, c.y + 18);
        });
        c.y += h + 3;
    }
}

export type Celula = string | { v: string; direita?: boolean; vermelho?: boolean; forte?: boolean };

/** Tabela de verdade (autotable): uma linha nunca é cortada entre páginas. */
export function tabela(c: Ctx, cabecalho: string[], linhas: Celula[][], o: { fonte?: number; direitaA?: number; larguras?: Record<number, number> } = {}) {
    const { fonte = 7.5, direitaA = 1, larguras } = o;
    const body: RowInput[] = linhas.map(l => l.map((x, i): CellDef => {
        const cel = typeof x === 'string' ? { v: x } : x;
        const direita = cel.direita ?? (i >= direitaA);
        return {
            content: limpo(cel.v),
            styles: {
                halign: direita ? 'right' : 'left',
                ...(cel.vermelho ? { textColor: [COR.vermelho[0], COR.vermelho[1], COR.vermelho[2]] } : {}),
                ...(cel.forte ? { fontStyle: 'bold' } : {}),
            },
        };
    }));
    autoTable(c.doc, {
        startY: c.y,
        head: [cabecalho.map((h, i): CellDef => ({ content: limpo(h), styles: { halign: i >= direitaA ? 'right' : 'left' } }))],
        body,
        margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: FIM_UTIL },
        styles: { fontSize: fonte, cellPadding: 1.4, overflow: 'linebreak', textColor: [COR.texto[0], COR.texto[1], COR.texto[2]] },
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: larguras ? Object.fromEntries(Object.entries(larguras).map(([k, v]) => [k, { cellWidth: v }])) : undefined,
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
    });
    c.y = ((c.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? c.y) + 4;
}

// ── Imagens ──────────────────────────────────────────────────────────────────

export interface FotoPronta { dataUrl: string; formato: 'PNG' | 'JPEG'; w: number; h: number }

/** Lê as dimensões; dataURL ilegível (ou formato estranho) devolve `null` — a foto some, o book não cai. */
export function prepararFoto(doc: jsPDF, dataUrl: string | undefined): FotoPronta | null {
    if (!dataUrl) return null;
    const formato = formatoDaImagem(dataUrl);
    if (!formato) return null;
    try {
        const p = doc.getImageProperties(dataUrl);
        if (!(p.width > 0) || !(p.height > 0)) return null;
        return { dataUrl, formato, w: p.width, h: p.height };
    } catch { return null; }
}

/** Desenha a foto "contida" na caixa (sem cortar), centralizada. Falha ao desenhar = só a omite. */
export function fotoNaCaixa(doc: jsPDF, f: FotoPronta, x: number, y: number, bw: number, bh: number): boolean {
    const escala = Math.min(bw / f.w, bh / f.h);
    const w = f.w * escala; const h = f.h * escala;
    try {
        doc.setFillColor(COR.cartao[0], COR.cartao[1], COR.cartao[2]);
        doc.rect(x, y, bw, bh, 'F');
        // 'FAST': sem recompressão por imagem (o jsPDF guarda PNG sem compressão).
        doc.addImage(f.dataUrl, f.formato, x + (bw - w) / 2, y + (bh - h) / 2, w, h, undefined, 'FAST');
        return true;
    } catch { return false; }
}
