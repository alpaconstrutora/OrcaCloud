import { supabase } from '../lib/supabase';
import {
    Company, CompanyInsert, CompanyUpdate,
    CompanyPartner, CompanyPartnerInsert, CompanyPartnerUpdate,
    CompanyBankAccount, CompanyBankAccountInsert, CompanyBankAccountUpdate,
    CompanyIncorporacao, CompanyIncorporacaoUpsert,
    CompanyBranch, CompanyBranchInsert, CompanyBranchUpdate,
    CompanyDocument, CompanyDocumentInsert, CompanyDocumentUpdate,
    CompanyAuditLog,
    CompanyTarget, CompanyTargetUpsert,
    CompanyConsolidated,
    CompanyDepartment, CompanyDepartmentInsert, CompanyDepartmentUpdate,
} from '../types';

export const companyService = {
    async list(orgId: string): Promise<Company[]> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('org_id', orgId)
            .order('is_headquarters', { ascending: false })
            .order('razao_social');
        if (error) throw error;
        return data as Company[];
    },

    async get(id: string): Promise<Company> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as Company;
    },

    async create(payload: CompanyInsert): Promise<Company> {
        const { data, error } = await supabase
            .from('companies')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as Company;
    },

    async update(id: string, payload: CompanyUpdate): Promise<Company> {
        const { data, error } = await supabase
            .from('companies')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as Company;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ─── Quadro Societário ────────────────────────────────────

    async listPartners(companyId: string): Promise<CompanyPartner[]> {
        const { data, error } = await supabase
            .from('company_partners')
            .select('id, company_id, tipo_pessoa, nome, documento, participacao_pct, is_administrador, is_assinante_legal, pj_company_id, data_entrada, data_saida, created_at')
            .eq('company_id', companyId)
            .order('participacao_pct', { ascending: false });
        if (error) throw error;
        return data as CompanyPartner[];
    },

    async createPartner(payload: CompanyPartnerInsert): Promise<CompanyPartner> {
        const { data, error } = await supabase
            .from('company_partners')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyPartner;
    },

    async updatePartner(id: string, payload: CompanyPartnerUpdate): Promise<CompanyPartner> {
        const { data, error } = await supabase
            .from('company_partners')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyPartner;
    },

    async removePartner(id: string): Promise<void> {
        const { error } = await supabase
            .from('company_partners')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ─── Contas Bancárias ─────────────────────────────────────

    async listBankAccounts(companyId: string): Promise<CompanyBankAccount[]> {
        const { data, error } = await supabase
            .from('company_bank_accounts')
            .select('id, company_id, banco_codigo, banco_nome, agencia, conta, tipo_conta, pix_chave, pix_tipo, favorecido, limite_credito, is_principal, ativa, obra_id, created_at')
            .eq('company_id', companyId)
            .order('is_principal', { ascending: false })
            .order('created_at');
        if (error) throw error;
        return data as CompanyBankAccount[];
    },

    async createBankAccount(payload: CompanyBankAccountInsert): Promise<CompanyBankAccount> {
        const { data, error } = await supabase
            .from('company_bank_accounts')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyBankAccount;
    },

    async updateBankAccount(id: string, payload: CompanyBankAccountUpdate): Promise<CompanyBankAccount> {
        const { data, error } = await supabase
            .from('company_bank_accounts')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyBankAccount;
    },

    async removeBankAccount(id: string): Promise<void> {
        const { error } = await supabase
            .from('company_bank_accounts')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ─── Certificado Digital ──────────────────────────────────

    async uploadCertificado(companyId: string, file: File): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'pfx';
        const path = `${companyId}/certificado_digital.${ext}`;
        const { error } = await supabase.storage
            .from('company-certificates')
            .upload(path, file, { upsert: true });
        if (error) throw error;
        return path;
    },

    async getCertificadoSignedUrl(path: string): Promise<string> {
        const { data, error } = await supabase.storage
            .from('company-certificates')
            .createSignedUrl(path, 3600);
        if (error) throw error;
        return data.signedUrl;
    },

    // ─── Incorporação / SPE ───────────────────────────────────

    async getIncorporacao(companyId: string): Promise<CompanyIncorporacao | null> {
        const { data, error } = await supabase
            .from('company_incorporacao')
            .select('company_id, tipo_spe, registro_incorporacao, cartorio, matriculas, alvara_construcao, alvara_validade, habite_se, habite_se_data, rep_numero, conta_segregada_id, empreendimento_id, created_at, updated_at')
            .eq('company_id', companyId)
            .maybeSingle();
        if (error) throw error;
        return data as CompanyIncorporacao | null;
    },

    async upsertIncorporacao(payload: CompanyIncorporacaoUpsert): Promise<CompanyIncorporacao> {
        const { data, error } = await supabase
            .from('company_incorporacao')
            .upsert(payload, { onConflict: 'company_id' })
            .select()
            .single();
        if (error) throw error;
        return data as CompanyIncorporacao;
    },

    // ─── Filiais ──────────────────────────────────────────────

    async listBranches(companyId: string): Promise<CompanyBranch[]> {
        const { data, error } = await supabase
            .from('company_branches')
            .select('id, company_id, codigo, nome, cnpj_proprio, endereco, estoque_proprio, obra_id, ativa, created_at')
            .eq('company_id', companyId)
            .order('codigo');
        if (error) throw error;
        return data as CompanyBranch[];
    },

    async createBranch(payload: CompanyBranchInsert): Promise<CompanyBranch> {
        const { data, error } = await supabase
            .from('company_branches')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyBranch;
    },

    async updateBranch(id: string, payload: CompanyBranchUpdate): Promise<CompanyBranch> {
        const { data, error } = await supabase
            .from('company_branches')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyBranch;
    },

    async removeBranch(id: string): Promise<void> {
        const { error } = await supabase
            .from('company_branches')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ─── Documentos ───────────────────────────────────────────

    async listDocuments(companyId: string): Promise<CompanyDocument[]> {
        const { data, error } = await supabase
            .from('company_documents')
            .select('id, company_id, tipo, numero, emissor, data_emissao, data_validade, arquivo_url, observacoes, alerta_dias_antecedencia, created_at, updated_at')
            .eq('company_id', companyId)
            .order('data_validade', { ascending: true, nullsFirst: false });
        if (error) throw error;
        return data as CompanyDocument[];
    },

    async createDocument(payload: CompanyDocumentInsert): Promise<CompanyDocument> {
        const { data, error } = await supabase
            .from('company_documents')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyDocument;
    },

    async updateDocument(id: string, payload: CompanyDocumentUpdate): Promise<CompanyDocument> {
        const { data, error } = await supabase
            .from('company_documents')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyDocument;
    },

    async removeDocument(id: string): Promise<void> {
        const { error } = await supabase
            .from('company_documents')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async uploadDocumento(companyId: string, tipo: string, file: File): Promise<string> {
        const ts = Date.now();
        const ext = file.name.split('.').pop() ?? 'pdf';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${companyId}/${tipo}/${ts}_${safeName}.${ext}`;
        const { error } = await supabase.storage
            .from('company-documents')
            .upload(path, file, { upsert: false });
        if (error) throw error;
        return path;
    },

    async getDocumentoSignedUrl(path: string): Promise<string> {
        const { data, error } = await supabase.storage
            .from('company-documents')
            .createSignedUrl(path, 3600);
        if (error) throw error;
        return data.signedUrl;
    },

    // ─── Audit Log ────────────────────────────────────────────

    async listAuditLog(companyId: string, limit = 50): Promise<CompanyAuditLog[]> {
        const { data, error } = await supabase
            .from('company_audit_log')
            .select('id, company_id, user_email, action, field_changed, old_value, new_value, created_at')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data as CompanyAuditLog[];
    },

    async insertAuditLog(entry: Omit<CompanyAuditLog, 'id' | 'created_at'>): Promise<void> {
        const { error } = await supabase
            .from('company_audit_log')
            .insert(entry);
        if (error) console.warn('Audit log insert failed:', error.message);
    },

    // ─── Metas Anuais ─────────────────────────────────────────

    async listTargets(companyId: string): Promise<CompanyTarget[]> {
        const { data, error } = await supabase
            .from('company_targets')
            .select('id, company_id, ano, margem_alvo_pct, limite_endividamento_pct, faturamento_meta, ebitda_alvo, ticket_medio_alvo, qtd_obras_meta, created_at, updated_at')
            .eq('company_id', companyId)
            .order('ano', { ascending: false });
        if (error) throw error;
        return data as CompanyTarget[];
    },

    async upsertTarget(payload: CompanyTargetUpsert): Promise<CompanyTarget> {
        const { data, error } = await supabase
            .from('company_targets')
            .upsert(payload, { onConflict: 'company_id,ano' })
            .select()
            .single();
        if (error) throw error;
        return data as CompanyTarget;
    },

    async removeTarget(id: string): Promise<void> {
        const { error } = await supabase
            .from('company_targets')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ─── Consolidação do Grupo ────────────────────────────────

    async getConsolidatedGroup(orgId: string): Promise<CompanyConsolidated[]> {
        const { data, error } = await supabase
            .from('vw_company_consolidated')
            .select('org_id, consolidadora_id, company_id, razao_social, nome_fantasia, tipo, status, cor_sistema, regime_tributario, is_headquarters, holding_id, qtd_obras, qtd_contratos, receita_contratada, compras_aprovadas, qtd_socios, qtd_contas, docs_vencidos, docs_vencendo')
            .eq('org_id', orgId)
            .order('is_headquarters', { ascending: false })
            .order('razao_social');
        if (error) throw error;
        return data as CompanyConsolidated[];
    },

    // ─── Departamentos ────────────────────────────────────────

    async listDepartments(companyId: string): Promise<CompanyDepartment[]> {
        const { data, error } = await supabase
            .from('company_departments')
            .select('id, company_id, parent_id, nome, descricao, responsavel_nome, cor, ordem, ativo, created_at')
            .eq('company_id', companyId)
            .order('ordem');
        if (error) throw error;
        return data as CompanyDepartment[];
    },

    async createDepartment(payload: CompanyDepartmentInsert): Promise<CompanyDepartment> {
        const { data, error } = await supabase
            .from('company_departments')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyDepartment;
    },

    async updateDepartment(id: string, payload: CompanyDepartmentUpdate): Promise<CompanyDepartment> {
        const { data, error } = await supabase
            .from('company_departments')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as CompanyDepartment;
    },

    async removeDepartment(id: string): Promise<void> {
        const { error } = await supabase
            .from('company_departments')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async seedDefaultDepartments(companyId: string): Promise<void> {
        const idByName: Record<string, string> = {};

        type SeedEntry = { nome: string; parentNome: string | null; cor: string; ordem: number };

        const SEED: SeedEntry[] = [
            // Raízes
            { nome: 'Conselho / Sócios',          parentNome: null,                         cor: '#92400E', ordem: 0 },
            { nome: 'CEO / Diretor Executivo',     parentNome: null,                         cor: '#1D4ED8', ordem: 1 },
            // Nível 1
            { nome: 'Diretoria de Operações',      parentNome: 'CEO / Diretor Executivo',    cor: '#1D4ED8', ordem: 0 },
            { nome: 'Diretoria Financeira',         parentNome: 'CEO / Diretor Executivo',    cor: '#065F46', ordem: 1 },
            { nome: 'Diretoria Comercial',          parentNome: 'CEO / Diretor Executivo',    cor: '#6D28D9', ordem: 2 },
            { nome: 'Diretoria de Incorporação',    parentNome: 'CEO / Diretor Executivo',    cor: '#C2410C', ordem: 3 },
            { nome: 'Tecnologia e Dados',           parentNome: 'CEO / Diretor Executivo',    cor: '#0E7490', ordem: 4 },
            { nome: 'Jurídico e Compliance',        parentNome: 'CEO / Diretor Executivo',    cor: '#9F1239', ordem: 5 },
            // Operações
            { nome: 'Engenharia',        parentNome: 'Diretoria de Operações',   cor: '#1D4ED8', ordem: 0 },
            { nome: 'Planejamento',      parentNome: 'Diretoria de Operações',   cor: '#1D4ED8', ordem: 1 },
            { nome: 'Obras',             parentNome: 'Diretoria de Operações',   cor: '#1D4ED8', ordem: 2 },
            { nome: 'Pós-obra',          parentNome: 'Diretoria de Operações',   cor: '#1D4ED8', ordem: 3 },
            { nome: 'Facilities',        parentNome: 'Diretoria de Operações',   cor: '#1D4ED8', ordem: 4 },
            // Financeira
            { nome: 'Controladoria',        parentNome: 'Diretoria Financeira',  cor: '#065F46', ordem: 0 },
            { nome: 'Tesouraria',           parentNome: 'Diretoria Financeira',  cor: '#065F46', ordem: 1 },
            { nome: 'Fiscal/Tributário',    parentNome: 'Diretoria Financeira',  cor: '#065F46', ordem: 2 },
            { nome: 'Captação/Viabilidade', parentNome: 'Diretoria Financeira',  cor: '#065F46', ordem: 3 },
            // Comercial
            { nome: 'Vendas',          parentNome: 'Diretoria Comercial', cor: '#6D28D9', ordem: 0 },
            { nome: 'Relacionamento',  parentNome: 'Diretoria Comercial', cor: '#6D28D9', ordem: 1 },
            { nome: 'Parcerias',       parentNome: 'Diretoria Comercial', cor: '#6D28D9', ordem: 2 },
            { nome: 'Locação',         parentNome: 'Diretoria Comercial', cor: '#6D28D9', ordem: 3 },
            // Incorporação
            { nome: 'Terrenos',    parentNome: 'Diretoria de Incorporação', cor: '#C2410C', ordem: 0 },
            { nome: 'Aprovações',  parentNome: 'Diretoria de Incorporação', cor: '#C2410C', ordem: 1 },
            { nome: 'Produto',     parentNome: 'Diretoria de Incorporação', cor: '#C2410C', ordem: 2 },
            { nome: 'Viabilidade', parentNome: 'Diretoria de Incorporação', cor: '#C2410C', ordem: 3 },
            // Tecnologia
            { nome: 'ERP',       parentNome: 'Tecnologia e Dados', cor: '#0E7490', ordem: 0 },
            { nome: 'BI',        parentNome: 'Tecnologia e Dados', cor: '#0E7490', ordem: 1 },
            { nome: 'Custos',    parentNome: 'Tecnologia e Dados', cor: '#0E7490', ordem: 2 },
            { nome: 'Automação', parentNome: 'Tecnologia e Dados', cor: '#0E7490', ordem: 3 },
            // Jurídico
            { nome: 'Contratos',  parentNome: 'Jurídico e Compliance', cor: '#9F1239', ordem: 0 },
            { nome: 'Societário', parentNome: 'Jurídico e Compliance', cor: '#9F1239', ordem: 1 },
            { nome: 'Riscos',     parentNome: 'Jurídico e Compliance', cor: '#9F1239', ordem: 2 },
            { nome: 'LGPD',       parentNome: 'Jurídico e Compliance', cor: '#9F1239', ordem: 3 },
        ];

        // Inserir em 3 passagens (profundidade 0, 1, 2)
        for (let depth = 0; depth <= 2; depth++) {
            const batch = SEED.filter(d => {
                if (depth === 0) return d.parentNome === null;
                if (depth === 1) return d.parentNome !== null && SEED.find(s => s.nome === d.parentNome)?.parentNome === null;
                return d.parentNome !== null && SEED.find(s => s.nome === d.parentNome)?.parentNome !== null;
            });

            for (const d of batch) {
                const { data } = await supabase
                    .from('company_departments')
                    .insert({
                        company_id: companyId,
                        nome: d.nome,
                        cor: d.cor,
                        ordem: d.ordem,
                        parent_id: d.parentNome ? idByName[d.parentNome] : null,
                    })
                    .select('id')
                    .single();
                if (data) idByName[d.nome] = data.id;
            }
        }
    },
};
