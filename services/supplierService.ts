import { supabase } from '../lib/supabase';
import { Supplier, SupplierCnaeActivity, SupplierPartner, SupplierStateRegistration } from '../types';
import { isRealEstateBrokerCategory, REAL_ESTATE_BROKER_CATEGORY } from '../constants/supplierCategories';

const CNPJA_COLUMNS = 'cnpj_status, cnpj_status_date, cnpj_updated_at, cnpj_founded_at, cnpj_legal_nature, cnpj_company_size, cnpj_main_activity_code, cnpj_main_activity_text, cnpj_side_activities, cnpj_partners, cnpj_simples_optant, cnpj_simples_since, cnpj_simei_optant, cnpj_simei_since, cnpj_state_registrations';
const SUPPLIER_SELECT = `id, code, name, contact_name, email, phone, document, type, category, address, street, number, neighborhood, city, state, zip_code, organization_id, created_at, ${CNPJA_COLUMNS}`;
const SUPPLIER_LIST_SELECT = `id, code, name, contact_name, email, phone, document, type, category, address, street, number, neighborhood, city, state, zip_code, organization_id, created_at, ${CNPJA_COLUMNS}, organizations:organization_id(name)`;
const CNPJA_PUBLIC_API_BASE = 'https://open.cnpja.com/office';
const CNPJA_PUBLIC_LIMIT = 5;
const CNPJA_PUBLIC_WINDOW_MS = 60_000;
const cnpjaLookupTimestamps: number[] = [];

const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();
const isDuplicateEmailError = (error: unknown) => {
    const err = error as { code?: string; message?: string; details?: string };
    const text = `${err?.message || ''} ${err?.details || ''}`.toLowerCase();
    return err?.code === '23505' && text.includes('email');
};
const onlyDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
export interface CnpjaSupplierUpdate {
    name: string;
    document: string;
    type: 'PJ';
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    cnpjUpdatedAt?: string | null;
    cnpjStatus?: string | null;
    cnpjStatusDate?: string | null;
    cnpjFoundedAt?: string | null;
    cnpjLegalNature?: string | null;
    cnpjCompanySize?: string | null;
    cnpjMainActivityCode?: string | null;
    cnpjMainActivityText?: string | null;
    cnpjSideActivities?: SupplierCnaeActivity[] | null;
    cnpjPartners?: SupplierPartner[] | null;
    cnpjSimplesOptant?: boolean | null;
    cnpjSimplesSince?: string | null;
    cnpjSimeiOptant?: boolean | null;
    cnpjSimeiSince?: string | null;
    cnpjStateRegistrations?: SupplierStateRegistration[] | null;
}

interface CnpjaOfficeResponse {
    updated?: string | null;
    taxId?: string | null;
    alias?: string | null;
    founded?: string | null;
    company?: {
        name?: string | null;
        nature?: { text?: string | null } | null;
        size?: { text?: string | null } | null;
        simples?: { optant?: boolean | null; since?: string | null } | null;
        simei?: { optant?: boolean | null; since?: string | null } | null;
        members?: Array<{
            since?: string | null;
            role?: { text?: string | null } | null;
            person?: { name?: string | null } | null;
        }> | null;
    } | null;
    status?: {
        text?: string | null;
    } | null;
    statusDate?: string | null;
    address?: {
        street?: string | null;
        number?: string | null;
        district?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
    } | null;
    mainActivity?: {
        id?: string | null;
        text?: string | null;
    } | null;
    sideActivities?: Array<{
        id?: string | null;
        text?: string | null;
    }> | null;
    registrations?: Array<{
        number?: string | null;
        state?: string | null;
        enabled?: boolean | null;
        status?: { text?: string | null } | null;
    }> | null;
    phones?: Array<{
        area?: string | null;
        number?: string | null;
    }> | null;
    emails?: Array<{
        address?: string | null;
    }> | null;
}

function assertCnpjaPublicRateLimit() {
    const now = Date.now();
    while (cnpjaLookupTimestamps.length && now - cnpjaLookupTimestamps[0] > CNPJA_PUBLIC_WINDOW_MS) {
        cnpjaLookupTimestamps.shift();
    }

    if (cnpjaLookupTimestamps.length >= CNPJA_PUBLIC_LIMIT) {
        throw new Error('Limite da API publica CNPJa atingido. Aguarde 1 minuto antes de consultar novamente.');
    }

    cnpjaLookupTimestamps.push(now);
}

function formatPhoneFromCnpja(phone?: { area?: string | null; number?: string | null } | null) {
    if (!phone?.number) return null;
    const area = onlyDigits(phone.area);
    const number = onlyDigits(phone.number);
    if (!number) return null;
    return area ? `(${area}) ${number}` : number;
}

function mapCnpjaOfficeToSupplier(office: CnpjaOfficeResponse): CnpjaSupplierUpdate {
    const address = office.address;
    const phone = formatPhoneFromCnpja(office.phones?.[0]);
    const email = office.emails?.find(item => item.address)?.address?.trim().toLowerCase() || null;
    const street = address?.street || null;
    const number = address?.number || null;
    const neighborhood = address?.district || null;

    const sideActivities: SupplierCnaeActivity[] | null = office.sideActivities?.length
        ? office.sideActivities.map(item => ({ code: item.id || null, text: item.text || null }))
        : null;

    const partners: SupplierPartner[] | null = office.company?.members?.length
        ? office.company.members.map(member => ({
            name: member.person?.name || null,
            role: member.role?.text || null,
            since: member.since || null,
        }))
        : null;

    const stateRegistrations: SupplierStateRegistration[] | null = office.registrations?.length
        ? office.registrations.map(reg => ({
            number: reg.number || null,
            state: reg.state || null,
            enabled: reg.enabled ?? null,
            status: reg.status?.text || null,
        }))
        : null;

    return {
        name: office.company?.name || office.alias || '',
        document: office.taxId || '',
        type: 'PJ',
        email,
        phone,
        street,
        number,
        neighborhood,
        address: [street, number, neighborhood].filter(Boolean).join(', ') || null,
        city: address?.city || null,
        state: address?.state || null,
        zip_code: address?.zip || null,
        cnpjUpdatedAt: office.updated || null,
        cnpjStatus: office.status?.text || null,
        cnpjStatusDate: office.statusDate || null,
        cnpjFoundedAt: office.founded || null,
        cnpjLegalNature: office.company?.nature?.text || null,
        cnpjCompanySize: office.company?.size?.text || null,
        cnpjMainActivityCode: office.mainActivity?.id || null,
        cnpjMainActivityText: office.mainActivity?.text || null,
        cnpjSideActivities: sideActivities,
        cnpjPartners: partners,
        cnpjSimplesOptant: office.company?.simples?.optant ?? null,
        cnpjSimplesSince: office.company?.simples?.since || null,
        cnpjSimeiOptant: office.company?.simei?.optant ?? null,
        cnpjSimeiSince: office.company?.simei?.since || null,
        cnpjStateRegistrations: stateRegistrations,
    };
}

async function syncRealEstateBrokerProfile(supplier: Partial<Supplier>): Promise<void> {
    const email = normalizeEmail(supplier.email);
    const organizationId = supplier.organization_id || null;

    if (!email || !organizationId) return;

    if (!isRealEstateBrokerCategory(supplier.category)) {
        await supabase
            .from('broker_profiles')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('organization_id', organizationId)
            .eq('email', email);
        return;
    }

    const profile = {
        organization_id: organizationId,
        email,
        name: supplier.contact_name || supplier.name || email,
        phone: supplier.phone || null,
        cpf: supplier.type === 'PF' ? supplier.document || null : null,
        agency_name: supplier.type === 'PJ' ? supplier.name || null : null,
        commission_rate: 5,
        is_active: true,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('broker_profiles')
        .upsert(profile, { onConflict: 'organization_id,email' });

    if (error) {
        console.error('[SUPPLIER SERVICE] Error syncing supplier broker profile:', error);
        throw error;
    }
}

export const supplierService = {
    listSuppliers: async (organizationId?: string): Promise<(Supplier & { organization_name?: string })[]> => {
        let query = supabase
            .from('suppliers')
            .select(SUPPLIER_LIST_SELECT)
            .order('name', { ascending: true });

        if (organizationId) {
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data as any[])?.map(supplier => {
            let orgName = 'Todas as Organizações';
            if (supplier.organization_id && supplier.organizations?.name) {
                orgName = supplier.organizations.name;
            }
            return {
                ...supplier,
                organization_name: orgName
            };
        }) || [];
    },

    listRealEstateBrokers: async (organizationId?: string): Promise<Supplier[]> => {
        let query = supabase
            .from('suppliers')
            .select(SUPPLIER_SELECT)
            .ilike('category', REAL_ESTATE_BROKER_CATEGORY)
            .order('name', { ascending: true });

        if (organizationId) {
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as Supplier[];
    },

    syncRealEstateBrokerProfiles: async (organizationId?: string): Promise<void> => {
        const brokers = await supplierService.listRealEstateBrokers(organizationId);
        await Promise.all(
            brokers
                .filter(supplier => supplier.organization_id && supplier.email)
                .map(syncRealEstateBrokerProfile)
        );
    },

    lookupCnpjRegistration: async (document: string): Promise<CnpjaSupplierUpdate> => {
        const cnpj = onlyDigits(document);

        if (cnpj.length !== 14) {
            throw new Error('Informe um CNPJ com 14 digitos para consultar a CNPJa.');
        }

        assertCnpjaPublicRateLimit();

        const response = await fetch(`${CNPJA_PUBLIC_API_BASE}/${cnpj}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (response.status === 404) {
            throw new Error('CNPJ nao encontrado na base publica da CNPJa.');
        }

        if (response.status === 429) {
            throw new Error('A CNPJa limitou as consultas deste IP. Aguarde 1 minuto e tente novamente.');
        }

        if (!response.ok) {
            throw new Error(`Falha ao consultar CNPJa (${response.status}).`);
        }

        const office = await response.json() as CnpjaOfficeResponse;
        const mapped = mapCnpjaOfficeToSupplier(office);

        if (!mapped.name || !mapped.document) {
            throw new Error('A CNPJa retornou dados incompletos para este CNPJ.');
        }

        return mapped;
    },

    getByEmail: async (email: string): Promise<Supplier | null> => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select(SUPPLIER_SELECT)
                .eq('email', email.toLowerCase())
                .maybeSingle();

            if (error) throw error;
            return data as Supplier;
        } catch (error: unknown) {
            console.error('[SUPPLIER SERVICE] Error fetching supplier by email:', error instanceof Error ? error.message : error);
            return null;
        }
    },

    getById: async (id: string): Promise<Supplier | null> => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select(SUPPLIER_SELECT)
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data as Supplier;
        } catch (error: unknown) {
            console.error('[SUPPLIER SERVICE] Error fetching supplier by id:', error instanceof Error ? error.message : error);
            return null;
        }
    },

    addSupplier: async (supplier: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> => {
        const payload: Record<string, unknown> = {
            ...supplier,
            email: normalizeEmail(supplier.email) || null,
        };

        // Código sequencial 001/002/003... único por organização (§ui_ux_standard_guide.md).
        if (!payload.code) {
            const { data: nextCode } = await supabase.rpc('get_next_supplier_code', { p_org_id: supplier.organization_id ?? null });
            if (nextCode) payload.code = nextCode;
        }

        let { data, error } = await supabase
            .from('suppliers')
            .insert(payload)
            .select()
            .single();

        if (error && payload.email && isDuplicateEmailError(error)) {
            console.warn('[SUPPLIER SERVICE] Duplicate supplier email from cadastro; saving without email.', error);
            const retry = await supabase
                .from('suppliers')
                .insert({ ...payload, email: null })
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        await syncRealEstateBrokerProfile(data as Supplier);
        return data as Supplier;
    },

    updateSupplier: async (id: string, updates: Partial<Supplier>): Promise<Supplier> => {
        const payload = {
            ...updates,
            ...(updates.email !== undefined ? { email: normalizeEmail(updates.email) || null } : {}),
        };

        let { data, error } = await supabase
            .from('suppliers')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error && payload.email && isDuplicateEmailError(error)) {
            console.warn('[SUPPLIER SERVICE] Duplicate supplier email from cadastro; saving without email.', error);
            const retry = await supabase
                .from('suppliers')
                .update({ ...payload, email: null })
                .eq('id', id)
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        await syncRealEstateBrokerProfile(data as Supplier);
        return data as Supplier;
    },

    deleteSupplier: async (id: string): Promise<void> => {
        const existing = await supplierService.getById(id);

        const { error } = await supabase
            .from('suppliers')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (existing?.organization_id && existing.email && isRealEstateBrokerCategory(existing.category)) {
            await supabase
                .from('broker_profiles')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('organization_id', existing.organization_id)
                .eq('email', normalizeEmail(existing.email));
        }
    }
};