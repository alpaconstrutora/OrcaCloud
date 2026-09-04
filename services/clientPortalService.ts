import { supabase } from '../lib/supabase';

export interface ClientPortalToken {
    id: string;
    org_id: string;
    client_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

// ── Aba "Condomínio" ────────────────────────────────────────────────────────
// O condômino JÁ é um `client` (`unit_occupancies.client_id` é FK para
// `clients`), então isto não é um portal novo: é o que faltava do prédio dentro
// do portal que a pessoa já tem.

/** Quem mais consta na unidade. Só papel e nome — o portal não expõe documento
 *  nem contato de terceiro. */
export interface PortalOcupante {
    papel: string;
    nome: string;
}

/** Uma linha por UNIDADE, não por ocupação: a mesma pessoa costuma ser
 *  inquilina E responsável financeira da mesma sala. Os papéis vêm somados. */
export interface PortalUnidadeCondominio {
    unitId: string;
    unidade: string;
    torre: string | null;
    pavimento: number | null;
    tipologia: string | null;
    areaPrivativa: number | null;
    fracaoIdeal: number | null;
    fracaoOrigem: string | null;
    papeis: string[];
    condominioId: string;
    condominioCode: string | null;
    condominioNome: string;
    condominioCnpj: string | null;
    ocupacoes: PortalOcupante[];
}

export interface PortalAvisoCondominio {
    id: string;
    titulo: string;
    corpo: string | null;
    categoria: string;
    publicadoEm: string | null;
    condominioNome: string;
    lido: boolean;
}

export interface PortalDocumentoCondominio {
    id: string;
    titulo: string;
    categoria: string;
    /** ⚠️ NULO quando o documento é ARQUIVO ENVIADO (bucket privado), e essa é a
     *  maioria desde 04/09/2026 — só documento cadastrado como link externo tem
     *  endereço aqui. Renderizar `<a href={url}>` direto produz uma âncora SEM
     *  href, que não é link: o clique não faz nada e nada aparece no console.
     *  Foi exatamente esse o defeito. Use `abrirDocumentoCondominio()`. */
    url: string | null;
    descricao: string | null;
    condominioNome: string;
}

export interface PortalCondominio {
    ok: boolean;
    motivo?: string;
    unidades: PortalUnidadeCondominio[];
    avisos: PortalAvisoCondominio[];
    documentos: PortalDocumentoCondominio[];
}

/** Payload vazio — usado quando não há vínculo, e também no erro. A aba precisa
 *  renderizar o estado vazio de propósito, não uma tela quebrada. */
export const CONDOMINIO_VAZIO: PortalCondominio = {
    ok: true, unidades: [], avisos: [], documentos: [],
};

// ── Aba "Dados da Unidade" ──────────────────────────────────────────────────
// A ficha do imóvel que o cliente comprou ou alugou. Fonte primária é
// `commercial_properties` (o imóvel da negociação), NÃO `empreendimento_units`:
// os 9 contratos de locação em produção apontam para imóveis sem unidade de
// empreendimento vinculada. A unidade de empreendimento entra como
// enriquecimento (fração ideal, área real NBR, torre, empreendimento).
// Ver migration 20270918000027.

export interface PortalUnidadeEndereco {
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    /** Endereço em texto livre (cadastro antigo, antes dos campos separados). */
    livre: string | null;
}

/** A negociação que dá ao cliente acesso a esta unidade. Só o que é dele:
 *  comissão de corretor, checklist interno e dados de outro comprador ficam
 *  fora do payload, no banco — não é filtro de tela. */
export interface PortalUnidadeNegociacao {
    id: string;
    tipo: 'SALE' | 'RENTAL' | 'SERVICE' | string;
    status: string;
    data: string | null;
    codigo: string | null;
    contrato: string | null;
    /** Venda: valor desta unidade no contrato. */
    valorUnidade: number | null;
    /** Locação: valor MENSAL (`installment_value`), já rateado em contrato
     *  multi-unidade. Nunca o total do contrato — grandezas diferentes por um
     *  fator de `installments`. */
    aluguelMensal: number | null;
    vigenciaFim: string | null;
    periodicidade: string | null;
    indiceReajuste: string | null;
}

export interface PortalUnidadeNegociada {
    propertyId: string;
    nome: string;
    tipoImovel: string | null;
    finalidade: string | null;
    empreendimento: string | null;
    torre: string | null;
    unidade: string;
    /** `0` é TÉRREO, não vazio. */
    pavimento: number | null;
    pavimentoTipo: string | null;
    tipologia: string | null;
    posicao: string | null;
    vista: string | null;
    orientacaoSolar: string | null;
    areaPrivativa: number | null;
    areaComum: number | null;
    areaTotal: number | null;
    /** Área real total NBR 12721, quando a unidade passou pelo motor de áreas. */
    areaRealNbr: number | null;
    /** Decimal (0,0833), não porcentagem — ver `fracaoParaPercentual`. */
    fracaoIdeal: number | null;
    fracaoMilesimos: number | null;
    fracaoFonte: string | null;
    dormitorios: number | null;
    suites: number | null;
    banheiros: number | null;
    vagas: number | null;
    caracteristicas: string[];
    endereco: PortalUnidadeEndereco;
    matricula: string | null;
    cartorio: string | null;
    inscricaoIptu: string | null;
    negociacao: PortalUnidadeNegociacao;
}

export interface PortalUnidades {
    ok: boolean;
    motivo?: string;
    unidades: PortalUnidadeNegociada[];
}

/** Payload vazio — usado quando não há vínculo, e também no erro. A aba precisa
 *  renderizar o estado vazio de propósito, não uma tela quebrada. */
export const UNIDADES_VAZIO: PortalUnidades = { ok: true, unidades: [] };

export interface ClientPortalValidation {
    valid: boolean;
    client_id?: string;
    org_id?: string;
    name?: string;
    email?: string;
    error?: string;
}

export interface PortalPlanningItem {
    id: string;
    startDate?: string;
    endDate?: string;
    duration?: number;
    manualRealPct?: number;
    plannedValue?: number;
    actualValue?: number;
    budgetedValue?: number;
}

export interface PortalPlanningOutlineNode {
    id: string;
    type: 'group' | 'phase' | 'subphase' | 'item' | 'activity';
    name: string;
    budgetItemId?: string;
    children?: PortalPlanningOutlineNode[];
}

export interface PortalPlanningBudgetItem {
    id: string;
    group: string;
    phase: string;
}

export interface PortalPlanning {
    name?: string;
    progress?: number;
    phase?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    outline?: PortalPlanningOutlineNode[] | null;
    itemSchedules?: PortalPlanningItem[];
    budget?: PortalPlanningBudgetItem[];
    financialEnabled?: boolean;
}

export interface PortalGedDocument {
    id: string;
    nome: string;
    descricao?: string;
    categoria: string;
    tipo_documento: string;
    data_validade?: string;
    storage_path?: string;
    mime_type?: string;
    tamanho?: number;
    version_number?: number;
    shared_at: string;
}

export const clientPortalService = {
    async generateToken(clientId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('client_portal_generate_token', {
            p_client_id: clientId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    async validateToken(token: string): Promise<ClientPortalValidation> {
        const { data, error } = await supabase.rpc('client_portal_validate_token', { p_token: token });
        if (error) throw error;
        return data as ClientPortalValidation;
    },

    async getPortalData(token: string): Promise<{ valid: boolean; client?: any; project?: any; portal_tabs?: string[] | null; error?: string }> {
        const { data, error } = await supabase.rpc('client_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; client?: any; project?: any; portal_tabs?: string[] | null; error?: string };
    },

    async getContractsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_contracts', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; data: any[] | null };
        return res.valid ? (res.data ?? []) : [];
    },

    // Aba "Documentos" — GED (opura_documents) compartilhados com o cliente do token,
    // ver migration 20270821000008/9 e o botão "Compartilhar" do módulo Gestão de Documentos.
    async getGedDocumentsByToken(token: string): Promise<PortalGedDocument[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_ged_documents', { p_token: token });
        if (error) { console.error('[clientPortalService] getGedDocumentsByToken:', error); return []; }
        const res = data as { valid: boolean; data: PortalGedDocument[] | null };
        return res?.valid ? (res.data ?? []) : [];
    },

    // Link assinado para baixar um documento do GED compartilhado — via Edge Function
    // (service_role), porque o bucket 'opura-docs' é privado e o portal é anon.
    async getGedDownloadUrl(token: string, storagePath: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('portal-ged-download', {
            body: { token, storagePath },
        });
        if (error) throw error;
        if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de download.');
        return data.signedUrl as string;
    },

    // Portal por token (anon): lê o realizado das POs de um projeto via RPC
    // SECURITY DEFINER, já que purchase_orders passou a ter RLS. Retorna só
    // { status, items } — o único dado que o cálculo de progresso financeiro
    // do portal consome (calculateRealizedFinancialProgress).
    async getOrdersByToken(token: string, projectId: string): Promise<{ status: string; items: any[] }[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_orders', { p_token: token, p_project_id: projectId });
        if (error) { console.error('[clientPortalService] getOrdersByToken:', error); return []; }
        const res = data as { valid: boolean; data: { status: string; items: any[] }[] | null };
        return res?.valid ? (res.data ?? []) : [];
    },

    // ── Condomínio ──────────────────────────────────────────────────────────
    // DUAS funções, e não uma com fallback pela RLS. `unit_occupancies` tem RLS
    // `is_org_member`, e o cliente logado NÃO é membro da organização: pela via
    // normal ele receberia zero linhas sem erro nenhum, e a aba diria "você não
    // tem unidades" a um condômino de verdade. Por isso os dois caminhos passam
    // por RPC SECURITY DEFINER, cada uma com sua autorização.

    /** Link público (`/portal-cliente?token=`). */
    async getCondominioByToken(token: string): Promise<PortalCondominio> {
        const { data, error } = await supabase.rpc('client_portal_get_condominio', { p_token: token });
        if (error) { console.error('[clientPortalService] getCondominioByToken:', error); return CONDOMINIO_VAZIO; }
        const res = data as PortalCondominio;
        return res?.ok ? res : CONDOMINIO_VAZIO;
    },

    /** Cliente logado, e admin abrindo o portal por dentro. */
    async getCondominioForClient(clientId: string): Promise<PortalCondominio> {
        const { data, error } = await supabase.rpc('client_portal_get_condominio_for_client', { p_client_id: clientId });
        if (error) { console.error('[clientPortalService] getCondominioForClient:', error); return CONDOMINIO_VAZIO; }
        const res = data as PortalCondominio;
        return res?.ok ? res : CONDOMINIO_VAZIO;
    },

    /**
     * Endereço para abrir um documento do condomínio — assinado na hora quando o
     * arquivo é nosso, o link cru quando é externo.
     *
     * Passa por Edge Function pelo mesmo motivo de `getGedDownloadUrl`: o bucket
     * `condominio-documentos` é privado e a policy exige `authenticated` +
     * `is_org_member` — que nem o link público nem o cliente logado têm (cliente
     * não é membro da organização). A function não reescreve a regra de quem vê
     * o quê: ela chama a MESMA RPC que esta aba chama, com a credencial do
     * chamador, e só assina se o documento estiver na lista que voltou.
     *
     * Aceita as duas identidades do portal — `token` (link público) ou
     * `clientId` (cliente logado / admin espiando) — na mesma ordem de
     * precedência do resto da tela.
     *
     * Nunca guarde o retorno: URL assinada expira em 15 min.
     */
    async abrirDocumentoCondominio(
        params: { token?: string; clientId?: string; documentoId: string },
    ): Promise<string> {
        const { data, error } = await supabase.functions.invoke('client-portal-condominio-download', {
            body: params,
        });
        if (error) throw error;
        if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir o documento.');
        return data.url as string;
    },

    /** Só existe pelo token: marcar lido é ato do morador, não do admin olhando.
     *  Silencioso de propósito — falhar aqui não pode atrapalhar a leitura. */
    async marcarAvisoLido(token: string, avisoId: string): Promise<boolean> {
        const { data, error } = await supabase.rpc('client_portal_marcar_aviso_lido', {
            p_token: token, p_aviso_id: avisoId,
        });
        if (error) { console.error('[clientPortalService] marcarAvisoLido:', error); return false; }
        return !!(data as { ok?: boolean })?.ok;
    },

    // ── Dados da Unidade ────────────────────────────────────────────────────
    // DUAS funções pela mesma razão do Condomínio: `commercial_deals` e
    // `commercial_properties` têm RLS `is_org_member`, e o cliente logado não é
    // membro da organização. Pela via normal ele receberia zero linhas SEM ERRO
    // e a aba diria "nenhuma unidade" a quem tem três.

    /** Link público (`/portal-cliente?token=`). */
    async getUnidadesByToken(token: string): Promise<PortalUnidades> {
        const { data, error } = await supabase.rpc('client_portal_get_unidade', { p_token: token });
        if (error) { console.error('[clientPortalService] getUnidadesByToken:', error); return UNIDADES_VAZIO; }
        const res = data as PortalUnidades;
        return res?.ok ? res : UNIDADES_VAZIO;
    },

    /** Cliente logado, e admin abrindo o portal por dentro. */
    async getUnidadesForClient(clientId: string): Promise<PortalUnidades> {
        const { data, error } = await supabase.rpc('client_portal_get_unidade_for_client', { p_client_id: clientId });
        if (error) { console.error('[clientPortalService] getUnidadesForClient:', error); return UNIDADES_VAZIO; }
        const res = data as PortalUnidades;
        return res?.ok ? res : UNIDADES_VAZIO;
    },

    async getPlanningByToken(token: string): Promise<PortalPlanning | null> {
        const { data, error } = await supabase.rpc('fn_portal_get_planning', { p_token: token });
        if (error) throw error;
        const res = data as (PortalPlanning & { valid: boolean; found?: boolean });
        if (!res?.valid || res.found === false) return null;
        return res;
    },

    // Caminho autenticado (prévia do admin, sem token público)
    async getPlanningForClient(clientId: string): Promise<PortalPlanning | null> {
        const { data, error } = await supabase.rpc('fn_planning_for_client', { p_client_id: clientId });
        if (error) throw error;
        const res = data as (PortalPlanning & { valid: boolean; found?: boolean });
        if (!res?.valid || res.found === false) return null;
        return res;
    },

    async getTokenForClient(clientId: string): Promise<ClientPortalToken | null> {
        const { data, error } = await supabase
            .from('client_portal_tokens')
            .select('id, org_id, client_id, token, expires_at, last_used_at, is_active, created_at')
            .eq('client_id', clientId)
            .maybeSingle();
        if (error) throw error;
        return data as ClientPortalToken | null;
    },

    async revokeToken(clientId: string): Promise<void> {
        const { error } = await supabase
            .from('client_portal_tokens')
            .update({ is_active: false })
            .eq('client_id', clientId);
        if (error) throw error;
    },

    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-cliente?token=${token}`;
    },
};
