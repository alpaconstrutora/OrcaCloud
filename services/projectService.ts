import { supabase } from '../lib/supabase';
import { ProjectSettings, BudgetEntry } from '../types';
import { cloneBudgetForPersistence, cloneSettingsForPersistence } from '../utils/budgetPersistence';
import { isSystemProject, excludeSystemProjects } from '../utils/systemProjects';
import { AnyClassification, onlyClassifications } from '../utils/projectClassification';

/**
 * Opções de `listProjects`. Objeto, e não parâmetros posicionais, por um motivo
 * concreto: `classifications` tem default SEGURO (`['OBRA']`), e trocar a
 * assinatura obrigou o compilador a apontar as 30 chamadas existentes, uma a
 * uma. Era essa a única forma de fechar o furo sem depender de alguém lembrar.
 *
 * O furo: `projects` guarda quatro entidades separadas só por
 * `settings.classification` (CLAUDE.md regra #3). A versão anterior devolvia as
 * quatro, e cabia a cada tela filtrar — o que dezenas não faziam. Foi assim que
 * um PLANEJAMENTO chamado "Plan: Garden" apareceu na coluna "Obra" de
 * Suprimentos › Contratos em 28/08/2026, e o mesmo em Boletos.
 *
 * `check-project-classification.sh` não pegava isso: ele acha comparação
 * literal `=== 'OBRA'`, não "chamou e usou direto".
 */
export interface ListProjectsOptions {
    /** Filtra por `settings.clientId`. */
    clientId?: string;
    /** `null`/`undefined` = "Todas as organizações": não filtra, a RLS recorta (regra #5). */
    organizationId?: string | null;
    /** Inclui também projetos com `organization_id IS NULL` (órfãos de organização excluída). */
    includeOrphans?: boolean;
    /** Empresa específica do grupo — tem precedência sobre `organizationId`. */
    empresaId?: string;
    /** Traz "Gestão Comercial" e afins (regra #2). Só para quem precisa DELES. */
    includeSystemProjects?: boolean;
    /**
     * Quais classificações trazer. **Default: só `OBRA`** — quando a tela fala
     * em "obra", ela mostra obra. Use `'ALL'` para os quatro tipos, ou liste os
     * que a tela realmente quer (`['OBRA','ORCAMENTO']`).
     *
     * O filtro roda em memória, por `utils/projectClassification.ts`, e não em
     * SQL: a decisão sobre projeto SEM classificação
     * (`TRATAR_SEM_CLASSIFICACAO_COMO_OBRA`) mora numa constante única lá, e
     * duplicá-la num `WHERE` criaria a segunda fonte da verdade que a regra #3
     * existe para eliminar.
     */
    classifications?: AnyClassification[] | 'ALL';
}

export interface ProjectData {
    id?: string;
    name: string;
    settings: ProjectSettings;
    budget: BudgetEntry[];
    empresa_id?: string;
    investor_id?: string;
    updated_at?: string;
    // Coluna nativa (denormalizada de empresa_id via trigger, ou gravada direto). Fonte
    // mais confiável que settings.organizationId — obras vinculadas a uma empresa/grupo
    // só têm a organização aqui, nunca no JSONB. Ver services/empreendimentoService.ts.
    organization_id?: string;
}

export const projectService = {
    // Salva ou atualiza um projeto
    // Como não temos autenticação completa ainda vamos usar o local storage para guardar o ID do projeto criado
    // para permitir "edição" simples do mesmo projeto
    async saveProject(data: ProjectData) {
        const { id, ...rest } = data;
        const settingsForSave = cloneSettingsForPersistence(rest.settings);
        const budgetForSave = cloneBudgetForPersistence(rest.budget);

        // VALIDAÇÃO DE NOME DUPLICADO (Sensível à Classificação)
        const orgId = settingsForSave?.organizationId;
        const classification = settingsForSave?.classification;

        if (orgId && !isSystemProject({ name: rest.name, settings: settingsForSave })) {
            const { data: existing } = await supabase
                .from('projects')
                .select('id, name, settings')
                .ilike('name', rest.name.trim())
                .filter('settings->>organizationId', 'eq', orgId);

            if (existing && existing.length > 0) {
                const isDuplicate = existing.some(p => {
                    const sameId = p.id === id;
                    const sameName = p.name.toLowerCase().trim() === rest.name.toLowerCase().trim();
                    const sameClass = (p.settings as any)?.classification === classification;
                    return !sameId && sameName && sameClass;
                });

                if (isDuplicate) {
                    const typeLabel = classification === 'DIARIO' ? 'diário' : 
                                     classification === 'ORCAMENTO' ? 'orçamento' :
                                     classification === 'PLANEJAMENTO' ? 'planejamento' : 'obra';
                                     
                    throw new Error(`Já existe um ${typeLabel} chamado "${rest.name.trim()}" na sua organização. Por favor, escolha outro nome para este ${typeLabel}.`);
                }
            }
        }

        const tipoObra = settingsForSave?.tipoObra ?? null;
        const regimeObra = settingsForSave?.regimeObra ?? null;
        const empresaId = rest.empresa_id ?? settingsForSave?.empresaId ?? null;
        const investorId = rest.investor_id ?? settingsForSave?.investorId ?? null;

        // Se tivermos um ID, tentamos atualizar
        if (id) {
            const { data: updated, error } = await supabase
                .from('projects')
                .update({
                    name: rest.name,
                    settings: settingsForSave,
                    budget: budgetForSave,
                    updated_at: new Date(),
                    ...(settingsForSave?.code !== undefined ? { code: settingsForSave.code || null } : {}),
                    ...(tipoObra !== null ? { tipo_obra: tipoObra } : {}),
                    ...(regimeObra !== null ? { regime_obra: regimeObra } : {}),
                    ...(empresaId ? { empresa_id: empresaId } : {}),
                    investor_id: investorId || null,
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return updated;
        }
        // Senão, criamos um novo
        else {
            let codeToUse = settingsForSave?.code ?? null;

            // Auto-generate sequential code for OBRA projects if not provided
            if (!codeToUse && classification === 'OBRA' && orgId) {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_next_project_code', { p_org_id: orgId });
                if (!rpcError && rpcData) {
                    codeToUse = rpcData as string;
                }
            }

            // Auto-generate sequential code for ORCAMENTO projects if not provided
            if (!codeToUse && classification === 'ORCAMENTO' && orgId) {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_next_orcamento_code', { p_org_id: orgId });
                if (!rpcError && rpcData) {
                    codeToUse = rpcData as string;
                }
            }

            // Auto-generate sequential code for PLANEJAMENTO projects if not provided
            if (!codeToUse && classification === 'PLANEJAMENTO' && orgId) {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_next_planejamento_code', { p_org_id: orgId });
                if (!rpcError && rpcData) {
                    codeToUse = rpcData as string;
                }
            }

            const settingsWithCode = codeToUse
                ? { ...settingsForSave, code: codeToUse }
                : settingsForSave;

            const { data: created, error } = await supabase
                .from('projects')
                .insert({
                    name: rest.name,
                    settings: settingsWithCode,
                    budget: budgetForSave,
                    code: codeToUse,
                    ...(tipoObra ? { tipo_obra: tipoObra } : {}),
                    ...(regimeObra ? { regime_obra: regimeObra } : {}),
                    ...(empresaId ? { empresa_id: empresaId } : {}),
                    ...(investorId ? { investor_id: investorId } : {}),
                })
                .select()
                .single();

            if (error) throw error;
            return created;
        }
    },

    async loadProject(id: string) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!data) return data;
        return {
            ...data,
            settings: cloneSettingsForPersistence(data.settings as ProjectSettings),
            budget: cloneBudgetForPersistence(data.budget as BudgetEntry[]),
        };
    },

    /**
     * Lista projetos. Por padrão NÃO retorna projetos de sistema (ex: "Gestão
     * Comercial") — ver utils/systemProjects.ts. Quem precisa deles usa
     * `includeSystemProjects = true`; hoje ninguém precisa por esta via, porque
     * o financeiro comercial busca o projeto direto no Supabase.
     *
     * Este corte existe aqui, e não em cada chamador, porque espalhar o filtro
     * pelas ~31 chamadas é justamente o que fez o projeto comercial reaparecer
     * em tela nova toda vez que alguém esquecia de replicá-lo.
     */
    async listProjects(opcoes: ListProjectsOptions = {}) {
        const {
            clientId,
            organizationId,
            includeOrphans = false,
            empresaId,
            includeSystemProjects = false,
            classifications = ['OBRA'],
        } = opcoes;

        let query = supabase
            .from('projects')
            .select('id, name, updated_at, created_at, settings, code, empresa_id, investor_id, organization_id')
            .order('updated_at', { ascending: false });

        if (clientId) {
            query = query.filter('settings->>clientId', 'eq', clientId);
        }

        if (empresaId) {
            // Filtro por empresa específica do grupo (coluna própria)
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            if (includeOrphans) {
                query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
            } else {
                query = query.eq('organization_id', organizationId);
            }
        }

        const { data, error } = await query;
        if (error) throw error;
        const rows = data ?? [];
        const semSistema = includeSystemProjects ? rows : excludeSystemProjects(rows);
        return classifications === 'ALL'
            ? semSistema
            : onlyClassifications(semSistema, ...classifications);
    },

    async linkInvestor(projectId: string, investorId: string | null) {
        const { error } = await supabase
            .from('projects')
            .update({ investor_id: investorId })
            .eq('id', projectId);
        if (error) throw error;
    },

    async deleteProject(id: string) {
        // Bloqueio de segurança para o Gestão Comercial
        const { data: projectToDel } = await supabase.from('projects').select('name, settings').eq('id', id).maybeSingle();
        if (isSystemProject(projectToDel)) {
            throw new Error('Não é possível excluir a obra do sistema "Gestão Comercial". Ela é vital para o armazenamento no banco de dados e sincronização.');
        }

        // Verificar purchase_orders vinculadas
        const { count: poCount, error: poCountError } = await supabase
            .from('purchase_orders')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', id);

        if (poCountError) throw poCountError;

        if (poCount && poCount > 0) {
            throw new Error(`Não é possível excluir esta obra pois existem ${poCount} pedido(s) de compra vinculados a ela. Exclua ou cancele os pedidos primeiro.`);
        }

        // Verificar work_orders vinculadas
        const { count: woCount, error: woCountError } = await supabase
            .from('work_orders')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', id);

        if (woCountError) throw woCountError;

        if (woCount && woCount > 0) {
            throw new Error(`Não é possível excluir esta obra pois existem ${woCount} ordem(ns) de serviço vinculadas a ela. Exclua as ordens de serviço primeiro.`);
        }

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Retorna a contagem de pedidos para uma lista de IDs de projeto
    async getOrderCounts(projectIds: string[]) {
        if (projectIds.length === 0) return {};

        const { data, error } = await supabase
            .from('purchase_orders')
            .select('project_id')
            .in('project_id', projectIds);

        if (error) throw error;

        const counts: Record<string, number> = {};
        data?.forEach(o => {
            counts[o.project_id] = (counts[o.project_id] || 0) + 1;
        });
        return counts;
    }
};
