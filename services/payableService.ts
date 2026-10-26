import { supabase } from '../lib/supabase';
import { fetchAllPagesParallel, type RangeableQuery } from '../lib/supabasePaginate';
import type { Payable, PayableBusinessStatus, ReceivablePaymentType } from '../types/financial';

/** Mesmo vocabulário de `internal_transactions.payment_type` usado em Receber. */
export type PayablePaymentType = ReceivablePaymentType;
import { propertyExpenseService } from './propertyExpenseService';
import { processService } from './processService';
import { exigirAlcadaLiberada } from './alcadaDaBaixa';
import { financialApprovalService } from './financialApprovalService';
import { resolverCategoriaPorId } from './financialCategoryResolver';
import { storageService } from './storageService';
import {
    caminhoDoAnexo,
    montarTitulosAvulsos,
    type FormPagamentoAvulso,
    type FormaPagamentoAvulso,
} from '../utils/pagamentoAvulso';

/** Bucket privado do anexo do pagamento avulso (migration aplicar_20271018300000). */
export const BUCKET_ANEXOS_AVULSO = 'financeiro-anexos';

/** O que o formulário de edição precisa reabrir de um título avulso. */
/** Estados de supplier_payments em que o título não se edita nem se exclui: o dinheiro
 *  está saindo ou já saiu pela Asaas. FAILED e CANCELLED não travam. */
export const STATUS_ASAAS_TRAVA_TITULO = ['APPROVED', 'PENDING', 'SCHEDULED', 'DONE'];

export interface PagamentoAvulsoGravado {
    id: string;
    organization_id: string;
    reference_id: string | null;
    description: string | null;
    amount: number;
    due_date: string | null;
    competencia_date: string | null;
    supplier_id: string | null;
    party_name: string | null;
    project_id: string | null;
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
    category_id: string | null;
    category: string | null;
    payment_type: FormaPagamentoAvulso | null;
    payment_account_id: string | null;
    status: string;
    business_status: string | null;
    approval_status: string | null;
    documento_path: string | null;
    documento_nome: string | null;
}

/** Resultado de criar um avulso: os títulos gravados e, se a baixa de "Já pago" não saiu, por quê. */
export interface ResultadoAvulso {
    ids: string[];
    /** Preenchido quando o título foi criado mas a baixa não foi gravada (alçada pendente ou erro). */
    avisoBaixa: string | null;
}

/** O grupo das parcelas é o prefixo de `reference_id` (`<grupo>:p<k>`). */
function grupoDaReferencia(referenceId: string | null | undefined): string | null {
    const m = /^([0-9a-f-]{36}):p\d+$/i.exec(referenceId ?? '');
    return m ? m[1] : null;
}

async function usuarioAtualId(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
}

/** Apaga o arquivo do bucket só quando nenhum título aponta mais para ele (as parcelas compartilham o anexo). */
async function removerAnexoSeOrfao(path: string | null | undefined): Promise<void> {
    if (!path) return;
    try {
        const { count, error } = await supabase
            .from('internal_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('documento_path', path);
        if (error || (count ?? 0) > 0) return;
        await storageService.remove(BUCKET_ANEXOS_AVULSO, [path]);
    } catch (e) {
        // Arquivo órfão no bucket não é dado errado na tela — só espaço. Não derruba a operação.
        console.warn('[payableService] anexo órfão não removido:', path, e);
    }
}

export interface PayableFilters {
    search?: string;
    status?: PayableBusinessStatus | 'VENCIDO' | 'all';
    dueFrom?: string;
    dueTo?: string;
    projectId?: string;
    /** Origem do título: PURCHASE_ORDER, CONTRACT_PARCELADO, MANUAL… */
    sourceSystem?: string;
}

/** Contraparte exibível: alguns produtores gravam só entity_name. */
export function payableParty(p: Payable): string {
    return p.party_name || p.entity_name || '—';
}

/**
 * Tamanho do bloco de paginação. O PostgREST do Supabase corta toda resposta em
 * `db-max-rows` (1000 por padrão) — uma query sem `.range()` devolve no máximo
 * 1000 linhas SEM erro e SEM aviso. Com `due_date` ascendente e nulos por
 * último, isso cortava exatamente os títulos MAIS RECENTES (o mês corrente
 * nunca chegava a aparecer) assim que a organização passava de ~1000 títulos —
 * é por isso que Fechamento por Centro de Custo aparecia vazio em 2026-08 com
 * 1848 títulos na base. Mesmo padrão de `boletoService.ts`.
 */
const PAGE_SIZE = 1000;

/** O pedaço do query builder do supabase-js que `list()` usa para filtrar. */
interface FiltravelPorColuna {
    eq(column: string, value: unknown): FiltravelPorColuna;
    gte(column: string, value: unknown): FiltravelPorColuna;
    lte(column: string, value: unknown): FiltravelPorColuna;
}

export const payableService = {

    /**
     * `organizationId` aceita null: com "Todas as organizações" selecionado não
     * filtramos por org e deixamos a RLS de internal_transactions recortar o que
     * o usuário pode ver (REGRA #5 do CLAUDE.md — leitura nunca bloqueia).
     */
    async list(organizationId?: string | null, filters?: PayableFilters): Promise<Payable[]> {
        // Os MESMOS filtros na página e na contagem — contagem de outro recorte
        // só custaria requisição (o helper confere a última página de qualquer jeito).
        // Tipo estreito de propósito: com o builder do supabase-js como genérico,
        // o tsc estoura a profundidade de instanciação (TS2589).
        function comFiltros(q: FiltravelPorColuna): FiltravelPorColuna {
            if (organizationId)      q = q.eq('organization_id', organizationId);
            if (filters?.dueFrom)    q = q.gte('due_date', filters.dueFrom);
            if (filters?.dueTo)      q = q.lte('due_date', filters.dueTo);
            // Filtro por OBRA, não pelo projeto cru: um pedido lançado no
            // orçamento da obra X pertence a X, e filtrando por `project_id`
            // ele sumia do recorte da própria obra. `obra_id` já vem resolvido
            // de vw_project_obra (CLAUDE.md regra #3 na leitura).
            if (filters?.projectId)  q = q.eq('obra_id', filters.projectId);
            if (filters?.sourceSystem) q = q.eq('source_system', filters.sourceSystem);
            return q;
        }

        const { data: todas, error } = await fetchAllPagesParallel<Payable>(
            () => comFiltros(supabase
                .from('vw_payables')
                .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,direction,description,category,status,business_status,effective_status,party_id,party_name,party_type,entity_name,supplier_id,project_id,project_name,obra_id,obra_name,cost_center_id,plano_de_contas_id,documento_path,documento_nome,darf_id,payment_date,payment_type,approval_status,approval_required_levels,approval_chain,created_at,updated_at')
                .order('due_date', { ascending: true, nullsFirst: false })
                .order('id', { ascending: true }) as unknown as FiltravelPorColuna) as unknown as RangeableQuery<Payable>,
            () => comFiltros(supabase
                .from('vw_payables')
                .select('id', { count: 'exact', head: true }) as unknown as FiltravelPorColuna) as unknown as PromiseLike<{ count: number | null; error: unknown }>,
            PAGE_SIZE,
        );
        if (error) throw error;

        let rows = todas;

        if (filters?.status && filters.status !== 'all') {
            rows = rows.filter(r => r.effective_status === filters.status);
        }

        if (filters?.search) {
            const termo = filters.search.toLowerCase();
            rows = rows.filter(r =>
                payableParty(r).toLowerCase().includes(termo) ||
                (r.description ?? '').toLowerCase().includes(termo) ||
                // Busca por obra: procura nos DOIS — quem digita "Garden Cambuhy"
                // (a obra) e quem digita "Garden" (o orçamento que aparece no
                // hover) tem de achar a mesma linha.
                (r.obra_name ?? '').toLowerCase().includes(termo) ||
                (r.project_name ?? '').toLowerCase().includes(termo) ||
                (r.reference_id ?? '').toLowerCase().includes(termo),
            );
        }

        return rows;
    },

    async updateStatus(id: string, newStatus: PayableBusinessStatus): Promise<void> {
        // Baixa manual não passa por cima da alçada pendente (item H.1 do plano 2026-10-16).
        if (newStatus === 'PAGO') await exigirAlcadaLiberada(id);
        const updates: Record<string, unknown> = {
            business_status: newStatus,
            updated_at: new Date().toISOString(),
        };
        if (newStatus === 'PAGO')           updates.status = 'CONCILIATED';
        else if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';
        else if (newStatus !== 'PARCIAL' && newStatus !== 'RENEGOCIADO') {
            /* Volta para um estado ABERTO (Previsto/Aprovado) precisa desfazer a
               baixa também em `status` e `payment_date` — senão sobra o estado
               contraditório `status='CONCILIATED'` + `business_status='PREVISTO'`.
               Isso passou despercebido enquanto `effective_status` derivava só de
               `business_status`; desde 20270909000000 a view também lê `status`,
               e o título ficava preso em Pago mesmo depois de desmarcado.
               `PARCIAL`/`RENEGOCIADO` ficam de fora de propósito: a view os
               respeita explicitamente e eles guardam um pagamento parcial real.
               Espelha o que `handleUndoMatch` (BankReconciliation) já fazia certo. */
            updates.status = 'PENDING';
            updates.payment_date = null;
        }

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;

        // Costura P2P (Passo 3 do plano 2026-09-28): baixa MANUAL de título de
        // pedido. A baixa por conciliação bancária dispara o mesmo evento em
        // `bankReconciliationService.createMatch`. O resolvedor só segue se o
        // título é DEBIT com purchase_order_id. Best-effort.
        if (newStatus === 'PAGO') {
            try {
                await processService.triggerForTransaction(id, 'internal_transaction.paid');
            } catch (e) {
                console.error('[payableService] process trigger (paid) failed:', e);
            }
            // Costura Financeiro (16/10/2026): o mesmo título, de QUALQUER origem.
            await processService.triggerForFinancialTitle(id, 'payable.settled');
        }
    },

    /**
     * Baixa com os dados do painel (espelho de `receivableService.darBaixa`).
     * `payment_date` vai explícito: a trigger `trg_payment_date_na_baixa` só
     * preenche quando chega vazio, então a data escolhida no painel prevalece
     * sobre o "hoje" dela. A forma de pagamento sai no recibo.
     */
    async darBaixa(
        id: string,
        pagamento: { paymentDate: string; paymentType: PayablePaymentType | null; valorPago?: number | null },
    ): Promise<void> {
        // Baixa manual não passa por cima da alçada pendente (item H.1 do plano 2026-10-16).
        await exigirAlcadaLiberada(id);
        const { error } = await supabase
            .from('internal_transactions')
            .update({
                business_status: 'PAGO',
                status: 'CONCILIATED',
                payment_date: pagamento.paymentDate,
                payment_type: pagamento.paymentType,
                // Parcela de contrato VARIÁVEL: o valor pago passa a ser o valor da parcela
                // (o painel só manda quando o título é variável e o valor mudou).
                ...(pagamento.valorPago ? { amount: pagamento.valorPago } : {}),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        if (error) throw error;

        // Mesma costura P2P do `updateStatus('PAGO')` — esta função nasceu em
        // main (1d16990f) em paralelo ao Passo 3 e grava PAGO sem passar por lá;
        // sem esta linha a baixa pelo painel ficava invisível para Processos.
        try {
            await processService.triggerForTransaction(id, 'internal_transaction.paid');
        } catch (e) {
            console.error('[payableService] process trigger (paid, darBaixa) failed:', e);
        }
        await processService.triggerForFinancialTitle(id, 'payable.settled');
    },

    async create(
        organizationId: string,
        data: {
            due_date: string;
            amount: number;
            description: string;
            party_name?: string;
            project_id?: string;
            category?: string;
            /** Imóvel ao qual a despesa pertence (Fase 2 — OPEX por imóvel). */
            property_id?: string | null;
            /** DIRECT = fica no imóvel; PRORATED = rateia entre as unidades filhas. */
            property_allocation_mode?: 'DIRECT' | 'PRORATED';
        },
    ): Promise<Payable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   'MANUAL',
                direction:       'DEBIT',
                transaction_date: data.due_date,
                due_date:        data.due_date,
                amount:          data.amount,
                description:     data.description,
                // party_id fica de fora: FK só para `clients`, e aqui a
                // contraparte é fornecedor (internal_txs_party_id_fkey).
                party_name:      data.party_name ?? null,
                entity_name:     data.party_name ?? null,
                party_type:      'SUPPLIER',
                project_id:      data.project_id ?? null,
                category:        data.category ?? null,
                property_id:     data.property_id ?? null,
                property_allocation_mode: data.property_allocation_mode ?? 'DIRECT',
                status:          'PENDING',
                business_status: 'PREVISTO',
            })
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,party_id,party_name,party_type,entity_name,project_id,created_at,updated_at')
            .single();
        if (error) throw error;

        // Materializa a apropriação por imóvel. Depois do insert, e não numa
        // transação com ele, porque o PostgREST não expõe transação multi-passo:
        // se esta parte falhar, o lançamento existe sem apropriação — estado
        // recuperável (reabrir e salvar de novo), ao contrário do inverso, que
        // seria apropriação órfã de lançamento.
        if (data.property_id) {
            try {
                const mode = data.property_allocation_mode ?? 'DIRECT';
                const preview = await propertyExpenseService.previewAllocation(
                    data.property_id, data.amount, mode,
                );
                await propertyExpenseService.saveAllocation(
                    row.id as string, data.amount, mode, preview.allocations,
                );
            } catch (allocError) {
                // Não derruba a criação da conta a pagar: o lançamento é o dado
                // principal, a apropriação é dimensão analítica. Mas precisa
                // aparecer, senão o NOI fica com buraco silencioso.
                console.error(
                    '[Payable] Conta criada, mas a apropriação por imóvel falhou. ' +
                    'O NOI não contará esta despesa até ser reaplicada:', allocError,
                );
            }
        }

        return { ...row, direction: 'DEBIT', effective_status: 'PREVISTO' } as Payable;
    },

    /**
     * Pagamento avulso (Contas a Pagar › "Novo pagamento avulso"). Plano
     * docs/planos/2026-10-17-contas-a-pagar-pagamento-avulso.md.
     *
     * 1. sobe o anexo (se houver) — antes das linhas, para todas nascerem com ele;
     * 2. insere as N parcelas num INSERT só (tudo ou nada);
     * 3. submete cada título em aberto à alçada (desde 26/10/2026 o gatilho
     *    `fn_titulo_nasce_na_alcada` já o grava PENDENTE; o submit não repete);
     * 4. "Já pago" (26/10/2026, S5 do plano 2026-10-26-todo-titulo-a-pagar-passa-
     *    pela-aprovacao): o título NASCE pago (`montarTitulosAvulsos`) — baixar
     *    depois do INSERT seria recusado pela alçada. Fica só a costura de
     *    Processos que o `darBaixa` faria. Até 26/10 a baixa vinha depois, e a
     *    recusa voltava em `avisoBaixa` (que segue no retorno, sempre null aqui).
     */
    async createAvulso(organizationId: string, form: FormPagamentoAvulso, arquivo?: File | null): Promise<ResultadoAvulso> {
        const grupoId = crypto.randomUUID();
        const linhas = montarTitulosAvulsos(form, grupoId);
        if (linhas.length === 0) throw new Error('Informe valor e vencimento.');

        // O nome da Conta Financeira vem do banco, não do que a tela mostrou.
        const categoria = await resolverCategoriaPorId(form.categoryId);

        let documentoPath: string | null = null;
        if (arquivo) {
            documentoPath = caminhoDoAnexo(organizationId, grupoId, arquivo.name);
            await storageService.uploadFile(BUCKET_ANEXOS_AVULSO, documentoPath, arquivo);
        }

        const createdBy = await usuarioAtualId();
        const { data, error } = await supabase
            .from('internal_transactions')
            .insert(linhas.map(l => ({
                ...l,
                organization_id: organizationId,
                category_id: categoria?.category_id ?? null,
                category: categoria?.category ?? null,
                documento_path: documentoPath,
                documento_nome: arquivo ? arquivo.name : null,
                created_by: createdBy,
            })))
            .select('id, due_date')
            .order('due_date', { ascending: true });
        if (error) {
            // Nenhum título nasceu: o arquivo enviado ficaria órfão.
            if (documentoPath) await storageService.remove(BUCKET_ANEXOS_AVULSO, [documentoPath]).catch(() => undefined);
            // As travas de período (mês fechado, competência do CC fechada) chegam
            // aqui com a frase do banco — é ela que diz ao usuário o que fazer.
            throw new Error(error.message);
        }
        const ids = ((data ?? []) as { id: string }[]).map(r => r.id);
        const nasceuPago = linhas.length === 1 && linhas[0].status === 'CONCILIATED';

        // Título pago não vai à alçada: não há pagamento a aprovar.
        for (const id of nasceuPago ? [] : ids) {
            try {
                await financialApprovalService.submitForApproval(id, organizationId);
            } catch (e) {
                // Mesma escolha do boleto: o título existe e pode ser submetido pela
                // tela de Aprovações; perder o lançamento seria pior.
                console.error('[payableService] submeter avulso à alçada:', e);
            }
        }

        const avisoBaixa: string | null = null;
        if (nasceuPago) {
            // Mesma costura P2P do `darBaixa`, que o título pago na criação não passa.
            try {
                await processService.triggerForTransaction(ids[0], 'internal_transaction.paid');
            } catch (e) {
                console.error('[payableService] process trigger (paid, avulso já pago) failed:', e);
            }
            try {
                await processService.triggerForFinancialTitle(ids[0], 'payable.settled');
            } catch (e) {
                console.error('[payableService] process trigger (settled, avulso já pago) failed:', e);
            }
        }
        return { ids, avisoBaixa };
    },

    /** Lê o título avulso inteiro para o formulário de edição. */
    async getAvulso(id: string): Promise<PagamentoAvulsoGravado> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('id, organization_id, reference_id, description, amount, due_date, competencia_date, supplier_id, party_name, project_id, cost_center_id, plano_de_contas_id, category_id, category, payment_type, payment_account_id, status, business_status, approval_status, documento_path, documento_nome')
            .eq('id', id)
            .eq('source_system', 'MANUAL')
            .single();
        if (error) throw new Error(error.message);
        return data as PagamentoAvulsoGravado;
    },

    /**
     * Edita UM título avulso (as parcelas são títulos independentes depois de
     * criadas). Não mexe em `reference_id`, tipo da parcela nem situação — a
     * baixa e o estorno continuam sendo ações da linha.
     *
     * Valor mudou num título em aberto → volta para a alçada: aprovação dada
     * para R$ 1.000 não vale para R$ 10.000.
     */
    async updateAvulso(
        atual: PagamentoAvulsoGravado,
        form: FormPagamentoAvulso,
        anexo: { novo?: File | null; remover?: boolean } = {},
    ): Promise<void> {
        const [l] = montarTitulosAvulsos({ ...form, parcelas: 1, jaPago: false }, 'edicao');
        if (!l) throw new Error('Informe valor e vencimento.');
        // Título sendo pago pela Asaas não muda valor nem credor no meio do caminho
        // (o PIX já saiu com o valor e a chave de antes). Mesmos estados da trava de
        // exclusão no banco (aplicar_20271018420000).
        const { data: emCurso } = await supabase.from('supplier_payments').select('status')
            .eq('transaction_id', atual.id).in('status', STATUS_ASAAS_TRAVA_TITULO).limit(1);
        if (emCurso && emCurso.length > 0) {
            throw new Error(emCurso[0].status === 'DONE'
                ? 'Este título foi pago pela Asaas e não pode ser editado.'
                : 'Este título tem pagamento pela Asaas em andamento. Cancele o pagamento antes de editar.');
        }
        const categoria = await resolverCategoriaPorId(form.categoryId);

        const updates: Record<string, unknown> = {
            transaction_date: l.transaction_date,
            due_date: l.due_date,
            competencia_date: l.competencia_date,
            amount: l.amount,
            description: l.description,
            supplier_id: l.supplier_id,
            party_name: l.party_name,
            entity_name: l.entity_name,
            project_id: l.project_id,
            cost_center_id: l.cost_center_id,
            plano_de_contas_id: l.plano_de_contas_id,
            category_id: categoria?.category_id ?? null,
            category: categoria?.category ?? null,
            payment_type: l.payment_type,
            payment_account_id: l.payment_account_id,
            updated_at: new Date().toISOString(),
        };

        const valorMudou = Math.abs(Number(atual.amount) - l.amount) >= 0.005;
        const emAberto = atual.status !== 'CONCILIATED';
        if (valorMudou && emAberto) {
            updates.approval_status = 'RASCUNHO';
            updates.approval_chain = [];
            if (atual.business_status === 'AGUARDANDO_APROVACAO' || atual.business_status === 'APROVADO') {
                updates.business_status = 'PREVISTO';
            }
        }

        let novoPath: string | null = null;
        if (anexo.novo) {
            const grupo = grupoDaReferencia(atual.reference_id) ?? crypto.randomUUID();
            novoPath = caminhoDoAnexo(atual.organization_id, grupo, `${Date.now()}-${anexo.novo.name}`);
            await storageService.uploadFile(BUCKET_ANEXOS_AVULSO, novoPath, anexo.novo);
            updates.documento_path = novoPath;
            updates.documento_nome = anexo.novo.name;
        } else if (anexo.remover) {
            updates.documento_path = null;
            updates.documento_nome = null;
        }

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', atual.id)
            .eq('source_system', 'MANUAL');
        if (error) {
            if (novoPath) await storageService.remove(BUCKET_ANEXOS_AVULSO, [novoPath]).catch(() => undefined);
            throw new Error(error.message);
        }

        if ((anexo.novo || anexo.remover) && atual.documento_path) {
            await removerAnexoSeOrfao(atual.documento_path);
        }
        if (valorMudou && emAberto) {
            try {
                await financialApprovalService.submitForApproval(atual.id, atual.organization_id);
            } catch (e) {
                console.error('[payableService] resubmeter avulso à alçada:', e);
            }
        }
    },

    /** URL assinada do anexo do avulso — gerada no CLIQUE (15 min), nunca ao carregar a lista. */
    async urlDoAnexo(path: string): Promise<string> {
        return storageService.createSignedUrl(BUCKET_ANEXOS_AVULSO, path, 15 * 60);
    },

    /** Corrige dados de negócio do título (valor, vencimento, descrição, contraparte). */
    async update(
        id: string,
        data: {
            amount?: number; due_date?: string; description?: string;
            party_name?: string | null; category?: string | null;
        },
    ): Promise<void> {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.amount      !== undefined) updates.amount = data.amount;
        if (data.due_date    !== undefined) {
            updates.due_date = data.due_date;
            // transaction_date espelha o vencimento em lançamento manual (é como
            // o create grava) — sem isso a linha reordena/soma errado após editar.
            updates.transaction_date = data.due_date;
        }
        if (data.description !== undefined) updates.description = data.description;
        if (data.party_name  !== undefined) {
            updates.party_name = data.party_name;
            updates.entity_name = data.party_name;
        }
        if (data.category    !== undefined) updates.category = data.category;

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Exclui um título **manual**.
     * O `.eq('source_system','MANUAL')` é trava de segurança, não filtro de
     * conveniência: parcela vinda de Pedido ou Contrato é espelho da origem —
     * apagada aqui, voltaria no próximo sync e, pior, sumiria do lugar onde de
     * fato é gerenciada.
     */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('id', id)
            .eq('source_system', 'MANUAL')
            .select('id, documento_path');

        if (error) {
            // reconciliation_matches tem FK RESTRICT: título casado com uma linha
            // do extrato não pode sumir sem desfazer a conciliação antes.
            if (error.code === '23503') {
                throw new Error('Este título está conciliado com o extrato bancário. Desfaça a conciliação antes de excluir.');
            }
            // Trava do banco: pagamento pela Asaas em andamento ou concluído (aplicar_20271018420000).
            if (error.code === 'P0001') throw new Error(error.message);
            throw error;
        }
        if (!data || data.length === 0) {
            throw new Error('Só lançamentos manuais podem ser excluídos aqui. Este veio de Pedidos ou Contratos — exclua na origem.');
        }
        // O anexo é compartilhado pelas parcelas: só some com a última que apontava para ele.
        await removerAnexoSeOrfao((data[0] as { documento_path?: string | null }).documento_path);
    },
};
