import { supabase } from '../lib/supabase';
import { Property, PropertyDeal, PropertyStatus, DealUnit } from '../types';
import { commercialFinanceService } from './commercialFinanceService';
import { taxPayableService } from './taxPayableService';

/**
 * Traduz a violação de FK (23503) ao excluir um imóvel para uma frase acionável.
 * Sem isso o usuário via o texto cru do Postgres ("violates foreign key
 * constraint commercial_properties_parent_id_fkey"), que não diz o que fazer.
 */
function translatePropertyDeleteError(error: { code?: string; message?: string }): string {
    const msg = error?.message || 'Erro desconhecido';
    if (error?.code !== '23503') return msg;

    if (msg.includes('parent_id')) {
        return 'Este imóvel tem unidades vinculadas a ele. Exclua as unidades primeiro ou confirme a exclusão do edifício inteiro.';
    }
    if (msg.includes('commercial_deals')) {
        return 'Este imóvel tem negociações vinculadas. Exclua as negociações antes (ou confirme a exclusão em cadeia).';
    }
    if (msg.includes('post_sales')) {
        return 'Há registros de pós-venda vinculados a uma negociação deste imóvel. Remova-os antes de excluir.';
    }
    // broker_portal_* usa ON DELETE RESTRICT — reserva/proposta de corretor trava o delete
    if (msg.includes('broker')) {
        return 'Este imóvel tem reservas ou propostas de corretor vinculadas. Cancele-as no Portal do Corretor antes de excluir.';
    }
    return `Não foi possível excluir: há registros vinculados a este imóvel. (${msg})`;
}

/**
 * Normaliza a lista de unidades de uma negociação.
 *
 * Contratos anteriores à tabela `commercial_deal_units` (e qualquer linha que o
 * backfill não tenha alcançado) só têm `property_id`. Em vez de espalhar
 * `if (deal.units?.length)` por toda a base, toda leitura passa por aqui e
 * enxerga SEMPRE uma lista — com uma única unidade, no caso legado.
 */
export function dealUnitsOf(deal: Partial<PropertyDeal> | null | undefined): DealUnit[] {
    if (!deal) return [];
    const list = (deal.units || []).filter(u => !!u?.property_id);
    if (list.length > 0) {
        // Garante exatamente uma principal: a marcada, senão a primeira.
        const primaryIdx = Math.max(0, list.findIndex(u => u.is_primary));
        return list.map((u, i) => ({ ...u, value: Number(u.value) || 0, is_primary: i === primaryIdx }));
    }
    if (deal.property_id) {
        return [{ property_id: deal.property_id, value: Number(deal.value) || 0, is_primary: true }];
    }
    return [];
}

/** Unidade principal (a que espelha `commercial_deals.property_id`). */
export function primaryUnitOf(deal: Partial<PropertyDeal> | null | undefined): DealUnit | undefined {
    const units = dealUnitsOf(deal);
    return units.find(u => u.is_primary) || units[0];
}

/**
 * `commercial_deal_units` só existe depois da migration 20270825000020. Enquanto
 * ela não for aplicada, toda leitura da tabela falha com PGRST205/42P01 e
 * derrubaria a tela de Locações inteira. Este flag registra a ausência na
 * primeira falha e o código passa a operar no modo legado (1 unidade por
 * contrato, via `property_id`) sem erro visível.
 */
let dealUnitsTableMissing = false;
function noteDealUnitsError(error: { code?: string; message?: string } | null | undefined): boolean {
    const code = error?.code || '';
    const msg = error?.message || '';
    if (code === '42P01' || code === 'PGRST205' || msg.includes('commercial_deal_units')) {
        if (!dealUnitsTableMissing) {
            console.warn('[COMMERCIAL SERVICE] Tabela commercial_deal_units indisponível — operando em modo 1 unidade por contrato. Aplique a migration 20270825000020.');
        }
        dealUnitsTableMissing = true;
        return true;
    }
    return false;
}

/** Soma dos valores das unidades — é o valor do contrato. */
export function dealUnitsTotal(units: DealUnit[] | undefined): number {
    return (units || []).reduce((s, u) => s + (Number(u.value) || 0), 0);
}

export const commercialService = {
    /**
     * `includeHidden` traz também as unidades ocultadas pelo switch "Publicar" do
     * Espelho de Vendas (`visible_in_sales = false`). Default `false`: as telas de
     * oferta (Venda de Ativos, proposta, Portal) não devem mostrar unidade oculta —
     * o vínculo com o Empreendimento continua lá, só não aparece.
     */
    async listProperties(organizationId?: string, projectId?: string, purpose?: 'SALE' | 'RENTAL' | 'BOTH', includeHidden = false) {
        console.log('[commercialService] API Call: listProperties', { organizationId, projectId, purpose, includeHidden });

        const BASE_COLS = 'id, organization_id, project_id, parent_id, client_id, name, number, type, purpose, address, street, complement, neighborhood, city, state, zip_code, area, private_area, common_area, total_area, price, rental_price, current_price, initial_price, table_price, bedrooms, bathrooms, parking_spaces, status, specs, block, floor, typology, position_type, view_type, sun_orientation, features, images, visible_to_broker, visible_in_sales, created_at, updated_at';
        // Registro do imóvel (migration 20270842000001) + empresa dona
        // (20270826000002). São opcionais para a listagem: alimentam a minuta e a
        // resolução do locador.
        const REGISTRY_COLS = 'company_id, registration_number, registry_office, iptu_registration';

        const build = (cols: string) => {
            let q = supabase
                .from('commercial_properties')
                .select(cols)
                .order('name', { ascending: true });

            // `is not false` cobre NULL (linhas anteriores à migration) além de TRUE.
            if (!includeHidden) q = q.not('visible_in_sales', 'is', false);
            if (organizationId) q = q.eq('organization_id', organizationId);
            if (projectId) q = q.eq('project_id', projectId);
            if (purpose && purpose !== 'BOTH') q = q.eq('purpose', purpose);
            return q;
        };

        let { data, error } = await build(`${BASE_COLS}, ${REGISTRY_COLS}`);

        // Fallback: colunas de registro ainda não aplicadas no banco. Subir o
        // código antes da migration não pode derrubar a tela de imóveis inteira.
        if (error && (error as { code?: string }).code === '42703') {
            console.warn('[commercialService] Colunas de registro do imóvel ausentes — aplique as migrations 20270826000002 / 20270842000001. Listando sem elas.');
            const retry = await build(BASE_COLS);
            data = retry.data as any;
            error = retry.error;
        }

        if (error) throw error;
        return (data || []) as unknown as Property[];
    },

    async saveProperty(property: Partial<Property>) {
        // Enforce uppercase for block names
        if (property.block) {
            property.block = property.block.toUpperCase();
        }

        // Organização em cascata: uma unidade (com parent_id = edifício) SEMPRE
        // herda a organização do edifício-pai — que por sua vez veio do
        // Empreendimento. O edifício é a raiz local do estoque; deixar a unidade
        // pegar a org do seletor global do app é o que criava "mistura" (unidade
        // numa org, edifício/empreendimento em outra) — origem do bug do Corretor
        // vazio. Só deriva quando parent_id vem no payload (criação/movimentação de
        // unidade); update de campo solto não mexe em org. A trava do banco
        // (trigger BEFORE INSERT/UPDATE) é a rede de segurança contra qualquer
        // caminho que escape daqui.
        if (property.parent_id) {
            const { data: parent } = await supabase
                .from('commercial_properties')
                .select('organization_id')
                .eq('id', property.parent_id)
                .single();
            if (parent?.organization_id) {
                property = { ...property, organization_id: parent.organization_id };
            }
        }

        if (property.id) {
            const { data, error } = await supabase
                .from('commercial_properties')
                .update(property)
                .eq('id', property.id)
                .select()
                .single();

            if (error) throw error;
            return data as Property;
        } else {
            // Remover 'id' do payload de INSERT para garantir que o banco gere via DEFAULT gen_random_uuid()
            const { id: _ignoredId, ...insertPayload } = property;
            const { data, error } = await supabase
                .from('commercial_properties')
                .insert(insertPayload)
                .select()
                .single();

            if (error) throw error;
            return data as Property;
        }
    },

    async savePropertiesBatch(properties: Partial<Property>[]) {
        // Separar itens com ID (existentes → upsert) dos sem ID (novos → insert)
        // O upsert do Supabase não aceita misturar itens com e sem a coluna de conflito (id).
        // Itens sem 'id' passados no upsert geram null no payload JSON → viola NOT NULL.
        const toUpdate: any[] = [];
        const toInsert: any[] = [];

        for (const p of properties) {
            const { id, block, ...rest } = p;
            const entry: any = {
                ...rest,
                block: block ? block.toUpperCase() : block
            };

            if (id) {
                entry.id = id;
                toUpdate.push(entry);
            } else {
                // Não incluir 'id' → banco gera via DEFAULT gen_random_uuid()
                toInsert.push(entry);
            }
        }

        let allResults: Property[] = [];

        // 1. Upsert dos existentes (com id)
        if (toUpdate.length > 0) {
            const { data, error } = await supabase
                .from('commercial_properties')
                .upsert(toUpdate)
                .select();
            if (error) throw error;
            allResults = allResults.concat((data || []) as Property[]);
        }

        // 2. Insert dos novos (sem id — banco gera UUID automaticamente)
        if (toInsert.length > 0) {
            const { data, error } = await supabase
                .from('commercial_properties')
                .insert(toInsert)
                .select();
            if (error) throw error;
            allResults = allResults.concat((data || []) as Property[]);
        }

        return allResults;
    },

    async updatePropertiesBatch(ids: string[], updates: Partial<Property>) {
        const { data, error } = await supabase
            .from('commercial_properties')
            .update(updates)
            .in('id', ids)
            .select();

        if (error) throw error;
        return data as Property[];
    },

    /**
     * O que será destruído ao excluir esta property — para a tela poder avisar
     * ANTES, em vez de deixar vazar o erro cru de FK do Postgres.
     *
     * Contexto: NENHUMA das FKs que apontam para commercial_properties tem
     * cascade no banco real, apesar de o repo declarar que têm:
     *   • `commercial_properties.parent_id` (migration 20260226000001 diz CASCADE)
     *   • `commercial_deals.property_id`    (migration 20240219000000 diz CASCADE)
     * Ambas falham com 23503. Por isso a exclusão em cadeia é feita aqui, na
     * ordem de dependência, e não delegada ao banco.
     */
    async getPropertyDeleteImpact(id: string): Promise<{ children: number; deals: number }> {
        const { data: kids } = await supabase
            .from('commercial_properties')
            .select('id')
            .eq('parent_id', id);
        const childIds = (kids || []).map(k => k.id as string);

        const targets = [id, ...childIds];
        const dealIds = await this.dealIdsForProperties(targets);

        return { children: childIds.length, deals: dealIds.length };
    },

    /**
     * `cascade` só deve vir true depois de a tela ter mostrado o impacto e o
     * usuário ter confirmado — é irreversível e leva junto as negociações.
     *
     * Ordem de dependência (nenhuma FK cascateia de verdade, ver acima):
     *   1. negociações das properties alvo — via deleteDeal, que ESTORNA as
     *      parcelas no financeiro. Um DELETE direto aqui deixaria recebíveis
     *      órfãos, e deleteDeal ainda protege: lança se houver parcela PAGA.
     *   2. unidades filhas
     *   3. a própria property
     */
    async deleteProperty(id: string, cascade = false) {
        const targets = [id];

        if (cascade) {
            const { data: kids } = await supabase
                .from('commercial_properties')
                .select('id')
                .eq('parent_id', id);
            targets.push(...(kids || []).map(k => k.id as string));
        }

        // 1. Negociações (uma a uma, para reusar o estorno de parcelas).
        //    Inclui os contratos em que a unidade é apenas UMA das participantes.
        const dealIds = await commercialService.dealIdsForProperties(targets);
        for (const dealId of dealIds) {
            await commercialService.deleteDeal(dealId);
        }

        // 2. Unidades filhas
        if (cascade && targets.length > 1) {
            const { error: childErr } = await supabase
                .from('commercial_properties')
                .delete()
                .eq('parent_id', id);
            if (childErr) throw new Error(translatePropertyDeleteError(childErr));
        }

        // 3. A property
        const { error } = await supabase
            .from('commercial_properties')
            .delete()
            .eq('id', id);

        if (error) throw new Error(translatePropertyDeleteError(error));
    },

    /**
     * `propertyId` filtra pelas negociações que CONTÊM aquela unidade — não só as
     * em que ela é a principal. Num contrato "apto + vaga", pedir os contratos da
     * vaga tem que devolver o contrato inteiro.
     */
    async listDeals(propertyId?: string) {
        let dealIdsFilter: string[] | null = null;
        if (propertyId && !dealUnitsTableMissing) {
            const { data: links, error: linkErr } = await supabase
                .from('commercial_deal_units')
                .select('deal_id')
                .eq('property_id', propertyId);
            if (linkErr) noteDealUnitsError(linkErr);
            dealIdsFilter = Array.from(new Set((links || []).map(l => l.deal_id as string)));
        }

        const buildQuery = (withUnits: boolean) => {
            let q = supabase
                .from('commercial_deals')
                .select(withUnits
                    ? '*, units:commercial_deal_units(id, deal_id, property_id, organization_id, value, is_primary)'
                    : '*')
                .order('date', { ascending: false });
            if (propertyId) {
                // Cobre tanto os contratos multi-unidade (via deal_units) quanto os
                // legados que só têm property_id e nunca foram materializados.
                q = (withUnits && dealIdsFilter && dealIdsFilter.length > 0)
                    ? q.or(`property_id.eq.${propertyId},id.in.(${dealIdsFilter.join(',')})`)
                    : q.eq('property_id', propertyId);
            }
            return q;
        };

        // `as any` porque o select é montado dinamicamente (com ou sem o join de
        // unidades) e o parser de tipos do supabase-js não resolve string variável.
        let { data, error } = await (buildQuery(!dealUnitsTableMissing) as any);
        if (error && noteDealUnitsError(error)) {
            ({ data, error } = await (buildQuery(false) as any));
        }
        if (error) throw error;
        return ((data || []) as PropertyDeal[]).map(d => ({ ...d, units: dealUnitsOf(d) }));
    },

    /**
     * IDs das negociações que envolvem qualquer uma das properties dadas, seja
     * como unidade principal (`commercial_deals.property_id`) ou como item do
     * contrato (`commercial_deal_units`). Deduplicado.
     */
    async dealIdsForProperties(propertyIds: string[]): Promise<string[]> {
        if (!propertyIds.length) return [];
        const ids = new Set<string>();

        const { data: direct } = await supabase
            .from('commercial_deals')
            .select('id')
            .in('property_id', propertyIds);
        (direct || []).forEach(d => ids.add(d.id as string));

        if (!dealUnitsTableMissing) {
            const { data: links, error } = await supabase
                .from('commercial_deal_units')
                .select('deal_id')
                .in('property_id', propertyIds);
            if (error) noteDealUnitsError(error);
            (links || []).forEach(l => ids.add(l.deal_id as string));
        }

        return Array.from(ids);
    },

    /** Nomes das unidades, na ordem dada — usado nos rótulos ("Apto 101 + Vaga 12"). */
    async propertyNames(propertyIds: string[]): Promise<Record<string, string>> {
        if (!propertyIds.length) return {};
        const { data } = await supabase
            .from('commercial_properties')
            .select('id, name')
            .in('id', propertyIds);
        const map: Record<string, string> = {};
        (data || []).forEach(p => { map[p.id as string] = (p.name as string) || ''; });
        return map;
    },

    /**
     * Substitui a lista de unidades de uma negociação: apaga as que saíram e
     * grava/atualiza as atuais. Devolve as properties REMOVIDAS, para que o
     * chamador possa devolvê-las ao estoque (status AVAILABLE).
     */
    async syncDealUnits(dealId: string, organizationId: string | undefined, units: DealUnit[]): Promise<string[]> {
        if (dealUnitsTableMissing) return [];

        const { data: existing, error: readErr } = await supabase
            .from('commercial_deal_units')
            .select('id, property_id')
            .eq('deal_id', dealId);
        if (readErr && noteDealUnitsError(readErr)) return [];

        const keepIds = new Set(units.map(u => u.property_id));
        const removed = (existing || [])
            .filter(e => !keepIds.has(e.property_id as string))
            .map(e => e.property_id as string);

        if (removed.length > 0) {
            await supabase
                .from('commercial_deal_units')
                .delete()
                .eq('deal_id', dealId)
                .in('property_id', removed);
        }

        if (units.length > 0) {
            const rows = units.map(u => ({
                deal_id: dealId,
                property_id: u.property_id,
                organization_id: organizationId || u.organization_id || null,
                value: Number(u.value) || 0,
                is_primary: !!u.is_primary,
            }));
            const { error } = await supabase
                .from('commercial_deal_units')
                .upsert(rows, { onConflict: 'deal_id,property_id' });
            if (error) {
                if (noteDealUnitsError(error)) return [];
                console.error('[COMMERCIAL SERVICE] Erro ao sincronizar unidades do contrato:', error);
                throw error;
            }
        }

        return removed;
    },

    /**
     * REGRA: Uma Unidade, Um Contrato Ativo — agora aplicada ao CONJUNTO de
     * unidades do contrato, não a uma só. `excludeDealId` deixa o próprio
     * contrato de fora ao editar.
     *
     * `checkStatus` liga a verificação do estoque (usada ao avançar para RESERVA):
     * a unidade precisa estar AVAILABLE ou RESERVED.
     *
     * A mensagem NOMEIA a unidade em conflito — com N unidades, "esta unidade"
     * não diria ao usuário qual delas travou o contrato.
     */
    async assertUnitsAvailable(propertyIds: string[], excludeDealId?: string, checkStatus = false) {
        if (!propertyIds.length) return;

        const names = await this.propertyNames(propertyIds);
        const label = (id: string) => names[id] || 'unidade';

        if (checkStatus) {
            const { data: props } = await supabase
                .from('commercial_properties')
                .select('id, status')
                .in('id', propertyIds);
            const blocked = (props || []).filter(p => p.status !== 'AVAILABLE' && p.status !== 'RESERVED');
            if (blocked.length > 0) {
                const list = blocked.map(p => `${label(p.id as string)} (${p.status})`).join(', ');
                throw new Error(`Unidade(s) não disponível(is) para reserva: ${list}. Verifique se já foram vendidas ou alugadas.`);
            }
        }

        // Conflitos por unidade principal (legado) e por item de contrato.
        const conflicts = new Map<string, string>(); // propertyId → dealId
        const register = (propertyId: string, dealId: string) => {
            if (excludeDealId && dealId === excludeDealId) return;
            if (!conflicts.has(propertyId)) conflicts.set(propertyId, dealId);
        };

        const { data: directDeals } = await supabase
            .from('commercial_deals')
            .select('id, property_id, status')
            .in('property_id', propertyIds)
            .neq('status', 'CANCELLED');
        (directDeals || []).forEach(d => register(d.property_id as string, d.id as string));

        let links: { deal_id: string; property_id: string }[] = [];
        if (!dealUnitsTableMissing) {
            const { data, error } = await supabase
                .from('commercial_deal_units')
                .select('deal_id, property_id')
                .in('property_id', propertyIds);
            if (error) noteDealUnitsError(error);
            links = (data || []) as { deal_id: string; property_id: string }[];
        }
        const linkDealIds = Array.from(new Set((links || []).map(l => l.deal_id as string)))
            .filter(id => !excludeDealId || id !== excludeDealId);
        if (linkDealIds.length > 0) {
            const { data: activeDeals } = await supabase
                .from('commercial_deals')
                .select('id, status')
                .in('id', linkDealIds)
                .neq('status', 'CANCELLED');
            const activeIds = new Set((activeDeals || []).map(d => d.id as string));
            (links || []).forEach(l => {
                if (activeIds.has(l.deal_id as string)) register(l.property_id as string, l.deal_id as string);
            });
        }

        if (conflicts.size > 0) {
            const list = Array.from(conflicts.keys()).map(label).join(', ');
            throw new Error(
                `Já existe contrato ativo para: ${list}. Cancele o contrato atual (ou remova a unidade dele) antes de prosseguir.`
            );
        }
    },

    async saveDeal(deal: Partial<PropertyDeal>) {
        let result: PropertyDeal;

        // As unidades do contrato NÃO são coluna de commercial_deals — vivem em
        // commercial_deal_units. Extraídas antes de qualquer coisa; se vazassem no
        // payload, o PostgREST rejeitaria ("Could not find the 'units' column").
        const units = dealUnitsOf(deal);
        const primaryUnit = units.find(u => u.is_primary) || units[0];

        // custom_installments é gravado como coluna normal (dbPayload abaixo) E
        // usado mais adiante para acionar o sync com o cofre financeiro (Contas a
        // Receber) — este segundo uso só acontece quando o status está em
        // FINANCIAL_STATUSES (propositalmente: uma Proposta em IN_NEGOTIATION não
        // pode lançar recebível). Antes a coluna era removida do payload do banco
        // e só sobrevivia via aquele sync — então o Plano de Pagamento de uma
        // negociação ainda em Proposta nunca era persistido e sumia ao sair e
        // voltar. Persistir aqui também garante que o rascunho sobreviva
        // independente do status.
        const dbPayload: Partial<PropertyDeal> = { ...deal };
        delete dbPayload.units;

        // Quem manda é a lista de unidades: property_id é a principal e value é a
        // SOMA. Contratos legados (1 unidade) caem no mesmo caminho sem mudança de
        // comportamento, porque dealUnitsOf sintetiza a lista a partir do próprio
        // property_id/value.
        if (primaryUnit) {
            dbPayload.property_id = primaryUnit.property_id;
            dbPayload.value = Number(dealUnitsTotal(units).toFixed(2));
        }

        Object.keys(dbPayload).forEach(key => {
            // Campos transitórios de UI (ex: _clientName, _propertyName, injetados
            // por RentalsModule.sortedDeals para ordenação/exibição) não são colunas
            // de commercial_deals — se vazarem no update, o PostgREST rejeita com
            // "Could not find the '_clientName' column ... in the schema cache".
            if (key.startsWith('_')) {
                delete dbPayload[key as keyof typeof dbPayload];
                return;
            }
            if (dbPayload[key as keyof typeof dbPayload] === "") {
                delete dbPayload[key as keyof typeof dbPayload];
            }
        });

        // Force organization_id from property if available to ensure consistency
        // This prevents deals being saved in the wrong organization (like Alpa Principal instead of Alpa Projetos)
        if (dbPayload.property_id) {
            try {
                const { data: propData } = await supabase.from('commercial_properties').select('organization_id').eq('id', dbPayload.property_id).single();
                if (propData && propData.organization_id) {
                    dbPayload.organization_id = propData.organization_id;
                }
            } catch (e) {
                console.error('[COMMERCIAL SERVICE] Error fetching property org for consistency:', e);
            }
        }

        if (deal.id) {
            // 1.1 — Ao avançar para RESERVA (ou WAITING_PAYMENT legacy), verifica se a unidade
            // ainda está disponível (outro deal pode ter reservado no intervalo)
            if ((dbPayload.status === 'RESERVA' || dbPayload.status === 'WAITING_PAYMENT') && units.length > 0) {
                await this.assertUnitsAvailable(units.map(u => u.property_id), deal.id, true);
            }

            const { data, error } = await supabase
                .from('commercial_deals')
                .update(dbPayload)
                .eq('id', deal.id)
                .select()
                .single();

            if (error) {
                console.error('[COMMERCIAL SERVICE] Error updating deal:', error);
                throw error;
            }
            result = data as PropertyDeal;
        } else {
            // REGRA: Unicidade de Unidade (Uma Unidade, Um Contrato Ativo) —
            // aplicada a TODAS as unidades do contrato.
            if (units.length > 0 && (dbPayload.type === 'SALE' || dbPayload.type === 'RENTAL')) {
                await this.assertUnitsAvailable(units.map(u => u.property_id));
            }

            // Código sequencial de 3 dígitos (001, 002, ...) por organização, apenas
            // para negociações de Venda de Ativos (type='SALE'). Atribuído na criação
            // e persistido em commercial_deals.code — estável, nunca reaproveitado.
            // O try/catch protege o insert caso a migration da coluna ainda não tenha
            // sido aplicada (o PostgREST rejeitaria `code` como coluna desconhecida).
            if (dbPayload.type === 'SALE' && !dbPayload.code) {
                try {
                    let codeQuery = supabase
                        .from('commercial_deals')
                        .select('code')
                        .eq('type', 'SALE');
                    if (dbPayload.organization_id) {
                        codeQuery = codeQuery.eq('organization_id', dbPayload.organization_id);
                    }
                    const { data: codeRows, error: codeErr } = await codeQuery;
                    if (codeErr) throw codeErr;
                    const maxCode = (codeRows || []).reduce((max, row) => {
                        const n = parseInt((row as { code?: string }).code || '', 10);
                        return Number.isNaN(n) ? max : Math.max(max, n);
                    }, 0);
                    dbPayload.code = String(maxCode + 1).padStart(3, '0');
                } catch (e) {
                    console.warn('[COMMERCIAL SERVICE] Não foi possível gerar código sequencial (coluna code ausente?):', e);
                    delete dbPayload.code;
                }
            }

            const { data, error } = await supabase
                .from('commercial_deals')
                .insert(dbPayload)
                .select()
                .single();

            if (error) {
                console.error('[COMMERCIAL SERVICE] Error inserting deal:', error);
                throw error;
            }
            result = data as PropertyDeal;
        }

        // Persiste a lista de unidades do contrato. As que SAÍRAM voltam ao
        // estoque logo abaixo — sem isso, remover uma unidade de um contrato
        // ativo a deixaria eternamente "Locada" sem contrato nenhum.
        let removedPropertyIds: string[] = [];
        if (units.length > 0) {
            try {
                removedPropertyIds = await this.syncDealUnits(
                    result.id,
                    result.organization_id || dbPayload.organization_id,
                    units
                );
            } catch (e) {
                console.error('[COMMERCIAL SERVICE] Falha ao gravar unidades do contrato:', e);
            }
        }
        if (removedPropertyIds.length > 0) {
            await supabase
                .from('commercial_properties')
                .update({ status: 'AVAILABLE', client_id: null })
                .in('id', removedPropertyIds);
            console.log(`[COMMERCIAL SERVICE] ${removedPropertyIds.length} unidade(s) removida(s) do contrato voltaram a AVAILABLE`);
        }

        result.units = units;

        // Estágios que reservam a unidade (impede negociação duplicada da mesma unidade).
        // Inclui PENDING/APPROVED: qualquer negociação ativa, mesmo sem contrato formal
        // gerado ainda, trava a unidade — decisão do usuário 2026-07-19 (unidade com
        // negociação pendente aparecia como "Disponível" em Gestão de Unidades).
        const RESERVA_STATUSES = ['PENDING', 'APPROVED', 'WAITING_PAYMENT', 'RESERVA', 'CONTRATO', 'ASSINATURA'];
        // Estágios ATIVOS do negócio (unidade reservada, tributos gerados).
        //
        // ⚠️ Esta lista NÃO gera mais lançamento em Contas a Receber. Até
        // 2026-08-01 ela se chamava FINANCIAL_STATUSES e publicava as parcelas
        // automaticamente: bastava salvar em PENDING/RESERVA para o plano de
        // pagamento — que serve para montar a PROPOSTA — virar recebível de um
        // negócio que ainda não fechou. Era a maior fonte de confusão do módulo.
        // Quem cria cobrança é o botão "Gerar parcelas" da aba Parcelas
        // (`dealReceivablesService.gerar`), com confirmação. NÃO reintroduza
        // nenhum sync financeiro aqui.
        const ACTIVE_STATUSES = ['COMPLETED', ...RESERVA_STATUSES];

        // Estágio ativo: atualiza unidade e tributos. Financeiro NÃO — ver acima.
        if (ACTIVE_STATUSES.includes(result.status)) {
            try {
                // Atualizar status do imóvel em qualquer estágio ativo (inclusive PENDING).
                // TODAS as unidades do contrato mudam de estado, não só a principal.
                // (O trigger fn_propagate_commercial_status_to_unit replica cada uma
                //  para empreendimento_units.rental_status automaticamente.)
                if (units.length > 0 && result.client_id && result.type !== 'SERVICE'
                    && (result.status === 'COMPLETED' || RESERVA_STATUSES.includes(result.status))) {
                    const propertyUpdates: Partial<Property> = {
                        status: result.status === 'COMPLETED'
                            ? (result.type === 'SALE' ? PropertyStatus.SOLD : PropertyStatus.RENTED)
                            : PropertyStatus.RESERVED,
                        client_id: result.client_id
                    };
                    for (const u of units) {
                        await this.saveProperty({ id: u.property_id, ...propertyUpdates });
                    }
                    console.log(`[COMMERCIAL SERVICE] ${units.length} unidade(s) atualizada(s) para ${propertyUpdates.status} (Deal: ${result.status})`);
                }

                // Fallback: PostgREST cache delay might strip new columns from the RETURNING clause.
                const finalDealToSync = {
                    ...result,
                    payment_method: deal.payment_method || result.payment_method,
                    down_payment: deal.down_payment !== undefined ? deal.down_payment : result.down_payment,
                    installments: deal.installments || result.installments,
                    custom_installments: deal.custom_installments,
                    linked_project_id: deal.linked_project_id || (result as any).linked_project_id
                };

                // 0.1 — passa organization_id explicitamente para evitar vazamento cross-tenant
                const orgId = result.organization_id || dbPayload.organization_id;
                if (!orgId) throw new Error('[COMMERCIAL SERVICE] organization_id ausente.');

                // ⚠️ NÃO chame syncDealToFinance / syncFinancialData aqui.
                // Salvar a negociação não cria parcela em Contas a Receber —
                // quem cria é o botão "Gerar parcelas" da aba
                // Parcelas (dealReceivablesService.gerar).

                // Tributos a Pagar: gera/atualiza os tributos (IRRF/PIS/COFINS/CSLL…)
                // deste negócio de Venda de Ativo/Locação a partir de tax_settings.
                try {
                    await taxPayableService.generateForDeal(finalDealToSync, orgId);
                } catch (e) {
                    console.error('[COMMERCIAL SERVICE] Falha ao gerar tributos a pagar:', e);
                }
            } catch (err) {
                console.error('[COMMERCIAL SERVICE] Sync or Property update failed:', err);
            }
        } else if (result.status === 'CANCELLED') {
            // 1.3 — Distrato: reverte unidade + estorna parcelas do vault financeiro
            // Garante data de cancelamento mesmo que o cliente não a tenha enviado
            if (!result.cancellation_date) {
                await supabase.from('commercial_deals')
                    .update({ cancellation_date: new Date().toISOString() })
                    .eq('id', result.id);
            }
            const cancelOrgId = result.organization_id || dbPayload.organization_id;
            await Promise.allSettled([
                // (a) Libera TODAS as unidades do contrato no espelho
                units.length > 0
                    ? supabase.from('commercial_properties')
                        .update({ status: 'AVAILABLE', client_id: null })
                        .in('id', units.map(u => u.property_id))
                        .then(() => console.log(`[COMMERCIAL SERVICE] ${units.length} unidade(s) revertida(s) para AVAILABLE (distrato)`))
                    : Promise.resolve(),
                // (b) Estorna parcelas pendentes do vault legado (ignora PAID)
                cancelOrgId
                    ? commercialFinanceService.deleteDealInstallments(result.id, cancelOrgId)
                        .then(() => console.log(`[COMMERCIAL SERVICE] Installments reversed for deal ${result.id} (distrato)`))
                    : Promise.resolve(),
                // (c) Estorna tributos a pagar pendentes deste negócio
                cancelOrgId
                    ? taxPayableService.removeForDeal(result.id, cancelOrgId)
                    : Promise.resolve(),
            ]);
        } else if (result.status === 'IN_NEGOTIATION') {
            // Negociação recuou de um estágio ativo (ex: Aprovação → Proposta,
            // transição permitida) de volta para Proposta. IN_NEGOTIATION não
            // está em ACTIVE_STATUSES nem é CANCELLED, então sem este branch a
            // unidade ficava travada em RESERVED para sempre — Contratos
            // mostrava "Proposta" e Unidades continuava mostrando "Reservado".
            // Sem os efeitos de distrato (sem data de cancelamento, sem
            // estorno de parcela/tributo): a negociação não foi cancelada, só
            // recuou de estágio.
            if (units.length > 0) {
                await supabase.from('commercial_properties')
                    .update({ status: 'AVAILABLE', client_id: null })
                    .in('id', units.map(u => u.property_id));
                console.log(`[COMMERCIAL SERVICE] ${units.length} unidade(s) revertida(s) para AVAILABLE (negociação voltou para Proposta)`);
            }
        }

        return result;
    },

    async deleteDeal(id: string) {
        // 1. Fetch deal to get details for cleanup
        const { data: deal } = await supabase
            .from('commercial_deals')
            .select('*')
            .eq('id', id)
            .single();

        if (deal) {
            // 2. Cleanup installments (this will throw if any are PAID)
            await commercialFinanceService.deleteDealInstallments(id, deal.organization_id);

            // 2b. Remove tributos a pagar pendentes deste negócio
            await taxPayableService.removeForDeal(id, deal.organization_id);

            // Revert property status to AVAILABLE — todas as unidades do contrato.
            let unitRows: { property_id: string }[] = [];
            if (!dealUnitsTableMissing) {
                const { data, error } = await supabase
                    .from('commercial_deal_units')
                    .select('property_id')
                    .eq('deal_id', id);
                if (error) noteDealUnitsError(error);
                unitRows = (data || []) as { property_id: string }[];
            }
            const propertyIds = Array.from(new Set([
                ...(unitRows || []).map(u => u.property_id as string),
                ...(deal.property_id ? [deal.property_id as string] : []),
            ]));
            if (propertyIds.length > 0) {
                await supabase.from('commercial_properties')
                    .update({ status: 'AVAILABLE', client_id: null })
                    .in('id', propertyIds);
            }
        }

        // 3. Delete the deal
        const { error } = await supabase
            .from('commercial_deals')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async uploadPropertyImage(propertyId: string, file: File) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${propertyId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('properties')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('properties')
            .getPublicUrl(filePath);

        return publicUrl;
    },

    async updateUnitsAddress(parentId: string, updates: Partial<Property>) {
        const { error } = await supabase
            .from('commercial_properties')
            .update(updates)
            .eq('parent_id', parentId);

        if (error) throw error;
    },

    async deleteUnitsByParentId(parentId: string) {
        const { error } = await supabase
            .from('commercial_properties')
            .delete()
            .eq('parent_id', parentId);

        if (error) throw error;
    }
};
