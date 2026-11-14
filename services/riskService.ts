import { supabase } from '../lib/supabase';
import type {
    ProjectRisk, ProjectRiskInput, RiskAction, RiskActionInput, RiskAuditLog, RiskCatalogItem, RiskCategoryRow,
    RiskEvaluation, RiskEvaluationInput, RiskMatrixConfig,
} from '../types/risk';
import { RISK_MATRIZ_PADRAO } from '../utils/riskScoring';

/**
 * Módulo ÒPURA Riscos — acesso a dados.
 * Tabelas: supabase/migrations/aplicar_20271114637000_modulo_riscos_estrutura.sql.
 * Plano: docs/planos/2026-11-13-modulo-riscos.md.
 *
 * Organização (REGRA #5): toda leitura recebe `organizationId?: string | null`;
 * `null` = "Todas" e a RLS recorta (só as orgs de que o usuário é membro). Escrita
 * recebe a org EXPLÍCITA, resolvida pela tela com `useOrgWriteTarget`.
 *
 * Auditoria (F1.11): toda mudança de ficha, avaliação e ação grava em
 * `risk_audit_logs` — um evento por campo alterado, valores pequenos. A auditoria
 * NUNCA derruba a operação: erro vira `console.warn` (mesmo contrato de
 * `empreendimentoAuditService`).
 */

const RISK_COLS = '*';

/** Documento do SST oferecido no vínculo da ficha (F1.12). */
export interface DocumentoSst {
    tipo: 'risk_assessment' | 'sst_regulatory_doc';
    id: string;
    /** "PGR · Programa de Gerenciamento de Riscos — Torre A" */
    rotulo: string;
    status: string | null;
    /** Próxima revisão (PGR/APR) ou fim da vigência (documento regulatório). */
    data: string | null;
}

// ── Ator (uma vez por aba) ───────────────────────────────────────────────────
type Ator = { user_id: string | null; user_email: string | null };
let atorCache: Promise<Ator> | null = null;
function atorAtual(): Promise<Ator> {
    if (!atorCache) {
        atorCache = supabase.auth.getUser()
            .then(({ data }) => ({ user_id: data.user?.id ?? null, user_email: data.user?.email ?? null }))
            .catch(() => ({ user_id: null, user_email: null }));
    }
    return atorCache;
}

type EventoAuditoria = Omit<RiskAuditLog, 'id' | 'created_at' | 'user_id' | 'user_email' | 'metadata' | 'reason' | 'field_name' | 'old_value' | 'new_value'> &
    Partial<Pick<RiskAuditLog, 'metadata' | 'reason' | 'field_name' | 'old_value' | 'new_value'>>;

async function auditar(eventos: EventoAuditoria[]): Promise<void> {
    if (!eventos.length) return;
    try {
        const ator = await atorAtual();
        const { error } = await supabase.from('risk_audit_logs').insert(eventos.map(e => ({
            metadata: {}, ...e, user_id: ator.user_id, user_email: ator.user_email,
        })));
        if (error) console.warn('[riskService] auditoria não gravada:', error.message);
    } catch (e) {
        console.warn('[riskService] auditoria não gravada:', e);
    }
}

/** Campos que nunca viram evento — ruído ou espelho mantido pelo banco. */
const SEM_AUDITORIA = new Set(['id', 'organization_id', 'numero', 'codigo', 'created_at', 'updated_at', 'created_by',
    'inerente_probabilidade', 'inerente_impacto', 'inerente_pontuacao', 'residual_probabilidade', 'residual_impacto',
    'residual_pontuacao', 'valor_esperado', 'ultima_avaliacao_em']);

/** Um evento por campo que mudou de fato (comparação por JSON). */
export function diffParaAuditoria<T extends Record<string, unknown>>(antes: T, depois: Partial<T>): { field_name: string; old_value: unknown; new_value: unknown }[] {
    return Object.keys(depois)
        .filter(k => !SEM_AUDITORIA.has(k))
        .filter(k => JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null))
        .map(k => ({ field_name: k, old_value: antes[k] ?? null, new_value: depois[k] ?? null }));
}

// ── Catálogo ─────────────────────────────────────────────────────────────────
export const riskService = {
    async listarCategorias(): Promise<RiskCategoryRow[]> {
        const { data, error } = await supabase.from('risk_categories')
            .select('id, organization_id, codigo, nome, ordem').order('ordem').order('codigo');
        if (error) throw error;
        return data ?? [];
    },

    /** Itens do sistema (sempre) + riscos próprios da org (ou de todas as orgs do usuário). */
    async listarCatalogo(organizationId?: string | null): Promise<RiskCatalogItem[]> {
        let q = supabase.from('risk_catalog').select('*').eq('ativo', true).order('codigo');
        if (organizationId) q = q.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as RiskCatalogItem[];
    },

    async criarRiscoProprio(organizationId: string, item: Pick<RiskCatalogItem, 'category_id' | 'evento'> & Partial<RiskCatalogItem>): Promise<RiskCatalogItem> {
        const { id: _id, organization_id: _o, codigo: _c, versao: _v, updated_at: _u, ...resto } = item as RiskCatalogItem;
        const { data, error } = await supabase.from('risk_catalog')
            .insert({ ...resto, organization_id: organizationId, codigo: '', revisao_tecnica: 'aprovado' })
            .select('*').single();
        if (error) throw error;
        const novo = data as RiskCatalogItem;
        await auditar([{ organization_id: organizationId, project_risk_id: null, entity_type: 'catalog', entity_id: novo.id, entity_label: `${novo.codigo} ${novo.evento}`, action: 'create' }]);
        return novo;
    },

    // ── Faixas da matriz ─────────────────────────────────────────────────────
    /** Faixas de UMA organização. Em "Todas" (`null`) não há uma faixa só: vale a padrão — por risco, use `listarFaixasPorOrg`. */
    async obterFaixas(organizationId?: string | null): Promise<RiskMatrixConfig> {
        // Sem retorno antecipado por falta de organização (REGRA #5, orgContextGuard): a consulta só roda com ela.
        if (organizationId) {
            const { data, error } = await supabase.from('risk_matrix_config')
                .select('limite_medio, limite_alto, limite_critico').eq('organization_id', organizationId).maybeSingle();
            if (error) throw error;
            if (data) return data;
        }
        return RISK_MATRIZ_PADRAO;
    },

    /**
     * Faixas de TODAS as organizações visíveis (RLS recorta), por id. Em "Todas"
     * cada risco é classificado com as faixas da PRÓPRIA organização — uma faixa
     * única (a padrão) pintaria errado o risco de quem configurou outra.
     * Organização sem linha = `RISK_MATRIZ_PADRAO` (quem lê decide: `faixasDe`).
     */
    async listarFaixasPorOrg(organizationId?: string | null): Promise<Record<string, RiskMatrixConfig>> {
        let q = supabase.from('risk_matrix_config').select('organization_id, limite_medio, limite_alto, limite_critico');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        const porOrg: Record<string, RiskMatrixConfig> = {};
        for (const row of (data ?? []) as (RiskMatrixConfig & { organization_id: string })[]) {
            porOrg[row.organization_id] = { limite_medio: row.limite_medio, limite_alto: row.limite_alto, limite_critico: row.limite_critico };
        }
        return porOrg;
    },

    // ── Contexto do risco (escolha de empreendimento e contrato na ficha) ────
    /** Empreendimentos para o campo "Empreendimento" da ficha e para o rótulo do escopo. Select estreito. */
    async listarEmpreendimentos(organizationId?: string | null): Promise<{ id: string; organization_id: string; name: string }[]> {
        let q = supabase.from('empreendimentos').select('id, organization_id, name').order('name');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as { id: string; organization_id: string; name: string }[];
    },

    /** Contratos para o campo "Contrato" da ficha e para o rótulo do escopo. Select estreito. */
    async listarContratos(organizationId?: string | null): Promise<{ id: string; organization_id: string; number: string | null; title: string | null }[]> {
        let q = supabase.from('contracts').select('id, organization_id, number, title').order('number');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as { id: string; organization_id: string; number: string | null; title: string | null }[];
    },

    // ── Riscos ───────────────────────────────────────────────────────────────
    async listarRiscos(organizationId?: string | null): Promise<ProjectRisk[]> {
        let q = supabase.from('project_risks').select(RISK_COLS).order('numero', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ProjectRisk[];
    },

    async obterRisco(id: string): Promise<ProjectRisk | null> {
        const { data, error } = await supabase.from('project_risks').select(RISK_COLS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data as ProjectRisk | null;
    },

    async criarRisco(organizationId: string, input: ProjectRiskInput): Promise<ProjectRisk> {
        const { data, error } = await supabase.from('project_risks')
            .insert({ ...input, organization_id: organizationId, numero: 0, codigo: '' })
            .select(RISK_COLS).single();
        if (error) throw error;
        const r = data as ProjectRisk;
        await auditar([{ organization_id: r.organization_id, project_risk_id: r.id, entity_type: 'risk', entity_id: r.id,
            entity_label: `${r.codigo} ${r.titulo}`, action: 'create',
            metadata: r.catalog_codigo ? { catalogo: r.catalog_codigo, versao: r.catalog_versao } : {} }]);
        return r;
    },

    /** Grava só o que mudou e registra um evento por campo. Encerrar/reabrir viram ação própria. */
    async atualizarRisco(antes: ProjectRisk, patch: Partial<ProjectRiskInput>): Promise<ProjectRisk> {
        const mudancas = diffParaAuditoria(antes as unknown as Record<string, unknown>, patch as Record<string, unknown>);
        if (!mudancas.length) return antes;
        const dados: Record<string, unknown> = Object.fromEntries(mudancas.map(m => [m.field_name, m.new_value]));
        if (dados.status === 'encerrado') dados.encerrado_em = new Date().toISOString();
        if (antes.status === 'encerrado' && dados.status && dados.status !== 'encerrado') dados.encerrado_em = null;
        const { data, error } = await supabase.from('project_risks').update(dados).eq('id', antes.id).select(RISK_COLS).single();
        if (error) throw error;
        const r = data as ProjectRisk;
        const label = `${r.codigo} ${r.titulo}`;
        await auditar(mudancas.map(m => ({
            organization_id: r.organization_id, project_risk_id: r.id, entity_type: 'risk' as const, entity_id: r.id, entity_label: label,
            action: m.field_name === 'status' && m.new_value === 'encerrado' ? 'close' as const
                : m.field_name === 'status' && m.old_value === 'encerrado' ? 'reopen' as const
                : m.field_name === 'sst_document_id' ? (m.new_value ? 'link' as const : 'unlink' as const)
                : 'update' as const,
            ...m,
            reason: m.field_name === 'status' && m.new_value === 'encerrado' ? r.encerramento_motivo : null,
        })));
        return r;
    },

    /**
     * Excluir só serve para risco registrado por engano: com avaliação, o banco
     * recusa (FK RESTRICT — avaliação é histórico). A tela oferece "Encerrar".
     */
    async excluirRisco(r: ProjectRisk): Promise<void> {
        const { error } = await supabase.from('project_risks').delete().eq('id', r.id);
        if (error) throw error;
        await auditar([{ organization_id: r.organization_id, project_risk_id: null, entity_type: 'risk', entity_id: r.id,
            entity_label: `${r.codigo} ${r.titulo}`, action: 'delete' }]);
    },

    // ── Avaliações (append-only) ─────────────────────────────────────────────
    async listarAvaliacoes(riskId: string): Promise<RiskEvaluation[]> {
        const { data, error } = await supabase.from('risk_evaluations').select('*')
            .eq('project_risk_id', riskId).order('avaliado_em', { ascending: false });
        if (error) throw error;
        return (data ?? []) as RiskEvaluation[];
    },

    /** Grava a avaliação (o banco consolida o impacto pelo máximo) e devolve o risco já com o espelho atualizado. */
    async avaliar(r: ProjectRisk, input: RiskEvaluationInput): Promise<{ avaliacao: RiskEvaluation; risco: ProjectRisk }> {
        const { data, error } = await supabase.from('risk_evaluations')
            .insert({ ...input, organization_id: r.organization_id, project_risk_id: r.id, impacto: 1 })
            .select('*').single();
        if (error) throw error;
        const avaliacao = data as RiskEvaluation;
        await auditar([{ organization_id: r.organization_id, project_risk_id: r.id, entity_type: 'evaluation', entity_id: avaliacao.id,
            entity_label: `${r.codigo} ${r.titulo}`, action: 'evaluate',
            new_value: { tipo: avaliacao.tipo, probabilidade: avaliacao.probabilidade, impacto: avaliacao.impacto, pontuacao: avaliacao.pontuacao } }]);
        const risco = (await this.obterRisco(r.id)) ?? r;
        return { avaliacao, risco };
    },

    // ── Ações de tratamento ──────────────────────────────────────────────────
    async listarAcoes(params: { riskId?: string; organizationId?: string | null }): Promise<RiskAction[]> {
        let q = supabase.from('risk_actions').select('*').order('prazo');
        if (params.riskId) q = q.eq('project_risk_id', params.riskId);
        if (params.organizationId) q = q.eq('organization_id', params.organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as RiskAction[];
    },

    async criarAcao(r: ProjectRisk, input: RiskActionInput, opcoes?: { espelharEmTarefas?: boolean }): Promise<RiskAction> {
        const { data, error } = await supabase.from('risk_actions')
            .insert({ ...input, organization_id: r.organization_id, project_risk_id: r.id }).select('*').single();
        if (error) throw error;
        let acao = data as RiskAction;
        await auditar([{ organization_id: r.organization_id, project_risk_id: r.id, entity_type: 'action', entity_id: acao.id,
            entity_label: acao.descricao.slice(0, 120), action: 'create' }]);
        if (opcoes?.espelharEmTarefas) acao = await this.espelharEmTarefas(r, acao);
        return acao;
    },

    async atualizarAcao(r: ProjectRisk, antes: RiskAction, patch: Partial<RiskActionInput>): Promise<RiskAction> {
        const mudancas = diffParaAuditoria(antes as unknown as Record<string, unknown>, patch as Record<string, unknown>);
        if (!mudancas.length) return antes;
        const dados: Record<string, unknown> = Object.fromEntries(mudancas.map(m => [m.field_name, m.new_value]));
        if ('eficacia' in dados) {
            const ator = await atorAtual();
            dados.eficacia_verificada_por = dados.eficacia === 'nao_verificada' ? null : ator.user_id;
            dados.eficacia_verificada_em = dados.eficacia === 'nao_verificada' ? null : new Date().toISOString();
        }
        const { data, error } = await supabase.from('risk_actions').update(dados).eq('id', antes.id).select('*').single();
        if (error) throw error;
        const acao = data as RiskAction;
        await auditar(mudancas.map(m => ({ organization_id: r.organization_id, project_risk_id: r.id, entity_type: 'action' as const,
            entity_id: acao.id, entity_label: acao.descricao.slice(0, 120), action: 'update' as const, ...m })));
        return acao;
    },

    async excluirAcao(r: ProjectRisk, acao: RiskAction): Promise<void> {
        const { error } = await supabase.from('risk_actions').delete().eq('id', acao.id);
        if (error) throw error;
        await auditar([{ organization_id: r.organization_id, project_risk_id: r.id, entity_type: 'action', entity_id: acao.id,
            entity_label: acao.descricao.slice(0, 120), action: 'delete' }]);
    },

    /** Cria a tarefa do responsável em Tarefas (agenda + aviso por e-mail) com link de volta ao risco. */
    async espelharEmTarefas(r: ProjectRisk, acao: RiskAction): Promise<RiskAction> {
        const { data: taskId, error } = await supabase.rpc('create_task', {
            p_user_id: acao.responsavel_user_id,
            p_org_id: r.organization_id,
            p_title: `${r.codigo} · ${acao.descricao}`.slice(0, 200),
            p_due: `${acao.prazo}T12:00:00-03:00`,
            p_source_module: 'riscos',
            p_source_ref: { type: 'risk_action', id: acao.id, risk_id: r.id, route: `/riscos?riskId=${r.id}` }, // "Abrir origem" abre a ficha
            p_description: `Ação de tratamento do risco ${r.codigo} — ${r.titulo}`,
        });
        if (error) throw error;
        const { data, error: e2 } = await supabase.from('risk_actions').update({ task_id: taskId }).eq('id', acao.id).select('*').single();
        if (e2) throw e2;
        return data as RiskAction;
    },

    // ── Histórico ────────────────────────────────────────────────────────────
    async listarHistorico(riskId: string): Promise<RiskAuditLog[]> {
        const { data, error } = await supabase.from('risk_audit_logs').select('*')
            .eq('project_risk_id', riskId).order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return (data ?? []) as RiskAuditLog[];
    },

    // ── Vínculo com o SST (F1.12) ────────────────────────────────────────────
    /**
     * Documentos do SST da MESMA obra que a ficha de um risco R14 pode apontar:
     * PGR/APR (`risk_assessments`) e documentos regulatórios (`sst_regulatory_docs`).
     * As duas tabelas usam `org_id` (não `organization_id`). Cada leitura falha
     * sozinha: sem uma delas a ficha ainda oferece a outra.
     */
    async listarDocumentosSst(organizationId: string, projectId: string): Promise<DocumentoSst[]> {
        const [pgr, reg] = await Promise.allSettled([
            supabase.from('risk_assessments').select('id, tipo, titulo, status, proxima_revisao')
                .eq('org_id', organizationId).eq('project_id', projectId).order('data_avaliacao', { ascending: false }),
            supabase.from('sst_regulatory_docs').select('id, tipo, titulo, status, vigencia_fim')
                .eq('org_id', organizationId).eq('project_id', projectId).order('tipo'),
        ]);
        const docs: DocumentoSst[] = [];
        if (pgr.status === 'fulfilled' && !pgr.value.error) {
            for (const d of (pgr.value.data ?? []) as { id: string; tipo: string | null; titulo: string | null; status: string | null; proxima_revisao: string | null }[]) {
                docs.push({ tipo: 'risk_assessment', id: d.id, rotulo: `${d.tipo ?? 'PGR/APR'} · ${d.titulo ?? 'sem título'}`, status: d.status, data: d.proxima_revisao });
            }
        }
        if (reg.status === 'fulfilled' && !reg.value.error) {
            for (const d of (reg.value.data ?? []) as { id: string; tipo: string | null; titulo: string | null; status: string | null; vigencia_fim: string | null }[]) {
                docs.push({ tipo: 'sst_regulatory_doc', id: d.id, rotulo: `${d.tipo ?? 'Documento'} · ${d.titulo ?? 'sem título'}`, status: d.status, data: d.vigencia_fim });
            }
        }
        return docs;
    },

    /** Quantos riscos do módulo apontam para cada documento do SST (PGR/APR ou documento regulatório). */
    async contarVinculosSst(documentIds: string[]): Promise<Record<string, number>> {
        if (!documentIds.length) return {};
        const { data, error } = await supabase.from('project_risks').select('sst_document_id').in('sst_document_id', documentIds);
        if (error) throw error;
        const contagem: Record<string, number> = {};
        for (const row of data ?? []) if (row.sst_document_id) contagem[row.sst_document_id] = (contagem[row.sst_document_id] ?? 0) + 1;
        return contagem;
    },
};

/** Ficha nova a partir de um item do catálogo: copia os textos (CA02) e o gatilho. */
export function fichaDoCatalogo(item: RiskCatalogItem, base: Pick<ProjectRiskInput, 'escopo' | 'owner_user_id' | 'owner_nome' | 'proxima_revisao'> & Partial<ProjectRiskInput>): ProjectRiskInput {
    return {
        catalog_id: item.id, catalog_codigo: item.codigo, catalog_versao: item.versao, category_id: item.category_id,
        tipo: 'ameaca', titulo: item.evento, evento: item.evento,
        causa: item.causas.join('; '), consequencia: item.consequencias.join('; '),
        tags: [], dimensoes: [...item.dimensoes],   // cópia: a ficha nunca compartilha array com o mestre (CA02)
        empreendimento_id: null, project_id: null, contract_id: null, frente: null, localizacao: null,
        fase: item.fases[0] ?? null, partes_afetadas: null,
        avaliador_user_id: null, aprovador_user_id: null,
        data_identificacao: new Date().toISOString().slice(0, 10),
        controles_existentes: null, estrategia: null,
        plano_resposta: item.controles_preventivos.join('\n'), contingencia: item.controles_resposta.join('\n'),
        justificativa_aceite: null, status: 'identificado', encerramento_motivo: null,
        gatilho_critico: item.gatilho_critico, gatilho_motivo: item.gatilho_motivo,
        sst_document_tipo: null, sst_document_id: null,
        ...base,
    };
}
