/**
 * Portal de Crédito · Credit Room — CRUD, snapshot, participantes, Data Room,
 * solicitações, comentários e auditoria.
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (item 4)
 *
 * REGRA #5: `organizationId` pode ser `null` ("Todas as organizações") e isso
 * NUNCA bloqueia leitura — o `.eq()` só entra quando há org. A RLS recorta o
 * resto. Modelo: services/debtService.ts.
 *
 * O que este serviço NÃO faz: calcular. Dívida, KPIs da obra, NOI e unidades
 * vêm dos serviços donos (debtAnalyticsService, opuraAnalyticsService,
 * rentalNoiService, empreendimentoService); `freezeVersion` só os reúne e
 * entrega a `utils/creditRoomSnapshot.ts`, que é puro e testado.
 */

import { supabase } from '../lib/supabase';
import type {
    CreditRoom,
    CreditRoomAccessAction,
    CreditRoomAccessLog,
    CreditRoomComment,
    CreditRoomCommentVisibility,
    CreditRoomDisbursement,
    CreditRoomDisbursementStatus,
    CreditRoomDocument,
    CreditRoomFundingEntry,
    CreditRoomInput,
    CreditRoomMember,
    CreditRoomMemberInput,
    CreditRoomRequest,
    CreditRoomRequestInput,
    CreditRoomRequestStatus,
    CreditRoomSide,
    CreditRoomStatus,
    CreditRoomVersion,
    MyCreditRoomMembership,
} from '../types/creditRoom';
import { PERMISSOES_PADRAO } from '../types/creditRoom';
import {
    buildSnapshot,
    computeIndicators,
    orcadoDoOrcamento,
    servicoPrimeirosMeses,
    type CreditRoomIndicators,
    type CreditRoomSnapshot,
    type SnapshotCapacidade,
    type SnapshotEmpreendimentoItem,
    type SnapshotEscopo,
} from '../utils/creditRoomSnapshot';
import {
    PARAMETROS_CAPACIDADE_PADRAO,
    mensagemSemAcessoAoGrupo,
    montarCapacidade,
    orgsForaDoAcesso,
    parametrosEfetivos,
    qualidadeDaRenda,
    rendaMensalDoEmpreendimento,
    type CapacidadeEntrada,
    type FluxosElegiveis,
    type LocacaoVigente,
    type Natureza,
    type ParametrosCapacidade,
    type TituloCarteira,
} from '../utils/creditCapacity';
import { montarCarteira } from '../utils/creditRoomCarteira';
import { buildSchedule } from '../utils/debtAmortization';
import { round2 } from '../utils/financialMath';
import { originIdFromRef, refPrefixOrFilter } from '../lib/receivableRef';
import { STATUS_SERVICO_VALIDOS, resumirServico, type ContratoDeServico, type ResumoDeServico } from '../utils/creditRoomServico';
import { getDealInstallmentValue } from '../lib/rentalPortfolio';
import { etapaMaisAvancada, rotuloDaEtapaDeLocacao, situacaoDeLocacao } from '../utils/creditRoomLocacaoEtapa';
import { saleDealStage } from '../lib/salesAnalysis';
import type { Receivable } from '../types/financial';
import type { DebtPosition } from '../types/debt';
import { calcularEac, escolherCustoTotal, type ItemContratado, type ItemOrcado } from '../utils/creditRoomEac';
import { avaliarCovenant, type AvaliacaoCovenant } from '../utils/covenantAvaliacao';
import { calculateProjectProgress } from '../utils/projectUtils';
import { hojeLocalISO } from '../utils/periodoControladoria';
import {
    agruparSugestoes,
    estaVencido,
    type DocumentoSugerido,
    type GrupoDeSugestoes,
    type OrigemSugestao,
} from '../utils/creditRoomSugestoes';
import { debtCovenantService, type DebtCovenant, type DebtCovenantInput } from './debtCovenantService';
import { debtAnalyticsService } from './debtAnalyticsService';
import { debtService } from './debtService';
import { opuraAnalyticsService } from './opuraAnalyticsService';
import { rentalNoiService } from './rentalNoiService';
import { empreendimentoService } from './empreendimentoService';
import { documentService } from './documentService';
import { receivableService } from './receivableService';
import { fotosDosEmpreendimentos } from './empreendimentoMidiaService';

// ⚠️ supabase-js exige string LITERAL em `.select()` — concatenar vira
// `string` e o cliente devolve GenericStringError.
const ROOM_COLS =
    'id, organization_id, seq, code, name, company_id, empreendimento_id, project_id, debt_contract_id, institution_supplier_id, institution_name, requested_amount, purpose, modality, term_months, grace_months, eligible_flows, guarantees, funding_sources, funding_uses, equity_committed, equity_contributed, escopo, grupo_organization_ids, empreendimento_ids, parametros_capacidade, status, active_version_id, notes, created_by, created_at, updated_at';

const VERSION_COLS =
    'id, organization_id, credit_room_id, version_no, label, data_base, snapshot, indicators, document_version_ids, notes, frozen_by, frozen_at';

const MEMBER_COLS =
    'id, organization_id, credit_room_id, email, user_id, name, institution, side, permissions, invited_by, invited_at, expires_at, revoked_at, revoked_by, last_access_at';

const REQUEST_COLS =
    'id, organization_id, credit_room_id, title, description, from_side, assignee_email, due_at, priority, status, answer_document_id, created_by, created_at, updated_at';

const COMMENT_COLS =
    'id, organization_id, credit_room_id, request_id, visibility, author_email, author_side, body, created_at';

const LOG_COLS =
    'id, credit_room_id, actor_user_id, actor_email, actor_side, action, resource_type, resource_id, metadata, ip, user_agent, created_at';

const DISBURSEMENT_COLS =
    'id, organization_id, debt_contract_id, credit_room_id, seq, status, requested_amount, approved_amount, gross_amount, net_amount, disbursed_at, purpose, measurement_ref, physical_pct, analysis_notes, decided_at, decided_by, document_url, notes, created_at, updated_at';

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));
const num = (v: unknown): number => (v == null ? 0 : Number(v));

function mapRoom(r: Row): CreditRoom {
    const flows = (r.eligible_flows ?? {}) as Partial<CreditRoom['eligibleFlows']>;
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        seq: num(r.seq),
        code: String(r.code ?? ''),
        name: String(r.name ?? ''),
        companyId: str(r.company_id),
        empreendimentoId: str(r.empreendimento_id),
        projectId: str(r.project_id),
        debtContractId: str(r.debt_contract_id),
        institutionSupplierId: str(r.institution_supplier_id),
        institutionName: str(r.institution_name),
        requestedAmount: num(r.requested_amount),
        purpose: str(r.purpose),
        modality: str(r.modality),
        termMonths: r.term_months == null ? undefined : num(r.term_months),
        graceMonths: r.grace_months == null ? undefined : num(r.grace_months),
        eligibleFlows: {
            noi: flows.noi ?? true,
            receivables: flows.receivables ?? false,
            operating_cash: flows.operating_cash ?? false,
        },
        guarantees: Array.isArray(r.guarantees) ? (r.guarantees as CreditRoom['guarantees']) : [],
        fundingSources: Array.isArray(r.funding_sources) ? (r.funding_sources as CreditRoom['fundingSources']) : [],
        fundingUses: Array.isArray(r.funding_uses) ? (r.funding_uses as CreditRoom['fundingUses']) : [],
        equityCommitted: num(r.equity_committed),
        equityContributed: num(r.equity_contributed),
        escopo: r.escopo === 'GRUPO' ? 'GRUPO' : 'EMPRESA',
        grupoOrganizationIds: Array.isArray(r.grupo_organization_ids) ? (r.grupo_organization_ids as unknown[]).map(String) : [],
        empreendimentoIds: Array.isArray(r.empreendimento_ids) ? (r.empreendimento_ids as unknown[]).map(String) : [],
        // `null` gravado no jsonb não pode apagar o padrão (`{ dscr_minimo: null }`
        // viraria DSCR mínimo nulo): só as chaves com valor entram por cima.
        parametrosCapacidade: {
            ...PARAMETROS_CAPACIDADE_PADRAO,
            ...(Object.fromEntries(
                Object.entries((r.parametros_capacidade ?? {}) as Record<string, unknown>).filter(([, v]) => v != null),
            ) as Partial<ParametrosCapacidade>),
        },
        status: String(r.status) as CreditRoomStatus,
        activeVersionId: str(r.active_version_id),
        notes: str(r.notes),
        createdBy: str(r.created_by),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}

function toRoomRow(input: CreditRoomInput): Row {
    // Campos da capacidade só vão quando vieram: ausente = não mexe na coluna
    // (um `update()` de quem ainda não os edita não pode zerá-los).
    const capacidade: Row = {};
    if (input.escopo !== undefined) capacidade.escopo = input.escopo;
    if (input.grupoOrganizationIds !== undefined) capacidade.grupo_organization_ids = input.grupoOrganizationIds;
    if (input.empreendimentoIds !== undefined) capacidade.empreendimento_ids = input.empreendimentoIds;
    if (input.parametrosCapacidade !== undefined) capacidade.parametros_capacidade = input.parametrosCapacidade;
    return {
        ...capacidade,
        name: input.name,
        company_id: input.companyId ?? null,
        empreendimento_id: input.empreendimentoId ?? null,
        project_id: input.projectId ?? null,
        debt_contract_id: input.debtContractId ?? null,
        institution_supplier_id: input.institutionSupplierId ?? null,
        institution_name: input.institutionName ?? null,
        requested_amount: input.requestedAmount,
        purpose: input.purpose ?? null,
        modality: input.modality ?? null,
        term_months: input.termMonths ?? null,
        grace_months: input.graceMonths ?? null,
        eligible_flows: input.eligibleFlows,
        guarantees: input.guarantees ?? [],
        funding_sources: input.fundingSources ?? [],
        funding_uses: input.fundingUses ?? [],
        equity_committed: input.equityCommitted,
        equity_contributed: input.equityContributed,
        status: input.status,
        notes: input.notes ?? null,
    };
}

function mapVersion(r: Row): CreditRoomVersion {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        versionNo: num(r.version_no),
        label: str(r.label),
        dataBase: String(r.data_base),
        snapshot: r.snapshot as CreditRoomSnapshot,
        indicators: (r.indicators ?? {}) as CreditRoomIndicators,
        documentVersionIds: Array.isArray(r.document_version_ids) ? (r.document_version_ids as string[]) : [],
        notes: str(r.notes),
        frozenBy: str(r.frozen_by),
        frozenAt: String(r.frozen_at),
    };
}

function mapMember(r: Row): CreditRoomMember {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        email: String(r.email),
        userId: str(r.user_id),
        name: str(r.name),
        institution: str(r.institution),
        side: String(r.side) as CreditRoomSide,
        permissions: { ...PERMISSOES_PADRAO, ...((r.permissions ?? {}) as Partial<CreditRoomMember['permissions']>) },
        invitedBy: str(r.invited_by),
        invitedAt: String(r.invited_at),
        expiresAt: str(r.expires_at),
        revokedAt: str(r.revoked_at),
        revokedBy: str(r.revoked_by),
        lastAccessAt: str(r.last_access_at),
    };
}

function mapRequest(r: Row): CreditRoomRequest {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        title: String(r.title ?? ''),
        description: str(r.description),
        fromSide: String(r.from_side) as CreditRoomSide,
        assigneeEmail: str(r.assignee_email),
        dueAt: str(r.due_at),
        priority: String(r.priority) as CreditRoomRequest['priority'],
        status: String(r.status) as CreditRoomRequestStatus,
        answerDocumentId: str(r.answer_document_id),
        createdBy: String(r.created_by ?? ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}

function mapComment(r: Row): CreditRoomComment {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        requestId: str(r.request_id),
        visibility: String(r.visibility) as CreditRoomCommentVisibility,
        authorEmail: String(r.author_email),
        authorSide: String(r.author_side) as CreditRoomSide,
        body: String(r.body ?? ''),
        createdAt: String(r.created_at),
    };
}

function mapLog(r: Row): CreditRoomAccessLog {
    return {
        id: String(r.id),
        creditRoomId: String(r.credit_room_id),
        actorUserId: str(r.actor_user_id),
        actorEmail: String(r.actor_email),
        actorSide: str(r.actor_side) as CreditRoomSide | undefined,
        action: String(r.action) as CreditRoomAccessAction,
        resourceType: str(r.resource_type),
        resourceId: str(r.resource_id),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        ip: str(r.ip),
        userAgent: str(r.user_agent),
        createdAt: String(r.created_at),
    };
}

function mapDisbursement(r: Row): CreditRoomDisbursement {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        debtContractId: String(r.debt_contract_id),
        creditRoomId: str(r.credit_room_id),
        seq: num(r.seq),
        status: String(r.status) as CreditRoomDisbursementStatus,
        requestedAmount: num(r.requested_amount),
        approvedAmount: r.approved_amount == null ? undefined : num(r.approved_amount),
        grossAmount: num(r.gross_amount),
        netAmount: num(r.net_amount),
        disbursedAt: str(r.disbursed_at),
        purpose: str(r.purpose),
        measurementRef: str(r.measurement_ref),
        physicalPct: r.physical_pct == null ? undefined : num(r.physical_pct),
        analysisNotes: str(r.analysis_notes),
        decidedAt: str(r.decided_at),
        decidedBy: str(r.decided_by),
        documentUrl: str(r.document_url),
        notes: str(r.notes),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}

function mapDocument(r: Row): CreditRoomDocument {
    return {
        shareId: String(r.share_id),
        documentId: String(r.document_id),
        nome: String(r.nome ?? ''),
        descricao: str(r.descricao),
        categoria: String(r.categoria ?? ''),
        tipoDocumento: String(r.tipo_documento ?? ''),
        status: String(r.status ?? ''),
        dataEmissao: str(r.data_emissao),
        dataValidade: str(r.data_validade),
        versionId: str(r.version_id),
        versionNumber: r.version_number == null ? undefined : num(r.version_number),
        storagePath: str(r.storage_path),
        mimeType: str(r.mime_type),
        tamanho: r.tamanho == null ? undefined : num(r.tamanho),
        sharedAt: String(r.shared_at),
        // Colunas novas da função (ausentes antes da migration → undefined).
        organizationId: str(r.organization_id),
        contractId: str(r.contract_id),
        empreendimentoId: str(r.empreendimento_id),
    };
}

/**
 * E-mail do usuário logado, em minúsculas — as policies de INSERT de
 * requests/comments/log exigem `= lower(auth.jwt()->>'email')`. Vem da sessão
 * local (sem ida ao servidor).
 */
async function actorEmail(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return (data.session?.user?.email ?? '').toLowerCase();
}

async function actorUserId(): Promise<string | undefined> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const addMonths = (iso: string, months: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
};

// ── Capacidade de pagamento — apoio da coleta (spec 2026-11-21 §5) ─────────

/** PostgREST recebe o `.in()` pela URL — lotes de 200 ids ficam longe do limite. */
const lotes = <T,>(xs: T[], n = 200): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
    return out;
};

/**
 * Lê TODAS as páginas de uma consulta. O PostgREST corta em 1000 linhas por
 * padrão e devolve o corte sem erro — carteira maior que isso sairia
 * truncada em silêncio, com cara de número completo. A consulta precisa de
 * `.order()` estável para as páginas não se sobreporem.
 */
const PAGINA = 1000;
async function todasAsPaginas<T>(
    consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
    // Para na página VAZIA, não na curta: se o `max-rows` do servidor for
    // menor que PAGINA, toda página vem "curta" e pararia na primeira. Pelo
    // mesmo motivo o passo é o que veio, não PAGINA (pularia linhas).
    const out: T[] = [];
    for (let de = 0; ;) {
        const { data, error } = await consulta(de, de + PAGINA - 1);
        if (error) throw error;
        const linhas = data ?? [];
        if (!linhas.length) return out;
        out.push(...linhas);
        de += linhas.length;
    }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parcela de locação faturada pela NEGOCIAÇÃO (contrato original) tem
 * `reference_id = tx-<deal_id>-…` (ver `contractRenewalService.countPendingFrom`).
 * `originIdFromRef` não a reconhece — o "id" que sobra não é contrato.
 */
const DEAL_DA_REF = /^tx-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;
const dealIdDaRef = (ref: unknown): string | null => DEAL_DA_REF.exec(String(ref ?? ''))?.[1] ?? null;

const NATUREZA_DO_DOMINIO: Record<string, Natureza> = { VENDAS: 'VENDA', LOCACAO: 'LOCACAO' };
const NATUREZA_DO_DEAL: Record<string, Natureza> = { SALE: 'VENDA', RENTAL: 'LOCACAO' };

/** 'AAAA-MM-01' do `delta`-ésimo mês depois do da data-base, sem `Date` com fuso. */
const diaUmDoMes = (dataBase: string, delta: number): string => {
    const [y, m] = dataBase.slice(0, 7).split('-').map(Number);
    const idx = y * 12 + (m - 1) + delta;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
};

/**
 * 1º vencimento da dívida nova simulada: dia 1 do mês SEGUINTE ao da
 * data-base — o 1º mês da série de renda. Antes era o 2º mês, e o serviço
 * novo cobria só 11 dos 12 primeiros meses (DSCR pós otimista). A mesma data
 * alimenta `capacidadeMaxima`, para a parcela k cair no mês k da série.
 */
const primeiroVencimentoSimulado = (dataBase: string): string => diaUmDoMes(dataBase, 1);

/** Prazo e carência do room vencem os dos parâmetros quando preenchidos (regra única em `utils/creditCapacity`). */
const parametrosDoRoom = (room: CreditRoom): ParametrosCapacidade =>
    parametrosEfetivos(room.parametrosCapacidade ?? PARAMETROS_CAPACIDADE_PADRAO, room.termMonths, room.graceMonths);

/** Soma mês a mês ('AAAA-MM' → valor). */
const somarPorMes = (mapas: Record<string, number>[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const m of mapas) for (const [mes, v] of Object.entries(m)) out[mes] = round2((out[mes] ?? 0) + v);
    return out;
};

/**
 * Posição da dívida do GRUPO: campos de valor somados; prazo, custo e os % de
 * taxa variável/indexada ponderados pela dívida de cada org (média simples
 * daria a mesma voz à org sem dívida e à que deve milhões).
 * ⚠️ `nInstituicoes` soma por org — o mesmo banco em duas orgs conta duas vezes.
 */
const somarPosicoes = (ps: DebtPosition[]): DebtPosition => {
    const soma = (f: (p: DebtPosition) => number) => round2(ps.reduce((a, p) => a + num(f(p)), 0));
    const total = soma(p => p.dividaTotal);
    const ponderado = (f: (p: DebtPosition) => number) =>
        total > 0 ? ps.reduce((a, p) => a + num(f(p)) * num(p.dividaTotal), 0) / total : 0;
    return {
        nContratos: soma(p => p.nContratos),
        nInstituicoes: soma(p => p.nInstituicoes),
        dividaTotal: total,
        curtoPrazo: soma(p => p.curtoPrazo),
        longoPrazo: soma(p => p.longoPrazo),
        encargosAPagar: soma(p => p.encargosAPagar),
        servico30: soma(p => p.servico30),
        servico90: soma(p => p.servico90),
        servico365: soma(p => p.servico365),
        vencido: soma(p => p.vencido),
        nParcelasVencidas: soma(p => p.nParcelasVencidas),
        custoMedioMensal: ponderado(p => p.custoMedioMensal),
        prazoMedioMeses: ponderado(p => p.prazoMedioMeses),
        pctTaxaVariavel: ponderado(p => p.pctTaxaVariavel),
        pctIndexada: ponderado(p => p.pctIndexada),
    };
};

/** O que `coletarPortfolio` devolve (NOI da janela de 12 meses de uma org). */
interface PortfolioColetado {
    janelaMeses: number;
    receita: number;
    despesa: number;
    noi: number;
    /** Fração (noi ÷ receita), como em `rentalNoiService`. */
    margem: number | null;
    /** Fração anual, como em `rentalNoiService`. */
    capRate: number | null;
}

/**
 * NOI do GRUPO. Org que não respondeu = `null` no todo (somar as outras
 * mostraria um NOI menor com cara de completo).
 *
 * Margem = NOI ÷ receita da SOMA. Cap rate = Σ NOI anual ÷ Σ patrimônio, com
 * o patrimônio de cada org reconstituído por `NOI anual ÷ cap rate` (o
 * service não o expõe). Org sem carteira de renda (cap rate nulo, receita e
 * NOI zero) não soma nada a nenhum dos dois lados e fica de fora; qualquer
 * outra org sem cap rate (ou com cap rate 0, de onde o patrimônio não se
 * recupera) torna o cap rate do grupo `null` — média simples, ou ignorar a
 * org, daria um número que nenhum dos patrimônios sustenta.
 */
const somarPortfolios = (ps: (PortfolioColetado | null)[]): PortfolioColetado | null => {
    if (!ps.length || ps.some(x => !x)) return null;
    const xs = ps as PortfolioColetado[];
    const soma = (f: (x: PortfolioColetado) => number) => round2(xs.reduce((a, x) => a + num(f(x)), 0));
    const receita = soma(x => x.receita);
    const noi = soma(x => x.noi);
    let noiAnual = 0;
    let patrimonio = 0;
    let capOk = true;
    for (const x of xs) {
        const anual = x.janelaMeses > 0 ? (num(x.noi) / x.janelaMeses) * 12 : 0;
        if (x.capRate == null) {
            if (num(x.receita) === 0 && num(x.noi) === 0) continue;
            capOk = false;
            break;
        }
        if (x.capRate === 0) { capOk = false; break; }
        noiAnual += anual;
        patrimonio += anual / x.capRate;
    }
    return {
        // Mesma janela (data-base − 12m → data-base) para todas as orgs.
        janelaMeses: xs[0].janelaMeses,
        receita,
        despesa: soma(x => x.despesa),
        noi,
        margem: receita > 0 ? noi / receita : null,
        capRate: capOk && patrimonio > 0 ? noiAnual / patrimonio : null,
    };
};

type ContratoDaCadeia = { id: string; deal_id: string | null; parent_contract_id: string | null };

/**
 * `deal_id` de cada contrato, subindo a cadeia de renovação: o filho criado
 * por `contractRenewalService` nasce SEM `deal_id` (o elo é
 * filho → `parent_contract_id` → pai → `deal_id`).
 */
async function dealsDaCadeia(contratos: ContratoDaCadeia[]): Promise<Map<string, string>> {
    const porId = new Map(contratos.map(c => [c.id, c]));
    const tentados = new Set<string>();
    for (let salto = 0; salto < 10; salto++) {
        const faltam = [...new Set([...porId.values()]
            .filter(c => !c.deal_id && c.parent_contract_id && !porId.has(c.parent_contract_id) && !tentados.has(c.parent_contract_id))
            .map(c => c.parent_contract_id as string))];
        if (!faltam.length) break;
        faltam.forEach(id => tentados.add(id));
        for (const ids of lotes(faltam)) {
            const { data, error } = await supabase.from('contracts').select('id, deal_id, parent_contract_id').in('id', ids);
            if (error) throw error;
            for (const c of (data ?? []) as ContratoDaCadeia[]) porId.set(c.id, c);
        }
    }
    const out = new Map<string, string>();
    for (const c of contratos) {
        let atual: ContratoDaCadeia | undefined = c;
        const visto = new Set<string>();
        while (atual && !atual.deal_id && atual.parent_contract_id && !visto.has(atual.id)) {
            visto.add(atual.id);
            atual = porId.get(atual.parent_contract_id);
        }
        if (atual?.deal_id) out.set(c.id, atual.deal_id);
    }
    return out;
}

type DealLido = {
    id: string; type: string | null; property_id: string | null; client_id: string | null;
    value: number | null; installment_value: number | null; status: string | null;
};

async function lerDeals(ids: string[]): Promise<Map<string, DealLido>> {
    const out = new Map<string, DealLido>();
    for (const lote of lotes([...new Set(ids)])) {
        const { data, error } = await supabase
            .from('commercial_deals')
            .select('id, type, property_id, client_id, value, installment_value, status')
            .in('id', lote);
        if (error) throw error;
        for (const d of (data ?? []) as DealLido[]) out.set(d.id, d);
    }
    return out;
}

/** `internal_transactions.payment_date` dos títulos recebidos (a view não traz). */
async function datasDePagamento(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const lote of lotes(ids)) {
        const { data, error } = await supabase.from('internal_transactions').select('id, payment_date').in('id', lote);
        if (error) throw error;
        for (const r of (data ?? []) as { id: string; payment_date: string | null }[]) {
            if (r.payment_date) out.set(r.id, String(r.payment_date).slice(0, 10));
        }
    }
    return out;
}

/**
 * Unidades do empreendimento com o preço resolvido — a unidade vence o
 * espelho do Comercial (`commercial_properties.price`) quando tem preço
 * próprio. O porquê está em `coletarUnidades`.
 */
async function unidadesComPreco(empreendimentoId: string): Promise<{
    status: string; rental_status: string | null; price: number | null; rental_price: number | null;
    /** `true` = o aluguel dela dependia do espelho de Locações e a leitura falhou: valor DESCONHECIDO (não "sem valor cadastrado"). */
    aluguel_indisponivel: boolean;
    rental_property_id: string | null;
    /** Etapa mais avançada das negociações de LOCAÇÃO do imóvel (`etapaMaisAvancada`); `null` = nenhuma que decida. */
    etapa_locacao: string | null;
    /** Aluguel mensal da negociação dessa etapa (`getDealInstallmentValue`); `null` sem negociação. */
    aluguel_da_negociacao: number | null;
}[]> {
    const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimentoId);
    const idsEspelho = units.map(u => u.commercial_property_id).filter((v): v is string => !!v);
    const precoEspelho = new Map<string, number>();
    if (idsEspelho.length) {
        const { data } = await supabase
            .from('commercial_properties')
            .select('id, price')
            .in('id', idsEspelho);
        for (const cp of (data ?? []) as Array<{ id: string; price: number | null }>) {
            if (cp.price != null) precoEspelho.set(cp.id, Number(cp.price));
        }
    }
    // Aluguel-alvo: o da unidade vence; sem ele, o do espelho de Locações (`rental_property_id`).
    const idsLocacao = units.filter(u => u.rental_price == null).map(u => u.rental_property_id).filter((v): v is string => !!v);
    const aluguelEspelho = new Map<string, number>();
    let espelhoFalhou = false;
    if (idsLocacao.length) {
        // Erro aqui não derruba a venda, mas também não pode virar "sem valor cadastrado": o aluguel fica desconhecido.
        const { data, error } = await supabase
            .from('commercial_properties')
            .select('id, rental_price')
            .in('id', idsLocacao);
        if (error) {
            espelhoFalhou = true;
            console.warn('[creditRoomService] aluguel das unidades (espelho de Locações) indisponível no snapshot:', error);
        }
        for (const cp of (data ?? []) as Array<{ id: string; rental_price: number | null }>) {
            if (cp.rental_price != null) aluguelEspelho.set(cp.id, Number(cp.rental_price));
        }
    }
    // Etapa da negociação de locação de cada imóvel (Gerenciar Negociação › Contrato). Falha = etapa
    // desconhecida: a unidade cai no status dela, a regra de antes (`situacaoDeLocacao`).
    const imoveisLocacao = [...new Set(units.map(u => u.rental_property_id).filter((v): v is string => !!v))];
    const negociacoes = new Map<string, { status: string | null; value: number | null; installment_value: number | null }[]>();
    for (const lote of lotes(imoveisLocacao)) {
        const { data, error } = await supabase
            .from('commercial_deals')
            .select('property_id, status, value, installment_value')
            .eq('type', 'RENTAL')
            .in('property_id', lote);
        if (error) {
            console.warn('[creditRoomService] etapa das negociações de locação indisponível no snapshot:', error);
            negociacoes.clear();
            break;
        }
        for (const d of (data ?? []) as Array<{ property_id: string; status: string | null; value: number | null; installment_value: number | null }>) {
            const l = negociacoes.get(d.property_id);
            if (l) l.push(d); else negociacoes.set(d.property_id, [d]);
        }
    }
    return units.map(u => {
        const ds = u.rental_property_id ? negociacoes.get(u.rental_property_id) ?? [] : [];
        const etapa = etapaMaisAvancada(ds.map(d => d.status));
        const deal = etapa ? ds.find(d => d.status === etapa) : undefined;
        return {
            status: u.status,
            rental_status: u.rental_status ?? null,
            price: u.price
                ?? (u.commercial_property_id ? precoEspelho.get(u.commercial_property_id) ?? null : null),
            rental_price: u.rental_price
                ?? (u.rental_property_id ? aluguelEspelho.get(u.rental_property_id) ?? null : null),
            aluguel_indisponivel: espelhoFalhou && u.rental_price == null && !!u.rental_property_id,
            rental_property_id: u.rental_property_id ?? null,
            etapa_locacao: etapa,
            aluguel_da_negociacao: deal ? round2(getDealInstallmentValue(deal)) : null,
        };
    });
}

type LinhaRecebivel = {
    id: string; organization_id: string; reference_id: string | null; due_date: string | null;
    amount: number | null; effective_status: string | null; party_id: string | null;
    party_name: string | null; project_id: string | null;
};

/**
 * Títulos a receber de UMA org, já ligados ao contrato, à natureza e ao
 * empreendimento. O contrato sai SEMPRE de `originIdFromRef` (o
 * `reference_id` é composto — `.eq`/`.in` com o uuid cru nunca casa).
 */
async function titulosDaOrg(org: string): Promise<TituloCarteira[]> {
    const linhas = (await todasAsPaginas((de, ate) => supabase
        .from('vw_receivables')
        .select('id, organization_id, reference_id, due_date, amount, effective_status, party_id, party_name, project_id')
        .eq('organization_id', org)
        .order('id')
        .range(de, ate))) as LinhaRecebivel[];
    if (!linhas.length) return [];

    type ContratoLido = ContratoDaCadeia & { domain: string | null };
    const contratos = new Map<string, ContratoLido>();
    const idsContrato = [...new Set(linhas
        .filter(l => !dealIdDaRef(l.reference_id))
        .map(l => originIdFromRef(l.reference_id))
        .filter(id => UUID.test(id)))];
    for (const ids of lotes(idsContrato)) {
        const { data: cs, error: ce } = await supabase
            .from('contracts')
            .select('id, domain, deal_id, parent_contract_id')
            .in('id', ids);
        if (ce) throw ce;
        for (const c of (cs ?? []) as ContratoLido[]) contratos.set(c.id, c);
    }

    // Parcela `tx-<deal_id>-…`: o contrato é o ORIGINAL da negociação (sem pai).
    const dealsTx = [...new Set(linhas.map(l => dealIdDaRef(l.reference_id)).filter((v): v is string => !!v))];
    const contratoDoDealTx = new Map<string, string>();
    for (const ids of lotes(dealsTx)) {
        const { data: cs, error: ce } = await supabase
            .from('contracts')
            .select('id, deal_id, parent_contract_id')
            .in('deal_id', ids);
        if (ce) throw ce;
        for (const c of (cs ?? []) as ContratoDaCadeia[]) {
            if (c.deal_id && !c.parent_contract_id && !contratoDoDealTx.has(c.deal_id)) contratoDoDealTx.set(c.deal_id, c.id);
        }
    }

    const [comEmp, pagamentos, dealDoContrato] = await Promise.all([
        // Contrato → negócio → imóvel → empreendimento (e obra), o caminho da tela.
        // Só linhas cujo contrato é um UUID: uma `tx-…` (ou qualquer id que
        // não seja UUID) vira `.in('id', …)` inválido lá dentro, e o erro
        // apaga o empreendimento de TODAS as linhas. `tx-…` segue pelo negócio.
        receivableService.resolveEmpreendimentos(
            linhas.filter(l => !dealIdDaRef(l.reference_id) && UUID.test(originIdFromRef(l.reference_id))) as unknown as Receivable[],
            org,
        ),
        datasDePagamento(linhas.filter(l => l.effective_status === 'RECEBIDO').map(l => l.id)),
        dealsDaCadeia([...contratos.values()]),
    ]);
    const empDoTitulo = new Map(comEmp.map(r => [r.id, r.empreendimento_id ?? null]));

    const dealDe = (l: LinhaRecebivel): string | null => {
        const tx = dealIdDaRef(l.reference_id);
        if (tx) return tx;
        return dealDoContrato.get(originIdFromRef(l.reference_id)) ?? null;
    };
    // Negócio só é lido quando falta algo: a natureza do `tx-…` ou o
    // empreendimento que `resolveEmpreendimentos` não achou (ex.: contrato
    // renovado, cujo `deal_id` mora no pai).
    const dealsPrecisos = [...new Set(linhas
        .filter(l => dealIdDaRef(l.reference_id) || !empDoTitulo.get(l.id))
        .map(dealDe)
        .filter((v): v is string => !!v))];
    const deals = dealsPrecisos.length ? await lerDeals(dealsPrecisos) : new Map<string, DealLido>();
    const faltaPeloImovel = linhas.some(l => !empDoTitulo.get(l.id) && !!deals.get(dealDe(l) ?? '')?.property_id);
    const empDoImovel = faltaPeloImovel ? await empreendimentoPorImovel([org]) : new Map<string, string>();

    return linhas.map(l => {
        const tx = dealIdDaRef(l.reference_id);
        const contrato = tx ? undefined : contratos.get(originIdFromRef(l.reference_id));
        const deal = deals.get(dealDe(l) ?? '');
        const natureza = contrato
            ? NATUREZA_DO_DOMINIO[contrato.domain ?? ''] ?? null
            : tx ? NATUREZA_DO_DEAL[deal?.type ?? ''] ?? null : null;
        return {
            id: l.id,
            organizationId: l.organization_id,
            contractId: contrato?.id ?? (tx ? contratoDoDealTx.get(tx) ?? null : null),
            natureza,
            empreendimentoId: empDoTitulo.get(l.id)
                ?? (deal?.property_id ? empDoImovel.get(deal.property_id) ?? null : null),
            // Só para agrupar, em memória — nunca entra no snapshot.
            partyKey: l.party_id ?? l.party_name ?? null,
            dueDate: l.due_date,
            paymentDate: pagamentos.get(l.id) ?? null,
            amount: round2(num(l.amount)),
            recebido: l.effective_status === 'RECEBIDO',
        };
    });
}

/** Status de dívida que `vw_debt_open_installments` deixa FORA da curva. */
const STATUS_DIVIDA_FORA_DA_CURVA = new Set(['LIQUIDADO', 'CANCELADO', 'EM_NEGOCIACAO']);

/** Locação vigente = status Ativo/Assinado e não substituída por renovação vigente. */
const STATUS_LOCACAO_VIGENTE = new Set(['Ativo', 'Assinado']);

/** Imóvel → empreendimento das orgs (a view já resolve unidade → torre → empreendimento). */
async function empreendimentoPorImovel(orgs: string[]): Promise<Map<string, string>> {
    const mapas = await Promise.all(orgs.map(o => empreendimentoService.mapPropertiesToEmpreendimentos(o)));
    const out = new Map<string, string>();
    for (const m of mapas) for (const [prop, link] of Object.entries(m)) if (link?.id) out.set(prop, link.id);
    return out;
}


/**
 * Onde está o orçamento de uma obra — medido em 07/09/2026.
 *
 * **Nem sempre na obra.** A obra `Igreja Divino Espirito Santo` tem
 * `jsonb_array_length(budget) = 0`, e os 37 itens vivem no projeto-gêmeo de
 * classificação `ORCAMENTO`, alcançado pelo `contracts.budget_id` (ver
 * `contractService.criarContratoDeOrcamento`, que grava
 * `budget_id: projectId // referência ao projeto-orçamento`).
 *
 * Ler só `projects.budget` da obra fazia a tela mostrar **"Orçado R$ 0,00"**
 * ao lado de **"Contratado R$ 466.622,84"** — que um analista de crédito lê
 * como obra 100% estourada — e derrubava o LTC para "sem orçamento da obra"
 * com o orçamento a um join de distância. Zero plausível é pior que erro
 * visível.
 *
 * Devolve os itens deduplicados por id (obra e gêmeo podem trazer a mesma
 * linha) com o BDI já resolvido por projeto de origem: um `bdiPadrao` único
 * aplicaria o BDI da obra a itens que vieram do orçamento.
 */
async function resolverOrcamentoDaObra(projectId: string): Promise<{
    itens: ItemOrcado[];
    origens: { id: string; name: string }[];
    /** `settings.valorEstimado` da obra — a estimativa declarada. */
    valorEstimado: number | null;
    contratos: Array<{ id: string; current_value: number | null }>;
}> {
    const { data: contratosRaw } = await supabase
        .from('contracts')
        .select('id, status, direction, supplier_id, budget_id, current_value')
        .eq('project_id', projectId);

    // Regra copiada de `fn_obra_kpis` — ver o comentário de `coletarEac`.
    const contratos = (contratosRaw ?? []).filter(c => {
        const custo = c.direction === 'OUTGOING' || (c.direction == null && c.supplier_id != null);
        return custo && c.status !== 'Rascunho' && c.status !== 'Cancelado';
    });

    const fontes = new Set<string>([projectId]);
    for (const c of contratos) if (c.budget_id) fontes.add(c.budget_id);

    // ⚠️ O vínculo obra↔orçamento aponta AO CONTRÁRIO do que se espera: é o
    // projeto-orçamento que guarda `settings.linkedProjectId` apontando para a
    // obra, não a obra apontando para ele. Medido em 07/09/2026 no
    // `Garden Cambuhy`: a obra não tem `linkedProjectId`; o orçamento `Garden`
    // tem, apontando para ela.
    //
    // Sem seguir esse elo, uma obra SEM contratos fica sem orçamento algum —
    // porque o único outro caminho é `contracts.budget_id`, e obra que ainda
    // não contratou nada não tem contrato para carregar o elo.
    const { data: ligados } = await supabase
        .from('projects')
        .select('id')
        .eq('settings->>linkedProjectId', projectId);
    for (const l of (ligados ?? []) as Array<{ id: string }>) fontes.add(l.id);

    // `projectId` está sempre em `fontes`, então o settings da obra (com o
    // `valorEstimado`) vem nesta mesma consulta.
    const { data: projs } = await supabase
        .from('projects')
        .select('id, name, budget, settings')
        .in('id', [...fontes]);

    const porId = new Map<string, ItemOrcado>();
    const origens: { id: string; name: string }[] = [];
    for (const pr of (projs ?? []) as Array<{ id: string; name: string; budget: unknown; settings: { bdi?: number } | null }>) {
        const itens = Array.isArray(pr.budget) ? pr.budget : [];
        if (!itens.length) continue;
        origens.push({ id: pr.id, name: pr.name });
        const bdiProjeto = pr.settings?.bdi ?? 0;
        for (const it of itens as Array<ItemOrcado & { bdi?: number }>) {
            if (!it?.id || porId.has(it.id)) continue;
            porId.set(it.id, { ...it, bdi: it.bdi ?? bdiProjeto });
        }
    }

    // A estimativa declarada da obra — usada quando o detalhado não cobre o
    // todo. Ver `escolherCustoTotal`.
    const obra = (projs ?? []).find(x => (x as { id: string }).id === projectId) as
        { settings?: { valorEstimado?: number | string } } | undefined;
    const brutoEstimado = obra?.settings?.valorEstimado;
    const valorEstimado = brutoEstimado == null || brutoEstimado === ''
        ? null
        : Number(brutoEstimado) || null;

    return {
        itens: [...porId.values()],
        origens,
        valorEstimado,
        contratos: contratos.map(c => ({ id: c.id, current_value: c.current_value })),
    };
}

/** Resultado do primeiro passo do congelamento: nada foi gravado ainda. */
export interface VersaoPreparada {
    roomId: string;
    dataBase: string;
    snapshot: CreditRoomSnapshot;
    indicators: CreditRoomIndicators;
    /**
     * O `servico_novo` da série foi SIMULADO com `buildSchedule` (sem proposta, ou
     * proposta sem cronograma)? `false` quando veio do cronograma real da proposta
     * ou quando ela já está na curva (então `servico_novo` = {}). É o que decide se
     * `simularParametros` pode refazê-lo.
     */
    servicoNovoSimulado: boolean;
}

export const creditRoomService = {

    // ── Credit Rooms ──────────────────────────────────────────────────────

    async list(organizationId: string | null): Promise<CreditRoom[]> {
        let q = supabase.from('credit_rooms').select(ROOM_COLS).order('created_at', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(r => mapRoom(r as Row));
    },

    async get(id: string): Promise<CreditRoom | null> {
        const { data, error } = await supabase.from('credit_rooms').select(ROOM_COLS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapRoom(data as Row) : null;
    },

    async create(organizationId: string, input: CreditRoomInput): Promise<CreditRoom> {
        const created_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_rooms')
            .insert({ ...toRoomRow(input), organization_id: organizationId, created_by })
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        return mapRoom(data as Row);
    },

    async update(id: string, input: CreditRoomInput): Promise<CreditRoom> {
        const { data, error } = await supabase
            .from('credit_rooms')
            .update(toRoomRow(input))
            .eq('id', id)
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        return mapRoom(data as Row);
    },

    /**
     * Grava SÓ os parâmetros da capacidade (botão "Salvar no room" da simulação).
     * Não reaproveita `update()` de propósito: aquele manda o room inteiro, e
     * sobrescreveria com dado velho o que outra aba ou outro usuário tenha mudado.
     * Não toca em versão liberada nem escreve no log do credor.
     *
     * ⚠️ Reescreve o objeto `parametros_capacidade` INTEIRO a partir do room em memória: se outro
     * usuário mudou uma chave dele nesse meio-tempo, ela é sobrescrita. Aceito (decisão do revisor).
     */
    async salvarParametrosCapacidade(room: Pick<CreditRoom, 'id'>, parametros: ParametrosCapacidade): Promise<CreditRoom> {
        const { data, error } = await supabase
            .from('credit_rooms')
            .update({ parametros_capacidade: parametros })
            .eq('id', room.id)
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        return mapRoom(data as Row);
    },

    /**
     * Grava SÓ o quadro (PRD §47). Não reaproveita `update()` de propósito:
     * aquele manda o room inteiro, e sobrescreveria com dado velho o que outra
     * aba (status, garantias) tenha mudado enquanto o quadro estava aberto.
     */
    async saveFunding(
        room: CreditRoom,
        sources: CreditRoomFundingEntry[],
        uses: CreditRoomFundingEntry[],
    ): Promise<CreditRoom> {
        const { data, error } = await supabase
            .from('credit_rooms')
            .update({ funding_sources: sources, funding_uses: uses })
            .eq('id', room.id)
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'UPDATE', 'funding', room.id, {
            fontes: sources.length, usos: uses.length,
            total_fontes: sources.reduce((a, e) => a + (Number(e.amount) || 0), 0),
            total_usos: uses.reduce((a, e) => a + (Number(e.amount) || 0), 0),
        });
        return mapRoom(data as Row);
    },

    async setStatus(room: CreditRoom, status: CreditRoomStatus): Promise<CreditRoom> {
        const { data, error } = await supabase
            .from('credit_rooms')
            .update({ status })
            .eq('id', room.id)
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'STATUS', 'room', room.id, { de: room.status, para: status });
        return mapRoom(data as Row);
    },

    /**
     * Excluir só é possível sem versão congelada — a trigger de imutabilidade
     * recusa o CASCADE (R2). Com versões, o caminho é cancelar.
     */
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('credit_rooms').delete().eq('id', id);
        if (error) {
            if (error.code === '23514') {
                throw new Error('Este Credit Room já tem versões congeladas e não pode ser excluído. Cancele a operação em vez de excluí-la.');
            }
            throw error;
        }
    },

    // ── Versões / snapshot ────────────────────────────────────────────────

    async listVersions(creditRoomId: string): Promise<CreditRoomVersion[]> {
        const { data, error } = await supabase
            .from('credit_room_versions')
            .select(VERSION_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('version_no', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapVersion(r as Row));
    },

    async getVersion(id: string): Promise<CreditRoomVersion | null> {
        const { data, error } = await supabase.from('credit_room_versions').select(VERSION_COLS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapVersion(data as Row) : null;
    },

    /**
     * Reúne os pedaços dos módulos donos e monta o snapshot + indicadores, SEM
     * gravar nada. Cada fonte que falhar vira bloco `null` no snapshot (a tela
     * mostra "sem dado"), nunca zero — exceto a posição da dívida, que é o
     * mínimo para a operação fazer sentido e por isso propaga o erro.
     * É o primeiro passo do congelamento em dois passos: a tela mostra o que
     * foi preparado ("Conferir") e o `freezeVersion` grava exatamente isso.
     */
    async prepararVersao(room: CreditRoom, dataBaseOpt?: string): Promise<VersaoPreparada> {
        const dataBase = dataBaseOpt ?? isoDate(new Date());
        const orgId = room.organizationId;
        // REGRA #5: as orgs vêm do ROOM, nunca de prop de tela. O que cada uma
        // devolve continua recortado pela RLS de quem congela.
        const orgs = this.orgsDoEscopo(room);
        // GRUPO: org que quem congela não enxerga voltaria VAZIA pela RLS, e
        // vazio vira zero (dívida dela some, DSCR infla). Recusa antes de ler.
        if (room.escopo === 'GRUPO') await this.exigirMembroDeTodas(orgs);
        const p = parametrosDoRoom(room);
        const horizonte = p.horizonte_meses > 0 ? p.horizonte_meses : PARAMETROS_CAPACIDADE_PADRAO.horizonte_meses;

        // Posição da dívida: o mínimo para a operação fazer sentido — propaga.
        const posicoes = await Promise.all(orgs.map(o => debtAnalyticsService.position(o, dataBase)));
        const divida = posicoes.length === 1 ? posicoes[0] : somarPosicoes(posicoes);

        const filtrando = room.empreendimentoIds.length > 0;
        // R8: os fluxos que a OPERAÇÃO marcou como elegíveis (vendas = recebíveis, aluguéis = NOI).
        const fluxos: FluxosElegiveis = { vendas: room.eligibleFlows.receivables, alugueis: room.eligibleFlows.noi };

        const [
            [obra, unidades, empreendimento, portfolio, recebiveis, novoServico12mDaProposta, documentos, eac],
            [escopo, titulos, locacoes, servicoPorOrg, portfoliosDoGrupo, servicoNovoColetado, despesasFiltradas, propostaNaCurva],
        ] = await Promise.all([
            Promise.all([
                this.coletarObra(orgId, room.projectId),
                this.coletarUnidades(room.empreendimentoId),
                this.coletarEmpreendimento(room.empreendimentoId),
                this.coletarPortfolio(orgId, dataBase),
                this.coletarRecebiveis(orgs),
                this.coletarNovoServico(room.debtContractId),
                this.listDocuments(room.id).catch(() => [] as CreditRoomDocument[]),
                this.coletarEac(room.projectId),
            ]),
            Promise.all([
                this.coletarEscopo(room, dataBase),
                this.coletarTitulos(orgs, room.empreendimentoIds),
                this.coletarLocacoes(orgs, room.empreendimentoIds),
                Promise.all(orgs.map(o => this.coletarServicoAtual([o], dataBase, horizonte + 1))),
                // A org dona já tem o NOI acima; só as demais do grupo vão buscar.
                Promise.all(orgs.filter(o => o !== orgId).map(o => this.coletarPortfolio(o, dataBase))),
                this.servicoNovoPorMes(room, dataBase, p),
                // Com filtro, a despesa é só a dos imóveis dos empreendimentos escolhidos.
                filtrando && p.despesa_operacional
                    ? this.coletarDespesaDosEmpreendimentos(orgs, dataBase, room.empreendimentoIds)
                    : Promise.resolve(null),
                this.propostaJaNaCurva(room.debtContractId),
            ]),
        ]);

        // Proposta já ativa: as parcelas dela já estão em `fn_debt_schedule_curve`
        // (serviço ATUAL). Contá-las de novo como serviço novo seria 2×.
        const novoServico12m = propostaNaCurva === true ? null : novoServico12mDaProposta;
        const servicoNovo = propostaNaCurva === true ? {} : servicoNovoColetado.porMes;
        // Proposta já na curva: servico_novo = {} e a parcela está em servico_atual — nada simulado.
        const servicoNovoSimulado = propostaNaCurva === true ? false : servicoNovoColetado.simulado;

        // Com filtro de empreendimentos, título e locação SEM empreendimento não
        // entram na renda nem na carteira — só no alerta TITULO_SEM_EMPREENDIMENTO.
        // Sem filtro, entram (não há como dizer que são de fora).
        const titulosDoEscopo = titulos && filtrando ? titulos.filter(t => !!t.empreendimentoId) : titulos;
        const locacoesDoEscopo = locacoes && filtrando ? locacoes.filter(l => !!l.empreendimentoId) : locacoes;

        const [vendasSemTitulo, empreendimentos, dadosDosContratos] = await Promise.all([
            titulos ? this.coletarVendasSemTitulo(orgs, titulos, room.empreendimentoIds) : Promise.resolve(null),
            titulosDoEscopo && locacoesDoEscopo
                ? this.coletarEmpreendimentosDoEscopo(orgs, room.empreendimentoIds, titulosDoEscopo, locacoesDoEscopo, dataBase, fluxos)
                : Promise.resolve(null),
            titulosDoEscopo && locacoesDoEscopo
                ? this.coletarDadosDosContratos([
                    ...titulosDoEscopo.map(t => t.contractId).filter((v): v is string => !!v),
                    ...locacoesDoEscopo.map(l => l.contractId),
                ])
                : Promise.resolve({ unidade: new Map<string, string>(), valor: new Map<string, number>(), etapa: new Map<string, string>() }),
        ]);

        // Despesa operacional média por org (só desconta dos aluguéis). NOI que
        // não respondeu = despesa desconhecida, e não zero: zero inflaria a renda.
        const portfolioDe = new Map<string, typeof portfolio>([[orgId, portfolio]]);
        orgs.filter(o => o !== orgId).forEach((o, i) => portfolioDe.set(o, portfoliosDoGrupo[i]));
        const despesaDe = (o: string, i: number): number | null => {
            if (!p.despesa_operacional) return 0;
            // Filtro de empreendimentos: a despesa da org INTEIRA descontada do
            // aluguel de parte dela subestimaria a renda — só a dos escolhidos.
            if (filtrando) return despesasFiltradas?.[i] ?? null;
            const pf = portfolioDe.get(o);
            return pf ? round2(num(pf.despesa) / (pf.janelaMeses > 0 ? pf.janelaMeses : 1)) : null;
        };
        const despesas = orgs.map(despesaDe);
        // GRUPO: NOI consolidado (ver `somarPortfolios`); EMPRESA, o da dona.
        const portfolioDoEscopo = orgs.length === 1
            ? portfolio
            : somarPortfolios(orgs.map(o => portfolioDe.get(o) ?? null));
        const despesaMensal = despesas.some(d => d == null) ? null : round2(despesas.reduce<number>((a, d) => a + num(d), 0));

        const servicoAtual = servicoPorOrg.some(s => s == null)
            ? null
            : somarPorMes(servicoPorOrg as Record<string, number>[]);

        const entradaDe = (
            ts: TituloCarteira[], ls: LocacaoVigente[], despesa: number, servico: Record<string, number>, novo: Record<string, number>,
        ): CapacidadeEntrada => ({
            dataBase, horizonte, titulos: ts, locacoes: ls, despesaMensal: despesa,
            servicoAtualPorMes: servico, servicoNovoPorMes: novo, fluxos,
        });

        // A série precisa de todas as pernas: sem títulos, locações ou serviço
        // atual não há DSCR honesto; sem despesa, só se o aluguel entra. Sem
        // a lista de vendas sem parcelas, o alerta sumiria calado — cai tudo.
        // Despesa só é exigida quando há aluguel no escopo para descontá-la. Sem
        // saber se a proposta já está na curva, não dá para não contá-la 2×.
        const despesaFalta = despesaMensal == null && fluxos.alugueis && (locacoesDoEscopo?.length ?? 0) > 0;
        const capacidade = ((): SnapshotCapacidade | null => {
            if (!titulos || !titulosDoEscopo || !locacoesDoEscopo || !servicoAtual || despesaFalta || !vendasSemTitulo) return null;
            if (!servicoNovo || propostaNaCurva == null) return null;
            return montarCapacidade({
                fonte: 'vw_receivables + internal_transactions.payment_date + contracts LOCACAO + fn_debt_schedule_curve + rentalNoiService',
                dataBase,
                horizonte,
                parametros: p,
                fluxos,
                primeiroVencimento: primeiroVencimentoSimulado(dataBase),
                orgs,
                titulos,
                titulosDoEscopo,
                locacoesDoEscopo,
                despesaMensal: despesaMensal ?? 0,
                despesaPorOrg: despesas,
                servicoAtualPorMes: servicoAtual,
                servicoAtualPorOrg: servicoPorOrg,
                servicoNovoPorMes: servicoNovo,
                vendasSemTitulo,
                empreendimentos,
                dividaTotalPorOrg: posicoes.map(x => x?.dividaTotal),
            });
        })();

        const qualidade = titulosDoEscopo && locacoesDoEscopo
            ? {
                fonte: 'vw_receivables + internal_transactions.payment_date + contracts LOCACAO',
                data_base: dataBase,
                ...qualidadeDaRenda(entradaDe(titulosDoEscopo, locacoesDoEscopo, despesaMensal ?? 0, servicoAtual ?? {}, servicoNovo ?? {})),
            }
            : null;

        const contratos = titulosDoEscopo && locacoesDoEscopo
            ? montarCarteira(titulosDoEscopo, locacoesDoEscopo, dataBase, dadosDosContratos.unidade, dadosDosContratos.valor, dadosDosContratos.etapa)
            : null;

        const snapshot = buildSnapshot({
            dataBase,
            operacao: {
                requestedAmount: room.requestedAmount,
                termMonths: room.termMonths,
                graceMonths: room.graceMonths,
                modality: room.modality,
                purpose: room.purpose,
                institutionName: room.institutionName,
                eligibleFlows: room.eligibleFlows,
                guarantees: room.guarantees,
                equityCommitted: room.equityCommitted,
                equityContributed: room.equityContributed,
                fundingSources: room.fundingSources,
                fundingUses: room.fundingUses,
            },
            novoServico12m,
            empreendimento,
            divida: { ...divida, dataBase },
            obra,
            unidades,
            portfolio: portfolioDoEscopo,
            recebiveis,
            documentVersionIds: documentos.map(d => d.versionId).filter((v): v is string => !!v),
            eac,
            escopo,
            empreendimentos,
            contratos,
            capacidade,
            qualidade,
        });
        const indicators = computeIndicators(snapshot);
        return { roomId: room.id, dataBase, snapshot, indicators, servicoNovoSimulado };
    },

    /**
     * Congela uma versão. Se vier `preparada` (do `prepararVersao`) da mesma
     * sala e da mesma data-base, grava exatamente ela; senão prepara agora.
     */
    async freezeVersion(
        room: CreditRoom,
        opts: { label?: string; notes?: string; dataBase?: string } = {},
        preparada?: VersaoPreparada,
    ): Promise<CreditRoomVersion> {
        const dataBase = opts.dataBase ?? isoDate(new Date());
        const orgId = room.organizationId;
        const { snapshot, indicators } = preparada && preparada.roomId === room.id && preparada.dataBase === dataBase
            ? preparada
            : await this.prepararVersao(room, dataBase);

        const { data: last } = await supabase
            .from('credit_room_versions')
            .select('version_no')
            .eq('credit_room_id', room.id)
            .order('version_no', { ascending: false })
            .limit(1)
            .maybeSingle();
        const versionNo = num((last as Row | null)?.version_no) + 1;

        const frozen_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_versions')
            .insert({
                organization_id: orgId,
                credit_room_id: room.id,
                version_no: versionNo,
                label: opts.label ?? null,
                data_base: dataBase,
                snapshot,
                indicators,
                document_version_ids: snapshot.documentos.version_ids,
                notes: opts.notes ?? null,
                frozen_by,
            })
            .select(VERSION_COLS)
            .single();
        if (error) throw error;
        const version = mapVersion(data as Row);

        // A versão recém-congelada passa a ser a que o credor vê.
        const { error: upErr } = await supabase
            .from('credit_rooms')
            .update({ active_version_id: version.id })
            .eq('id', room.id);
        if (upErr) throw upErr;

        await this.log(room, 'FREEZE', 'version', version.id, { version_no: versionNo, label: opts.label ?? null });
        return version;
    },

    async setActiveVersion(room: CreditRoom, versionId: string | null): Promise<void> {
        const { error } = await supabase
            .from('credit_rooms')
            .update({ active_version_id: versionId })
            .eq('id', room.id);
        if (error) throw error;
        await this.log(room, 'STATUS', 'version', versionId ?? '', { active_version: versionId });
    },

    // Coletores — cada um devolve `null` quando a fonte não se aplica ou falha.

    async coletarObra(orgId: string, projectId?: string) {
        if (!projectId) return null;
        try {
            const [{ data: proj }, kpis] = await Promise.all([
                supabase.from('projects').select('id, name, budget, settings').eq('id', projectId).maybeSingle(),
                opuraAnalyticsService.obraKpis(orgId, projectId),
            ]);
            if (!proj) return null;
            const p = proj as { id: string; name: string; budget: unknown; settings: { bdi?: number; diaryEntries?: unknown[] } | null };
            const budget = Array.isArray(p.budget) ? p.budget : [];
            const diary = Array.isArray(p.settings?.diaryEntries) ? p.settings!.diaryEntries : [];
            // O ORÇADO vem do orçamento resolvido (obra + projeto-gêmeo); o
            // AVANÇO continua saindo do budget da própria obra, porque ele se
            // apura contra os apontamentos do diário DESTA obra.
            const resolvido = await resolverOrcamentoDaObra(projectId)
                .catch(() => ({ itens: [] as ItemOrcado[], origens: [], valorEstimado: null, contratos: [] }));
            const itensOrcamento = resolvido.itens.length ? resolvido.itens : budget;
            let avanco: number | null = null;
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                avanco = budget.length ? calculateProjectProgress(budget as any, diary as any) : null;
            } catch {
                avanco = null;
            }
            const custo = escolherCustoTotal(
                orcadoDoOrcamento(
                    itensOrcamento as Parameters<typeof orcadoDoOrcamento>[0],
                    resolvido.itens.length ? 0 : p.settings?.bdi,
                ),
                resolvido.valorEstimado,
            );

            return {
                projectId: p.id,
                projectName: p.name,
                // bdi 0: o BDI já foi aplicado item a item em `resolverOrcamentoDaObra`.
                orcado: custo.valor ?? 0,
                orcadoOrigem: custo.origem,
                orcadoDetalhado: custo.orcadoDetalhado,
                valorEstimado: custo.valorEstimado,
                contratadoCusto: kpis?.contratado_custo ?? 0,
                pago: kpis?.pago ?? 0,
                aPagar: kpis?.a_pagar ?? 0,
                vencidoPagar: kpis?.vencido_pagar ?? 0,
                avancoFisicoPct: avanco,
            };
        } catch (e) {
            console.warn('[creditRoomService] obra indisponível no snapshot:', e);
            return null;
        }
    },

    /**
     * EAC — orçado vs. contratado item a item (PRD §22).
     *
     * ── Onde mora o orçamento (medido em 07/09) ─────────────────────────────
     *
     * **Não é na obra.** A obra `Igreja Divino Espirito Santo` tem
     * `jsonb_array_length(budget) = 0`; os 37 itens do orçamento estão no
     * projeto-gêmeo de classificação `ORCAMENTO`, alcançado pelo
     * `contracts.budget_id` (ver `contractService.criarContratoDeOrcamento`,
     * que grava `budget_id: projectId // referência ao projeto-orçamento`).
     * Procurar o denominador só em `projects.budget` da obra devolveria "sem
     * dado" com o dado a um join de distância.
     *
     * Por isso o caminho é: obra → contratos da obra → `budget_id` de cada um →
     * orçamento. A obra continua sendo uma fonte válida (algumas carregam
     * orçamento próprio), e a união é deduplicada por id de item.
     *
     * ── Que contrato conta ───────────────────────────────────────────────────
     *
     * A regra é **copiada de `fn_obra_kpis`** (`direction = 'OUTGOING'` ou
     * nulo com fornecedor; `status NOT IN ('Rascunho','Cancelado')`), e a cópia
     * é deliberada: a Visão mostra "Contratado (custo)" do KPI ao lado do EAC.
     * Duas regras diferentes = dois "contratado" que se contradizem na mesma
     * tela, e o credor não tem como saber qual acreditar.
     *
     * ⚠️ **Mesmo com a regra igual, os números divergem — e é honesto.** O KPI
     * soma `contracts.current_value` (cabeçalho); o EAC soma
     * `contract_items.total_price`, porque só o item tem vínculo com o
     * orçamento. Medido: R$ 466.622,84 no cabeçalho contra R$ 340.882,42 em
     * itens — 73% de cobertura. Um EAC construído sobre 73% do contratado não
     * é a mesma afirmação que um sobre 100%, então a cobertura viaja junto do
     * número e a tela precisa mostrá-la.
     */
    async coletarEac(projectId?: string) {
        if (!projectId) return null;
        try {
            const { itens, origens, contratos } = await resolverOrcamentoDaObra(projectId);

            const ids = contratos.map(c => c.id);
            const { data: itensRaw } = ids.length
                ? await supabase.from('contract_items').select('budget_item_id, total_price').in('contract_id', ids)
                : { data: [] as Array<{ budget_item_id: string | null; total_price: number | null }> };

            const contratados: ItemContratado[] = (itensRaw ?? []).map(i => ({
                budgetItemId: i.budget_item_id ?? '',
                totalPrice: Number(i.total_price) || 0,
            }));

            const r = calcularEac(itens, contratados, 0);
            const cabecalho = contratos.reduce((a, c) => a + (Number(c.current_value) || 0), 0);

            return {
                ...r,
                contratadoCabecalho: Math.round(cabecalho * 100) / 100,
                coberturaPct: cabecalho > 0 ? Math.round((r.contratado / cabecalho) * 10000) / 100 : null,
                origens,
            };
        } catch (e) {
            console.warn('[creditRoomService] EAC indisponível no snapshot:', e);
            return null;
        }
    },

    /**
     * Unidades para o bloco de vendas (VGV total, vendido, disponível).
     *
     * ⚠️ **O preço quase nunca está em `empreendimento_units.price`.** Medido em
     * 07/09/2026 no `011 - Garden Cambuhy`: 41 unidades, **0 com preço** na
     * tabela de unidades — e as 41 com preço em `commercial_properties`,
     * alcançadas pelo `commercial_property_id` (o espelho do Comercial, que é
     * onde a tabela de preços de fato é mantida: R$ 598.224, R$ 599.581, …).
     *
     * Ler só `units.price` faria o Credit Room dizer **"8 unidades vendidas ·
     * VGV vendido R$ 0,00 · 0% vendido"** para uma incorporação de R$ 25M —
     * número que o banco derruba na primeira pergunta, e que é o mesmo padrão
     * do orçamento da obra (ver `resolverOrcamentoDaObra`): o dado existe a um
     * join de distância e o zero parece plausível.
     *
     * A unidade vence o espelho quando tem preço próprio — é ela que o time
     * edita quando quer um preço específico para a operação.
     *
     * Permutada com preço 0,00 no espelho é **correto**, não ausência: permuta
     * não tem preço em dinheiro. Por isso o `0` do espelho é preservado, e só
     * `null`/`undefined` cai para o próximo candidato.
     */
    async coletarUnidades(empreendimentoId?: string) {
        if (!empreendimentoId) return null;
        try {
            const units = await unidadesComPreco(empreendimentoId);
            return units.map(u => ({ status: u.status, price: u.price }));
        } catch (e) {
            console.warn('[creditRoomService] unidades indisponíveis no snapshot:', e);
            return null;
        }
    },

    async coletarEmpreendimento(empreendimentoId?: string) {
        if (!empreendimentoId) return null;
        try {
            const e = await empreendimentoService.getById(empreendimentoId);
            if (!e) return null;
            return {
                id: e.id,
                name: e.name,
                tipo: e.tipo ?? null,
                spe_razao_social: e.spe_razao_social ?? null,
                spe_cnpj: e.spe_cnpj ?? null,
                endereco_city: e.endereco_city ?? null,
                endereco_state: e.endereco_state ?? null,
                terreno_area: e.terreno_area ?? null,
                vgv_total: e.vgv_total ?? null,
            };
        } catch (e) {
            console.warn('[creditRoomService] empreendimento indisponível no snapshot:', e);
            return null;
        }
    },

    /**
     * Recebíveis de venda para o aging (PRD §25).
     *
     * ⚠️ **A fonte é `vw_receivables`, não `deal_installments`.** A tabela
     * `deal_installments` existe no repositório (migration 20270849000000) mas
     * **nunca foi aplicada no banco** — medido em 07/09: `42P01, relation does
     * not exist`. Quem sustenta Contas a Receber é a view sobre
     * `internal_transactions`, com 362 linhas.
     *
     * ⚠️ **O escopo é a ORGANIZAÇÃO, e é assim de propósito.** `vw_receivables`
     * tem `project_id`, mas só **1 das 362 linhas** o traz preenchido. Filtrar
     * pela obra do room mostraria "R$ 0,00 a receber" para uma carteira real de
     * 344 parcelas em aberto — um zero que o banco leria como ausência de
     * recebíveis, quando é ausência de vínculo no cadastro. Enquanto o
     * `project_id` não for preenchido na origem, o único número verdadeiro é o
     * da organização, e o snapshot diz isso na cara (`escopo`).
     *
     * `effective_status`: 'PREVISTO' | 'VENCIDO' | 'RECEBIDO'. O aging só olha
     * o que não foi recebido; 'RECEBIDO' vira o total à parte (R6 do PRD:
     * receita realizada nunca se mistura com a projetada).
     */
    async coletarRecebiveis(orgs: string[]) {
        // GRUPO: o aging é de todas as orgs do escopo (spec §3, "consolida
        // tudo"). O rótulo segue ORGANIZACAO — o bloco `escopo` diz quais.
        try {
            const data = await todasAsPaginas((de, ate) => supabase
                .from('vw_receivables')
                .select('id, due_date, amount, effective_status')
                .in('organization_id', orgs)
                .order('id')
                .range(de, ate));
            return {
                escopo: 'ORGANIZACAO' as const,
                parcelas: ((data ?? []) as Row[])
                    .filter(r => !!r.due_date)
                    .map(r => ({
                        dueDate: String(r.due_date),
                        amount: num(r.amount),
                        // O builder entende 'RECEBIDA'/'CANCELADA'; a view fala
                        // 'RECEBIDO'/'PREVISTO'/'VENCIDO'. Traduz aqui, uma vez.
                        settlementStatus: String(r.effective_status) === 'RECEBIDO' ? 'RECEBIDA' : 'LANCADA',
                    })),
            };
        } catch (e) {
            console.warn('[creditRoomService] recebíveis indisponíveis no snapshot:', e);
            return null;
        }
    },

    /** NOI dos 12 meses até a data-base — `null` sem apropriação de despesa. */
    async coletarPortfolio(orgId: string, dataBase: string): Promise<PortfolioColetado | null> {
        try {
            const from = addMonths(dataBase, -12);
            const m = await rentalNoiService.getNoiMetrics(orgId, from, dataBase);
            if (!m) return null;
            return {
                janelaMeses: m.monthsInWindow,
                receita: m.revenue,
                despesa: m.expense,
                noi: m.noi,
                margem: m.margin,
                capRate: m.capRate,
            };
        } catch (e) {
            console.warn('[creditRoomService] portfólio indisponível no snapshot:', e);
            return null;
        }
    },

    /** Serviço dos 12 primeiros meses do cronograma da proposta vinculada. */
    async coletarNovoServico(debtContractId?: string): Promise<number | null> {
        if (!debtContractId) return null;
        try {
            const schedule =
                (await debtService.getActiveSchedule(debtContractId, 'VIGENTE'))
                ?? (await debtService.getActiveSchedule(debtContractId, 'CONTRATUAL'));
            if (!schedule) return null;
            const parcelas = await debtService.listInstallments(schedule.id);
            return servicoPrimeirosMeses(parcelas.map(p => ({ total: p.total })));
        } catch (e) {
            console.warn('[creditRoomService] cronograma da proposta indisponível:', e);
            return null;
        }
    },

    // ── Capacidade de pagamento (spec 2026-11-21 §5) ──────────────────────
    // Cada coletor: falha → `null` + console.warn (dado ausente ≠ zero).

    /** EMPRESA → só a org dona; GRUPO → a dona e as do grupo, sem repetir. */
    orgsDoEscopo(room: CreditRoom): string[] {
        if (room.escopo !== 'GRUPO') return [room.organizationId];
        return [...new Set([room.organizationId, ...(room.grupoOrganizationIds ?? [])])];
    },

    /**
     * Recusa (erro com o nome das empresas) se o usuário não é membro de
     * alguma org de `orgs`. Usa `minhas_orgs_membro()`, a função das policies:
     * é exatamente o conjunto que a RLS deixa ler. Sem conseguir conferir,
     * também recusa — congelar às cegas é o risco que a trava existe para tirar.
     */
    async exigirMembroDeTodas(orgs: string[]): Promise<void> {
        const { data, error } = await supabase.rpc('minhas_orgs_membro');
        if (error) {
            throw new Error('Não foi possível conferir se você é membro de todas as empresas do grupo — a versão não foi congelada. Tente de novo.');
        }
        // SETOF uuid chega como lista de strings; aceita também `{ minhas_orgs_membro }`.
        const minhas = ((data ?? []) as unknown[]).map(x =>
            typeof x === 'string' ? x : String(Object.values((x ?? {}) as Record<string, unknown>)[0] ?? ''));
        const faltam = orgsForaDoAcesso(orgs, minhas);
        if (!faltam.length) return;
        // O nome pode estar escondido pela mesma RLS: cai no id curto, nunca some.
        const { data: os } = await supabase.from('organizations').select('id, name').in('id', faltam);
        const nome = new Map(((os ?? []) as { id: string; name: string | null }[]).map(o => [o.id, o.name]));
        throw new Error(mensagemSemAcessoAoGrupo(
            faltam.map(id => nome.get(id) || `organização ${id.slice(0, 8)}`),
        ));
    },

    /** Quem compõe a leitura. CNPJ da MATRIZ (`companies.is_headquarters`), senão o da org. */
    async coletarEscopo(room: CreditRoom, dataBase: string = isoDate(new Date())): Promise<SnapshotEscopo | null> {
        try {
            const orgs = this.orgsDoEscopo(room);
            const [os, cs] = await Promise.all([
                supabase.from('organizations').select('id, name, cnpj').in('id', orgs),
                supabase.from('companies').select('org_id, cnpj').in('org_id', orgs).eq('is_headquarters', true),
            ]);
            if (os.error) throw os.error;
            if (cs.error) throw cs.error;
            const org = new Map(((os.data ?? []) as { id: string; name: string | null; cnpj: string | null }[]).map(o => [o.id, o]));
            const cnpjMatriz = new Map<string, string>();
            for (const c of (cs.data ?? []) as { org_id: string; cnpj: string | null }[]) {
                if (c.cnpj && !cnpjMatriz.has(c.org_id)) cnpjMatriz.set(c.org_id, c.cnpj);
            }
            return {
                fonte: 'organizations + companies (matriz)',
                data_base: dataBase,
                tipo: room.escopo === 'GRUPO' ? 'GRUPO' : 'EMPRESA',
                organizacoes: orgs.map(id => ({
                    id,
                    // O UUID nunca vira nome na frente do banco. Com a trava de
                    // `exigirMembroDeTodas` isto não deveria acontecer no GRUPO;
                    // se acontecer, diz o que é.
                    nome: org.get(id)?.name || 'Organização sem acesso',
                    cnpj: cnpjMatriz.get(id) ?? org.get(id)?.cnpj ?? null,
                })),
            };
        } catch (e) {
            console.warn('[creditRoomService] escopo indisponível no snapshot:', e);
            return null;
        }
    },

    /**
     * Títulos a receber das orgs do escopo (`vw_receivables`), com data de
     * pagamento (`internal_transactions.payment_date`), contrato, natureza e
     * empreendimento. Com `empreendimentoIds`, descarta o título de
     * empreendimento fora da lista; o SEM empreendimento fica (vira alerta).
     */
    async coletarTitulos(orgs: string[], empreendimentoIds: string[]): Promise<TituloCarteira[] | null> {
        try {
            const todos = (await Promise.all(orgs.map(o => titulosDaOrg(o)))).flat();
            if (!empreendimentoIds.length) return todos;
            const permitidos = new Set(empreendimentoIds);
            return todos.filter(t => !t.empreendimentoId || permitidos.has(t.empreendimentoId));
        } catch (e) {
            console.warn('[creditRoomService] títulos da carteira indisponíveis no snapshot:', e);
            return null;
        }
    },

    /**
     * Locações vigentes: `contracts` LOCACAO Ativo/Assinado, sem renovação
     * vigente por cima (o filho vigente substitui o pai; filho em rascunho
     * não apaga o aluguel do pai). Aluguel = `current_value`, senão a parcela
     * do negócio. Empreendimento direto, senão negócio → imóvel (o filho da
     * renovação nasce sem `deal_id`: sobe a cadeia).
     */
    async coletarLocacoes(orgs: string[], empreendimentoIds: string[]): Promise<LocacaoVigente[] | null> {
        try {
            const data = await todasAsPaginas((de, ate) => supabase
                .from('contracts')
                .select('id, organization_id, status, current_value, start_date, end_date, deal_id, parent_contract_id, empreendimento_id, client_id')
                .eq('domain', 'LOCACAO')
                .in('organization_id', orgs)
                .order('id')
                .range(de, ate));
            type ContratoLocacao = ContratoDaCadeia & {
                organization_id: string; status: string | null; current_value: number | null;
                start_date: string | null; end_date: string | null; empreendimento_id: string | null; client_id: string | null;
            };
            const todos = (data ?? []) as ContratoLocacao[];
            const candidatos = todos.filter(c => STATUS_LOCACAO_VIGENTE.has(String(c.status)));
            const renovados = new Set(candidatos.map(c => c.parent_contract_id).filter((v): v is string => !!v));
            const vigentes = candidatos.filter(c => !renovados.has(c.id));
            if (!vigentes.length) return [];

            const dealDoContrato = await dealsDaCadeia(todos);
            const deals = await lerDeals(vigentes.map(c => dealDoContrato.get(c.id)).filter((v): v is string => !!v));
            const empDoImovel = vigentes.some(c => !c.empreendimento_id)
                ? await empreendimentoPorImovel(orgs)
                : new Map<string, string>();

            const permitidos = new Set(empreendimentoIds);
            return vigentes
                .map((c): LocacaoVigente => {
                    const deal = deals.get(dealDoContrato.get(c.id) ?? '');
                    return {
                        contractId: c.id,
                        organizationId: c.organization_id,
                        empreendimentoId: c.empreendimento_id
                            ?? (deal?.property_id ? empDoImovel.get(deal.property_id) ?? null : null),
                        propertyId: deal?.property_id ?? null,
                        partyKey: c.client_id ?? deal?.client_id ?? null,
                        aluguelMensal: round2(c.current_value != null
                            ? num(c.current_value)
                            : deal ? getDealInstallmentValue(deal) : 0),
                        inicio: c.start_date,
                        fim: c.end_date,
                    };
                })
                .filter(l => !permitidos.size || !l.empreendimentoId || permitidos.has(l.empreendimentoId));
        } catch (e) {
            console.warn('[creditRoomService] locações vigentes indisponíveis no snapshot:', e);
            return null;
        }
    },

    /**
     * Negócios de VENDA já vendidos (`saleDealStage` — etapas `ETAPAS_VENDIDA`)
     * sem nenhuma parcela gerada: nem contrato com título, nem `tx-<deal_id>-`.
     * Vira o alerta "vendas sem parcelas" — dinheiro fora da renda.
     *
     * O "tem título" olha TODOS os recebíveis das orgs, não só `titulos`: com
     * filtro de empreendimento, a venda de outro empreendimento sumiria da
     * lista e pareceria sem parcelas. `empreendimentoIds` recorta o alerta.
     * Falha = `null`, e o `freezeVersion` não monta a capacidade sem ela.
     */
    async coletarVendasSemTitulo(
        orgs: string[],
        titulos: TituloCarteira[],
        empreendimentoIds: string[] = [],
    ): Promise<{ dealId: string; valor: number }[] | null> {
        try {
            const ds = await todasAsPaginas((de, ate) => supabase
                .from('commercial_deals')
                .select('id, status, value, property_id')
                .eq('type', 'SALE')
                .in('organization_id', orgs)
                .order('id')
                .range(de, ate));
            const vendidas = ((ds ?? []) as { id: string; status: string | null; value: number | null; property_id: string | null }[])
                .filter(d => saleDealStage(d.status) === 'sold');
            if (!vendidas.length) return [];

            const refs = await todasAsPaginas((de, ate) => supabase
                .from('vw_receivables')
                .select('id, reference_id')
                .in('organization_id', orgs)
                .order('id')
                .range(de, ate));
            const comTitulo = new Set<string>();
            const idsContrato = new Set(titulos.map(t => t.contractId).filter((v): v is string => !!v));
            for (const r of (refs ?? []) as { reference_id: string | null }[]) {
                const tx = dealIdDaRef(r.reference_id);
                if (tx) comTitulo.add(tx);
                else if (UUID.test(originIdFromRef(r.reference_id))) idsContrato.add(originIdFromRef(r.reference_id));
            }
            for (const ids of lotes([...idsContrato])) {
                const { data: cs, error: ce } = await supabase.from('contracts').select('id, deal_id').in('id', ids);
                if (ce) throw ce;
                for (const c of (cs ?? []) as { deal_id: string | null }[]) if (c.deal_id) comTitulo.add(c.deal_id);
            }

            const permitidos = new Set(empreendimentoIds);
            const empDoImovel = permitidos.size ? await empreendimentoPorImovel(orgs) : new Map<string, string>();
            return vendidas
                .filter(d => !comTitulo.has(d.id))
                .filter(d => {
                    if (!permitidos.size) return true;
                    const emp = d.property_id ? empDoImovel.get(d.property_id) : undefined;
                    return !emp || permitidos.has(emp);
                })
                .map(d => ({ dealId: d.id, valor: round2(num(d.value)) }));
        } catch (e) {
            // `null`, não `[]`: lista vazia diria "nenhuma venda sem parcelas"
            // — um zero plausível na frente do banco. Sem ela, a capacidade cai.
            console.warn('[creditRoomService] vendas sem parcelas indisponíveis no snapshot:', e);
            return null;
        }
    },

    /**
     * Serviço da dívida atual mês a mês ('AAAA-MM' → parcela), de
     * `fn_debt_schedule_curve` por org, somado. A MESMA fonte serve à série e
     * ao `dscr_atual` dos indicadores — os dois DSCR da tela batem.
     */
    async coletarServicoAtual(orgs: string[], dataBase: string, meses: number): Promise<Record<string, number> | null> {
        try {
            const curvas = await Promise.all(orgs.map(o => debtAnalyticsService.curve(o, { from: dataBase, months: meses })));
            const out: Record<string, number> = {};
            for (const curva of curvas) {
                for (const pt of curva) {
                    const mes = pt.mes.slice(0, 7);
                    out[mes] = round2((out[mes] ?? 0) + num(pt.parcela));
                }
            }
            return out;
        } catch (e) {
            console.warn('[creditRoomService] serviço da dívida atual indisponível no snapshot:', e);
            return null;
        }
    },

    /**
     * Serviço da dívida NOVA mês a mês (`simulado` = veio de `buildSchedule`, não do cronograma real). Com proposta vinculada, o cronograma
     * dela (VIGENTE, senão CONTRATUAL); sem proposta (ou sem cronograma), a
     * simulação por `buildSchedule` com o valor pedido, prazo/carência do room
     * quando preenchidos e 1º vencimento no dia 1 do mês seguinte ao da data-base (1º mês da série).
     */
    async servicoNovoPorMes(
        room: CreditRoom, dataBase: string, p: ParametrosCapacidade,
    ): Promise<{ porMes: Record<string, number> | null; simulado: boolean }> {
        const porMes = (linhas: { dueDate: string; total: number }[]) => {
            const out: Record<string, number> = {};
            for (const l of linhas) {
                const mes = String(l.dueDate).slice(0, 7);
                out[mes] = round2((out[mes] ?? 0) + num(l.total));
            }
            return out;
        };
        try {
            if (room.debtContractId) {
                const schedule =
                    (await debtService.getActiveSchedule(room.debtContractId, 'VIGENTE'))
                    ?? (await debtService.getActiveSchedule(room.debtContractId, 'CONTRATUAL'));
                if (schedule) return { porMes: porMes(await debtService.listInstallments(schedule.id)), simulado: false };
            }
            // `p` já são os EFETIVOS (`parametrosDoRoom`): prazo/carência da operação por cima.
            if (!(room.requestedAmount > 0) || !(p.prazo_meses > 0)) return { porMes: {}, simulado: true };
            return { porMes: porMes(buildSchedule({
                principal: room.requestedAmount,
                nominalRate: p.taxa_mensal_pct,
                ratePeriod: 'MENSAL',
                system: p.sistema,
                installmentCount: p.prazo_meses,
                installmentPeriod: 'MENSAL',
                firstDueDate: primeiroVencimentoSimulado(dataBase),
                gracePrincipalPeriods: p.carencia_meses,
            })), simulado: true };
        } catch (e) {
            // `null`, não `{}`: sem serviço novo o DSCR pós sairia igual ao
            // atual — otimista na frente do banco. A capacidade cai.
            console.warn('[creditRoomService] serviço da dívida nova indisponível no snapshot:', e);
            return { porMes: null, simulado: false };
        }
    },

    /**
     * A proposta vinculada já está na curva da dívida atual? A regra é a de
     * `vw_debt_open_installments`, que alimenta `fn_debt_schedule_curve`:
     * cronograma VIGENTE ativo, contrato fora de LIQUIDADO/CANCELADO/
     * EM_NEGOCIACAO e `mirror_role` diferente de CREDORA. Se está, as parcelas
     * dela já são `servico_atual`, e somá-las de novo como serviço novo
     * contaria a dívida duas vezes. `null` = não deu para saber.
     */
    async propostaJaNaCurva(debtContractId?: string): Promise<boolean | null> {
        if (!debtContractId) return false;
        try {
            const [contrato, vigente] = await Promise.all([
                debtService.getContract(debtContractId),
                debtService.getActiveSchedule(debtContractId, 'VIGENTE'),
            ]);
            return !!vigente
                && !STATUS_DIVIDA_FORA_DA_CURVA.has(String(contrato.status))
                && contrato.mirrorRole !== 'CREDORA';
        } catch (e) {
            console.warn('[creditRoomService] situação da proposta vinculada indisponível:', e);
            return null;
        }
    },

    /**
     * Despesa operacional mensal SÓ dos imóveis dos empreendimentos escolhidos
     * (por org, na ordem de `orgs`): Σ `ownExpense` de `getNoiMetrics.byProperty`
     * dos imóveis cujo empreendimento está na lista, ÷ meses da janela. O
     * `ownExpense` (e não o `expense` com subárvore) evita somar o filho duas
     * vezes quando o edifício-pai também está na lista. Org que falha = `null`.
     */
    async coletarDespesaDosEmpreendimentos(
        orgs: string[],
        dataBase: string,
        empreendimentoIds: string[],
    ): Promise<(number | null)[]> {
        try {
            const permitidos = new Set(empreendimentoIds);
            const empDoImovel = await empreendimentoPorImovel(orgs);
            return await Promise.all(orgs.map(async o => {
                try {
                    const m = await rentalNoiService.getNoiMetrics(o, addMonths(dataBase, -12), dataBase, undefined, { throwOnError: true });
                    if (!m) return null;
                    let soma = 0;
                    for (const [imovel, r] of m.byProperty) {
                        const emp = empDoImovel.get(imovel);
                        if (emp && permitidos.has(emp)) soma += num(r.ownExpense);
                    }
                    return round2(soma / (m.monthsInWindow > 0 ? m.monthsInWindow : 1));
                } catch (e) {
                    console.warn('[creditRoomService] despesa dos empreendimentos indisponível:', e);
                    return null;
                }
            }));
        } catch (e) {
            console.warn('[creditRoomService] despesa dos empreendimentos indisponível:', e);
            return orgs.map(() => null);
        }
    },

    /**
     * Serviço por obra (`projects.id`): contratos `SERVICOS` Ativo/Concluído de cada obra, com o que já foi
     * faturado (Σ dos títulos a receber gerados no financeiro, recebidos ou não).
     *
     * Os títulos são lidos AQUI, direto de `vw_receivables`, e não tirados de `titulos`: o título de serviço
     * não tem empreendimento (`natureza` só existe para VENDA/LOCACAO) e, com filtro de empreendimentos na
     * sala, `titulosDoEscopo` descarta tudo que não tem empreendimento — o faturado sairia 0 em silêncio.
     * O contrato sai de `originIdFromRef` (o `reference_id` é composto; `.in()` com o uuid nunca casa — por
     * isso o `like` de `refPrefixOrFilter`, conferido depois por igualdade exata).
     *
     * Falha = `null` (o chamador grava `servico: null`, "—"); nunca zero.
     */
    async coletarServicoPorObra(orgs: string[], projectIds: string[]): Promise<Map<string, ResumoDeServico> | null> {
        const ids = [...new Set(projectIds.filter(Boolean))];
        if (!ids.length) return new Map();
        try {
            const contratos: (ContratoDeServico & { project_id: string })[] = [];
            for (const lote of lotes(ids)) {
                const linhas = await todasAsPaginas((de, ate) => supabase
                    .from('contracts')
                    .select('id, project_id, status, current_value')
                    .eq('domain', 'SERVICOS')
                    .in('organization_id', orgs)
                    .in('project_id', lote)
                    .in('status', [...STATUS_SERVICO_VALIDOS])
                    .order('id')
                    .range(de, ate));
                contratos.push(...(linhas as (ContratoDeServico & { project_id: string })[]));
            }

            const faturadoPorContrato = new Map<string, number>();
            const doConjunto = new Set(contratos.map(c => c.id));
            for (const lote of lotes([...doConjunto], 20)) {
                const filtro = refPrefixOrFilter(lote);
                if (!filtro) continue;
                const titulos = await todasAsPaginas((de, ate) => supabase
                    .from('vw_receivables')
                    .select('id, reference_id, amount')
                    .in('organization_id', orgs)
                    .or(filtro)
                    .order('id')
                    .range(de, ate));
                for (const t of titulos as { reference_id: string | null; amount: number | null }[]) {
                    const contrato = originIdFromRef(t.reference_id);
                    if (!doConjunto.has(contrato)) continue;
                    faturadoPorContrato.set(contrato, (faturadoPorContrato.get(contrato) ?? 0) + num(t.amount));
                }
            }

            const out = new Map<string, ResumoDeServico>();
            for (const projectId of ids) {
                out.set(projectId, resumirServico(contratos.filter(c => c.project_id === projectId), faturadoPorContrato));
            }
            return out;
        } catch (e) {
            console.warn('[creditRoomService] contratos de serviço indisponíveis no snapshot:', e);
            return null;
        }
    },

    /**
     * Empreendimentos do escopo com unidades, VGV, renda do mês e fotos.
     *
     * Unidades: `status` é o eixo de VENDA; o de LOCAÇÃO é a ETAPA DA NEGOCIAÇÃO
     * (`situacaoDeLocacao`, 23/11/2026): "Alugado" = alugada; Reserva/Contrato/
     * Assinatura = em negociação (nem alugada, nem disponível); sem negociação
     * que decida, o `rental_status` da unidade. A
     * unidade alugada NÃO conta como disponível (nem no VGV disponível, que
     * vira estoque): o aluguel dela já está na renda, e contá-la também como
     * estoque a vender seria o mesmo imóvel duas vezes na frente do banco.
     * Vendidas = VENDIDO + PERMUTADO, a mesma regra do `vgv_vendido`.
     */
    async coletarEmpreendimentosDoEscopo(
        orgs: string[],
        empreendimentoIds: string[],
        titulos: TituloCarteira[],
        locacoes: LocacaoVigente[],
        dataBase: string,
        fluxos: FluxosElegiveis,
    ): Promise<SnapshotEmpreendimentoItem[] | null> {
        try {
            const listas = await Promise.all(orgs.map(o => empreendimentoService.list(o)));
            const permitidos = new Set(empreendimentoIds);
            const vistos = new Set<string>();
            const emps = listas.flat().filter(e => {
                if (vistos.has(e.id)) return false;
                vistos.add(e.id);
                return !permitidos.size || permitidos.has(e.id);
            });
            if (!emps.length) return [];

            const projetosDeServico = emps.filter(e => e.objetivo === 'SERVICO' && e.project_id).map(e => e.project_id as string);
            const [unidades, fotos, servicoPorObra] = await Promise.all([
                Promise.all(emps.map(e => unidadesComPreco(e.id))),
                // Foto que falha não derruba os números do empreendimento.
                fotosDosEmpreendimentos(emps.map(e => e.id)).catch(err => {
                    console.warn('[creditRoomService] fotos dos empreendimentos indisponíveis:', err);
                    return new Map<string, { url: string; legenda: string | null }[]>();
                }),
                // Falha nos contratos de serviço só tira o bloco de serviço (`servico: null`), não o resto.
                projetosDeServico.length ? this.coletarServicoPorObra(orgs, projetosDeServico) : Promise.resolve(null),
            ]);

            return emps.map((e, i): SnapshotEmpreendimentoItem => {
                const us = unidades[i];
                const alugada = (u: typeof us[number]) => situacaoDeLocacao(u) === 'LOCADA';
                const emNegociacao = (u: typeof us[number]) => situacaoDeLocacao(u) === 'EM_NEGOCIACAO';
                const vendida = (u: typeof us[number]) => u.status === 'VENDIDO' || u.status === 'PERMUTADO';
                const disponivel = (u: typeof us[number]) => situacaoDeLocacao(u) === 'DISPONIVEL';
                const vgv = (pred: (u: typeof us[number]) => boolean) =>
                    round2(us.filter(pred).reduce((a, u) => a + num(u.price), 0));
                const fs = (fotos.get(e.id) ?? []).slice(0, 8);
                // Aluguel contratado: as locações vigentes DESTE empreendimento (a mesma base da renda da série).
                const doEmp = locacoes.filter(l => l.empreendimentoId === e.id);
                // Em negociação: o aluguel do contrato vigente do imóvel (já pode existir, ex.: Ativo em
                // Assinatura), senão a parcela da negociação. Esse contrato sai da soma das locadas.
                const negociando = us.filter(emNegociacao);
                const imoveisNegociando = new Set(negociando.map(u => u.rental_property_id).filter((v): v is string => !!v));
                const doImovel = (pid: string | null) => (pid ? doEmp.filter(l => l.propertyId === pid) : []);
                const aluguelNegociando = negociando.reduce((a, u) => {
                    const ls = doImovel(u.rental_property_id);
                    return a + (ls.length ? ls.reduce((b, l) => b + num(l.aluguelMensal), 0) : num(u.aluguel_da_negociacao));
                }, 0);
                const porEtapa: Record<string, number> = {};
                for (const u of negociando) {
                    const r = rotuloDaEtapaDeLocacao(u.etapa_locacao as string);
                    porEtapa[r] = (porEtapa[r] ?? 0) + 1;
                }
                const aluguelPedido = us.filter(disponivel).filter(u => num(u.rental_price) > 0);
                // Leitura do aluguel falhou para alguma disponível: a soma e a contagem das "sem valor" não são confiáveis.
                const aluguelDesconhecido = us.filter(disponivel).some(u => u.aluguel_indisponivel);
                return {
                    id: e.id,
                    nome: e.name,
                    organization_id: e.organization_id,
                    cidade: e.endereco_city ?? null,
                    uf: e.endereco_state ?? null,
                    objetivo: e.objetivo ?? null,
                    unidades_total: us.length,
                    vendidas: us.filter(vendida).length,
                    alugadas: us.filter(alugada).length,
                    disponiveis: us.filter(disponivel).length,
                    vgv_total: vgv(() => true),
                    vgv_vendido: vgv(vendida),
                    vgv_disponivel: vgv(disponivel),
                    renda_mensal: rendaMensalDoEmpreendimento(e.id, titulos, locacoes, dataBase, fluxos),
                    // Sem locação vigente = R$ 0 (é dado, não ausência): só a versão antiga, sem o campo, mostra "—".
                    aluguel_locadas: round2(doEmp
                        .filter(l => !(l.propertyId && imoveisNegociando.has(l.propertyId)))
                        .reduce((a, l) => a + num(l.aluguelMensal), 0)),
                    em_negociacao: negociando.length,
                    aluguel_em_negociacao: round2(aluguelNegociando),
                    em_negociacao_por_etapa: porEtapa,
                    aluguel_disponiveis: !aluguelDesconhecido && aluguelPedido.length
                        ? round2(aluguelPedido.reduce((a, u) => a + num(u.rental_price), 0))
                        : null,
                    disponiveis_sem_aluguel: aluguelDesconhecido ? undefined : us.filter(disponivel).length - aluguelPedido.length,
                    servico: e.objetivo === 'SERVICO'
                        ? (e.project_id ? servicoPorObra?.get(e.project_id) ?? null : resumirServico([], new Map()))
                        : undefined,
                    capa: fs[0]?.url ?? null,
                    fotos: fs.map(f => ({ url: f.url, legenda: f.legenda ?? null })),
                };
            });
        } catch (e) {
            console.warn('[creditRoomService] empreendimentos do escopo indisponíveis no snapshot:', e);
            return null;
        }
    },

    /**
     * Unidade e valor de cada contrato da carteira. Unidade: contrato →
     * negócio (subindo a renovação) → imóvel → `commercial_properties.name`
     * (rótulo do imóvel, não da pessoa). Valor: `contracts.current_value`,
     * senão o `value` do negócio — é o `valor_contrato` da VENDA na carteira
     * (`montarCarteira`). Falha = mapas vazios: a coluna fica "—" e o valor
     * cai na soma dos títulos; a carteira não cai.
     */
    async coletarDadosDosContratos(contractIds: string[]): Promise<{ unidade: Map<string, string>; valor: Map<string, number>; etapa: Map<string, string> }> {
        const unidade = new Map<string, string>();
        const valor = new Map<string, number>();
        // Etapa da negociação (Gerenciar Negociação › Contrato) de cada contrato, subindo a renovação.
        const etapa = new Map<string, string>();
        try {
            const ids = [...new Set(contractIds.filter(id => UUID.test(id)))];
            const contratos: (ContratoDaCadeia & { current_value: number | null })[] = [];
            for (const lote of lotes(ids)) {
                const { data, error } = await supabase.from('contracts').select('id, deal_id, parent_contract_id, current_value').in('id', lote);
                if (error) throw error;
                contratos.push(...((data ?? []) as (ContratoDaCadeia & { current_value: number | null })[]));
            }
            const dealDoContrato = await dealsDaCadeia(contratos);
            const deals = await lerDeals([...dealDoContrato.values()]);
            for (const c of contratos) {
                const v = c.current_value != null && num(c.current_value) > 0
                    ? num(c.current_value)
                    : num(deals.get(dealDoContrato.get(c.id) ?? '')?.value);
                if (v > 0) valor.set(c.id, round2(v));
            }
            const imoveis = [...new Set([...deals.values()].map(d => d.property_id).filter((v): v is string => !!v))];
            const nomeDoImovel = new Map<string, string>();
            for (const lote of lotes(imoveis)) {
                const { data, error } = await supabase.from('commercial_properties').select('id, name').in('id', lote);
                if (error) throw error;
                for (const cp of (data ?? []) as { id: string; name: string | null }[]) if (cp.name) nomeDoImovel.set(cp.id, cp.name);
            }
            for (const [contrato, dealId] of dealDoContrato) {
                const nome = nomeDoImovel.get(deals.get(dealId)?.property_id ?? '');
                if (nome) unidade.set(contrato, nome);
                const st = deals.get(dealId)?.status;
                if (st) etapa.set(contrato, st);
            }
        } catch (e) {
            console.warn('[creditRoomService] unidades/valores dos contratos indisponíveis no snapshot:', e);
        }
        return { unidade, valor, etapa };
    },

    // ── Data Room (GED) ───────────────────────────────────────────────────

    async listDocuments(creditRoomId: string): Promise<CreditRoomDocument[]> {
        const { data, error } = await supabase.rpc('fn_credit_room_documents', { p_room: creditRoomId });
        if (error) throw error;
        return ((data ?? []) as Row[]).map(mapDocument);
    },

    /**
     * Sugere documentos do GED para o Data Room, a partir do que a versão
     * congelada contém (contratos, empreendimentos, obra) — tela interna.
     *
     * Só lê documento de org do escopo da sala (`orgsDoEscopo`); a RLS ainda
     * recorta pelo que o usuário enxerga. Documento do CLIENTE (dado pessoal)
     * entra em grupo próprio, desmarcado. Falha de leitura LANÇA erro em
     * português — lista parcial passaria por completa.
     */
    async sugerirDocumentos(room: CreditRoom, versao: CreditRoomVersion): Promise<GrupoDeSugestoes[]> {
        const orgs = this.orgsDoEscopo(room);
        const snap = versao.snapshot;

        // Rótulo mascarado do contrato (nunca o nome do cliente) por contract_id.
        const rotuloDoContrato = new Map<string, string>();
        for (const c of snap.contratos ?? []) {
            if (c.contract_id && !rotuloDoContrato.has(c.contract_id)) rotuloDoContrato.set(c.contract_id, c.rotulo);
        }
        const contractIds = [...rotuloDoContrato.keys()];

        const nomeDoEmpreendimento = new Map<string, string>();
        for (const e of snap.empreendimentos ?? []) if (e.id) nomeDoEmpreendimento.set(e.id, e.nome);
        for (const id of [room.empreendimentoId, ...(room.empreendimentoIds ?? [])]) {
            if (id && !nomeDoEmpreendimento.has(id)) nomeDoEmpreendimento.set(id, 'Empreendimento da operação');
        }
        const empIds = [...nomeDoEmpreendimento.keys()];
        const projectId = room.projectId;

        const COLS = 'id, organization_id, nome, categoria, tipo_documento, data_validade, contract_id, empreendimento_id, project_id, client_id';
        type LinhaGed = {
            id: string; organization_id: string; nome: string | null; categoria: string | null;
            tipo_documento: string | null; data_validade: string | null;
            contract_id: string | null; empreendimento_id: string | null; project_id: string | null; client_id: string | null;
        };
        const lerPor = async (
            coluna: 'contract_id' | 'empreendimento_id' | 'project_id' | 'client_id',
            ids: string[],
        ): Promise<LinhaGed[]> => {
            const out: LinhaGed[] = [];
            for (const lote of lotes(ids)) {
                out.push(...await todasAsPaginas<LinhaGed>((de, ate) =>
                    supabase.from('opura_documents').select(COLS)
                        .in('organization_id', orgs)
                        .neq('status', 'arquivado')
                        .not('active_version_id', 'is', null)
                        .in(coluna, lote)
                        .order('id')
                        .range(de, ate)));
            }
            return out;
        };

        try {
            const [compartilhados, porContrato, porEmpreendimento, porObra] = await Promise.all([
                this.listDocuments(room.id),
                lerPor('contract_id', contractIds),
                lerPor('empreendimento_id', empIds),
                projectId ? lerPor('project_id', [projectId]) : Promise.resolve([] as LinhaGed[]),
            ]);
            const jaNoDataRoom = new Set(compartilhados.map(d => d.documentId));

            // Clientes dos contratos da versão → rótulos dos contratos de cada cliente.
            const rotulosDoCliente = new Map<string, string[]>();
            for (const lote of lotes(contractIds)) {
                const cs = await todasAsPaginas<{ id: string; client_id: string | null }>((de, ate) =>
                    supabase.from('contracts').select('id, client_id').in('id', lote).order('id').range(de, ate));
                for (const c of cs) {
                    if (!c.client_id) continue;
                    const rot = rotuloDoContrato.get(c.id);
                    if (!rot) continue;
                    const lista = rotulosDoCliente.get(c.client_id) ?? [];
                    if (!lista.includes(rot)) lista.push(rot);
                    rotulosDoCliente.set(c.client_id, lista);
                }
            }
            const porCliente = await lerPor('client_id', [...rotulosDoCliente.keys()]);

            const hoje = hojeLocalISO();
            const montar = (l: LinhaGed, origem: OrigemSugestao, referencia: string): DocumentoSugerido => ({
                documentId: l.id,
                nome: l.nome ?? '',
                categoria: l.categoria ?? '',
                tipoDocumento: l.tipo_documento ?? '',
                organizationId: l.organization_id,
                dataValidade: l.data_validade ?? null,
                origem,
                referencia,
                vencido: estaVencido(l.data_validade, hoje),
                jaCompartilhado: jaNoDataRoom.has(l.id),
                // Ex.: contrato assinado (vínculo de contrato E de cliente): fica no grupo do contrato, mas avisa.
                ...(l.client_id ? { temDadosDoCliente: true } : {}),
            });

            const sugeridos: DocumentoSugerido[] = [
                ...porContrato.map(l => montar(l, 'CONTRATO', rotuloDoContrato.get(l.contract_id ?? '') ?? 'Contrato')),
                ...porEmpreendimento.map(l => montar(l, 'EMPREENDIMENTO', nomeDoEmpreendimento.get(l.empreendimento_id ?? '') ?? 'Empreendimento')),
                ...porObra.map(l => montar(l, 'OBRA', 'Obra da operação')),
                ...porCliente.map(l => montar(l, 'CLIENTE', (rotulosDoCliente.get(l.client_id ?? '') ?? []).join(', ') || 'Contrato')),
            ];
            return agruparSugestoes(sugeridos);
        } catch (e) {
            console.warn('[creditRoomService] sugerirDocumentos falhou:', e);
            throw new Error('Não foi possível ler os documentos do GED para sugerir. Tente de novo.');
        }
    },

    async shareDocuments(room: CreditRoom, documentIds: string[]): Promise<void> {
        const sharedBy = await actorEmail();
        await documentService.sharePortalDocumentsBatch(documentIds, { audience: 'credor', creditRoomId: room.id }, sharedBy);
        await this.log(room, 'SHARE', 'document', documentIds.join(','), { count: documentIds.length });
    },

    async unshareDocument(room: CreditRoom, shareId: string, documentId: string): Promise<void> {
        await documentService.unsharePortalDocument(shareId);
        await this.log(room, 'UNSHARE', 'document', documentId);
    },

    /**
     * Download do documento pelo Data Room. Passa pela Edge Function
     * `credit-room-download`, que valida o JWT, o vínculo e grava o log com IP.
     * O lado interno (membro da org) pode assinar direto pelo storage — mas
     * usa o mesmo caminho para a trilha ser uma só.
     *
     * ⚠️ **Duas respostas possíveis, e o chamador precisa das duas** (§84):
     *
     *   PDF  → a função devolve os BYTES já com marca d'água. Vira blob local.
     *   resto → devolve `{ signedUrl }` de 15 min, como antes.
     *
     * O `Blob` é o formato comum: `invoke` entrega blob quando o content-type
     * não é JSON, então basta olhar o tipo do que voltou. Um `signedUrl` também
     * é convertido em blob aqui para o chamador ter UM caminho só — abrir aba
     * nova para um caso e baixar blob no outro seria comportamento diferente
     * para a mesma ação.
     */
    async getDownloadUrl(creditRoomId: string, storagePath: string): Promise<{ url: string; marcado: boolean }> {
        const { data, error } = await supabase.functions.invoke('credit-room-download', {
            body: { creditRoomId, storagePath },
        });
        if (error) throw error;

        if (data instanceof Blob) {
            // Content-type não-JSON: são os bytes do PDF marcado.
            return { url: URL.createObjectURL(data), marcado: true };
        }

        const url = (data as { signedUrl?: string } | null)?.signedUrl;
        if (!url) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível gerar o link do documento.');
        return { url, marcado: false };
    },

    // ── Participantes ─────────────────────────────────────────────────────

    async listMembers(creditRoomId: string): Promise<CreditRoomMember[]> {
        const { data, error } = await supabase
            .from('credit_room_members')
            .select(MEMBER_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('invited_at');
        if (error) throw error;
        return (data ?? []).map(r => mapMember(r as Row));
    },

    async invite(room: CreditRoom, input: CreditRoomMemberInput): Promise<CreditRoomMember> {
        const invited_by = await actorEmail();
        const email = input.email.trim().toLowerCase();
        const { data, error } = await supabase
            .from('credit_room_members')
            .insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                email,
                name: input.name ?? null,
                institution: input.institution ?? null,
                side: input.side,
                permissions: { ...PERMISSOES_PADRAO, ...(input.permissions ?? {}) },
                invited_by,
                expires_at: input.expiresAt ?? null,
            })
            .select(MEMBER_COLS)
            .single();
        if (error) {
            if (error.code === '23505') throw new Error('Este e-mail já foi convidado para este Credit Room.');
            throw error;
        }
        await this.log(room, 'INVITE', 'member', String((data as Row).id), { email, side: input.side });
        return mapMember(data as Row);
    },

    async updateMember(memberId: string, patch: Partial<Pick<CreditRoomMemberInput, 'name' | 'institution' | 'permissions' | 'expiresAt'>>): Promise<CreditRoomMember> {
        const row: Row = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.institution !== undefined) row.institution = patch.institution;
        if (patch.permissions !== undefined) row.permissions = { ...PERMISSOES_PADRAO, ...patch.permissions };
        if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt || null;
        const { data, error } = await supabase
            .from('credit_room_members')
            .update(row)
            .eq('id', memberId)
            .select(MEMBER_COLS)
            .single();
        if (error) throw error;
        return mapMember(data as Row);
    },

    async revoke(room: CreditRoom, member: CreditRoomMember): Promise<CreditRoomMember> {
        const revoked_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_members')
            .update({ revoked_at: new Date().toISOString(), revoked_by })
            .eq('id', member.id)
            .select(MEMBER_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'REVOKE', 'member', member.id, { email: member.email });
        return mapMember(data as Row);
    },

    /** Reativa um convite revogado (a linha é a mesma — o histórico fica). */
    async reinstate(room: CreditRoom, member: CreditRoomMember): Promise<CreditRoomMember> {
        const { data, error } = await supabase
            .from('credit_room_members')
            .update({ revoked_at: null, revoked_by: null })
            .eq('id', member.id)
            .select(MEMBER_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'INVITE', 'member', member.id, { email: member.email, reativado: true });
        return mapMember(data as Row);
    },

    // ── Lado do credor ────────────────────────────────────────────────────

    async myMemberships(): Promise<MyCreditRoomMembership[]> {
        const { data, error } = await supabase.rpc('fn_my_credit_rooms');
        if (error) throw error;
        return ((data ?? []) as Row[]).map(r => ({
            creditRoomId: String(r.credit_room_id),
            side: String(r.side) as CreditRoomSide,
            permissions: { ...PERMISSOES_PADRAO, ...((r.permissions ?? {}) as Partial<CreditRoomMember['permissions']>) },
            expiresAt: str(r.expires_at),
        }));
    },

    /** Rooms em que o usuário logado é participante ativo (a RLS já recorta). */
    async myRooms(): Promise<{ room: CreditRoom; membership: MyCreditRoomMembership }[]> {
        const memberships = await this.myMemberships();
        if (!memberships.length) return [];
        const { data, error } = await supabase
            .from('credit_rooms')
            .select(ROOM_COLS)
            .in('id', memberships.map(m => m.creditRoomId));
        if (error) throw error;
        const byId = new Map(memberships.map(m => [m.creditRoomId, m]));
        return (data ?? [])
            .map(r => mapRoom(r as Row))
            .map(room => ({ room, membership: byId.get(room.id)! }))
            .filter(x => !!x.membership);
    },

    /**
     * Primeiro acesso: liga user_id ao convite e marca last_access_at.
     *
     * `side` não é opcional por capricho: sem ele o LOGIN — o evento que a
     * auditoria mais consulta — nasce com `actor_side` nulo e a coluna "Lado"
     * fica vazia justamente na linha "fulano acessou". Visto na trilha real em
     * 07/09.
     */
    async touch(room: CreditRoom, side?: CreditRoomSide): Promise<boolean> {
        const { data, error } = await supabase.rpc('fn_credit_room_touch_member', { p_room: room.id });
        if (error) throw error;
        await this.log(room, 'LOGIN', 'room', room.id, {}, side);
        return !!data;
    },

    // ── Solicitações (request list) ───────────────────────────────────────

    async listRequests(creditRoomId: string): Promise<CreditRoomRequest[]> {
        const { data, error } = await supabase
            .from('credit_room_requests')
            .select(REQUEST_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapRequest(r as Row));
    },

    async createRequest(room: CreditRoom, input: CreditRoomRequestInput): Promise<CreditRoomRequest> {
        const created_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_requests')
            .insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                title: input.title,
                description: input.description ?? null,
                from_side: input.fromSide,
                assignee_email: input.assigneeEmail?.toLowerCase() ?? null,
                due_at: input.dueAt ?? null,
                priority: input.priority ?? 'MEDIA',
                answer_document_id: input.answerDocumentId ?? null,
                created_by,
            })
            .select(REQUEST_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'REQUEST', 'request', String((data as Row).id), { title: input.title, side: input.fromSide });
        return mapRequest(data as Row);
    },

    async updateRequest(
        requestId: string,
        patch: Partial<CreditRoomRequestInput> & { status?: CreditRoomRequestStatus },
    ): Promise<CreditRoomRequest> {
        const row: Row = {};
        if (patch.title !== undefined) row.title = patch.title;
        if (patch.description !== undefined) row.description = patch.description ?? null;
        if (patch.assigneeEmail !== undefined) row.assignee_email = patch.assigneeEmail?.toLowerCase() ?? null;
        if (patch.dueAt !== undefined) row.due_at = patch.dueAt || null;
        if (patch.priority !== undefined) row.priority = patch.priority;
        if (patch.answerDocumentId !== undefined) row.answer_document_id = patch.answerDocumentId ?? null;
        if (patch.status !== undefined) row.status = patch.status;
        const { data, error } = await supabase
            .from('credit_room_requests')
            .update(row)
            .eq('id', requestId)
            .select(REQUEST_COLS)
            .single();
        if (error) throw error;
        return mapRequest(data as Row);
    },

    async removeRequest(requestId: string): Promise<void> {
        const { error } = await supabase.from('credit_room_requests').delete().eq('id', requestId);
        if (error) throw error;
    },

    // ── Comentários ───────────────────────────────────────────────────────

    async listComments(creditRoomId: string, requestId?: string | null): Promise<CreditRoomComment[]> {
        let q = supabase
            .from('credit_room_comments')
            .select(COMMENT_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('created_at');
        if (requestId === null) q = q.is('request_id', null);
        else if (requestId) q = q.eq('request_id', requestId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(r => mapComment(r as Row));
    },

    async addComment(
        room: CreditRoom,
        input: { body: string; visibility: CreditRoomCommentVisibility; side: CreditRoomSide; requestId?: string },
    ): Promise<CreditRoomComment> {
        const author_email = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_comments')
            .insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                request_id: input.requestId ?? null,
                visibility: input.visibility,
                author_email,
                author_side: input.side,
                body: input.body,
            })
            .select(COMMENT_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'COMMENT', input.requestId ? 'request' : 'room', input.requestId ?? room.id, { visibility: input.visibility });
        return mapComment(data as Row);
    },

    async removeComment(commentId: string): Promise<void> {
        const { error } = await supabase.from('credit_room_comments').delete().eq('id', commentId);
        if (error) throw error;
    },

    // ── Covenants da operação (PRD §74–76) ────────────────────────────────

    async listCovenants(room: CreditRoom): Promise<DebtCovenant[]> {
        return debtCovenantService.list(room.organizationId, undefined, room.id);
    },

    async saveCovenant(room: CreditRoom, input: DebtCovenantInput): Promise<DebtCovenant> {
        return debtCovenantService.save(room.organizationId, { ...input, creditRoomId: room.id });
    },

    async removeCovenant(id: string): Promise<void> {
        return debtCovenantService.remove(id);
    },

    /**
     * Apura o covenant da operação (R8) — e a diferença em relação ao covenant
     * de contrato é o ponto inteiro.
     *
     * `fn_debt_covenant_evaluate` calcula o DSCR como `EBITDA 12m ÷ serviço
     * 12m` da EMPRESA. Numa operação de crédito isso não serve: o banco
     * negociou *quais* fluxos contam (`eligible_flows`), e é sobre eles que a
     * cláusula foi escrita. Esse número já existe pronto e conferido em
     * `indicators.dscr_pos` da versão congelada — o mesmo que o banco viu na
     * Visão. Recalculá-lo por outro caminho abriria a porta para dois DSCR
     * divergentes na mesma tela.
     *
     * Os demais tipos (dívida/EBITDA, endividamento, liquidez…) continuam indo
     * para o SQL: são da empresa, não da operação.
     */
    async evaluateCovenant(
        covenant: DebtCovenant,
        versaoAtiva: CreditRoomVersion | null,
        refDate: string,
        caixa?: number | null,
    ): Promise<AvaliacaoCovenant & { origem: 'SNAPSHOT' | 'RAZAO' }> {
        if (covenant.kind === 'DSCR') {
            const dscr = versaoAtiva?.indicators?.dscr_pos ?? versaoAtiva?.indicators?.dscr_atual ?? null;
            return {
                ...avaliarCovenant(dscr, covenant.threshold, covenant.comparator, covenant.warningMarginPct),
                origem: 'SNAPSHOT',
            };
        }
        const r = await debtCovenantService.evaluate(covenant.id, refDate, caixa);
        return {
            apurado: r.apurado ?? null,
            margemPct: r.margemPct ?? null,
            situacao: r.situacao === 'REGULAR' || r.situacao === 'ATENCAO' || r.situacao === 'VIOLADO'
                ? r.situacao : 'NAO_APURADO',
            origem: 'RAZAO',
        };
    },

    // ── Desembolsos (PRD §68–71) ──────────────────────────────────────────

    async listDisbursements(room: CreditRoom): Promise<CreditRoomDisbursement[]> {
        const { data, error } = await supabase
            .from('debt_disbursements')
            .select(DISBURSEMENT_COLS)
            .eq('credit_room_id', room.id)
            .order('seq', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapDisbursement(r as Row));
    },

    /**
     * Cria a SOLICITAÇÃO (§68). Nasce em `SOLICITADO`, sem data e sem valor
     * bruto — é a trava condicional da migration ...000005 que permite isso, e
     * é ela que impede a linha de chegar a LIBERADO pela metade.
     */
    async createDisbursement(
        room: CreditRoom,
        input: { requestedAmount: number; purpose?: string; measurementRef?: string; notes?: string },
    ): Promise<CreditRoomDisbursement> {
        if (!room.debtContractId) {
            throw new Error('Vincule um contrato de dívida à operação antes de solicitar desembolso — a liberação é dele.');
        }
        const { data, error } = await supabase
            .from('debt_disbursements')
            .insert({
                organization_id: room.organizationId,
                debt_contract_id: room.debtContractId,
                credit_room_id: room.id,
                status: 'SOLICITADO',
                requested_amount: input.requestedAmount,
                gross_amount: 0,
                purpose: input.purpose ?? null,
                measurement_ref: input.measurementRef ?? null,
                notes: input.notes ?? null,
            })
            .select(DISBURSEMENT_COLS)
            .single();
        if (error) throw error;
        const criado = mapDisbursement(data as Row);
        await this.log(room, 'REQUEST', 'disbursement', criado.id, { seq: criado.seq, valor: input.requestedAmount });
        return criado;
    },

    /**
     * Move o desembolso no fluxo do §69. Chegar em LIBERADO exige data e valor
     * — o banco recusa com 23514 se faltarem, e a mensagem crua não ajudaria
     * ninguém, então é traduzida aqui.
     */
    async moveDisbursement(
        room: CreditRoom,
        id: string,
        patch: Partial<{
            status: CreditRoomDisbursementStatus;
            approvedAmount: number | null;
            grossAmount: number;
            disbursedAt: string | null;
            physicalPct: number | null;
            analysisNotes: string;
            measurementRef: string;
            purpose: string;
            notes: string;
        }>,
        side?: CreditRoomSide,
    ): Promise<CreditRoomDisbursement> {
        const row: Row = {};
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.approvedAmount !== undefined) row.approved_amount = patch.approvedAmount;
        if (patch.grossAmount !== undefined) row.gross_amount = patch.grossAmount;
        if (patch.disbursedAt !== undefined) row.disbursed_at = patch.disbursedAt || null;
        if (patch.physicalPct !== undefined) row.physical_pct = patch.physicalPct;
        if (patch.analysisNotes !== undefined) row.analysis_notes = patch.analysisNotes;
        if (patch.measurementRef !== undefined) row.measurement_ref = patch.measurementRef;
        if (patch.purpose !== undefined) row.purpose = patch.purpose;
        if (patch.notes !== undefined) row.notes = patch.notes;
        if (patch.status === 'APROVADO' || patch.status === 'RECUSADO') {
            row.decided_at = new Date().toISOString();
            row.decided_by = await actorEmail();
        }

        const { data, error } = await supabase
            .from('debt_disbursements')
            .update(row)
            .eq('id', id)
            .select(DISBURSEMENT_COLS)
            .single();
        if (error) {
            if (error.code === '23514') {
                throw new Error('Para marcar como liberado é preciso informar a data e o valor efetivamente liberado.');
            }
            throw error;
        }
        const atualizado = mapDisbursement(data as Row);
        await this.log(room, 'STATUS', 'disbursement', id, { status: patch.status ?? '(edição)' }, side);
        return atualizado;
    },

    // ── Auditoria ─────────────────────────────────────────────────────────

    /**
     * Grava uma linha na trilha. Nunca derruba a ação que a originou — um
     * log que falha vira console.warn, não erro na tela.
     */
    async log(
        room: Pick<CreditRoom, 'id' | 'organizationId'>,
        action: CreditRoomAccessAction,
        resourceType?: string,
        resourceId?: string,
        metadata: Record<string, unknown> = {},
        side?: CreditRoomSide,
    ): Promise<void> {
        try {
            const [actor_email, actor_user_id] = await Promise.all([actorEmail(), actorUserId()]);
            if (!actor_email) return;
            const { error } = await supabase.from('credit_room_access_log').insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                actor_user_id: actor_user_id ?? null,
                actor_email,
                actor_side: side ?? null,
                action,
                resource_type: resourceType ?? null,
                resource_id: resourceId ?? null,
                metadata,
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            });
            if (error) console.warn('[creditRoomService] log não gravado:', error.message);
        } catch (e) {
            console.warn('[creditRoomService] log não gravado:', e);
        }
    },

    async listAccessLog(creditRoomId: string, limit = 200): Promise<CreditRoomAccessLog[]> {
        const { data, error } = await supabase
            .from('credit_room_access_log')
            .select(LOG_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map(r => mapLog(r as Row));
    },
};
