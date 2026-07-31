import { supabase } from '../lib/supabase';
import { Contract } from '../types/contracts';
import { Client } from '../types/users';
import { Property } from '../types/imovib';
import { ResolveContext, LandlordInfo, RentalUnitInfo, RentalMeta } from './docxFieldCatalog';
import { companyService } from './companyService';
import { rentalGuaranteeService } from './rentalGuaranteeService';
import { commercialFinanceService } from './commercialFinanceService';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Contexto de emissão de documento de LOCAÇÃO
 * ─────────────────────────────────────────────────────────────────────────
 * Reúne, para um contrato `domain='LOCACAO'`, tudo o que `docxFieldCatalog`
 * precisa além do trio organização/cliente/contrato: o LOCADOR (empresa do
 * grupo + sócio assinante), as UNIDADES da negociação, a GARANTIA ativa com
 * seus fiadores, e os agregados da série de parcelas.
 *
 * Mora num arquivo próprio de propósito: `docxFieldCatalog.ts` importa apenas
 * `types/*` — nenhum service, nenhum `supabase`. É essa pureza que o mantém
 * testável e livre de ciclo de import; colocar I/O lá dentro a quebraria.
 *
 * CONTRATO DE ERRO: só o passo do contrato pode lançar (sem contrato não há
 * documento). Todo o resto é `try/catch` individual — uma minuta com o fiador
 * em branco é recuperável pelo usuário; um "falha ao gerar o documento"
 * genérico não é.
 */

/**
 * Colunas do contrato. Deliberadamente NÃO reusa `getContractByDealId` nem
 * `getContractById`: as duas têm listas curtas que não trazem `end_date`,
 * `due_day`, `billing_cycle`, `payment_days`, os `reajuste_*`,
 * `guarantor_name`, `rescission_penalty_months` nem os `execution_*` — sem
 * eles a minuta sai sem vigência, sem reajuste e sem multa rescisória.
 */
const CONTRACT_COLS =
    'id, organization_id, deal_id, client_id, project_id, empresa_id, number, title, description, ' +
    'contract_type, nature, domain, direction, status, start_date, end_date, is_recurring, ' +
    'billing_cycle, due_day, payment_days, payment_method, payment_term_type, payment_installments, ' +
    'original_value, current_value, retention_rate, reajuste_index, reajuste_data_base, reajuste_proximo, ' +
    'guarantor_name, rescission_penalty_months, execution_address, execution_street, execution_number, ' +
    'execution_neighborhood, execution_city, execution_state, execution_zip, ' +
    'signature_status, signature_url, signed_contract_url, signature_completed_at, created_at';

/** Todas as colunas do imóvel: as novas (matrícula/cartório/IPTU) não estão na
 *  lista explícita de `commercialService.listProperties`, então `*` é o único
 *  jeito de não depender daquela lista estar em dia. */
const PROPERTY_COLS = '*';

export async function buildRentalResolveContext(input: {
    contractId: string;
    dealId?: string | null;
    /** Dica apenas — a org efetiva sai do contrato (REGRA #5). */
    organizationId?: string | null;
}): Promise<Partial<ResolveContext>> {
    // ── 1. Contrato completo (único passo que pode lançar) ────────────────────
    const { data: contractRow, error: contractErr } = await supabase
        .from('contracts')
        .select(CONTRACT_COLS)
        .eq('id', input.contractId)
        .maybeSingle();
    if (contractErr) throw contractErr;
    if (!contractRow) throw new Error('Contrato não encontrado.');

    const contract = contractRow as unknown as Contract;
    const ctx: Partial<ResolveContext> = { contract };

    // ── 2. Org efetiva — da entidade aberta, nunca do seletor global ──────────
    const effectiveOrgId = contract.organization_id || input.organizationId || null;
    const dealId = (contract as { deal_id?: string }).deal_id || input.dealId || null;

    // ── 3. Locatário ─────────────────────────────────────────────────────────
    if (contract.client_id) {
        try {
            const { data } = await supabase
                .from('clients')
                .select('*')
                .eq('id', contract.client_id)
                .maybeSingle();
            if (data) ctx.client = data as unknown as Client;
        } catch (e) {
            console.warn('[rentalDocumentContext] locatário não carregado:', e);
        }
    }

    // ── 4. Unidades do contrato ──────────────────────────────────────────────
    let units: RentalUnitInfo[] = [];
    try {
        units = await loadUnits(dealId);
        if (units.length > 0) ctx.units = units;
    } catch (e) {
        console.warn('[rentalDocumentContext] unidades não carregadas:', e);
    }

    // ── 5. Locador ───────────────────────────────────────────────────────────
    try {
        const landlord = await resolveLandlord({
            primaryProperty: units.find(u => u.isPrimary)?.property ?? units[0]?.property,
            contractEmpresaId: (contract as { empresa_id?: string }).empresa_id ?? null,
            organizationId: effectiveOrgId,
        });
        if (landlord) ctx.landlord = landlord;
    } catch (e) {
        console.warn('[rentalDocumentContext] locador não resolvido:', e);
    }

    // ── 6. Garantia + fiadores ───────────────────────────────────────────────
    // Isolado porque a Fase 1 de garantias locatícias é aplicada manualmente
    // (supabase/migrations/aplicar_20270836000000/) e pode não existir no
    // ambiente — ausência de garantia não pode impedir a emissão da minuta.
    try {
        const guarantee = await rentalGuaranteeService.getActive(contract.id);
        if (guarantee) {
            ctx.guarantee = guarantee;
            try {
                const guarantors = await rentalGuaranteeService.listGuarantors(guarantee.id);
                if (guarantors.length > 0) ctx.guarantors = guarantors;
            } catch (e) {
                console.warn('[rentalDocumentContext] fiadores não carregados:', e);
            }
        }
    } catch (e) {
        console.warn('[rentalDocumentContext] garantia não carregada:', e);
    }

    // ── 7. Agregados da série de parcelas ────────────────────────────────────
    try {
        const meta = await loadRentalMeta(dealId, effectiveOrgId);
        if (meta) ctx.rentalMeta = meta;
    } catch (e) {
        console.warn('[rentalDocumentContext] parcelas não carregadas:', e);
    }

    return ctx;
}

/**
 * Unidades da negociação. `commercial_deal_units` é a fonte; contratos
 * anteriores à tabela (ou linhas que o backfill não alcançou) caem no
 * `commercial_deals.property_id`, que é a representação legada de 1 unidade.
 */
async function loadUnits(dealId: string | null): Promise<RentalUnitInfo[]> {
    if (!dealId) return [];

    const byProperty = new Map<string, { value?: number | null; isPrimary?: boolean }>();

    const { data: unitRows } = await supabase
        .from('commercial_deal_units')
        .select('property_id, value, is_primary')
        .eq('deal_id', dealId);

    for (const r of (unitRows || []) as { property_id: string; value?: number; is_primary?: boolean }[]) {
        byProperty.set(r.property_id, { value: r.value, isPrimary: r.is_primary });
    }

    if (byProperty.size === 0) {
        const { data: deal } = await supabase
            .from('commercial_deals')
            .select('property_id, value')
            .eq('id', dealId)
            .maybeSingle();
        const pid = (deal as { property_id?: string } | null)?.property_id;
        if (!pid) return [];
        byProperty.set(pid, { value: (deal as { value?: number }).value, isPrimary: true });
    }

    const ids = [...byProperty.keys()];
    const { data: props } = await supabase
        .from('commercial_properties')
        .select(PROPERTY_COLS)
        .in('id', ids);

    const properties = (props || []) as unknown as Property[];

    // Nome da torre/edifício de cada unidade, numa única consulta.
    const parentIds = [...new Set(properties.map(p => p.parent_id).filter(Boolean))] as string[];
    const buildingNameById = new Map<string, string>();
    if (parentIds.length > 0) {
        const { data: parents } = await supabase
            .from('commercial_properties')
            .select('id, name')
            .in('id', parentIds);
        for (const p of (parents || []) as { id: string; name: string }[]) {
            buildingNameById.set(p.id, p.name);
        }
    }

    const units: RentalUnitInfo[] = properties.map(property => {
        const meta = byProperty.get(property.id);
        return {
            property,
            buildingName: property.parent_id ? (buildingNameById.get(property.parent_id) ?? null) : null,
            dealValue: meta?.value ?? null,
            isPrimary: !!meta?.isPrimary,
        };
    });

    // Principal primeiro — é a unidade que o grupo `unit` do catálogo descreve.
    // Sem nenhuma marcada, a primeira assume o papel.
    units.sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));
    if (units.length > 0 && !units.some(u => u.isPrimary)) units[0].isPrimary = true;
    return units;
}

/**
 * Locador, em cascata do mais específico para o mais genérico:
 *   unidade principal → empreendimento da unidade → contrato → matriz da org.
 * Devolve `null` quando nenhum degrau resolve — aí os tokens do grupo
 * `landlord` ficam vazios e o modelo pode cair no grupo `organization`, que
 * continua funcionando.
 */
async function resolveLandlord(input: {
    primaryProperty?: Property;
    contractEmpresaId: string | null;
    organizationId: string | null;
}): Promise<LandlordInfo | null> {
    const companyId = await resolveCompanyId(input);
    if (!companyId) return null;

    const company = await companyService.get(companyId);

    let signatory: LandlordInfo['signatory'] = null;
    try {
        const partners = await companyService.listPartners(companyId);
        const chosen = partners.find(p => p.is_assinante_legal)
            ?? partners.find(p => p.is_administrador)
            ?? partners[0];
        if (chosen) {
            signatory = { nome: chosen.nome, documento: chosen.documento, is_administrador: chosen.is_administrador };
        }
    } catch (e) {
        console.warn('[rentalDocumentContext] quadro societário não carregado:', e);
    }

    return { company, signatory };
}

async function resolveCompanyId(input: {
    primaryProperty?: Property;
    contractEmpresaId: string | null;
    organizationId: string | null;
}): Promise<string | null> {
    if (input.primaryProperty?.company_id) return input.primaryProperty.company_id;

    // Herança pelo empreendimento: a unidade comercial é espelhada em
    // `empreendimento_units.commercial_property_id` (ver migration 20270826000002).
    if (input.primaryProperty?.id) {
        try {
            const { data: link } = await supabase
                .from('empreendimento_units')
                .select('empreendimento_id')
                .eq('commercial_property_id', input.primaryProperty.id)
                .maybeSingle();
            const empId = (link as { empreendimento_id?: string } | null)?.empreendimento_id;
            if (empId) {
                const { data: emp } = await supabase
                    .from('empreendimentos')
                    .select('company_id')
                    .eq('id', empId)
                    .maybeSingle();
                const cid = (emp as { company_id?: string } | null)?.company_id;
                if (cid) return cid;
            }
        } catch { /* empreendimento é opcional — segue para o próximo degrau */ }
    }

    if (input.contractEmpresaId) return input.contractEmpresaId;

    if (input.organizationId) {
        try {
            const companies = await companyService.list(input.organizationId);
            const hq = companies.find(c => c.is_headquarters) ?? companies[0];
            if (hq) return hq.id;
        } catch { /* sem empresa cadastrada — locador fica nulo */ }
    }

    return null;
}

/**
 * Total e contagem da série de parcelas. Vem da NEGOCIAÇÃO, não do contrato:
 * na locação original quem fatura o aluguel é o deal (`source_system='COMMERCIAL'`),
 * e o contrato deliberadamente não gera segunda série — ver o comentário em
 * `contractService.createContract`.
 */
async function loadRentalMeta(dealId: string | null, organizationId: string | null): Promise<RentalMeta | null> {
    if (!dealId || !organizationId) return null;
    const installments = await commercialFinanceService.getDealInstallments(dealId, organizationId);
    if (installments.length === 0) return null;

    const total = installments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
    const firstDueDate = installments
        .map(i => i.dueDate)
        .filter(Boolean)
        .sort()[0];

    return {
        totalContractValue: total > 0 ? total : null,
        installmentsCount: installments.length,
        firstDueDate: firstDueDate ?? null,
        dealId,
    };
}
