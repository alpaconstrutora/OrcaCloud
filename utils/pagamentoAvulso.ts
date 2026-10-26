// utils/pagamentoAvulso.ts
//
// Contas a Pagar › Pagamento avulso — a parte pura, sem React e sem Supabase.
// Plano: docs/planos/2026-10-17-contas-a-pagar-pagamento-avulso.md (item 2).
//
// O formulário (`components/financeiro/PagamentoAvulsoSheet.tsx`) pergunta o que
// o usuário pensa — credor, valor total, em quantas vezes, de quanto em quanto
// tempo, se já foi pago — e este módulo transforma isso nas linhas de
// `internal_transactions` (`source_system='MANUAL'`, `direction='DEBIT'`).
//
// A divisão em parcelas é a do contrato parcelado (`gerarCronogramaContrato`):
// truncada em centavos, sobra na ÚLTIMA parcela, meses somados sem transbordo
// (31/jan + 1 mês = 28/fev, não 03/mar).
import { gerarCronogramaContrato, PERIODICIDADES_CONTRATO, type PeriodicidadeContrato } from './contractInstallments';
import { somarMeses } from './paymentPlan';
import { isSystemProject, type SystemProjectShape } from './systemProjects';
import type { PayableBusinessStatus } from '../types/financial';

export { PERIODICIDADES_CONTRATO };
export type { PeriodicidadeContrato };

/** Mesmo vocabulário de `internal_transactions.payment_type` (ver `utils/baixaRecebivel.ts`). */
export type FormaPagamentoAvulso = 'PIX' | 'BOLETO' | 'TED' | 'DOC' | 'DINHEIRO' | 'CHEQUE' | 'PERMUTA';

/** Código do Tipo de Pagamento (`constants/paymentTypes.ts`) de um avulso de uma parcela só. */
export const TIPO_PARCELA_UNICA = 'UNICA';

/** Teto de parcelas: acima disso é financiamento, e financiamento tem módulo próprio (Dívidas). */
export const MAX_PARCELAS_AVULSO = 120;

export interface FormPagamentoAvulso {
    /** Fornecedor de Meus Fornecedores, quando escolhido. Ganha do texto livre. */
    supplierId: string | null;
    /** Nome a gravar como contraparte: o do fornecedor escolhido, ou o digitado. */
    credorNome: string;
    descricao: string;
    /** Valor TOTAL; com N parcelas, é dividido. */
    valorTotal: number;
    /** Obra (só OBRA — REGRA #3). Projeto de sistema vira null (REGRA #2). */
    projeto: (SystemProjectShape & { id: string }) | null;
    costCenterId: string | null;
    planoDeContasId: string | null;
    /** Conta Financeira (`financial_categories`) — a dimensão que a DRE lê. */
    categoryId: string | null;
    /** Nome da Conta Financeira, gravado em `category` (texto) junto do id. */
    categoryName: string | null;
    formaPagamento: FormaPagamentoAvulso | null;
    paymentAccountId: string | null;
    /** `YYYY-MM` da competência da 1ª parcela; vazio = mês do 1º vencimento. */
    competencia: string;
    parcelas: number;
    periodicidade: PeriodicidadeContrato;
    /** `YYYY-MM-DD` do (1º) vencimento. */
    primeiroVencimento: string;
    /** Só com 1 parcela: o pagamento já aconteceu. */
    jaPago: boolean;
    /** `YYYY-MM-DD` do pagamento (quando `jaPago`). */
    dataPagamento: string;
}

/** Uma linha a inserir em `internal_transactions` (sem `organization_id`, anexo e autor — o service põe). */
export interface LinhaPagamentoAvulso {
    source_system: 'MANUAL';
    direction: 'DEBIT';
    reference_id: string;
    transaction_date: string;
    due_date: string;
    competencia_date: string;
    amount: number;
    description: string;
    supplier_id: string | null;
    party_name: string | null;
    entity_name: string | null;
    party_type: 'SUPPLIER';
    project_id: string | null;
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
    category_id: string | null;
    category: string | null;
    payment_type: FormaPagamentoAvulso | null;
    payment_account_id: string | null;
    installment_type: string;
    /** CONCILIATED só no "Já pago" (nasce pago — ver `montarTitulosAvulsos`). */
    status: 'PENDING' | 'CONCILIATED';
    business_status: PayableBusinessStatus;
    payment_date: string | null;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MES_ISO = /^\d{4}-\d{2}$/;

/** Primeiro dia do mês de uma data `YYYY-MM-DD` ou de um mês `YYYY-MM`. */
const inicioDoMes = (isoOuMes: string): string => `${isoOuMes.slice(0, 7)}-01`;

/** REGRA #2 na escrita: `project_id` de projeto de sistema é sempre NULL. */
export function obraDoLancamento(projeto: FormPagamentoAvulso['projeto']): string | null {
    if (!projeto) return null;
    return isSystemProject(projeto) ? null : (projeto.id ?? null);
}

/**
 * O que impede salvar, campo a campo. Vazio = pode salvar.
 * A chave é o nome do campo, para a tela mostrar a frase perto dele; `motivoBloqueio`
 * devolve a primeira, para o botão desligado dizer por quê.
 */
export function validarPagamentoAvulso(f: FormPagamentoAvulso, hoje: string): Partial<Record<keyof FormPagamentoAvulso, string>> {
    const erros: Partial<Record<keyof FormPagamentoAvulso, string>> = {};
    if (!f.descricao.trim()) erros.descricao = 'Informe a descrição.';
    if (!(f.valorTotal > 0)) erros.valorTotal = 'Informe um valor maior que zero.';
    if (!f.primeiroVencimento) erros.primeiroVencimento = 'Informe o vencimento.';
    else if (!DATA_ISO.test(f.primeiroVencimento)) erros.primeiroVencimento = 'Vencimento inválido.';
    if (f.competencia && !MES_ISO.test(f.competencia)) erros.competencia = 'Competência inválida.';

    const n = Math.floor(Number(f.parcelas));
    if (!Number.isFinite(n) || n < 1) erros.parcelas = 'O número de parcelas deve ser pelo menos 1.';
    else if (n > MAX_PARCELAS_AVULSO) erros.parcelas = `No máximo ${MAX_PARCELAS_AVULSO} parcelas — acima disso, use Dívidas e Financiamentos.`;
    else if (f.valorTotal > 0 && Math.floor((f.valorTotal / n) * 100) < 1) erros.parcelas = 'Parcelas demais para este valor: cada uma ficaria abaixo de R$ 0,01.';

    if (f.jaPago) {
        if (n > 1) erros.jaPago = 'Pagamento já feito vale para uma parcela só. Lance as parcelas em aberto e dê baixa em cada uma.';
        if (!f.dataPagamento) erros.dataPagamento = 'Informe a data do pagamento.';
        else if (!DATA_ISO.test(f.dataPagamento)) erros.dataPagamento = 'Data do pagamento inválida.';
        else if (f.dataPagamento > hoje) erros.dataPagamento = 'A data do pagamento não pode ser futura.';
        if (!f.paymentAccountId) erros.paymentAccountId = 'Informe a conta de onde o dinheiro saiu.';
    }
    return erros;
}

/** Primeira frase de `validarPagamentoAvulso`, ou `null` — para o botão desligado dizer o motivo. */
export function motivoBloqueio(f: FormPagamentoAvulso, hoje: string): string | null {
    const erros = validarPagamentoAvulso(f, hoje);
    const primeira = Object.values(erros)[0];
    return primeira ?? null;
}

/** Prévia das parcelas (vencimento e valor) — a mesma conta que `montarTitulosAvulsos` grava. */
export function previaParcelas(f: Pick<FormPagamentoAvulso, 'valorTotal' | 'parcelas' | 'periodicidade' | 'primeiroVencimento'>): { vencimento: string; valor: number }[] {
    if (!(f.valorTotal > 0) || !f.primeiroVencimento) return [];
    const n = Math.max(1, Math.floor(Number(f.parcelas) || 1));
    return gerarCronogramaContrato({
        total: f.valorTotal,
        entrada: 0,
        vencimentoEntrada: f.primeiroVencimento,
        parcelas: n,
        periodicidade: f.periodicidade,
        primeiroVencimento: f.primeiroVencimento,
    }).map(l => ({ vencimento: l.date, valor: l.value }));
}

/**
 * As linhas do avulso. `grupoId` amarra as parcelas (`reference_id = <grupo>:p<k>`,
 * convenção de referência composta) sem colidir no UNIQUE
 * `(organization_id, reference_id, entry_type)`.
 *
 * Nasce SEMPRE em aberto (Previsto). "Já pago" é a baixa logo em seguida, pelo
 * mesmo caminho da baixa manual (`payableService.darBaixa`), que respeita a
 * alçada pendente (decisão de 17/10/2026, plano 2026-10-16 item H.1) — gravar
 * PAGO direto no INSERT passaria por cima dela.
 */
export function montarTitulosAvulsos(f: FormPagamentoAvulso, grupoId: string): LinhaPagamentoAvulso[] {
    const previa = previaParcelas(f);
    const n = previa.length;
    const meses = PERIODICIDADES_CONTRATO.find(p => p.value === f.periodicidade)?.meses ?? 1;
    const tipo = n > 1
        ? (PERIODICIDADES_CONTRATO.find(p => p.value === f.periodicidade)?.tipo ?? 'MENSAL')
        : TIPO_PARCELA_UNICA;
    const competenciaBase = f.competencia && MES_ISO.test(f.competencia)
        ? inicioDoMes(f.competencia)
        : inicioDoMes(f.primeiroVencimento);
    const descricao = f.descricao.trim();
    const credor = f.credorNome.trim() || null;
    const projectId = obraDoLancamento(f.projeto);
    const pago = f.jaPago && n === 1;

    return previa.map((p, i) => ({
        source_system: 'MANUAL',
        direction: 'DEBIT',
        reference_id: `${grupoId}:p${i + 1}`,
        // transaction_date espelha o vencimento no lançamento manual — é o que
        // `payableService.update` e a trava de período (`trg_block_period_internal_tx`) leem.
        transaction_date: p.vencimento,
        due_date: p.vencimento,
        // A competência anda junto das parcelas: sem mexer no campo, cada uma cai
        // no mês do próprio vencimento; mudando, todas deslocam igual.
        competencia_date: somarMeses(competenciaBase, meses * i),
        amount: p.valor,
        description: n > 1 ? `${descricao} (${i + 1}/${n})` : descricao,
        supplier_id: f.supplierId || null,
        party_name: credor,
        entity_name: credor,
        party_type: 'SUPPLIER',
        project_id: projectId,
        cost_center_id: f.costCenterId || null,
        plano_de_contas_id: f.planoDeContasId || null,
        category_id: f.categoryId || null,
        category: f.categoryId ? (f.categoryName || null) : null,
        payment_type: f.formaPagamento,
        payment_account_id: f.paymentAccountId || null,
        installment_type: tipo,
        // "Já pago" (uma parcela só — a validação recusa N > 1) nasce PAGO: o pagamento
        // já aconteceu, e todo título em aberto nasce pendente na alçada desde
        // 26/10/2026 — baixar depois do INSERT seria recusado (plano
        // 2026-10-26-todo-titulo-a-pagar-passa-pela-aprovacao, S5).
        status: pago ? 'CONCILIATED' : 'PENDING',
        business_status: pago ? 'PAGO' : 'PREVISTO',
        payment_date: pago ? f.dataPagamento : null,
    }));
}

/** Nome de arquivo seguro para o Storage (sem acento, espaço nem barra), preservando a extensão. */
export function nomeSeguroDeArquivo(nome: string): string {
    const limpo = nome
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return limpo.slice(-120) || 'documento';
}

/** Caminho do anexo no bucket `financeiro-anexos`: a 1ª pasta é a org (é o que a policy confere). */
export function caminhoDoAnexo(organizationId: string, grupoId: string, nomeArquivo: string): string {
    return `${organizationId}/avulso/${grupoId}/${nomeSeguroDeArquivo(nomeArquivo)}`;
}
