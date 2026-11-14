// Imports com `.ts`: este arquivo também roda no Deno (Edge Function `pedido-fast`).
import { round2 } from '../utils/financialMath.ts';
import { FORMA_ENTREGA_FOB } from '../utils/formaEntrega.ts';
import { validateCpfCnpj } from './validators.ts';

/**
 * Pedido Fast — a regra de montar o pedido a partir da foto da nota/recibo.
 * Plano: docs/planos/2026-11-14-pedido-fast.md.
 *
 * PURO: sem banco, sem rede. A Edge Function `pedido-fast` (app logado e link
 * do celular) importa daqui — uma regra, um lugar. Testes:
 * `__tests__/pedidoFast.test.ts`.
 *
 * Decisões do usuário (14/11/2026):
 *   · nasce FOB "Retirado" (`Entregue`), sem título — o gestor confere e Recebe;
 *   · o comprador fica em `criado_por` (e no carimbo das observações);
 *   · a compra nunca se perde: leitura que falha vira pedido sem itens, com a
 *     foto anexada e o motivo nas observações.
 */

export const ORIGEM_FAST = 'FAST' as const;

/** Até 3 fotos por pedido (nota comprida em mais de uma foto). */
export const MAX_FOTOS_FAST = 3;

/** `confidence` abaixo disto → o detalhe pede conferência do item. */
export const CONFIANCA_BAIXA = 0.6;

/** Diferença tolerada entre a soma dos itens e o total da nota (arredondamentos). */
export const TOLERANCIA_TOTAL = 0.05;

export type TipoDocumentoFast = 'NOTA_FISCAL' | 'CUPOM_FISCAL' | 'RECIBO' | 'OUTRO';

export interface ItemLidoFast {
    descricao: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
    /** 0..1 — quanto a IA confia neste item. */
    confidence: number;
}

/** O que a IA devolve (structured output — `ESQUEMA_LEITURA_FAST`). */
export interface LeituraFast {
    legivel: boolean;
    tipo_documento: TipoDocumentoFast;
    fornecedor: { nome: string; cnpj_cpf: string };
    /** AAAA-MM-DD, ou '' quando não dá para ler. */
    data: string;
    numero_documento: string;
    itens: ItemLidoFast[];
    desconto: number;
    acrescimo: number;
    total: number;
    observacoes: string;
}

/**
 * JSON Schema do structured output. Sem minLength/maximum etc. — restrições
 * não suportadas por structured outputs (mesma nota de `read-matricula`).
 */
export const ESQUEMA_LEITURA_FAST = {
    type: 'object',
    additionalProperties: false,
    properties: {
        legivel: { type: 'boolean', description: 'false se a imagem não é uma nota/recibo de compra ou está ilegível' },
        tipo_documento: { type: 'string', enum: ['NOTA_FISCAL', 'CUPOM_FISCAL', 'RECIBO', 'OUTRO'] },
        fornecedor: {
            type: 'object',
            additionalProperties: false,
            properties: {
                nome: { type: 'string', description: 'Razão social ou nome fantasia da loja; vazio se não aparece' },
                cnpj_cpf: { type: 'string', description: 'CNPJ ou CPF do EMITENTE (a loja), como impresso; vazio se não aparece' },
            },
            required: ['nome', 'cnpj_cpf'],
        },
        data: { type: 'string', description: 'Data de emissão no formato AAAA-MM-DD; vazio se não aparece' },
        numero_documento: { type: 'string', description: 'Número da nota/cupom/recibo; vazio se não aparece' },
        itens: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    descricao: { type: 'string' },
                    unidade: { type: 'string', description: 'Unidade como impressa (UN, PC, KG, M, M2, M3, SC, L, CX...); vazio se não aparece' },
                    quantidade: { type: 'number' },
                    valor_unitario: { type: 'number', description: 'Valor unitário em reais; 0 se não aparece' },
                    valor_total: { type: 'number', description: 'Valor total da linha em reais; 0 se não aparece' },
                    confidence: { type: 'number', description: 'Confiança 0..1 na leitura desta linha' },
                },
                required: ['descricao', 'unidade', 'quantidade', 'valor_unitario', 'valor_total', 'confidence'],
            },
        },
        desconto: { type: 'number', description: 'Desconto total da nota em reais; 0 se não há' },
        acrescimo: { type: 'number', description: 'Frete/acréscimos em reais; 0 se não há' },
        total: { type: 'number', description: 'Valor total a pagar impresso na nota; 0 se não aparece' },
        observacoes: { type: 'string', description: 'O que ficou ilegível ou duvidoso, em uma frase; vazio se nada' },
    },
    required: ['legivel', 'tipo_documento', 'fornecedor', 'data', 'numero_documento', 'itens', 'desconto', 'acrescimo', 'total', 'observacoes'],
} as const;

const TIPOS: readonly TipoDocumentoFast[] = ['NOTA_FISCAL', 'CUPOM_FISCAL', 'RECIBO', 'OUTRO'];

const texto = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const numero = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
    return Number.isFinite(n) ? n : 0;
};
const entre0e1 = (v: unknown): number => Math.min(1, Math.max(0, numero(v)));

/** Leitura que não leu nada — para foto ilegível, recusa da IA ou falha de rede. */
export function leituraVazia(observacoes = ''): LeituraFast {
    return {
        legivel: false,
        tipo_documento: 'OUTRO',
        fornecedor: { nome: '', cnpj_cpf: '' },
        data: '',
        numero_documento: '',
        itens: [],
        desconto: 0,
        acrescimo: 0,
        total: 0,
        observacoes,
    };
}

/**
 * Normaliza o que veio da IA (ou do arquivo guardado no lote). Defensivo: o
 * schema garante a forma, mas nada aqui confia em valor negativo, texto gigante
 * ou campo ausente.
 */
export function normalizarLeitura(bruto: unknown): LeituraFast {
    if (!bruto || typeof bruto !== 'object') return leituraVazia('A leitura veio vazia.');
    const r = bruto as Record<string, unknown>;
    const forn = (r.fornecedor && typeof r.fornecedor === 'object' ? r.fornecedor : {}) as Record<string, unknown>;
    const tipo = TIPOS.includes(r.tipo_documento as TipoDocumentoFast) ? (r.tipo_documento as TipoDocumentoFast) : 'OUTRO';
    const itens = (Array.isArray(r.itens) ? r.itens : [])
        .slice(0, 200)
        .map((i): ItemLidoFast => {
            const it = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
            return {
                descricao: texto(it.descricao, 300),
                unidade: texto(it.unidade, 20),
                quantidade: Math.max(0, numero(it.quantidade)),
                valor_unitario: Math.max(0, numero(it.valor_unitario)),
                valor_total: Math.max(0, numero(it.valor_total)),
                confidence: entre0e1(it.confidence),
            };
        })
        .filter(i => i.descricao.length > 0);
    return {
        legivel: r.legivel !== false && itens.length > 0,
        tipo_documento: tipo,
        fornecedor: { nome: texto(forn.nome, 200), cnpj_cpf: texto(forn.cnpj_cpf, 30) },
        data: texto(r.data, 10),
        numero_documento: texto(r.numero_documento, 60),
        itens,
        desconto: Math.max(0, numero(r.desconto)),
        acrescimo: Math.max(0, numero(r.acrescimo)),
        total: Math.max(0, numero(r.total)),
        observacoes: texto(r.observacoes, 500),
    };
}

const UNIDADES: Record<string, string> = {
    U: 'UN', UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
    PC: 'PC', 'PÇ': 'PC', PCS: 'PC', 'PÇS': 'PC', PCA: 'PC', PECA: 'PC', 'PEÇA': 'PC',
    KG: 'KG', KGS: 'KG', QUILO: 'KG', G: 'G', GR: 'G',
    M: 'M', MT: 'M', MTS: 'M', METRO: 'M', ML: 'ML',
    M2: 'M2', 'M²': 'M2', M3: 'M3', 'M³': 'M3',
    L: 'L', LT: 'L', LTS: 'L', LITRO: 'L',
    SC: 'SC', SACO: 'SC', CX: 'CX', CAIXA: 'CX', RL: 'RL', ROLO: 'RL',
    BD: 'BD', BALDE: 'BD', GL: 'GL', GALAO: 'GL', 'GALÃO': 'GL', LATA: 'LT', TB: 'TB', BR: 'BR', BARRA: 'BR',
    JG: 'JG', JOGO: 'JG', KIT: 'KIT', PAR: 'PAR', CJ: 'CJ', MIL: 'MIL', MILHEIRO: 'MIL',
};

/** Unidade como o pedido grava: maiúscula, sem ponto; vazia vira UN. */
export function normalizarUnidade(unidade: string | null | undefined): string {
    const limpa = (unidade ?? '').toUpperCase().replace(/[.\s]/g, '');
    if (!limpa) return 'UN';
    return UNIDADES[limpa] ?? limpa.slice(0, 10);
}

/** Item do pedido (formato de `purchase_orders.items`). */
export interface ItemDoPedidoFast {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total: number;
    avulso: true;
}

/**
 * Itens do pedido a partir da leitura. O valor lido é o que a LOJA cobrou: vai
 * no par de referência (`unitPrice`/`total`) e o par cotado fica vazio — sem
 * cotação, o valor efetivo (`utils/pedidoItemValor.ts`) é a referência, ou seja,
 * o da nota. `code` = `FAST-n`, n = posição na leitura (o detalhe casa a
 * `confidence` por ele).
 */
export function itensDaLeitura(leitura: LeituraFast): ItemDoPedidoFast[] {
    return leitura.itens.map((i, idx) => {
        const quantidade = i.quantidade > 0 ? i.quantidade : 1;
        const unitario = i.valor_unitario > 0
            ? i.valor_unitario
            : i.valor_total > 0 ? i.valor_total / quantidade : 0;
        const total = i.valor_total > 0 ? i.valor_total : quantidade * unitario;
        return {
            code: `FAST-${idx + 1}`,
            description: i.descricao,
            unit: normalizarUnidade(i.unidade),
            quantity: quantidade,
            unitPrice: round2(unitario),
            total: round2(total),
            avulso: true,
        };
    });
}

export interface ConferenciaDoTotal {
    somaDosItens: number;
    /** soma − desconto + acréscimo */
    totalCalculado: number;
    totalDaNota: number;
    /** totalDaNota − totalCalculado (0 quando a nota não traz total). */
    diferenca: number;
    confere: boolean;
}

export function conferirTotal(leitura: LeituraFast, itens: ItemDoPedidoFast[]): ConferenciaDoTotal {
    const somaDosItens = round2(itens.reduce((s, i) => s + i.total, 0));
    const totalCalculado = round2(somaDosItens - leitura.desconto + leitura.acrescimo);
    const totalDaNota = round2(leitura.total);
    const diferenca = totalDaNota > 0 ? round2(totalDaNota - totalCalculado) : 0;
    return { somaDosItens, totalCalculado, totalDaNota, diferenca, confere: Math.abs(diferenca) <= TOLERANCIA_TOTAL };
}

/** Itens com leitura duvidosa (pelo `code` FAST-n). */
export function codigosComConfiancaBaixa(leitura: LeituraFast): string[] {
    return leitura.itens
        .map((i, idx) => (i.confidence < CONFIANCA_BAIXA ? `FAST-${idx + 1}` : null))
        .filter((c): c is string => c !== null);
}

/** Documento do emitente: só dígitos, e só se for CPF/CNPJ válido. */
export function digitosDoDocumento(doc: string | null | undefined): string {
    const d = (doc ?? '').replace(/\D/g, '');
    return (d.length === 11 || d.length === 14) && validateCpfCnpj(d) ? d : '';
}

/** Máscara como a maioria do cadastro de Fornecedores grava (00.000.000/0000-00, 000.000.000-00). */
export function documentoComMascara(digitos: string): string {
    if (digitos.length === 14) return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (digitos.length === 11) return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return digitos;
}

export function tipoDoFornecedor(digitos: string): 'PF' | 'PJ' {
    return digitos.length === 11 ? 'PF' : 'PJ';
}

/** Nome para casar fornecedor sem documento: minúsculo, sem acento, espaços únicos. */
export function nomeParaCasar(nome: string | null | undefined): string {
    return (nome ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Data da compra: a da nota quando é uma data válida entre 1 ano atrás e
 * amanhã (fuso); fora disso, ou ilegível, `hoje`. Entrada e saída AAAA-MM-DD.
 */
export function dataDaCompra(lida: string, hoje: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lida)) return hoje;
    const d = new Date(`${lida}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== lida) return hoje;
    const h = new Date(`${hoje}T12:00:00Z`).getTime();
    const dia = 24 * 60 * 60 * 1000;
    if (d.getTime() > h + dia || d.getTime() < h - 366 * dia) return hoje;
    return lida;
}

/** Categoria do anexo em `purchase_order_documents`. */
export function categoriaDoAnexo(tipo: TipoDocumentoFast): 'NOTA_FISCAL' | 'RECIBO' | 'OUTRO' {
    if (tipo === 'NOTA_FISCAL' || tipo === 'CUPOM_FISCAL') return 'NOTA_FISCAL';
    if (tipo === 'RECIBO') return 'RECIBO';
    return 'OUTRO';
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export interface ContextoDasObservacoes {
    compradorNome: string;
    leitura: LeituraFast;
    conferencia: ConferenciaDoTotal;
    /** O fornecedor foi identificado (achado ou cadastrado)? */
    fornecedorIdentificado: boolean;
    /** Motivo da falha da leitura, quando falhou. */
    falhaDaLeitura?: string | null;
}

/** Observações internas do pedido — o que o gestor precisa conferir. */
export function observacoesDoFast(c: ContextoDasObservacoes): string {
    const l = c.leitura;
    const linhas = [`Pedido Fast — comprado por ${c.compradorNome || 'comprador'}. Itens lidos da foto: confira antes de Receber.`];
    if (c.falhaDaLeitura || l.itens.length === 0) {
        linhas.push(`Itens a lançar — leitura da foto falhou${c.falhaDaLeitura ? `: ${c.falhaDaLeitura}` : '.'}`);
    }
    if (!c.fornecedorIdentificado) {
        linhas.push(`Fornecedor a conferir: ${l.fornecedor.nome || 'não identificado na foto'}.`);
    }
    if (l.numero_documento) linhas.push(`Documento nº ${l.numero_documento}.`);
    if (l.desconto > 0) linhas.push(`Desconto na nota: ${brl(l.desconto)}.`);
    if (l.acrescimo > 0) linhas.push(`Frete/acréscimo na nota: ${brl(l.acrescimo)}.`);
    if (l.itens.length > 0 && !c.conferencia.confere) {
        linhas.push(`Total da nota ${brl(c.conferencia.totalDaNota)} difere do calculado pelos itens ${brl(c.conferencia.totalCalculado)}.`);
    }
    if (l.observacoes) linhas.push(`Leitura: ${l.observacoes}`);
    return linhas.join('\n');
}

export interface EntradaDoPedidoFast {
    numero: string;
    projectId: string;
    supplierId: string | null;
    leitura: LeituraFast;
    compradorUserId: string;
    compradorNome: string;
    retiradoPorEmployeeId: string | null;
    fornecedorIdentificado: boolean;
    falhaDaLeitura?: string | null;
    /** AAAA-MM-DD no fuso de Brasília. */
    hoje: string;
    /** ISO do momento da criação. */
    agora: string;
}

/** A linha de `purchase_orders` do Pedido Fast (colunas do banco). */
export function montarPedidoFast(e: EntradaDoPedidoFast) {
    const itens = itensDaLeitura(e.leitura);
    const conferencia = conferirTotal(e.leitura, itens);
    const data = dataDaCompra(e.leitura.data, e.hoje);
    return {
        number: e.numero,
        project_id: e.projectId,
        supplier_id: e.supplierId,
        status: 'Entregue',
        status_updated_at: e.agora,
        delivery_date: data,
        actual_delivery_date: data,
        delivery_method: FORMA_ENTREGA_FOB,
        retirado_por_employee_id: e.retiradoPorEmployeeId,
        notes: observacoesDoFast({
            compradorNome: e.compradorNome,
            leitura: e.leitura,
            conferencia,
            fornecedorIdentificado: e.fornecedorIdentificado,
            falhaDaLeitura: e.falhaDaLeitura,
        }),
        notes_visible_to_supplier: false,
        is_financial_approved: false,
        items: itens,
        origem: ORIGEM_FAST,
        criado_por: e.compradorUserId,
        // O nome do comprador vai CONGELADO aqui (como o carimbo do Diário): o detalhe
        // mostra "comprado por" sem ler o perfil de outra pessoa (a RLS pode barrar).
        leitura_ia: {
            ...e.leitura,
            conferencia,
            comprador: { id: e.compradorUserId, nome: e.compradorNome },
            falhaDaLeitura: e.falhaDaLeitura ?? null,
        } satisfies LeituraIaDoPedido,
    };
}

/** O que fica gravado em `purchase_orders.leitura_ia` (e que o detalhe lê). */
export interface LeituraIaDoPedido extends LeituraFast {
    conferencia: ConferenciaDoTotal;
    comprador: { id: string; nome: string };
    falhaDaLeitura: string | null;
}

/** O que a tela mostra no fim ("Pedido PC-… criado · N itens · R$ …"). */
export interface ResultadoDoPedidoFast {
    pedidoId: string;
    numero: string;
    fornecedorNome: string | null;
    fornecedorCadastrado: boolean;
    itens: ItemDoPedidoFast[];
    total: number;
    leituraFalhou: boolean;
    totalConfere: boolean;
}
