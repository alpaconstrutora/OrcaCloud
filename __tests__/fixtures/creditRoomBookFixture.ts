/**
 * Versão congelada de teste para o book de crédito (PDF).
 * `versaoSchema2()` traz tudo (capacidade, carteira, empreendimentos com fotos);
 * `versaoSchema1()` é a versão antiga, sem nenhum bloco da capacidade.
 */
import type { CreditRoomVersion } from '../../types/creditRoom';
import {
    buildSnapshot, computeIndicators,
    type CreditRoomSnapshot, type SnapshotCapacidade, type SnapshotContrato, type SnapshotEmpreendimentoItem,
} from '../../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, type SerieMes } from '../../utils/creditCapacity';
import type { ExtrasDoBook } from '../../utils/creditRoomBook';

/** Nome que só existe num campo NÃO impresso: se aparecer no PDF, vazou. */
export const NOME_DE_CLIENTE = 'Zeferino Sentinela da Silva';

/** JPEG 1×1 válido (só o cabeçalho importa para o jsPDF medir e embutir). */
export const JPEG_1X1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

export const VALOR_MAXIMO_CONGELADO = 1_234_500;

const MESES = Array.from({ length: 36 }, (_, k) => {
    const idx = 2026 * 12 + 11 + k; // dez/2026 em diante
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
});

const serie: SerieMes[] = MESES.map((mes, k) => {
    const vendas = k < 18 ? 120_000 - k * 2_000 : 0;
    const alugueis = 80_000;
    const despesa = 8_000;
    const renda = vendas + alugueis - despesa;
    const atual = 60_000;
    const novo = 45_000;
    return {
        mes, vendas, alugueis, despesa_operacional: despesa, renda_liquida: renda,
        servico_atual: atual, servico_novo: novo, folga: renda - atual - novo,
        dscr: Math.round((renda / (atual + novo)) * 100) / 100,
    };
});

const capacidade: SnapshotCapacidade = {
    fonte: 'creditCapacity', data_base: '2026-11-20',
    parametros: PARAMETROS_CAPACIDADE_PADRAO, base: 'CONTRATADA', serie,
    recebido_12m: [
        { mes: '2026-09', vendas: 0, alugueis: 0 },
        { mes: '2026-10', vendas: 90_000, alugueis: 70_000 },
        { mes: '2026-11', vendas: 95_000, alugueis: 72_000 },
    ],
    vencido_na_data_base: 15_000, a_vencer_mes_corrente: 20_000,
    estoque: { vgv_disponivel: 3_000_000, haircut_pct: 30, valor_elegivel: 2_100_000 },
    capacidade_maxima: { parcela_maxima: 31_000, valor_maximo: VALOR_MAXIMO_CONGELADO },
    alertas: [{ tipo: 'LOCACAO_PRAZO_INDETERMINADO', qtd: 2, valor: 9_000 }],
    por_organizacao: [{ organization_id: 'org-1', renda_12m: 1_500_000, servico_12m: 700_000, divida_total: 4_000_000 }],
};

const contrato = (o: Partial<SnapshotContrato>): SnapshotContrato => ({
    rotulo: 'Comprador 01', tipo: 'VENDA', contract_id: 'c1', organization_id: 'org-1', empreendimento_id: 'emp-1',
    unidade: 'Apto 101', valor_contrato: 450_000, parcela_mensal: 3_500, saldo_a_receber: 300_000, vencido: 0,
    primeiro_vencimento: '2026-01-10', ultimo_vencimento: '2030-12-10', status: 'EM_DIA', tem_parcelas: true, ...o,
});

const empreendimentos: SnapshotEmpreendimentoItem[] = [
    {
        id: 'emp-1', nome: 'Garden Cambuhy', organization_id: 'org-1', cidade: 'Araraquara', uf: 'SP', objetivo: 'MISTO',
        unidades_total: 40, vendidas: 22, alugadas: 6, disponiveis: 12, vgv_total: 18_000_000, vgv_vendido: 10_000_000,
        vgv_disponivel: 3_000_000, renda_mensal: 48_000,
        capa: 'https://x.test/capa-1.jpg',
        fotos: [
            { url: 'https://x.test/capa-1.jpg', legenda: null }, // repetida da capa: não duplica
            { url: 'https://x.test/foto-2.jpg', legenda: 'Fachada' },
            { url: 'https://x.test/foto-quebrada.jpg', legenda: null }, // dataURL inválido
            { url: 'https://x.test/foto-404.jpg', legenda: null }, // não baixou
            { url: 'https://x.test/foto-5.jpg', legenda: null }, // 5ª: fora do limite de 4
        ],
    },
    {
        id: 'emp-2', nome: 'Residencial Sem Fotos', organization_id: 'org-1', cidade: null, uf: null, objetivo: 'LOCACAO',
        unidades_total: 10, vendidas: 0, alugadas: 8, disponiveis: 2, vgv_total: 0, vgv_vendido: 0, vgv_disponivel: 0,
        renda_mensal: 32_000, capa: null, fotos: [],
    },
];

const contratos: SnapshotContrato[] = [
    // O nome do cliente NÃO é campo do snapshot; este está aqui só para provar que nada o imprime.
    { ...contrato({}), ...({ cliente_nome: NOME_DE_CLIENTE } as object) },
    contrato({ rotulo: 'Comprador 02', contract_id: 'c2', unidade: 'Apto 202', vencido: 8_000, status: 'EM_ATRASO' }),
    contrato({
        rotulo: 'Locatário 01', tipo: 'LOCACAO', contract_id: 'c3', empreendimento_id: 'emp-2', unidade: 'Sala 3',
        valor_contrato: 0, parcela_mensal: 4_200, saldo_a_receber: 0, status: 'SEM_PARCELAS', tem_parcelas: false,
        primeiro_vencimento: null, ultimo_vencimento: null,
    }),
];

const BASE = {
    dataBase: '2026-11-20',
    operacao: {
        requestedAmount: 5_000_000, termMonths: 60, graceMonths: 12, modality: 'Financiamento à produção',
        purpose: 'Conclusão da torre B', institutionName: 'Banco Exemplo',
        eligibleFlows: { noi: true, receivables: true, operating_cash: false },
        guarantees: [{ kind: 'IMOVEL' as const, description: 'Terreno matrícula 123', value: 8_000_000, haircut_pct: 30 }],
        equityCommitted: 2_000_000, equityContributed: 1_500_000,
    },
    novoServico12m: null,
    empreendimento: { id: 'emp-1', name: 'Garden Cambuhy' },
    documentVersionIds: [] as string[],
};

const versao = (snapshot: CreditRoomSnapshot, no: number): CreditRoomVersion => ({
    id: `v${no}`, organizationId: 'org-1', creditRoomId: 'room-1', versionNo: no, label: 'Comitê de novembro',
    dataBase: '2026-11-20', snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [],
    frozenAt: '2026-11-20T12:00:00Z',
});

export function versaoSchema2(): CreditRoomVersion {
    const snapshot: CreditRoomSnapshot = {
        ...buildSnapshot(BASE),
        escopo: {
            fonte: 'creditRoom', data_base: '2026-11-20', tipo: 'GRUPO',
            organizacoes: [{ id: 'org-1', nome: 'Alpha Empreendimentos', cnpj: null }, { id: 'org-2', nome: 'Beta Locações', cnpj: null }],
        },
        empreendimentos, contratos, capacidade,
        qualidade: {
            fonte: 'creditCapacity', data_base: '2026-11-20',
            concentracao_top5_pct: 41.5, wale_anos: 3.2, locacoes_prazo_indeterminado: 2, pontualidade_12m_pct: null,
        },
    };
    return versao(snapshot, 3);
}

/** Versão antiga: nenhum bloco da capacidade, da carteira nem dos empreendimentos. */
export function versaoSchema1(): CreditRoomVersion {
    const cheio = { ...buildSnapshot(BASE), schema: 1 as const } as CreditRoomSnapshot;
    delete cheio.escopo;
    delete cheio.empreendimentos;
    delete cheio.contratos;
    delete cheio.capacidade;
    delete cheio.qualidade;
    return versao(cheio, 1);
}

export const extrasPadrao = (over: Partial<ExtrasDoBook> = {}): ExtrasDoBook => ({
    room: { code: 'CR-0007', name: 'Operação Torre B', institutionName: 'Banco Exemplo' },
    imagens: {
        'https://x.test/capa-1.jpg': JPEG_1X1,
        'https://x.test/foto-2.jpg': JPEG_1X1,
        'https://x.test/foto-quebrada.jpg': 'data:image/jpeg;base64,AAAA',
    },
    documentos: [
        { nome: 'Matrícula do terreno.pdf', categoria: 'Garantias', empresa: 'Alpha Empreendimentos' },
        { nome: 'Certidão negativa.pdf', categoria: 'Fiscal', empresa: null },
    ],
    ...over,
});
