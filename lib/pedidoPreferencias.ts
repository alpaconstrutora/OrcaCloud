/**
 * Preferências de Suprimentos › Pedidos de Compra — os padrões de um pedido NOVO.
 *
 * Pedido do usuário (09/11/2026): botão "Preferências" com plano de contas, centro de
 * custo, condição de pagamento, forma de entrega, forma de pagamento e, das sugestões,
 * conta de pagamento, local de entrega, prazo de entrega e observações padrão.
 * Plano: docs/planos/2026-11-09-pedido-compra-preferencias.md
 *
 * Três camadas, campo a campo: PESSOAL (do usuário, por organização) > EMPRESA
 * (da organização, gravada por owner/admin) > SISTEMA (as constantes que o
 * formulário sempre usou). Campo ausente numa camada = herda da de baixo.
 *
 * Regra que segura o formulário: o padrão só preenche campo que o usuário NÃO
 * mexeu (mesmo princípio de `utils/warrantyAutofill.ts`).
 */
import { FORMA_ENTREGA_CIF, FORMAS_DE_ENTREGA } from '../utils/formaEntrega';

export interface PadroesDoPedido {
    planoDeContasId?: string;
    costCenterId?: string;
    paymentTermType?: 'Vista' | 'Parcelado';
    paymentDays?: number;
    paymentInstallments?: number;
    paymentMethod?: string;
    /** Id da conta (o formulário grava o NOME em `bankAccount`; a tela traduz). */
    paymentAccountId?: string;
    deliveryMethod?: string;
    deliveryLocation?: string;
    /** Dias após a emissão para a previsão de entrega. */
    prazoEntregaDias?: number;
    notes?: string;
    notesVisibleToSupplier?: boolean;
}

export type CampoPadrao = keyof PadroesDoPedido;
export type OrigemDoPadrao = 'PESSOAL' | 'EMPRESA' | 'SISTEMA';

export const CHAVE_EMPRESA = 'suprimentos.pedido.padroes';
export const chavePessoal = (orgId: string) => `${CHAVE_EMPRESA}.${orgId}`;

/** Lista única das formas de pagamento do pedido (antes inline no formulário). */
export const FORMAS_PAGAMENTO_PEDIDO: { value: string; label: string }[] = [
    { value: 'Boleto', label: 'Boleto Bancário' },
    { value: 'Pix', label: 'Pix' },
    { value: 'Cartão de Crédito', label: 'Cartão de Crédito' },
    { value: 'Cartão de Débito', label: 'Cartão de Débito' },
    { value: 'Transferência', label: 'Transferência Bancária' },
    { value: 'Dinheiro', label: 'Dinheiro' },
];

export const LIMITE_OBSERVACAO = 1000;

/** O que o formulário sempre usou quando ninguém definiu nada. */
export const PADROES_DO_SISTEMA: Required<Omit<PadroesDoPedido, 'planoDeContasId' | 'costCenterId' | 'paymentAccountId' | 'prazoEntregaDias' | 'notes'>> = {
    paymentTermType: 'Vista',
    paymentDays: 30,
    paymentInstallments: 1,
    paymentMethod: 'Boleto',
    deliveryMethod: FORMA_ENTREGA_CIF,
    deliveryLocation: 'Canteiro de Obras',
    notesVisibleToSupplier: true,
};

const texto = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const inteiro = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

/**
 * Valor lido do banco → só os campos conhecidos e válidos. O que vier errado
 * (chave velha, tipo trocado, forma que saiu da lista) é ignorado e o campo
 * herda da camada de baixo, em vez de quebrar o formulário.
 */
export function sanearPadroes(valor: unknown): PadroesDoPedido {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    const v = valor as Record<string, unknown>;
    const p: PadroesDoPedido = {
        planoDeContasId: texto(v.planoDeContasId, 64),
        costCenterId: texto(v.costCenterId, 64),
        paymentTermType: v.paymentTermType === 'Vista' || v.paymentTermType === 'Parcelado' ? v.paymentTermType : undefined,
        paymentDays: inteiro(v.paymentDays, 0, 365),
        paymentInstallments: inteiro(v.paymentInstallments, 1, 60),
        paymentMethod: FORMAS_PAGAMENTO_PEDIDO.some(f => f.value === v.paymentMethod) ? (v.paymentMethod as string) : undefined,
        paymentAccountId: texto(v.paymentAccountId, 64),
        deliveryMethod: (FORMAS_DE_ENTREGA as readonly string[]).includes(v.deliveryMethod as string) ? (v.deliveryMethod as string) : undefined,
        deliveryLocation: texto(v.deliveryLocation, 200),
        prazoEntregaDias: inteiro(v.prazoEntregaDias, 0, 365),
        notes: texto(v.notes, LIMITE_OBSERVACAO),
        notesVisibleToSupplier: typeof v.notesVisibleToSupplier === 'boolean' ? v.notesVisibleToSupplier : undefined,
    };
    return Object.fromEntries(Object.entries(p).filter(([, x]) => x !== undefined)) as PadroesDoPedido;
}

/** `true` quando a camada não define nada (gravar = apagar a linha). */
export const vazio = (p: PadroesDoPedido) => Object.keys(sanearPadroes(p)).length === 0;

export interface PadroesResolvidos {
    valores: PadroesDoPedido;
    origem: Partial<Record<CampoPadrao, OrigemDoPadrao>>;
}

/** Campo a campo: pessoal > empresa > sistema. */
export function resolverPadroes(empresa: PadroesDoPedido, pessoal: PadroesDoPedido): PadroesResolvidos {
    const valores: PadroesDoPedido = {};
    const origem: Partial<Record<CampoPadrao, OrigemDoPadrao>> = {};
    const camadas: [OrigemDoPadrao, PadroesDoPedido][] = [
        ['SISTEMA', PADROES_DO_SISTEMA], ['EMPRESA', sanearPadroes(empresa)], ['PESSOAL', sanearPadroes(pessoal)],
    ];
    for (const [nome, camada] of camadas) {
        for (const [campo, valor] of Object.entries(camada) as [CampoPadrao, unknown][]) {
            if (valor === undefined) continue;
            (valores as Record<string, unknown>)[campo] = valor;
            origem[campo] = nome;
        }
    }
    return { valores, origem };
}

/**
 * Os campos que o padrão pode escrever agora: definidos no padrão e não
 * mexidos à mão. Devolve só o recorte a aplicar.
 */
export function camposAPreencher(padroes: PadroesDoPedido, mexidos: ReadonlySet<CampoPadrao>): PadroesDoPedido {
    return Object.fromEntries(
        Object.entries(padroes).filter(([campo, valor]) => valor !== undefined && !mexidos.has(campo as CampoPadrao)),
    ) as PadroesDoPedido;
}

/** Previsão de entrega = hoje (data LOCAL, sem fuso) + dias. */
export function dataPrevistaDeEntrega(dias: number, hoje: Date = new Date()): string {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ROTULO_ORIGEM: Record<OrigemDoPadrao, string> = {
    PESSOAL: 'seu padrão',
    EMPRESA: 'padrão da empresa',
    SISTEMA: 'padrão do sistema',
};
