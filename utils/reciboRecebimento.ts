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
 * A logo e o contato do emitente (telefone, e-mail, site) NÃO são congelados:
 * vêm da organização no momento de montar (`ReciboExtras`). O que garante a
 * reimpressão idêntica é o PDF guardado no Storage, não o snapshot.
 *
 * Layout (04/10/2026, docs/planos/2026-10-04-recibo-novo-layout.md): desenho de
 * "invoice" — logo + RECIBO, metadados, valor em destaque + contato, tabela de
 * uma linha, declaração + barra TOTAL, assinatura, rodapé. Cor de destaque =
 * coral dos portais (`PortalKit.accent`). Só helvetica: não há fonte embutida.
 *
 * Recibo de contrato (17/10/2026, docs/planos/2026-10-17-recibo-contrato-objeto-itens.md):
 * a linha da tabela leva "Contrato: <nº>" e "Objeto: <título>", a declaração cita o
 * objeto e, entre a tabela e a declaração, entra "ITENS DO CONTRATO" (congelados em
 * `contract_items`). Recibo sem contrato sai com o desenho de antes.
 */
import { jsPDF } from 'jspdf';
import { valorPorExtenso } from '../services/docxFieldCatalog';
import { FORMAS_PAGAMENTO } from './baixaRecebivel';
import type { FinancialReceipt, FinancialReceiptKind, ReciboItemContrato } from '../types/financial';

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
export function dataBR(iso: string): string {
    const [y, m, d] = (iso ?? '').slice(0, 10).split('-');
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

/** 'CPF 005.871.088-43' / 'CNPJ …' / 'documento …'; vazio → null. */
function documentoRotulado(doc?: string | null): string | null {
    const d = (doc ?? '').trim();
    return d ? `${rotuloDocumento(d)} ${d}` : null;
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

/**
 * "referente a …" da declaração: a descrição do título e, quando o título vem de
 * contrato, o OBJETO do contrato (pedido de 17/10/2026: "para identificar do que
 * se trata o recibo"). Objeto já contido na descrição não se repete.
 */
function referenteDoRecibo(r: Pick<FinancialReceipt, 'description' | 'contract_title'>): string {
    const descricao = (r.description ?? '').trim();
    const objeto = (r.contract_title ?? '').trim();
    const objetoNovo = objeto && !descricao.toLowerCase().includes(objeto.toLowerCase()) ? objeto : '';
    if (descricao && objetoNovo) return `, referente a ${descricao} — objeto: ${objetoNovo}`;
    if (descricao) return `, referente a ${descricao}`;
    return objeto ? `, referente a ${objeto}` : '';
}

/** A frase do corpo do recibo. Pura, para teste. */
export function textoRecibo(
    r: Pick<FinancialReceipt, 'amount' | 'payer_name' | 'payer_document' | 'description' | 'kind' | 'issuer_name' | 'issuer_document' | 'payee_document' | 'contract_title'>,
): string {
    const referente = referenteDoRecibo(r);
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

export function nomeArquivoRecibo(r: Pick<FinancialReceipt, 'receipt_number' | 'payer_name' | 'kind' | 'payee_name'>): string {
    const pagamento = ehPagamento(r);
    // No de pagamento, o nome é o do credor (quem assina); no de recebimento, o do pagador.
    const pessoa = ((pagamento ? r.payee_name : r.payer_name) ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return `Recibo_${pagamento ? 'Pagamento_' : ''}${numeroRecibo(r.receipt_number)}${pessoa ? `_${pessoa}` : ''}.pdf`;
}

// ─── Peças puras do layout (todas com teste em __tests__/reciboRecebimento.test.ts) ───

/** Dados de contato do emitente, lidos da organização na hora (não congelados). */
export interface ContatoEmitente {
    phone?: string | null;
    email?: string | null;
    website?: string | null;
}

/** O que o PDF recebe além do registro congelado. */
export interface ReciboExtras {
    logoDataUrl?: string | null;
    contato?: ContatoEmitente | null;
}

/**
 * '35999055003' → '(35) 99905-5003'; '3532123456' → '(35) 3212-3456'; com +55
 * ou 55 na frente, idem. Comprimento irregular devolve o texto como veio.
 */
export function formatarTelefoneBR(raw?: string | null): string | null {
    const bruto = (raw ?? '').trim();
    if (!bruto) return null;
    let d = bruto.replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return bruto;
}

/** 'https://www.x.com.br/' → 'www.x.com.br'; vazio → null. */
export function semProtocolo(url?: string | null): string | null {
    const limpo = (url ?? '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
    return limpo || null;
}

/** [telefone, e-mail, site], só os preenchidos, nessa ordem. */
export function linhasContatoEmitente(c?: ContatoEmitente | null): string[] {
    if (!c) return [];
    return [formatarTelefoneBR(c.phone), (c.email ?? '').trim() || null, semProtocolo(c.website)]
        .filter((s): s is string => !!s);
}

export interface RotulosRecibo {
    destinatario: 'Recebemos de:' | 'Pago a:';
    valor: 'VALOR RECEBIDO' | 'VALOR PAGO';
    papelAssinante: 'Emitente' | 'Credor';
}

/** Rótulos que mudam com o tipo; `kind` ausente = RECEBIMENTO. */
export function rotulosRecibo(kind?: FinancialReceiptKind): RotulosRecibo {
    return kind === 'PAGAMENTO'
        ? { destinatario: 'Pago a:', valor: 'VALOR PAGO', papelAssinante: 'Credor' }
        : { destinatario: 'Recebemos de:', valor: 'VALOR RECEBIDO', papelAssinante: 'Emitente' };
}

/** Quem está do outro lado: o pagador (recebimento) ou o credor (pagamento). */
export function destinatarioDoRecibo(
    r: Pick<FinancialReceipt, 'kind' | 'payer_name' | 'payer_document' | 'payee_name' | 'payee_document'>,
): { nome: string; documento: string | null } {
    const pagamento = ehPagamento(r);
    const nome = ((pagamento ? r.payee_name : r.payer_name) ?? '').trim();
    return { nome: nome || '—', documento: documentoRotulado(pagamento ? r.payee_document : r.payer_document) };
}

/** Quem assina: a organização (recebimento) ou o credor (pagamento). */
export function assinanteDoRecibo(
    r: Pick<FinancialReceipt, 'kind' | 'issuer_name' | 'issuer_document' | 'payee_name' | 'payee_document'>,
): { nome: string; documento: string | null; papel: 'Emitente' | 'Credor' } {
    if (ehPagamento(r)) {
        return { nome: (r.payee_name ?? '').trim() || 'Credor', documento: documentoRotulado(r.payee_document), papel: 'Credor' };
    }
    return { nome: (r.issuer_name ?? '').trim() || 'Emitente', documento: documentoRotulado(r.issuer_document), papel: 'Emitente' };
}

/** A única linha da tabela: o título pago (+ nº e objeto do contrato, quando há). */
export function linhaTabelaRecibo(
    r: Pick<FinancialReceipt, 'description' | 'contract_number' | 'contract_title' | 'payment_date' | 'payment_type' | 'amount'>,
): { descricao: string; contrato: string | null; objeto: string | null; data: string; forma: string; valor: string } {
    const contrato = (r.contract_number ?? '').trim();
    const objeto = (r.contract_title ?? '').trim();
    return {
        descricao: (r.description ?? '').trim() || '—',
        contrato: contrato ? `Contrato: ${contrato}` : null,
        objeto: objeto ? `Objeto: ${objeto}` : null,
        data: dataBR(r.payment_date),
        forma: rotuloFormaPagamento(r.payment_type) ?? '—',
        valor: brl(r.amount),
    };
}

/** Número do JSON congelado (pode vir string); inválido → null. */
function numeroDoItem(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

const qtdBR = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n);

export interface LinhaItemContrato {
    item: string;
    unid: string;
    qtd: string;
    unitario: string;
    total: string;
}

/**
 * Linhas da seção "ITENS DO CONTRATO" (tabela completa, decisão do usuário em
 * 17/10/2026). Cabem `maxLinhas`; se não couberem todos, a última vira o resumo
 * "+ N itens — ver contrato <nº>". Sem itens → nada (a seção não aparece).
 */
export function linhasItensContrato(
    itens: ReciboItemContrato[] | null | undefined,
    maxLinhas: number,
    numeroContrato?: string | null,
): { linhas: LinhaItemContrato[]; resto: string | null } {
    const lista = Array.isArray(itens) ? itens : [];
    if (!lista.length) return { linhas: [], resto: null };
    const max = Math.max(1, Math.floor(maxLinhas));
    const cabem = lista.length <= max ? lista.length : max - 1;
    const linhas = lista.slice(0, cabem).map((i) => {
        const qtd = numeroDoItem(i.quantity);
        const unit = numeroDoItem(i.unit_price);
        const total = numeroDoItem(i.total_price);
        return {
            item: (i.description ?? '').trim() || '—',
            unid: (i.unit ?? '').trim() || '—',
            qtd: qtd === null ? '—' : qtdBR(qtd),
            unitario: unit === null ? '—' : brl(unit),
            total: total === null ? '—' : brl(total),
        };
    });
    const faltam = lista.length - cabem;
    const contrato = (numeroContrato ?? '').trim();
    const resto = faltam > 0
        ? `+ ${faltam} ${faltam === 1 ? 'item' : 'itens'}${contrato ? ` — ver contrato ${contrato}` : ''}`
        : null;
    return { linhas, resto };
}

/** Corta em `max` linhas; a última ganha reticências. */
export function limitarLinhas(linhas: string[], max: number): string[] {
    if (linhas.length <= max) return linhas;
    const corte = linhas.slice(0, max);
    corte[max - 1] = `${corte[max - 1].replace(/[\s.,;:]+$/, '')}…`;
    return corte;
}

/** Desce o corpo da fonte de 0,5 em 0,5 pt até `medir(pt) <= maxW` (ou até `min`). */
export function tamanhoQueCabe(medir: (pt: number) => number, maxW: number, pt: number, min: number): number {
    let atual = pt;
    while (atual > min && medir(atual) > maxW) atual = Math.round((atual - 0.5) * 2) / 2;
    return Math.max(atual, min);
}

/** Declaração ao lado da barra TOTAL (98 mm) ou abaixo dela (170 mm) quando é longa. */
export function arranjoDeclaracao(nLinhas: number): 'lado' | 'abaixo' {
    return nLinhas > 9 ? 'abaixo' : 'lado';
}

/** As duas linhas do canto inferior direito. */
export function rodapeRecibo(r: Pick<FinancialReceipt, 'receipt_number' | 'issued_at'>): [string, string] {
    return [
        `Recibo Nº ${numeroRecibo(r.receipt_number)} · emitido em ${dataDeTimestampBR(r.issued_at)}`,
        'Gerado eletronicamente via Opura Suite',
    ];
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

// ─── O PDF ───

type RGB = [number, number, number];
const COR = {
    accent: [225, 85, 60] as RGB,      // coral dos portais (PortalKit.accent #E1553C)
    ink: [30, 41, 59] as RGB,          // slate-800
    muted: [100, 116, 139] as RGB,     // slate-500
    line: [226, 232, 240] as RGB,      // slate-200
    zebra: [248, 250, 252] as RGB,     // slate-50
    branco: [255, 255, 255] as RGB,
    cinzaRodape: [150, 150, 150] as RGB,
    vermelho: [220, 38, 38] as RGB,
};

/** /ID do PDF: 32 hex maiúsculos derivados do id do recibo (um UUID já tem 32). */
export function idDoArquivoPdf(id: string): string {
    const hex = (id ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    return (hex + '0'.repeat(32)).slice(0, 32);
}

/** pt × fator × (25,4/72) — altura de uma linha de texto em mm. */
const alturaLinhaMm = (pt: number, fator: number) => pt * fator * 0.3528;

/**
 * Monta o PDF do recibo. `extras.logoDataUrl` e `extras.contato` são opcionais e
 * não congelados (vêm da organização atual); se a logo falhar ao desenhar, o
 * recibo sai sem ela.
 */
export function montarReciboPdf(r: FinancialReceipt, extras: ReciboExtras = {}): jsPDF {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 20;
    const R = W - M;
    const pagamento = ehPagamento(r);
    const rotulos = rotulosRecibo(r.kind);

    // Hash estável: o PDF regerado do mesmo registro sai byte a byte igual
    // (data de criação = emissão; /ID do arquivo = id do recibo, não aleatório).
    const emitidoEm = new Date(r.issued_at);
    if (!isNaN(emitidoEm.getTime())) doc.setCreationDate(emitidoEm);
    doc.setFileId(idDoArquivoPdf(r.id));

    const fonte = (estilo: 'normal' | 'bold', pt: number, cor: RGB) => {
        doc.setFont('helvetica', estilo);
        doc.setFontSize(pt);
        doc.setTextColor(cor[0], cor[1], cor[2]);
    };
    const preencher = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const tracar = (c: RGB, espessura = 0.3) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(espessura); };
    /** Largura de `txt` em mm num corpo/estilo (deixa a fonte nesse estado). */
    const largura = (txt: string, pt: number, estilo: 'normal' | 'bold') => {
        doc.setFont('helvetica', estilo);
        doc.setFontSize(pt);
        return doc.getTextWidth(txt);
    };
    const corpoQueCabe = (txt: string, maxW: number, pt: number, min: number, estilo: 'normal' | 'bold') =>
        tamanhoQueCabe(p => largura(txt, p, estilo), maxW, pt, min);
    /** Rótulo pequeno em caixa alta com espaçamento — zera o charSpace depois (ele persiste). */
    const rotulo = (txt: string, x: number, y: number, pt = 8.5) => {
        fonte('normal', pt, COR.muted);
        doc.setCharSpace(0.5);
        doc.text(txt, x, y);
        doc.setCharSpace(0);
    };

    // Logo: propriedades lidas UMA vez; qualquer falha → sem logo (não impede o recibo).
    let logo: { url: string; formato: string; w: number; h: number } | null = null;
    if (extras.logoDataUrl) {
        try {
            const props = doc.getImageProperties(extras.logoDataUrl);
            if (props.width > 0 && props.height > 0) {
                logo = { url: extras.logoDataUrl, formato: formatoImagem(extras.logoDataUrl), w: props.width, h: props.height };
            }
        } catch { /* logo inválida */ }
    }
    /** Desenha a logo numa caixa; devolve a largura ocupada (0 se não desenhou). */
    const desenharLogo = (x: number, y: number, maxW: number, maxH: number, encostarDireita = false): number => {
        if (!logo) return 0;
        try {
            const { w, h } = caberNaCaixa(logo.w, logo.h, maxW, maxH);
            doc.addImage(logo.url, logo.formato, encostarDireita ? x - w : x, y + (maxH - h) / 2, w, h, undefined, 'FAST');
            return w;
        } catch {
            return 0;
        }
    };

    // ── 1. Cabeçalho ──────────────────────────────────────────────────────────
    const wLogo = desenharLogo(M, 18, 34, 18);
    const xTexto = wLogo > 0 ? M + wLogo + 6 : M;
    const nomeEmitente = (r.issuer_name ?? '').trim() || 'Emitente';
    fonte('bold', corpoQueCabe(nomeEmitente, 118 - xTexto, 13, 9, 'bold'), COR.ink);
    doc.text(nomeEmitente, xTexto, 27);
    if (r.issuer_document) {
        fonte('normal', 9, COR.muted);
        doc.text(`CNPJ ${r.issuer_document}`, xTexto, 32.5);
    }
    fonte('bold', 30, COR.accent);
    doc.text('RECIBO', R, 31, { align: 'right' });
    // Barra cinza com o chanfro coral na ponta (como no desenho de referência).
    preencher(COR.line);
    doc.rect(128, 35.5, 55, 2.2, 'F');
    preencher(COR.accent);
    doc.lines([[7, 0], [-2.2, 2.2], [-7, 0]], 183, 35.5, [1, 1], 'F', true);
    tracar(COR.line);
    doc.line(M, 46, R, 46);

    // ── 2. Metadados ─────────────────────────────────────────────────────────
    fonte('normal', 8.5, COR.muted);
    doc.text('Recibo nº', M, 55);
    doc.text('Data', M, 61.5);
    fonte('bold', 10.5, COR.ink);
    doc.text(numeroRecibo(r.receipt_number), 46, 55);
    doc.text(dataBR(r.payment_date), 46, 61.5);

    const destinatario = destinatarioDoRecibo(r);
    fonte('normal', 8.5, COR.muted);
    doc.text(rotulos.destinatario, R, 55, { align: 'right' });
    fonte('bold', corpoQueCabe(destinatario.nome, 85, 11, 8, 'bold'), COR.ink);
    doc.text(destinatario.nome, R, 61.5, { align: 'right' });
    if (destinatario.documento) {
        fonte('normal', 8.5, COR.muted);
        doc.text(destinatario.documento, R, 66.5, { align: 'right' });
    }

    // ── 3. Valor em destaque + contato do emitente ───────────────────────────
    rotulo(rotulos.valor, M, 80);
    fonte('bold', 24, COR.ink);
    doc.text(brl(r.amount), M, 91);

    {
        const entradas: string[][] = [];
        const endereco = (r.issuer_address ?? '').trim();
        fonte('normal', 8.5, COR.muted);
        if (endereco) entradas.push(limitarLinhas(doc.splitTextToSize(endereco, 74) as string[], 2));
        // Telefone e e-mail; o site vai no rodapé.
        for (const linha of linhasContatoEmitente(extras.contato).slice(0, 2)) entradas.push([linha]);
        let y = 80;
        for (const linhas of entradas.slice(0, 3)) {
            preencher(COR.accent);
            doc.circle(113.2, y - 1.1, 0.9, 'F');
            for (const linha of linhas) {
                doc.text(linha, 116.5, y);
                y += 4.6;
            }
        }
    }

    // ── 4. Tabela de uma linha ───────────────────────────────────────────────
    const yT = 106;
    preencher(COR.accent);
    doc.roundedRect(M, yT, R - M, 9, 2, 2, 'F');
    doc.rect(M, yT + 4, R - M, 5, 'F');   // cobre os cantos de baixo: só o topo fica arredondado
    const X_DESC = 24, W_DESC = 72, X_DATA = 100, X_FORMA = 141, W_FORMA = 21, X_VALOR = 186;
    fonte('bold', 8, COR.branco);
    doc.text('DESCRIÇÃO', X_DESC, yT + 5.8);
    doc.text('DATA DO PAGAMENTO', X_DATA, yT + 5.8);
    doc.text('FORMA', X_FORMA, yT + 5.8);
    doc.text('VALOR', X_VALOR, yT + 5.8, { align: 'right' });

    const linha = linhaTabelaRecibo(r);
    fonte('bold', 9.5, COR.ink);
    const descLinhas = limitarLinhas(doc.splitTextToSize(linha.descricao, W_DESC) as string[], 3);
    // Abaixo da descrição, em cinza: nº do contrato e objeto (até 2 linhas).
    fonte('normal', 8, COR.muted);
    const notas = [
        ...(linha.contrato ? [linha.contrato] : []),
        ...(linha.objeto ? limitarLinhas(doc.splitTextToSize(linha.objeto, W_DESC) as string[], 2) : []),
    ];
    const yL = yT + 9;
    const hL = Math.max(12, 5 + 4.6 * descLinhas.length + 4.2 * notas.length + 3);
    preencher(COR.zebra);
    doc.rect(M, yL, R - M, hL, 'F');
    fonte('bold', 9.5, COR.ink);
    descLinhas.forEach((l, i) => doc.text(l, X_DESC, yL + 6.5 + i * 4.6));
    if (notas.length) {
        fonte('normal', 8, COR.muted);
        notas.forEach((l, i) => doc.text(l, X_DESC, yL + 6.5 + descLinhas.length * 4.6 + i * 4.2));
    }
    fonte('normal', 9.5, COR.ink);
    doc.text(linha.data, X_DATA, yL + 6.5);
    fonte('normal', corpoQueCabe(linha.forma, W_FORMA, 9.5, 7.5, 'normal'), COR.ink);
    doc.text(linha.forma, X_FORMA, yL + 6.5);
    fonte('bold', 9.5, COR.ink);
    doc.text(linha.valor, X_VALOR, yL + 6.5, { align: 'right' });
    tracar(COR.line);
    doc.line(M, yL + hL, R, yL + hL);
    const yFimTabela = yL + hL;

    // A declaração é medida ANTES dos itens: o espaço dos itens é o que sobra entre a
    // tabela e a declaração, para a assinatura não passar do rodapé.
    const declaracao = textoRecibo(r);
    const FATOR = 1.45, PT_DECL = 9.5;
    fonte('normal', PT_DECL, COR.ink);
    let linhasDecl = doc.splitTextToSize(declaracao, 98) as string[];
    const declAbaixo = arranjoDeclaracao(linhasDecl.length) === 'abaixo';
    const nDecl = declAbaixo
        ? limitarLinhas(doc.splitTextToSize(declaracao, R - M) as string[], 16).length
        : linhasDecl.length;
    const alturaDecl = (declAbaixo ? 20 : 5) + (nDecl - 1) * alturaLinhaMm(PT_DECL, FATOR);

    // ── 4b. Itens do contrato (só quando o recibo vem de contrato com itens) ──
    let yFimItens = yFimTabela;
    if (r.contract_items?.length) {
        const H_ITEM = 5.5;
        const X_UNID = 112, X_QTD = 132, X_UNIT = 160;
        const yRotulo = yFimTabela + 10;
        const yCab = yRotulo + 6.5;          // base do texto do cabeçalho
        const yPrimeira = yCab + 7;          // base do texto da 1ª linha
        // Fim da declaração ≤ 214 mm → assinatura (≥ +32) termina antes do aviso de
        // CANCELADO (258) e do rodapé (266).
        const yFimItensMax = 214 - alturaDecl - 14;
        const maxLinhas = Math.floor((yFimItensMax - (yPrimeira - 4) - 2) / H_ITEM);
        const { linhas, resto } = linhasItensContrato(r.contract_items, maxLinhas, r.contract_number);

        rotulo('ITENS DO CONTRATO', M, yRotulo, 8);
        // Cabeçalho: fundo branco, texto na cor das células (guia §6.11 — nunca cinza).
        fonte('bold', 8, COR.ink);
        doc.text('Item', X_DESC, yCab);
        doc.text('Unid.', X_UNID, yCab);
        doc.text('Qtd.', X_QTD, yCab, { align: 'right' });
        doc.text('Valor unit.', X_UNIT, yCab, { align: 'right' });
        doc.text('Total', X_VALOR, yCab, { align: 'right' });
        tracar(COR.line);
        doc.line(M, yCab + 2.5, R, yCab + 2.5);

        let y = yPrimeira;
        for (const l of linhas) {
            fonte('normal', 9, COR.ink);
            doc.text(limitarLinhas(doc.splitTextToSize(l.item, X_UNID - X_DESC - 4) as string[], 1)[0], X_DESC, y);
            doc.text(limitarLinhas(doc.splitTextToSize(l.unid, X_QTD - X_UNID - 12) as string[], 1)[0], X_UNID, y);
            doc.text(l.qtd, X_QTD, y, { align: 'right' });
            doc.text(l.unitario, X_UNIT, y, { align: 'right' });
            doc.text(l.total, X_VALOR, y, { align: 'right' });
            y += H_ITEM;
        }
        if (resto) {
            fonte('normal', 8, COR.muted);
            doc.text(resto, X_DESC, y);
            y += H_ITEM;
        }
        yFimItens = y - H_ITEM + 3;
        tracar(COR.line);
        doc.line(M, yFimItens, R, yFimItens);
    }

    // ── 5. Declaração + barra TOTAL ──────────────────────────────────────────
    const yD = yFimItens + 14;
    preencher(COR.accent);
    doc.roundedRect(126, yD - 6, R - 126, 11, 1.5, 1.5, 'F');
    fonte('bold', 9, COR.branco);
    doc.text('TOTAL', 130, yD + 1.2);
    fonte('bold', 11.5, COR.branco);
    doc.text(brl(r.amount), X_VALOR, yD + 1.2, { align: 'right' });

    fonte('normal', PT_DECL, COR.ink);
    let yDecl: number;
    if (declAbaixo) {
        linhasDecl = limitarLinhas(doc.splitTextToSize(declaracao, R - M) as string[], 16);
        rotulo('DECLARAÇÃO', M, yD + 14, 8);
        yDecl = yD + 20;
    } else {
        rotulo('DECLARAÇÃO', M, yD - 1, 8);
        yDecl = yD + 5;
    }
    fonte('normal', PT_DECL, COR.ink);
    doc.text(linhasDecl, M, yDecl, { lineHeightFactor: FATOR });
    const yFimDecl = yDecl + (linhasDecl.length - 1) * alturaLinhaMm(PT_DECL, FATOR);

    // ── 6. Assinatura — de quem RECEBEU: a organização ou o credor ───────────
    const ySig = Math.max(yFimDecl + 32, 220);
    const assinante = assinanteDoRecibo(r);
    tracar(COR.muted);
    doc.line(112, ySig, R, ySig);
    const xSig = (112 + R) / 2;
    fonte('bold', corpoQueCabe(assinante.nome, 78, 9.5, 7.5, 'bold'), COR.ink);
    doc.text(assinante.nome, xSig, ySig + 5, { align: 'center' });
    fonte('normal', 8, COR.muted);
    doc.text([assinante.documento, assinante.papel].filter(Boolean).join(' · '), xSig, ySig + 9.5, { align: 'center' });
    if (pagamento) {
        // O papel é preparado para colher a assinatura do credor: leva local e data.
        fonte('normal', 9, COR.ink);
        doc.text('Local e data: ______________________________', M, ySig);
    }

    // ── 8. Cancelado (desenhado antes do rodapé, que é texto fixo) ───────────
    if (r.cancelled_at) {
        fonte('bold', 64, COR.vermelho);
        doc.text('CANCELADO', W / 2, H / 2, { align: 'center', angle: 30 });
        fonte('bold', 9, COR.vermelho);
        doc.text(`Recibo cancelado em ${dataDeTimestampBR(r.cancelled_at)} (baixa estornada).`, W / 2, 258, { align: 'center' });
    }

    // ── 7. Rodapé ────────────────────────────────────────────────────────────
    tracar(COR.line);
    doc.line(M, 266, R, 266);
    rotulo('CONTATO', M, 271.5, 7.5);
    {
        let y = 276.5;
        fonte('normal', 8, COR.muted);
        const endereco = (r.issuer_address ?? '').trim();
        if (endereco) {
            for (const l of limitarLinhas(doc.splitTextToSize(endereco, 100) as string[], 2)) {
                doc.text(l, M, y);
                y += 4;
            }
        }
        const contato = linhasContatoEmitente(extras.contato).join('  ·  ');
        if (contato) {
            fonte('normal', corpoQueCabe(contato, 100, 8, 7, 'normal'), COR.muted);
            doc.text(contato, M, y);
        }
    }
    desenharLogo(R, 269.5, 22, 9, true);
    const [rodape1, rodape2] = rodapeRecibo(r);
    fonte('normal', 7, COR.cinzaRodape);
    doc.text(rodape1, R, 284, { align: 'right' });
    doc.text(rodape2, R, 288, { align: 'right' });

    return doc;
}
