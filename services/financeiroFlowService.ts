import { projectService } from './projectService';
import type { ProcessEventKey } from '../types/process';
import type { FlowEdge, FlowGroup, FlowRecord, FlowService, FlowStage, FlowSnapshot, SeamStatus } from '../types/processFlow';
import {
  countRows, fetchRows, lerMotor, resumirProcessos, montarArestas, processosDoNo,
  fmtBrl, fmtDate, type Filters,
} from './processFlowShared';

/**
 * Torre de Controle — Fluxo Financeiro. Mesmo contrato e mesma tela da Torre
 * P2P (`p2pFlowService` + `ProcessFlowBoard`, §31 do guia de UI); aqui mora só
 * o que é do Financeiro: as etapas, o retrato das transições e os eventos.
 * Plano: docs/planos/2026-10-16-torre-fluxo-financeiro.md.
 *
 * Desenho: a pagar em cima (boletos e títulos de integração → Contas a Pagar →
 * Alçada → Pagamento), a receber embaixo (origens → Contas a Receber →
 * Cobrança), as duas linhas convergindo em Tesouraria (Pago / Recebido, com o
 * Extrato conciliando) e terminando no fechamento da Controladoria.
 */

/**
 * Eventos do motor que NASCEM em cada nó (`ProcessEventKey`, types/process.ts).
 * São do Financeiro e valem para título de qualquer origem — o
 * `internal_transaction.paid` do P2P continua só de pedido.
 */
export const STAGE_EVENT_KEYS_FIN: Record<string, ProcessEventKey[]> = {
  boletos:   ['boleto.approved'],
  aprovacao: ['payable.approved'],
  pagamento: ['payable.settled'],
  cobranca:  ['receivable.settled'],
};

/** Qual transição cada evento CONDUZ (a costura mora na aresta, como no P2P). */
export const EDGE_EVENT_KEYS_FIN: Record<string, ProcessEventKey[]> = {
  'boletos->a_pagar':     STAGE_EVENT_KEYS_FIN.boletos,
  'aprovacao->pagamento': STAGE_EVENT_KEYS_FIN.aprovacao,
  'pagamento->baixado':   STAGE_EVENT_KEYS_FIN.pagamento,
  'cobranca->baixado':    STAGE_EVENT_KEYS_FIN.cobranca,
};

/**
 * Retrato ESTÁTICO das transições — o que o código faz sozinho, sem o motor.
 * Conferido contra o código em 16/10/2026 (plano, seção "Contexto"). Se uma
 * costura mudar no código, mude AQUI.
 */
export const DEFINICAO_DAS_ARESTAS_FIN: ReadonlyArray<Pick<FlowEdge, 'from' | 'to' | 'seam' | 'note'>> = [
  { from: 'boletos',         to: 'a_pagar',    seam: 'manual', note: 'Aprovar o boleto cria o título e já o envia à alçada (abaixo do piso nasce liberado)' },
  { from: 'origens_pagar',   to: 'a_pagar',    seam: 'auto',   note: 'Pedido recebido, contrato, medição, folha fechada e tributo do negócio geram o título sozinhos; NF-e e dívida pedem um clique' },
  { from: 'a_pagar',         to: 'aprovacao',  seam: 'manual', note: 'Só o boleto entra na alçada sozinho; os demais títulos são enviados pela tela de Aprovações' },
  { from: 'aprovacao',       to: 'pagamento',  seam: 'auto',   note: 'Alçada fechada marca o título como Aprovado' },
  { from: 'pagamento',       to: 'baixado',    seam: 'manual', note: 'Baixa no painel ou boleto marcado como pago; o Asaas baixa sozinho pelo webhook. A baixa não confere a alçada' },
  { from: 'extrato',         to: 'baixado',    seam: 'auto',   note: 'Motor de conciliação (no app e por CRON a cada 10 min) vincula extrato × título; o que não casa vira sugestão. Baixa pelo CRON não abre processo' },
  { from: 'origens_receber', to: 'a_receber',  seam: 'auto',   note: 'Contrato de venda gera as parcelas depois de emitido/assinado; locação ("Gerar parcelas") e condomínio (rateio fechado) pedem um clique' },
  { from: 'a_receber',       to: 'cobranca',   seam: 'manual', note: 'Boleto/PIX do Asaas emitido na tela de Cobranças; a régua de cobrança só envia e-mail' },
  { from: 'cobranca',        to: 'baixado',    seam: 'auto',   note: 'Webhook do Asaas baixa o recebível; conciliação e baixa manual também. Baixa pelo webhook não abre processo' },
  { from: 'baixado',         to: 'fechamento', seam: 'manual', note: 'Fechamento de competência trava o mês; DRE e fluxo de caixa leem o que foi baixado' },
];

/** Áreas do fluxo, na ordem em que aparecem no desenho. */
export const FIN_GROUPS: ReadonlyArray<FlowGroup> = [
  { id: 'pagar',         label: 'A pagar',       nodeIds: ['boletos', 'origens_pagar', 'a_pagar', 'aprovacao', 'pagamento'] },
  { id: 'receber',       label: 'A receber',     nodeIds: ['origens_receber', 'a_receber', 'cobranca'] },
  { id: 'tesouraria',    label: 'Tesouraria',    nodeIds: ['extrato', 'baixado'] },
  { id: 'controladoria', label: 'Controladoria', nodeIds: ['fechamento'] },
];

/** Título aberto que veio de integração: lançamento manual (e o boleto, que tem nó próprio) fica de fora. */
const ORIGEM_INTEGRADA_PAGAR: Filters = { source_system: { notIn: ['MANUAL', 'BOLETO'] } };
const ORIGEM_INTEGRADA_RECEBER: Filters = { source_system: { notIn: ['MANUAL'] } };

/** Situação ABERTA de um título a pagar na view (o `effective_status` repete o `business_status` quando não venceu nem foi pago). */
const PAGAR_ABERTO = ['PREVISTO', 'APROVADO', 'VENCIDO', 'AGUARDANDO_APROVACAO', 'BLOQUEADO'];
const RECEBER_ABERTO = ['PREVISTO', 'VENCIDO'];
const RECEBER_EM_COBRANCA = ['EMITIDO', 'ENVIADO'];
const BOLETO_CAPTURADO = ['rascunho', 'revisao'];
/**
 * Extrato que ainda não virou baixa — o MESMO critério da aba Pendentes da
 * Conciliação (`BankReconciliation.tsx`, filtro de pendentes). Ignorado,
 * transferência e vinculado (MATCHED) ficam de fora.
 */
const EXTRATO_PENDENTE = ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED', 'CONFIRMED'];

/**
 * Título a pagar ABERTO na alçada (PENDENTE) ou já liberado por ela (APROVADO).
 * Pelo `approval_status`, não pelo `business_status`: a liberação abaixo do
 * piso (`approvalService.submit`, `semFaixa: 'liberar'`) grava só
 * `approval_status = 'APROVADO'` — na Alpa, em 16/10/2026, 75 títulos liberados
 * tinham `business_status` vazio, e contar `business_status = 'APROVADO'` dava
 * ZERO no nó Pagamento. Só abertos (`status = 'PENDING'`): título já baixado
 * que ficou PENDENTE na alçada é a lacuna "a baixa não confere a alçada", não
 * fila de aprovação.
 */
const NA_ALCADA: Filters = { direction: 'DEBIT', status: 'PENDING', approval_status: 'PENDENTE' };
const LIBERADO_PARA_PAGAR: Filters = { direction: 'DEBIT', status: 'PENDING', approval_status: 'APROVADO' };

/** Origem do título em texto — o mesmo vocabulário da Conciliação (`BankReconciliation`), com as origens que ela não nomeia. */
const ORIGEM_LABEL: Record<string, string> = {
  PURCHASE_ORDER:       'Pedido de compra',
  NFE:                  'NF-e',
  BOLETO:               'Boleto a pagar',
  CONTRACT_RECURRING:   'Contrato recorrente',
  CONTRACT_PARCELADO:   'Contrato parcelado',
  CONTRACT_AVISTA:      'Contrato à vista',
  CONTRACT_MEASUREMENT: 'Medição de contrato',
  LABOR:                'Folha de pagamento',
  PROLABORE:            'Pró-labore',
  DIVIDENDOS:           'Dividendos',
  COMMERCIAL:           'Gestão comercial',
  PROJECT:              'Obra / projeto',
  CONDOMINIO_RATEIO:    'Rateio de condomínio',
  DEBT_INSTALLMENT:     'Parcela de dívida',
  ASSET_MAINTENANCE:    'Manutenção de ativo',
  ASAAS_FEE:            'Taxa do Asaas',
  MANUAL:               'Lançamento manual',
};
const origem = (ss?: string | null) => (ss ? ORIGEM_LABEL[ss] ?? ss : undefined);

/** Situação do título na view (`effective_status`) e do extrato, em texto — o drawer não mostra código cru. */
const SITUACAO_TITULO: Record<string, string> = {
  PREVISTO: 'Previsto', APROVADO: 'Aprovado', VENCIDO: 'Vencido', AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  BLOQUEADO: 'Bloqueado', PAGO: 'Pago', RECEBIDO: 'Recebido', EMITIDO: 'Emitido', ENVIADO: 'Enviado',
  PARCIAL: 'Parcial', RENEGOCIADO: 'Renegociado', CANCELADO: 'Cancelado', RETIDO: 'Retido',
};
const SITUACAO_EXTRATO: Record<string, string> = {
  IMPORTED: 'Importado', NORMALIZED: 'A conciliar', RULE_APPLIED: 'Classificado por regra', CONFIRMED: 'Confirmado',
};
const SEAM_TEXTO: Record<SeamStatus, string> = { auto: 'automática', manual: 'semi-manual', gap: 'lacuna', orquestrada: 'orquestrada' };

const BOLETO_STATUS: Record<string, string> = {
  rascunho: 'Rascunho', revisao: 'Em revisão', aprovado: 'Aprovado', programado: 'Programado', pago: 'Pago', cancelado: 'Cancelado',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type LinhaTitulo = {
  id: string; description: string | null; amount: number; due_date: string | null;
  effective_status?: string; source_system?: string | null; party_name?: string | null;
};

const tituloParaRegistro = (r: LinhaTitulo, sub?: string): FlowRecord => ({
  id: r.id,
  label: r.description || r.party_name || 'Sem descrição',
  sublabel: [sub, fmtBrl(r.amount)].filter(Boolean).join(' · '),
  value: r.amount,
  status: r.effective_status ? (SITUACAO_TITULO[r.effective_status] ?? r.effective_status) : undefined,
  date: fmtDate(r.due_date ?? undefined),
});

const COLUNAS_TITULO = 'id, description, amount, due_date, effective_status, source_system, party_name';

export const financeiroFlowService: FlowService = {
  /** Obras da organização (só OBRA, sem projeto de sistema — REGRAS #2/#3, cortadas no `projectService`). */
  async listProjects(organizationId) {
    const rows = await projectService.listProjects({ organizationId });
    return rows
      .map(p => ({ id: p.id as string, name: p.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getSnapshot(organizationId, projectId): Promise<FlowSnapshot> {
    // REGRA #5: org do topo; "Todas" (null) não filtra e a RLS recorta.
    const org: Filters = organizationId ? { organization_id: organizationId } : {};
    // Filtro de obra onde a tabela tem obra. Extrato e fechamento são da
    // organização inteira (o extrato quase nunca tem obra antes de conciliar).
    const proj: Filters = projectId ? { project_id: projectId } : {};

    const [
      boletosCapturados, boletosEmRevisao,
      origensPagar, aPagar, aPagarVencidos, naAlcada, aprovadosAPagar,
      origensReceber, aReceber, aReceberVencidos, emCobranca,
      extratoPendente, pagos, recebidos, mesesFechados,
      motor,
    ] = await Promise.all([
      countRows('boletos', { ...org, ...proj, status: BOLETO_CAPTURADO }),
      countRows('boletos', { ...org, ...proj, status: 'revisao' }),
      countRows('internal_transactions', { ...org, ...proj, direction: 'DEBIT', status: 'PENDING', ...ORIGEM_INTEGRADA_PAGAR }),
      countRows('vw_payables', { ...org, ...proj, effective_status: PAGAR_ABERTO }),
      countRows('vw_payables', { ...org, ...proj, effective_status: 'VENCIDO' }),
      countRows('internal_transactions', { ...org, ...proj, ...NA_ALCADA }),
      countRows('internal_transactions', { ...org, ...proj, ...LIBERADO_PARA_PAGAR }),
      countRows('internal_transactions', { ...org, ...proj, direction: 'CREDIT', status: 'PENDING', ...ORIGEM_INTEGRADA_RECEBER }),
      countRows('vw_receivables', { ...org, ...proj, effective_status: RECEBER_ABERTO }),
      countRows('vw_receivables', { ...org, ...proj, effective_status: 'VENCIDO' }),
      countRows('vw_receivables', { ...org, ...proj, effective_status: RECEBER_EM_COBRANCA }),
      countRows('bank_transactions', { ...org, status: EXTRATO_PENDENTE }),
      countRows('vw_payables', { ...org, ...proj, effective_status: 'PAGO' }),
      countRows('vw_receivables', { ...org, ...proj, effective_status: 'RECEBIDO' }),
      countRows('financial_period_locks', { ...org, is_closed: 'true' }),
      lerMotor(organizationId, projectId),
    ]);

    const definicoes: FlowStage[] = [
      {
        id: 'boletos', label: 'Boletos capturados', owner: 'Contas a Pagar',
        view: 'boletos-pagar', count: boletosCapturados, pending: boletosEmRevisao,
        inboundSeam: 'auto', inboundNote: 'Captura por upload ou pela caixa de e-mail (IMAP)',
        eventKeys: STAGE_EVENT_KEYS_FIN.boletos,
      },
      {
        id: 'origens_pagar', label: 'Origens a pagar', owner: 'Integrações',
        view: 'contas-a-pagar', count: origensPagar,
        inboundSeam: 'auto', inboundNote: 'Títulos abertos nascidos de Suprimentos, Contratos, RH e Comercial',
      },
      {
        id: 'a_pagar', label: 'Contas a Pagar', owner: 'Financeiro',
        view: 'contas-a-pagar', count: aPagar, pending: aPagarVencidos,
        inboundSeam: 'auto',
      },
      {
        id: 'aprovacao', label: 'Alçada', owner: 'Aprovadores',
        view: 'financial-approval', count: naAlcada, pending: naAlcada,
        inboundSeam: 'manual',
        eventKeys: STAGE_EVENT_KEYS_FIN.aprovacao,
      },
      {
        id: 'pagamento', label: 'Pagamento', owner: 'Tesouraria',
        // Boleto programado no Asaas já está aqui: o título dele é aberto e liberado.
        view: 'contas-a-pagar', count: aprovadosAPagar, pending: aprovadosAPagar,
        inboundSeam: 'auto',
        eventKeys: STAGE_EVENT_KEYS_FIN.pagamento,
      },
      {
        id: 'origens_receber', label: 'Origens a receber', owner: 'Comercial / Obras',
        view: 'contas-a-receber', count: origensReceber,
        inboundSeam: 'auto', inboundNote: 'Títulos abertos nascidos de contratos de venda e locação, condomínio e obra',
      },
      {
        id: 'a_receber', label: 'Contas a Receber', owner: 'Financeiro',
        view: 'contas-a-receber', count: aReceber, pending: aReceberVencidos,
        inboundSeam: 'auto',
      },
      {
        id: 'cobranca', label: 'Cobrança emitida', owner: 'Cobrança',
        view: 'financial-boletos', count: emCobranca,
        inboundSeam: 'manual',
        eventKeys: STAGE_EVENT_KEYS_FIN.cobranca,
      },
      {
        id: 'extrato', label: 'Extrato bancário', owner: 'Tesouraria',
        view: 'bank-reconciliation', count: extratoPendente, pending: extratoPendente,
        inboundSeam: 'manual', inboundNote: 'Extrato importado na Conciliação (OFX, XLS, CSV)',
      },
      {
        id: 'baixado', label: 'Pago / Recebido', owner: 'Tesouraria',
        view: 'bank-reconciliation', count: pagos + recebidos,
        inboundSeam: 'manual',
      },
      {
        id: 'fechamento', label: 'Fechamento & DRE', owner: 'Controladoria',
        view: 'controladoria', count: mesesFechados,
        inboundSeam: 'manual',
      },
    ];

    const edges = montarArestas(DEFINICAO_DAS_ARESTAS_FIN, EDGE_EVENT_KEYS_FIN, motor);
    const agora = Date.now();
    const rotulo = (id: string) => definicoes.find(d => d.id === id)?.label ?? id;
    const stages: FlowStage[] = definicoes.map(no => ({
      ...no,
      ...entradaDoNo(edges.filter(e => e.to === no.id), rotulo),
      ...(no.eventKeys ? { processes: resumirProcessos(motor, no.eventKeys, agora) } : {}),
    }));

    return { stages, edges, groups: [...FIN_GROUPS], generatedAt: new Date().toISOString() };
  },

  /** Instâncias ativas nascidas num nó (drawer do nó e painel da aresta). */
  async getStageProcesses(stageId, organizationId, projectId) {
    return processosDoNo(STAGE_EVENT_KEYS_FIN[stageId], organizationId, projectId);
  },

  async getStageRecords(stageId, organizationId, projectId): Promise<FlowRecord[]> {
    const org: Filters = organizationId ? { organization_id: organizationId } : {};
    const proj: Filters = projectId ? { project_id: projectId } : {};

    const titulos = async (tabela: string, filtros: Filters, comOrigem = false) =>
      (await fetchRows<LinhaTitulo>(tabela, COLUNAS_TITULO, { ...org, ...proj, ...filtros }))
        .map(r => tituloParaRegistro(r, comOrigem ? origem(r.source_system) : r.party_name ?? undefined));

    switch (stageId) {
      case 'boletos':
        return boletosDoStatus(org, proj, BOLETO_CAPTURADO);

      case 'pagamento': {
        const rows = await fetchRows<LinhaTitulo>(
          'internal_transactions',
          'id, description, amount, due_date, source_system, party_name',
          { ...org, ...proj, ...LIBERADO_PARA_PAGAR },
        );
        return rows.map(r => ({ ...tituloParaRegistro(r, origem(r.source_system)), status: 'Liberado para pagar' }));
      }

      // Origens: o status do registro É a origem (pedido, contrato, folha…) —
      // é o que esta etapa existe para mostrar.
      case 'origens_pagar':
      case 'origens_receber': {
        const rows = await fetchRows<LinhaTitulo>(
          'internal_transactions',
          'id, description, amount, due_date, source_system, party_name',
          stageId === 'origens_pagar'
            ? { ...org, ...proj, direction: 'DEBIT', status: 'PENDING', ...ORIGEM_INTEGRADA_PAGAR }
            : { ...org, ...proj, direction: 'CREDIT', status: 'PENDING', ...ORIGEM_INTEGRADA_RECEBER },
        );
        return rows.map(r => ({ ...tituloParaRegistro(r, r.party_name ?? undefined), status: origem(r.source_system) }));
      }

      case 'a_pagar':
        return titulos('vw_payables', { effective_status: PAGAR_ABERTO }, true);

      case 'aprovacao': {
        const rows = await fetchRows<LinhaTitulo>(
          'internal_transactions',
          'id, description, amount, due_date, source_system, party_name',
          { ...org, ...proj, ...NA_ALCADA },
        );
        return rows.map(r => ({ ...tituloParaRegistro(r, origem(r.source_system)), status: 'Na alçada' }));
      }

      case 'a_receber':
        return titulos('vw_receivables', { effective_status: RECEBER_ABERTO }, true);

      case 'cobranca':
        return titulos('vw_receivables', { effective_status: RECEBER_EM_COBRANCA }, true);

      case 'extrato': {
        const rows = await fetchRows<{
          id: string; description_raw: string | null; counterparty_name: string | null;
          amount: number; status: string; transaction_date: string | null;
        }>(
          'bank_transactions',
          'id, description_raw, counterparty_name, amount, status, transaction_date',
          { ...org, status: EXTRATO_PENDENTE },
        );
        return rows.map(r => ({
          id: r.id,
          label: r.counterparty_name || r.description_raw || 'Movimento sem descrição',
          sublabel: fmtBrl(r.amount),
          value: r.amount,
          status: SITUACAO_EXTRATO[r.status] ?? r.status,
          date: fmtDate(r.transaction_date ?? undefined),
        }));
      }

      case 'baixado': {
        const [pagos, recebidos] = await Promise.all([
          titulos('vw_payables', { effective_status: 'PAGO' }, true),
          titulos('vw_receivables', { effective_status: 'RECEBIDO' }, true),
        ]);
        return [...pagos.slice(0, 25), ...recebidos.slice(0, 25)];
      }

      case 'fechamento': {
        const rows = await fetchRows<{
          id: string; period_year: number; period_month: number; is_closed: boolean; closed_at: string | null; notes: string | null;
        }>(
          'financial_period_locks',
          'id, period_year, period_month, is_closed, closed_at, notes',
          { ...org },
        );
        return rows.map(r => ({
          id: r.id,
          label: `Competência ${MESES[r.period_month - 1] ?? r.period_month}/${r.period_year}`,
          sublabel: r.notes ?? undefined,
          status: r.is_closed ? 'Fechado' : 'Reaberto',
          date: fmtDate(r.closed_at ?? undefined),
        }));
      }

      default:
        return [];
    }
  },
};

/**
 * A entrada de um nó. No P2P cada nó tem UMA aresta de entrada e a herda; aqui
 * Contas a Pagar tem duas (boleto, origens) e Pago / Recebido tem três
 * (pagamento, extrato, cobrança). Herdar só a primeira mostrava no drawer de
 * Contas a Pagar a nota do boleto como se fosse a única entrada (conferido no
 * navegador, 16/10/2026). Com várias: a nota lista cada uma, e a costura é a
 * mais exigente — orquestrada se algum processo conduz, senão semi-manual se
 * alguma pede ação, senão automática.
 */
export function entradaDoNo(
  entradas: FlowEdge[],
  rotulo: (id: string) => string,
): Partial<Pick<FlowStage, 'inboundSeam' | 'inboundNote'>> {
  if (entradas.length === 0) return {};
  if (entradas.length === 1) return { inboundSeam: entradas[0].seam, inboundNote: entradas[0].note };
  const ordem: SeamStatus[] = ['orquestrada', 'gap', 'manual', 'auto'];
  const inboundSeam = ordem.find(s => entradas.some(e => e.seam === s)) ?? entradas[0].seam;
  const inboundNote = entradas.map(e => `${rotulo(e.from)} (${SEAM_TEXTO[e.seam]})`).join(' · ');
  return { inboundSeam, inboundNote: `${entradas.length} entradas: ${inboundNote}` };
}

async function boletosDoStatus(org: Filters, proj: Filters, status: string[]): Promise<FlowRecord[]> {
  const rows = await fetchRows<{
    id: string; beneficiario_nome: string | null; valor: number | null; status: string; vencimento: string | null;
  }>(
    'boletos',
    'id, beneficiario_nome, valor, status, vencimento',
    { ...org, ...proj, status },
  );
  return rows.map(r => ({
    id: r.id,
    label: r.beneficiario_nome || 'Beneficiário não identificado',
    sublabel: fmtBrl(r.valor ?? undefined),
    value: r.valor ?? undefined,
    status: BOLETO_STATUS[r.status] ?? r.status,
    date: fmtDate(r.vencimento ?? undefined),
  }));
}
