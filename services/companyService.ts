import { supabase } from '../lib/supabase';
import {
    Company, CompanyInsert, CompanyUpdate,
    CompanyPartner, CompanyPartnerInsert, CompanyPartnerUpdate,
    CompanyBankAccount, CompanyBankAccountInsert, CompanyBankAccountUpdate,
    CompanyIncorporacao, CompanyIncorporacaoUpsert,
    CompanyBranch, CompanyBranchInsert, CompanyBranchUpdate,
    CompanyDocument, CompanyDocumentInsert, CompanyDocumentUpdate,
    CompanyAuditLog,
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
            .select('*')
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
            .select('*')
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
            .select('*')
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
            .select('*')
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
            .select('*')
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
            .select('*')
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
};
