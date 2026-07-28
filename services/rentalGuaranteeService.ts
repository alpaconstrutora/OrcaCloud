import { supabase } from '../lib/supabase';
import {
    Contract,
    ContractGuarantee,
    ContractGuarantor,
    GuaranteeDocument,
    GuaranteeDepositEvent,
    GuaranteeDepositEventType,
    RentalGuaranteeAlert,
    RentalGuaranteeKind,
} from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Garantias Locatícias — Fase 1
 * ─────────────────────────────────────────────────────────────────────────────
 * Fica separado de `contractGuaranteeService` (que continua servindo as apólices
 * de OBRA) porque as regras aqui são de outro domínio: rol taxativo do art. 37,
 * teto de 3 aluguéis do art. 38, vedação de cumulação do art. 43, outorga
 * conjugal do CC 1.647 e o ciclo de passivo da caução em dinheiro.
 *
 * O corte entre os dois é a coluna `scope` da mesma tabela — não há duas
 * tabelas de garantia, de propósito (ver cabeçalho da migration 20270836000000).
 */

// Colunas explícitas em vez de select('*') — feedback_select_narrowing.
const GUARANTEE_COLS =
    'id, organization_id, contract_id, kind, insurer, policy_number, coverage_limit, ' +
    'premium, valid_from, valid_until, document_url, status, notes, scope, product_name, ' +
    'caucao_type, guaranteed_value, rent_months_equivalent, cost_bearer, scope_notes, ' +
    'version, supersedes_id, substitution_reason, is_active, registry_office, ' +
    'registry_protocol, registered_at, deposit_bank, deposit_agency, deposit_account, ' +
    'deposit_account_holder, deposit_date, requires_reanalysis, created_at, updated_at';

const GUARANTOR_COLS =
    'id, organization_id, guarantee_id, person_type, name, document, email, phone, address, ' +
    'marital_status, marital_regime, spouse_name, spouse_document, spouse_consent, ' +
    'monthly_income, net_worth, income_commitment_pct, properties_offered, analysis_result, ' +
    'analysis_notes, documents_valid_until, signed, asset_description, asset_value, ' +
    'asset_valuation_date, asset_registration, asset_encumbrances, notes, created_at';

const DOCUMENT_COLS =
    'id, organization_id, guarantee_id, guarantor_id, label, is_required, received, ' +
    'received_at, valid_until, file_url, notes, created_at';

const DEPOSIT_COLS =
    'id, organization_id, guarantee_id, event_type, event_date, amount, description, ' +
    'document_url, created_at';

// ─── Rótulos (compartilhados entre painel, alertas e futuros relatórios) ──────

export const RENTAL_KIND_LABELS: Record<RentalGuaranteeKind, string> = {
    SEM_GARANTIA: 'Sem garantia',
    CAUCAO: 'Caução',
    FIANCA: 'Fiança',
    SEGURO_FIANCA: 'Seguro-fiança locatícia',
    CESSAO_FIDUCIARIA: 'Cessão fiduciária de quotas',
};

export const GUARANTEE_STATUS_LABELS: Record<string, string> = {
    EM_ANALISE: 'Em análise',
    PENDENTE_DOCUMENTOS: 'Pendente de documentos',
    PENDENTE_ASSINATURA: 'Pendente de assinatura',
    PENDENTE_REGISTRO: 'Pendente de registro',
    VIGENTE: 'Vigente',
    EM_RENOVACAO: 'Em renovação',
    INSUFICIENTE: 'Insuficiente',
    VENCIDA: 'Vencida',
    CANCELADA: 'Cancelada',
    SUBSTITUIDA: 'Substituída',
    LIBERADA: 'Liberada',
    DEVOLVIDA: 'Devolvida',
};

export const DEPOSIT_EVENT_LABELS: Record<GuaranteeDepositEventType, string> = {
    DEPOSITO: 'Depósito',
    RENDIMENTO: 'Rendimento',
    DEDUCAO: 'Dedução / compensação',
    DEVOLUCAO: 'Devolução ao locatário',
};

/** Eventos que somam ao saldo devido ao locatário; os demais subtraem. */
const POSITIVE_EVENTS: GuaranteeDepositEventType[] = ['DEPOSITO', 'RENDIMENTO'];

// ─── Validação legal ─────────────────────────────────────────────────────────

export interface LegalCheck {
    /** Impede a gravação. */
    blocking: string[];
    /** Só alerta — a decisão final é do locador. */
    warnings: string[];
}

/**
 * Regras da Lei do Inquilinato conferidas antes de gravar.
 *
 * O que BLOQUEIA é só o que a lei veda de forma objetiva (teto da caução em
 * dinheiro). O resto alerta: a outorga conjugal depende do regime de bens, e a
 * suficiência da cobertura é política do locador, não exigência legal.
 */
export function checkLegalRules(
    guarantee: Partial<ContractGuarantee>,
    monthlyRent: number,
    guarantors: Partial<ContractGuarantor>[] = [],
): LegalCheck {
    const blocking: string[] = [];
    const warnings: string[] = [];

    // Art. 38: caução em dinheiro não pode exceder 3 meses de aluguel.
    if (guarantee.kind === 'CAUCAO' && guarantee.caucao_type === 'DINHEIRO') {
        const valor = guarantee.guaranteed_value ?? 0;
        if (monthlyRent > 0 && valor > monthlyRent * 3 + 0.005) {
            blocking.push(
                `Caução em dinheiro limitada a 3 aluguéis (art. 38 da Lei 8.245/91). ` +
                `Máximo para este contrato: ${formatBRL(monthlyRent * 3)} — informado: ${formatBRL(valor)}.`,
            );
        }
        if (!guarantee.deposit_bank || !guarantee.deposit_account) {
            warnings.push(
                'Art. 38 §2º: a caução em dinheiro deve ser depositada em caderneta de poupança, ' +
                'com os rendimentos revertidos ao locatário. Informe banco e conta do depósito.',
            );
        }
    }

    // CC 1.647-1.649: fiança de pessoa casada exige outorga, salvo separação absoluta.
    if (guarantee.kind === 'FIANCA') {
        guarantors
            .filter(g => g.person_type !== 'PJ')
            .filter(g => !g.spouse_consent)
            .filter(g => !/solteir/i.test(g.marital_status || ''))
            .filter(g => !/separa[çc][ãa]o absoluta/i.test(g.marital_regime || ''))
            .forEach(g => warnings.push(
                `Fiador ${g.name || 'sem nome'}: sem consentimento do cônjuge registrado. ` +
                'Salvo no regime de separação absoluta, a fiança exige outorga conjugal (CC art. 1.647).',
            ));
        if (guarantors.length === 0) {
            warnings.push('Modalidade fiança sem nenhum fiador cadastrado.');
        }
    }

    // Vigência da garantia menor que a do contrato (§5.4 da especificação).
    if (guarantee.kind === 'SEGURO_FIANCA' && !guarantee.policy_number) {
        warnings.push('Seguro-fiança sem número de apólice informado.');
    }

    return { blocking, warnings };
}

const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// ─── Índice de cobertura (§6 — versão determinística da Fase 1) ──────────────

export interface CoverageIndex {
    /** valor garantido ÷ exposição estimada. */
    ratio: number;
    exposure: number;
    guaranteed: number;
    band: 'CRITICA' | 'INSUFICIENTE' | 'ADEQUADA' | 'CONFORTAVEL';
    label: string;
}

/**
 * Índice de cobertura = valor garantido ÷ exposição estimada.
 *
 * A exposição da Fase 1 é deliberadamente simples e explicável: aluguel × meses
 * médios de retomada + multa rescisória. Encargos, danos e custas entram na
 * Etapa 2, quando houver de onde puxá-los (vistoria e cobrança). Preferi um
 * número que o usuário consegue conferir de cabeça a um que ele não consegue
 * auditar.
 */
export function computeCoverageIndex(
    guaranteed: number,
    monthlyRent: number,
    opts: { monthsToRecover?: number; penaltyMonths?: number } = {},
): CoverageIndex {
    const meses = opts.monthsToRecover ?? 6;
    const multa = (opts.penaltyMonths ?? 0) * monthlyRent;
    const exposure = monthlyRent * meses + multa;
    const ratio = exposure > 0 ? guaranteed / exposure : 0;

    const band: CoverageIndex['band'] =
        ratio < 0.8 ? 'CRITICA'
        : ratio < 1.0 ? 'INSUFICIENTE'
        : ratio < 1.2 ? 'ADEQUADA'
        : 'CONFORTAVEL';

    const label = { CRITICA: 'Crítica', INSUFICIENTE: 'Insuficiente', ADEQUADA: 'Adequada', CONFORTAVEL: 'Confortável' }[band];
    return { ratio, exposure, guaranteed, band, label };
}

// ─── Serviço ─────────────────────────────────────────────────────────────────

export const rentalGuaranteeService = {
    /**
     * Cadeia completa de garantias do contrato — a ativa primeiro, depois o
     * histórico de versões substituídas.
     *
     * REGRA #5: não recebe organizationId nem bloqueia por ele. O contrato já
     * está aberto na tela e carrega a própria org; a RLS recorta o resto.
     */
    listByContract: async (contractId: string): Promise<ContractGuarantee[]> => {
        const { data, error } = await supabase
            .from('contract_guarantees')
            .select(GUARANTEE_COLS)
            .eq('contract_id', contractId)
            .eq('scope', 'LOCACAO')
            .order('version', { ascending: false });
        if (error) throw error;
        return (data ?? []) as unknown as ContractGuarantee[];
    },

    /** A versão que vale hoje (ou null quando o contrato ainda não tem garantia). */
    getActive: async (contractId: string): Promise<ContractGuarantee | null> => {
        const { data, error } = await supabase
            .from('contract_guarantees')
            .select(GUARANTEE_COLS)
            .eq('contract_id', contractId)
            .eq('scope', 'LOCACAO')
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw error;
        return (data as unknown as ContractGuarantee) ?? null;
    },

    /**
     * Cria a PRIMEIRA garantia do contrato, ou edita a versão ativa.
     *
     * Não é o caminho da substituição — trocar de modalidade tem que passar por
     * `substitute()`, que versiona. Editar aqui é para corrigir dado da mesma
     * garantia (nº da apólice digitado errado, data de vigência).
     */
    save: async (
        payload: Partial<ContractGuarantee> & { organization_id: string; contract_id: string; kind: RentalGuaranteeKind },
    ): Promise<ContractGuarantee> => {
        const { id, ...rest } = payload;
        const body = { ...rest, scope: 'LOCACAO' as const };

        if (id) {
            const { data, error } = await supabase
                .from('contract_guarantees')
                .update(body).eq('id', id).select(GUARANTEE_COLS).single();
            if (error) throw error;
            return data as unknown as ContractGuarantee;
        }

        const { data, error } = await supabase
            .from('contract_guarantees')
            .insert({ ...body, version: 1, is_active: true })
            .select(GUARANTEE_COLS).single();
        if (error) {
            // O índice único parcial é a trava do art. 43. Traduzir aqui, senão
            // o usuário vê "duplicate key value violates unique constraint".
            if (error.code === '23505' && error.message.includes('uq_contract_guarantees_locacao_ativa')) {
                throw new Error(
                    'Este contrato já tem uma garantia ativa. A Lei do Inquilinato (art. 43) veda ' +
                    'mais de uma modalidade de garantia no mesmo contrato — use "Substituir garantia".',
                );
            }
            throw error;
        }
        return data as unknown as ContractGuarantee;
    },

    /**
     * Substituição versionada (§7 da especificação).
     *
     * A anterior é encerrada e a nova nasce apontando para ela. As duas NUNCA
     * ficam ativas ao mesmo tempo — o índice único garante isso mesmo se dois
     * usuários tentarem em paralelo.
     *
     * Ordem: desativa a anterior ANTES de inserir a nova. O inverso bateria no
     * índice único e falharia; assim, se o insert falhar, a correção é reativar
     * a anterior — e é o que o catch faz.
     */
    substitute: async (
        currentId: string,
        next: Partial<ContractGuarantee> & { organization_id: string; contract_id: string; kind: RentalGuaranteeKind },
        reason: string,
    ): Promise<ContractGuarantee> => {
        const current = await rentalGuaranteeService.getById(currentId);
        if (!current) throw new Error('Garantia atual não encontrada.');

        const { error: errClose } = await supabase
            .from('contract_guarantees')
            .update({ is_active: false, status: 'SUBSTITUIDA', requires_reanalysis: false })
            .eq('id', currentId);
        if (errClose) throw errClose;

        try {
            const { id: _ignored, ...rest } = next;
            const { data, error } = await supabase
                .from('contract_guarantees')
                .insert({
                    ...rest,
                    scope: 'LOCACAO',
                    version: (current.version ?? 1) + 1,
                    supersedes_id: currentId,
                    substitution_reason: reason,
                    is_active: true,
                })
                .select(GUARANTEE_COLS).single();
            if (error) throw error;
            return data as unknown as ContractGuarantee;
        } catch (e) {
            // Rollback manual: sem transação no PostgREST, deixar as duas
            // inativas seria pior que o estado anterior (o contrato ficaria
            // "sem garantia" por efeito de um erro).
            await supabase.from('contract_guarantees')
                .update({ is_active: true, status: current.status })
                .eq('id', currentId);
            throw e;
        }
    },

    getById: async (id: string): Promise<ContractGuarantee | null> => {
        const { data, error } = await supabase
            .from('contract_guarantees')
            .select(GUARANTEE_COLS).eq('id', id).maybeSingle();
        if (error) throw error;
        return (data as unknown as ContractGuarantee) ?? null;
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_guarantees').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Garantidores ────────────────────────────────────────────────────────

    listGuarantors: async (guaranteeId: string): Promise<ContractGuarantor[]> => {
        const { data, error } = await supabase
            .from('contract_guarantors')
            .select(GUARANTOR_COLS)
            .eq('guarantee_id', guaranteeId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as unknown as ContractGuarantor[];
    },

    saveGuarantor: async (
        payload: Partial<ContractGuarantor> & { organization_id: string; guarantee_id: string; name: string },
    ): Promise<ContractGuarantor> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_guarantors').update(rest).eq('id', id)
            : supabase.from('contract_guarantors').insert(rest);
        const { data, error } = await query.select(GUARANTOR_COLS).single();
        if (error) throw error;
        return data as unknown as ContractGuarantor;
    },

    removeGuarantor: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_guarantors').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Checklist de documentos ─────────────────────────────────────────────

    listDocuments: async (guaranteeId: string): Promise<GuaranteeDocument[]> => {
        const { data, error } = await supabase
            .from('guarantee_documents')
            .select(DOCUMENT_COLS)
            .eq('guarantee_id', guaranteeId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as unknown as GuaranteeDocument[];
    },

    saveDocument: async (
        payload: Partial<GuaranteeDocument> & { organization_id: string; guarantee_id: string; label: string },
    ): Promise<GuaranteeDocument> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('guarantee_documents').update(rest).eq('id', id)
            : supabase.from('guarantee_documents').insert(rest);
        const { data, error } = await query.select(DOCUMENT_COLS).single();
        if (error) throw error;
        return data as unknown as GuaranteeDocument;
    },

    removeDocument: async (id: string): Promise<void> => {
        const { error } = await supabase.from('guarantee_documents').delete().eq('id', id);
        if (error) throw error;
    },

    /**
     * Checklist sugerido por modalidade. É só um ponto de partida gravado como
     * linhas editáveis — o usuário acrescenta e remove o que quiser. Não é
     * regra de negócio travada em código.
     */
    seedChecklist: async (
        guarantee: ContractGuarantee,
    ): Promise<GuaranteeDocument[]> => {
        const porModalidade: Record<string, string[]> = {
            CAUCAO: ['Comprovante do depósito', 'Extrato da conta poupança vinculada'],
            FIANCA: [
                'RG/CPF do fiador', 'Comprovante de renda do fiador',
                'Comprovante de residência do fiador', 'Certidão de casamento',
                'Matrícula do imóvel oferecido', 'Certidões negativas',
            ],
            SEGURO_FIANCA: ['Apólice', 'Comprovante de pagamento do prêmio', 'Condições gerais'],
            CESSAO_FIDUCIARIA: ['Instrumento de cessão', 'Comprovante de bloqueio das quotas', 'Posição do fundo'],
            SEM_GARANTIA: [],
        };
        const labels = porModalidade[guarantee.kind] ?? [];
        if (labels.length === 0) return [];

        const { data, error } = await supabase
            .from('guarantee_documents')
            .insert(labels.map(label => ({
                organization_id: guarantee.organization_id,
                guarantee_id: guarantee.id,
                label,
                is_required: true,
                received: false,
            })))
            .select(DOCUMENT_COLS);
        if (error) throw error;
        return (data ?? []) as unknown as GuaranteeDocument[];
    },

    // ── Caução em dinheiro: ledger de passivo ───────────────────────────────

    listDepositEvents: async (guaranteeId: string): Promise<GuaranteeDepositEvent[]> => {
        const { data, error } = await supabase
            .from('guarantee_deposit_events')
            .select(DEPOSIT_COLS)
            .eq('guarantee_id', guaranteeId)
            .order('event_date', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as unknown as GuaranteeDepositEvent[];
    },

    /**
     * Lança um movimento no ledger da caução.
     *
     * 🔴 Este lançamento NÃO vai para `internal_transactions`, e isso é
     * deliberado: caução é dinheiro de terceiro com obrigação de devolver, não
     * receita de locação. Se fosse sincronizado, apareceria como recebimento em
     * Contas a Receber e inflaria a receita no DRE e no Scorecard.
     *
     * O sinal é normalizado aqui a partir do tipo — a UI informa sempre um
     * valor positivo, e quem decide se soma ou subtrai é esta função (o banco
     * também trava, como rede de segurança).
     */
    addDepositEvent: async (
        payload: {
            organization_id: string;
            guarantee_id: string;
            event_type: GuaranteeDepositEventType;
            event_date: string;
            /** Sempre positivo — o sinal é derivado do tipo. */
            amount: number;
            description?: string;
            document_url?: string;
        },
    ): Promise<GuaranteeDepositEvent> => {
        const magnitude = Math.abs(payload.amount);
        if (magnitude < 0.005) throw new Error('Informe um valor maior que zero.');

        const signed = POSITIVE_EVENTS.includes(payload.event_type) ? magnitude : -magnitude;

        const { data, error } = await supabase
            .from('guarantee_deposit_events')
            .insert({ ...payload, amount: signed })
            .select(DEPOSIT_COLS).single();
        if (error) throw error;
        return data as unknown as GuaranteeDepositEvent;
    },

    removeDepositEvent: async (id: string): Promise<void> => {
        const { error } = await supabase.from('guarantee_deposit_events').delete().eq('id', id);
        if (error) throw error;
    },

    /** Saldo devido ao locatário = soma assinada dos eventos. */
    depositBalance: (events: GuaranteeDepositEvent[]): number =>
        events.reduce((acc, e) => acc + (e.amount || 0), 0),

    /**
     * Devolução da caução no encerramento.
     *
     * Bloqueia devolver mais do que o saldo — devolver a mais transformaria o
     * passivo em crédito contra o locatário sem nenhum lançamento que explique
     * isso.
     */
    refundDeposit: async (
        guarantee: ContractGuarantee,
        amount: number,
        opts: { date: string; description?: string; documentUrl?: string },
    ): Promise<GuaranteeDepositEvent> => {
        const events = await rentalGuaranteeService.listDepositEvents(guarantee.id);
        const saldo = rentalGuaranteeService.depositBalance(events);
        const valor = Math.abs(amount);
        if (valor > saldo + 0.005) {
            throw new Error(
                `Devolução (${formatBRL(valor)}) maior que o saldo da caução (${formatBRL(saldo)}). ` +
                'Registre primeiro as deduções apuradas na vistoria de saída.',
            );
        }

        const event = await rentalGuaranteeService.addDepositEvent({
            organization_id: guarantee.organization_id,
            guarantee_id: guarantee.id,
            event_type: 'DEVOLUCAO',
            event_date: opts.date,
            amount: valor,
            description: opts.description,
            document_url: opts.documentUrl,
        });

        // Quitou tudo → a garantia sai de cena. Ainda com saldo → devolução
        // parcial, a garantia continua ativa até o acerto final.
        const quitou = saldo - valor <= 0.005;
        await supabase.from('contract_guarantees')
            .update({ status: quitou ? 'DEVOLVIDA' : 'LIBERADA', is_active: !quitou })
            .eq('id', guarantee.id);

        return event;
    },

    // ── Renovação: reanálise explícita (decisão do usuário, 2026-07-28) ──────

    /**
     * Chamado depois de renovar um contrato de locação.
     *
     * A garantia NÃO é copiada para o contrato-filho. Motivo: fiador, apólice e
     * caução foram analisados contra o contrato anterior — valor, prazo e partes
     * mudaram. Herdar silenciosamente produziria um contrato "com garantia" que
     * ninguém conferiu, e no caso do seguro-fiança a apólice do pai sequer cobre
     * o período novo (a continuidade depende de aceitação da seguradora).
     *
     * O que acontece depende da VIA da renovação:
     *
     *  • NOVO_CONTRATO (contrato-filho) — `deactivate: true`. A garantia do pai
     *    é encerrada e marcada com `requires_reanalysis`. O filho nasce sem
     *    garantia e cai no alerta SEM_GARANTIA_ATIVA até alguém cadastrar a dele.
     *
     *  • ADITIVO (mesmo contrato, vigência estendida) — `deactivate: false`.
     *    Desativar aqui deixaria um contrato VIGENTE sem garantia nenhuma no
     *    meio do caminho, o que é pior que a garantia desatualizada. Ela
     *    continua ativa, mas sinalizada: o alerta REANALISE_PENDENTE cobra a
     *    conferência sem descobrir o locador.
     */
    onContractRenewed: async (
        contractId: string,
        opts: { deactivate?: boolean } = {},
    ): Promise<void> => {
        const atual = await rentalGuaranteeService.getActive(contractId);
        if (!atual) return;

        const desativar = opts.deactivate !== false;
        const { error } = await supabase
            .from('contract_guarantees')
            .update({
                ...(desativar ? { is_active: false } : {}),
                requires_reanalysis: true,
                status: atual.status === 'VIGENTE' ? 'EM_RENOVACAO' : atual.status,
            })
            .eq('id', atual.id);
        if (error) throw error;
    },

    /**
     * Reaproveita a garantia do contrato anterior no contrato-filho — mas só
     * como CÓPIA nova, versionada e sob confirmação humana. É o caminho
     * "reanalisei e aprovo": nunca acontece sozinho.
     */
    reanalyzeForRenewal: async (
        previousGuaranteeId: string,
        childContractId: string,
        opts: { validFrom?: string; validUntil?: string; guaranteedValue?: number } = {},
    ): Promise<ContractGuarantee> => {
        const anterior = await rentalGuaranteeService.getById(previousGuaranteeId);
        if (!anterior) throw new Error('Garantia anterior não encontrada.');

        const { data, error } = await supabase
            .from('contract_guarantees')
            .insert({
                organization_id: anterior.organization_id,
                contract_id: childContractId,
                kind: anterior.kind,
                scope: 'LOCACAO',
                insurer: anterior.insurer,
                product_name: anterior.product_name,
                caucao_type: anterior.caucao_type,
                policy_number: anterior.policy_number,
                coverage_limit: anterior.coverage_limit,
                guaranteed_value: opts.guaranteedValue ?? anterior.guaranteed_value,
                cost_bearer: anterior.cost_bearer,
                valid_from: opts.validFrom,
                valid_until: opts.validUntil,
                // Nasce EM_ANALISE, não VIGENTE: reaproveitar o dado não é o
                // mesmo que aprovar a garantia para o período novo.
                status: 'EM_ANALISE',
                version: 1,
                supersedes_id: previousGuaranteeId,
                substitution_reason: 'Reanálise na renovação do contrato',
                is_active: true,
            })
            .select(GUARANTEE_COLS).single();
        if (error) throw error;

        // A anterior deixa de pedir reanálise: já foi feita.
        await supabase.from('contract_guarantees')
            .update({ requires_reanalysis: false }).eq('id', previousGuaranteeId);

        // Garantidores acompanham a cópia — recadastrar fiador na renovação
        // seria retrabalho puro; o que exige revisão é a APROVAÇÃO, não o dado.
        const garantidores = await rentalGuaranteeService.listGuarantors(previousGuaranteeId);
        if (garantidores.length > 0) {
            const novo = data as unknown as ContractGuarantee;
            await supabase.from('contract_guarantors').insert(
                garantidores.map(g => {
                    const { id: _drop, created_at: _c, updated_at: _u, ...rest } = g;
                    return {
                        ...rest,
                        guarantee_id: novo.id,
                        // Análise e assinatura NÃO são herdadas: é o que
                        // "reanálise explícita" significa na prática.
                        analysis_result: 'PENDENTE',
                        signed: false,
                    };
                }),
            );
        }

        return data as unknown as ContractGuarantee;
    },

    // ── Alertas da carteira ─────────────────────────────────────────────────

    /** REGRA #5: `organizationId` nulo varre todas as orgs do usuário. */
    listAlerts: async (organizationId: string | null): Promise<RentalGuaranteeAlert[]> => {
        const { data, error } = await supabase.rpc('fn_rental_guarantee_alerts', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        return (data ?? []) as RentalGuaranteeAlert[];
    },

    /**
     * Espelha o nome do garantidor principal em `contracts.guarantor_name`.
     *
     * ⚠️ `contracts.guarantor_name` é LEGADA/DERIVADA — não editar direto.
     * Continua existindo só porque os marcadores {{...}} dos modelos .docx e o
     * clone de renovação (`contractRenewalService`) a leem. A fonte da verdade é
     * `contract_guarantors` via `contract_guarantees` (scope=LOCACAO).
     *
     * Este aviso mora aqui, e não como COMMENT no banco, porque marcar a coluna
     * exigiria DDL em `contracts` — tabela quente que já deadlockou a migration
     * desta fase (ver aplicar_20270836000000/).
     *
     * Chamar isto a cada gravação impede que as duas fontes divirjam enquanto a
     * coluna não puder ser dropada.
     */
    syncGuarantorNameToContract: async (contractId: string, guaranteeId: string): Promise<void> => {
        const garantidores = await rentalGuaranteeService.listGuarantors(guaranteeId);
        const nome = garantidores.map(g => g.name).filter(Boolean).join(', ') || null;
        await supabase.from('contracts').update({ guarantor_name: nome }).eq('id', contractId);
    },
};

/** Aluguel mensal do contrato — base do teto do art. 38 e do índice de cobertura. */
export function monthlyRentOf(contract: Contract | null | undefined): number {
    if (!contract) return 0;
    return contract.current_value ?? contract.original_value ?? 0;
}
