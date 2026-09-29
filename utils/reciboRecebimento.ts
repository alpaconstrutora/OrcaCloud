/**
 * Recibo de recebimento (Contas a Receber) e de pagamento (Contas a Pagar) —
 * montagem pura do texto e do PDF.
 *
 * O tipo vem do próprio registro (`kind`, aplicar_20270928000110):
 *   RECEBIMENTO  a organização declara que recebeu do pagador e assina;
 *   PAGAMENTO    o CREDOR declara que recebeu da organização e assina — a
 *                organização continua no cabeçalho (é ela quem prepara o papel).
 * Registro sem `kind` (anterior à migration) é RECEBIMENTO.
 *
 * Tudo sai do registro CONGELADO em `financial_receipts` (migration
 * aplicar_20270926000110), nunca do título ou do cliente atuais: é isso que faz
 * a reimpressão sair idêntica à emissão. Quem guarda/baixa o arquivo é
 * `services/financialReceiptService.ts`.
 *
 * Visual herdado de `exportService.generateReceiptPDF` (faixa verde, valor em
 * destaque, linha de assinatura), que continua servindo ClientArea e
 * ProjectFinancialManager — este aqui não o substitui.
 */
import { jsPDF } from 'jspdf';
import { valorPorExtenso } from '../services/docxFieldCatalog';
import { FORMAS_PAGAMENTO } from './baixaRecebivel';
import type { FinancialReceipt } from '../types/financial';

const FORMA_LABEL: Record<string, string> = Object.fromEntries(FORMAS_PAGAMENTO.map(f => [f.value, f.label]));

export function rotuloFormaPagamento(code?: string | null): string | null {
    if (!code) return null;
    return FORMA_LABEL[code] ?? code;
}

/** "000123" — o número com zeros à esquerda, como aparece no documento. */
export function numeroRecibo(n: number): string {
    return String(n).padStart(6, '0');
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' por string — `new Date('2026-09-25')` é UTC e
 *  cai no dia anterior em Brasília. */
function dataBR(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** timestamptz → 'DD/MM/YYYY' no fuso de Brasília (o `slice(0,10)` daria o dia UTC). */
function dataDeTimestampBR(ts: string): string {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? dataBR(ts) : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function rotuloDocumento(doc: string): string {
    const digitos = doc.replace(/\D/g, '').length;
    if (digitos === 11) return 'CPF';
    if (digitos === 14) return 'CNPJ';
    return 'documento';
}

const ehPagamento = (r: Pick<FinancialReceipt, 'kind'>) => r.kind === 'PAGAMENTO';

/**
 * Sujeito do recibo de pagamento, pela pessoa do credor: "Recebi" (CPF),
 * "Recebemos" (CNPJ), "Recebi(emos)" quando não se sabe. Pura, para teste.
 */
export function verboDoCredor(documento?: string | null): string {
    const digitos = (documento ?? '').replace(/\D/g, '').length;
    if (digitos === 11) return 'Recebi';
    if (digitos === 14) return 'Recebemos';
    return 'Recebi(emos)';
}

/** A frase do corpo do recibo. Pura, para teste. */
export function textoRecibo(
    r: Pick<FinancialReceipt, 'amount' | 'payer_name' | 'payer_document' | 'description' | 'kind' | 'issuer_name' | 'issuer_document' | 'payee_document'>,
): string {
    const descricao = (r.description ?? '').trim();
    const referente = descricao ? `, referente a ${descricao}` : '';
    const valor = `${brl(r.amount)} (${valorPorExtenso(r.amount)})`;

    if (ehPagamento(r)) {
        // O credor fala: quem pagou é a organização emitente do documento.
        const verbo = verboDoCredor(r.payee_document);
        const org = (r.issuer_name ?? '').trim();
        const cnpj = (r.issuer_document ?? '').trim();
        const de = org ? ` de ${org}${cnpj ? ` (${rotuloDocumento(cnpj)} ${cnpj})` : ''}` : '';
        return `${verbo}${de} a importância de ${valor}${referente}.`;
    }

    const pagador = (r.payer_name ?? '').trim();
    const doc = (r.payer_document ?? '').trim();
    const quem = pagador
        ? `Recebemos de ${pagador}${doc ? ` (${rotuloDocumento(doc)} ${doc})` : ''} a importância de`
        : 'Recebemos a importância de';
    return `${quem} ${valor}${referente}.`;
}

/** Linhas de detalhe abaixo do corpo (data e forma). */
export function detalhesRecibo(r: Pick<FinancialReceipt, 'payment_date' | 'payment_type' | 'contract_number'>): string[] {
    const linhas: string[] = [];
    if (r.contract_number) linhas.push(`Contrato: ${r.contract_number}`);
    linhas.push(`Data do pagamento: ${dataBR(r.payment_date)}`);
    const forma = rotuloFormaPagamento(r.payment_type);
    if (forma) linhas.push(`Forma de pagamento: ${forma}`);
    return linhas;
}

export function nomeArquivoRecibo(r: Pick<FinancialReceipt, 'receipt_number' | 'payer_name' | 'kind' | 'payee_name'>): string {
    const pagamento = ehPagamento(r);
    // No de pagamento, o nome é o do credor (quem assina); no de recebimento, o do pagador.
    const pessoa = ((pagamento ? r.payee_name : r.payer_name) ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return `Recibo_${pagamento ? 'Pagamento_' : ''}${numeroRecibo(r.receipt_number)}${pessoa ? `_${pessoa}` : ''}.pdf`;
}

/**
 * Tamanho da logo dentro da caixa `maxW × maxH` mantendo a proporção. Até
 * 27/09/2026 a logo era desenhada direto em 30×15 mm e saía esticada (a da Alpa
 * é quase quadrada).
 */
export function caberNaCaixa(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
    if (!(w > 0) || !(h > 0)) return { w: maxW, h: maxH };
    const escala = Math.min(maxW / w, maxH / h);
    return { w: w * escala, h: h * escala };
}

/** Formato do data URL da logo para o `addImage` do jsPDF. */
function formatoImagem(dataUrl: string): string {
    const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl);
    if (!m) return 'PNG';
    const f = m[1].toUpperCase();
    return f === 'JPG' ? 'JPEG' : f;
}

/**
 * Monta o PDF do recibo. `logoDataUrl` é opcional (a logo não é congelada — é a
 * atual da organização); se falhar ao desenhar, o recibo sai sem ela.
 */
export function montarReciboPdf(r: FinancialReceipt, logoDataUrl?: string | null): jsPDF {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 20;
    const numero = `Nº ${numeroRecibo(r.receipt_number)}`;

    // Faixa do título
    doc.setFillColor(16, 185, 129); // emerald-500, igual ao generateReceiptPDF
    doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('RECIBO', M, 19);
    doc.setFontSize(14);
    doc.text(numero, W - M, 19, { align: 'right' });

    // Emitente
    let y = 42;
    let xEmitente = M;
    if (logoDataUrl) {
        try {
            const props = doc.getImageProperties(logoDataUrl);
            const { w, h } = caberNaCaixa(props.width, props.height, 30, 15);
            // Centralizada na altura da caixa de 15 mm, alinhada à esquerda.
            doc.addImage(logoDataUrl, formatoImagem(logoDataUrl), M, y - 6 + (15 - h) / 2, w, h, undefined, 'FAST');
            xEmitente = M + w + 6;
        } catch {
            /* logo inválida não impede o recibo */
        }
    }
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(r.issuer_name || 'Emitente', xEmitente, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    if (r.issuer_document) { y += 5; doc.text(`CNPJ ${r.issuer_document}`, xEmitente, y); }
    if (r.issuer_address) {
        const linhas = doc.splitTextToSize(r.issuer_address, W - xEmitente - M);
        y += 5;
        doc.text(linhas, xEmitente, y);
        y += (linhas.length - 1) * 4;
    }

    // Valor em destaque
    y = Math.max(y + 14, 68);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(M, y - 8, W - 2 * M, 16, 2, 2, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('VALOR', M + 5, y + 2);
    doc.setFontSize(16);
    doc.text(brl(r.amount), W - M - 5, y + 2, { align: 'right' });

    // Corpo
    y += 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const corpo = doc.splitTextToSize(textoRecibo(r), W - 2 * M);
    doc.text(corpo, M, y, { lineHeightFactor: 1.5 });
    y += corpo.length * 7 + 8;

    doc.setFontSize(11);
    for (const linha of detalhesRecibo(r)) {
        doc.text(linha, M, y);
        y += 7;
    }

    // Assinatura — de quem RECEBEU: a organização (recebimento) ou o credor
    // (pagamento). No de pagamento o papel é preparado para colher a assinatura
    // do credor, então leva também a linha de local e data.
    y += 30;
    doc.setDrawColor(100, 116, 139);
    if (ehPagamento(r)) {
        doc.setFontSize(10);
        doc.text('Local e data: ______________________________________', M, y - 14);
    }
    doc.line(W / 2 - 45, y, W / 2 + 45, y);
    doc.setFontSize(10);
    const assinante = ehPagamento(r) ? (r.payee_name || 'Credor') : (r.issuer_name || '');
    const docAssinante = ehPagamento(r) ? r.payee_document : r.issuer_document;
    doc.text(assinante, W / 2, y + 5, { align: 'center' });
    if (docAssinante) {
        doc.setFontSize(8);
        doc.text(`${rotuloDocumento(docAssinante)} ${docAssinante}`, W / 2, y + 10, { align: 'center' });
    }

    // Cancelado
    if (r.cancelled_at) {
        doc.setTextColor(220, 38, 38);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(64);
        doc.text('CANCELADO', W / 2, H / 2, { align: 'center', angle: 30 });
        doc.setFontSize(10);
        doc.text(`Recibo cancelado em ${dataDeTimestampBR(r.cancelled_at)} (baixa estornada).`, W / 2, H - 25, { align: 'center' });
    }

    // Rodapé
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
        `Recibo ${numero} emitido em ${dataDeTimestampBR(r.issued_at)} · gerado eletronicamente via Opura Suite.`,
        W / 2, H - 15, { align: 'center' },
    );

    return doc;
}
