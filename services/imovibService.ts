import { supabase } from '../lib/supabase';
import {
    ImovibStudy, ImovibStudyInsert, ImovibStudyUpdate,
    ImovibBlock, ImovibBlockInsert, ImovibBlockUpdate,
    ImovibUnit, ImovibUnitInsert, ImovibUnitUpdate,
    ImovibCapexItem, ImovibCapexItemInsert, ImovibUnitInstance,
} from '../types';
import { fetchAllPages } from '../lib/supabasePaginate';
import {
    derivarEstruturaDoEmpreendimento, blocoSemLinha, TorreDaEstrutura, UnidadeDaEstrutura,
} from '../utils/imovibEstrutura';

// `base` existe desde aplicar_20271012100000_imovib_capex_base.sql — a migration
// tem de estar no banco ANTES de publicar código que lê esta lista (42703).
const CAPEX_COLS = 'id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at';

// Só o que o motor lê do espelho para o VGV (computeImovibMath).
const INSTANCIA_VGV_COLS = 'id, study_id, block_id, unit_id, name, floor, private_area, position_type, sun_orientation, price, status, created_at, updated_at';

// ── Estrutura lida do Empreendimento (plano 2026-10-19-imovib-premissas-planta-inteligente.md)

interface EmpreendimentoDaEstrutura {
    id: string;
    name: string;
    organization_id: string;
    imovib_study_id: string;
    blueprint_study_id: string | null;
    terreno_area: number | null;
}

interface VinculoDaEstrutura {
    empreendimento: EmpreendimentoDaEstrutura;
    torres: TorreDaEstrutura[];
    unidades: UnidadeDaEstrutura[];
}

/**
 * Empreendimento vinculado de cada estudo (`empreendimentos.imovib_study_id`), com
 * as torres e unidades — o que a Planta Inteligente envia ao empreendimento.
 * Custo fixo de 3 consultas, qualquer que seja o número de estudos. Falha PROPAGA:
 * cair para a estrutura antiga em silêncio mostraria outro VGV sem aviso.
 *
 * Empreendimento de OUTRA organização não vale como vínculo — a mesma blindagem do
 * imovibAdapter e do writeBackImovib.
 */
async function carregarVinculos(studies: { id: string; organization_id?: string | null }[]): Promise<Map<string, VinculoDaEstrutura>> {
    const out = new Map<string, VinculoDaEstrutura>();
    if (studies.length === 0) return out;
    const orgDoEstudo = new Map(studies.map(s => [s.id, s.organization_id ?? null]));

    const { data: emps, error: empError } = await supabase
        .from('empreendimentos')
        .select('id, name, organization_id, imovib_study_id, blueprint_study_id, terreno_area')
        .in('imovib_study_id', studies.map(s => s.id))
        .order('created_at', { ascending: true });
    if (empError) throw new Error(`Failed to fetch linked empreendimentos: ${empError.message}`);

    // Sem UNIQUE na coluna: com dois apontando para o mesmo estudo, vale o mais antigo.
    const empPorEstudo = new Map<string, EmpreendimentoDaEstrutura>();
    for (const e of (emps || []) as EmpreendimentoDaEstrutura[]) {
        if (empPorEstudo.has(e.imovib_study_id)) continue;
        if (e.organization_id !== orgDoEstudo.get(e.imovib_study_id)) continue;
        empPorEstudo.set(e.imovib_study_id, e);
    }
    if (empPorEstudo.size === 0) return out;

    const empIds = [...empPorEstudo.values()].map(e => e.id);
    const { data: torres, error: torreError } = await fetchAllPages<TorreDaEstrutura & { empreendimento_id: string }>(() =>
        supabase
            .from('empreendimento_towers')
            .select('id, empreendimento_id, name, imovib_block_id, construction_cost_sqm, sales_price_sqm, sort_order')
            .in('empreendimento_id', empIds)
            .order('id', { ascending: true }) as any);
    if (torreError) throw new Error(`Failed to fetch empreendimento towers: ${(torreError as Error).message}`);

    const torreIds = torres.map(t => t.id);
    let unidades: UnidadeDaEstrutura[] = [];
    if (torreIds.length > 0) {
        const r = await fetchAllPages<UnidadeDaEstrutura>(() =>
            supabase
                .from('empreendimento_units')
                .select('id, tower_id, typology, private_area, common_area, price, is_vendavel')
                .in('tower_id', torreIds)
                .order('id', { ascending: true }) as any);
        if (r.error) throw new Error(`Failed to fetch empreendimento units: ${(r.error as Error).message}`);
        unidades = r.data;
    }

    for (const [studyId, empreendimento] of empPorEstudo) {
        const daObra = torres.filter(t => t.empreendimento_id === empreendimento.id);
        const ids = new Set(daObra.map(t => t.id));
        out.set(studyId, { empreendimento, torres: daObra, unidades: unidades.filter(u => ids.has(u.tower_id)) });
    }
    return out;
}

/** Põe no estudo a estrutura que o motor lê: a do empreendimento vinculado, ou a antiga do estudo. */
function aplicarEstrutura(study: ImovibStudy, blocosDoEstudo: ImovibBlock[], vinculo: VinculoDaEstrutura | undefined): void {
    if (!vinculo) {
        study.blocks = blocosDoEstudo;
        study.estrutura = { origem: 'estudo', torres: 0, unidades: 0, blocos_fora_do_calculo: [] };
        return;
    }
    const d = derivarEstruturaDoEmpreendimento(study.id, vinculo.torres, vinculo.unidades, blocosDoEstudo);
    study.blocks = d.blocos;
    study.estrutura = {
        origem: 'empreendimento',
        empreendimento_id: vinculo.empreendimento.id,
        empreendimento_nome: vinculo.empreendimento.name,
        blueprint_study_id: vinculo.empreendimento.blueprint_study_id,
        terreno_area: vinculo.empreendimento.terreno_area,
        torres: vinculo.torres.length,
        unidades: d.unidades,
        blocos_fora_do_calculo: d.blocosForaDoCalculo.map(b => b.name),
    };
}

export const imovibService = {
    async getStudies(organizationId?: string): Promise<ImovibStudy[]> {
        // Campos numéricos de cenário omitidos na lista (carregados em getStudyById)
        let query = supabase
            .from('imovib_studies')
            .select('id, organization_id, name, cnpj, developer, developer_name, manager, version, segment, sub_classification, phase, development_modality, zoning, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching IMOVIB studies:', error);
            throw new Error(`Failed to fetch IMOVIB studies: ${error.message}`);
        }

        return data || [];
    },

    /**
     * Lista os estudos JÁ com blocos+unidades e todos os campos escalares que o
     * motor financeiro (computeImovibMath) consome — para a listagem calcular
     * VGV/VPL/TIR/margem por linha sem abrir estudo por estudo.
     *
     * Custo fixo de 5 consultas (3 níveis) independentemente do número de
     * estudos: estudos → [blocos, rubricas do CAPEX, espelho de vendas] em
     * paralelo (in study_id) → unidades (in block_id). O nesting é remontado em
     * memória, mesmo padrão de getStudyById. As rubricas entram no cálculo desde
     * 2026-10-12 (modo Completo) — sem elas a listagem mostraria VPL/TIR
     * diferentes do Resumo do mesmo estudo.
     */
    async getStudiesWithMetrics(organizationId?: string | null): Promise<ImovibStudy[]> {
        let query = supabase
            .from('imovib_studies')
            // metadados da listagem + todos os escalares lidos por computeImovibMath
            .select('id, organization_id, name, cnpj, developer, developer_name, manager, version, segment, sub_classification, phase, development_modality, zoning, created_at, updated_at, land_cost, capex_mode, capex_simplified_cost_sqm, capex_simplified_area_sqm, construction_duration_months, sales_duration_months, construction_start_month, sales_start_month, inflation_rate, discount_rate, tax_rate, brokerage_fee, financing_percent, financing_rate_annual, funding_debt_percent, swap_physical_percent, swap_financial_percent, default_rate_percent, cancellation_rate_percent, revenue_downpayment_percent, revenue_construction_percent, revenue_handover_percent')
            .order('created_at', { ascending: false });

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data: studies, error } = await query;

        if (error) {
            console.error('Error fetching IMOVIB studies with metrics:', error);
            throw new Error(`Failed to fetch IMOVIB studies: ${error.message}`);
        }

        if (!studies || studies.length === 0) return [];

        const studyIds = studies.map(s => s.id);

        const [{ data: blocks, error: blocksError }, { data: capex, error: capexError }, { data: instancias, error: instError }] = await Promise.all([
            supabase
                .from('imovib_blocks')
                .select('id, study_id, name, construction_cost_sqm, sales_price_sqm, created_at, updated_at')
                .in('study_id', studyIds)
                .order('created_at', { ascending: true }),
            supabase
                .from('imovib_capex_items')
                .select(CAPEX_COLS)
                .in('study_id', studyIds)
                .order('created_at', { ascending: true }),
            // Espelho de vendas: o VGV do bloco sai dele quando existe.
            supabase
                .from('imovib_unit_instances')
                .select(INSTANCIA_VGV_COLS)
                .in('study_id', studyIds),
        ]);

        if (instError) {
            console.error('Error fetching IMOVIB unit instances in batch:', instError);
            throw new Error(`Failed to fetch IMOVIB unit instances: ${instError.message}`);
        }

        if (capexError) {
            console.error('Error fetching IMOVIB CAPEX items in batch:', capexError);
            throw new Error(`Failed to fetch IMOVIB CAPEX items: ${capexError.message}`);
        }

        if (blocksError) {
            console.error('Error fetching IMOVIB blocks in batch:', blocksError);
            throw new Error(`Failed to fetch IMOVIB blocks: ${blocksError.message}`);
        }

        let units: ImovibUnit[] = [];
        const blockIds = (blocks || []).map(b => b.id);
        if (blockIds.length > 0) {
            const { data: unitsData, error: unitsError } = await supabase
                .from('imovib_units')
                .select('id, block_id, name, quantity, private_area, common_area, pavimentos, is_vendavel, created_at, updated_at')
                .in('block_id', blockIds)
                .order('created_at', { ascending: true });

            if (unitsError) {
                console.error('Error fetching IMOVIB units in batch:', unitsError);
                throw new Error(`Failed to fetch IMOVIB units: ${unitsError.message}`);
            }
            units = unitsData || [];
        }

        const blocksByStudy = new Map<string, ImovibBlock[]>();
        (blocks || []).forEach(b => {
            const withUnits = { ...b, units: units.filter(u => u.block_id === b.id) };
            const arr = blocksByStudy.get(b.study_id) || [];
            arr.push(withUnits);
            blocksByStudy.set(b.study_id, arr);
        });

        const capexByStudy = new Map<string, ImovibCapexItem[]>();
        ((capex || []) as ImovibCapexItem[]).forEach(c => {
            const arr = capexByStudy.get(c.study_id) || [];
            arr.push(c);
            capexByStudy.set(c.study_id, arr);
        });

        const instByStudy = new Map<string, ImovibUnitInstance[]>();
        ((instancias || []) as ImovibUnitInstance[]).forEach(i => {
            const arr = instByStudy.get(i.study_id) || [];
            arr.push(i);
            instByStudy.set(i.study_id, arr);
        });

        const vinculos = await carregarVinculos(studies);

        return studies.map(s => {
            const study = {
                ...s,
                capex_items: capexByStudy.get(s.id) || [],
                unit_instances: instByStudy.get(s.id) || [],
            } as ImovibStudy;
            aplicarEstrutura(study, blocksByStudy.get(s.id) || [], vinculos.get(s.id));
            return study;
        });
    },

    async getStudyById(id: string, includeDetails: boolean = false): Promise<ImovibStudy | null> {
        const { data: study, error } = await supabase
            .from('imovib_studies')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error(`Error fetching IMOVIB study ${id}:`, error);
            throw new Error(`Failed to fetch IMOVIB study: ${error.message}`);
        }

        if (study && includeDetails) {
            // Blocos/tipologias e CAPEX: falha aqui PROPAGA, como no espelho logo
            // abaixo. Antes cada leitura tinha um try/catch que devolvia [] — sem
            // blocos o VGV e o custo de obra caíam a zero, sem rubricas o CAPEX
            // sumia do cálculo, e a tela mostrava esses números como se fossem
            // reais, sem nenhum aviso. Quem chama (ImovibDetailView) mostra o erro.
            const { data: blocks, error: blocksError } = await supabase
                .from('imovib_blocks')
                .select('id, study_id, name, construction_cost_sqm, sales_price_sqm, created_at, updated_at')
                .eq('study_id', id)
                .order('created_at', { ascending: true });

            if (blocksError) {
                console.error('Error loading study blocks:', blocksError);
                throw new Error(`Failed to fetch study blocks: ${blocksError.message}`);
            }

            if (blocks && blocks.length > 0) {
                const blockIds = blocks.map(b => b.id);
                const { data: units, error: unitsError } = await supabase
                    .from('imovib_units')
                    .select('id, block_id, name, quantity, private_area, common_area, pavimentos, is_vendavel, created_at, updated_at')
                    .in('block_id', blockIds)
                    .order('created_at', { ascending: true });

                if (unitsError) {
                    console.error('Error loading study units:', unitsError);
                    throw new Error(`Failed to fetch study units: ${unitsError.message}`);
                }

                study.blocks = blocks.map(b => ({
                    ...b,
                    units: units ? units.filter(u => u.block_id === b.id) : []
                }));
            } else {
                study.blocks = [];
            }

            // A estrutura do empreendimento vinculado substitui a do estudo (Planta Inteligente).
            const vinculos = await carregarVinculos([study]);
            aplicarEstrutura(study, study.blocks || [], vinculos.get(study.id));

            // Fetch CAPEX Items
            const { data: capex, error: capexError } = await supabase
                .from('imovib_capex_items')
                .select(CAPEX_COLS)
                .eq('study_id', id)
                .order('category', { ascending: true })
                .order('created_at', { ascending: true });

            if (capexError) {
                console.error('Error loading study CAPEX items:', capexError);
                throw new Error(`Failed to fetch CAPEX items: ${capexError.message}`);
            }
            study.capex_items = capex || [];

            // Espelho de vendas: o VGV do bloco sai dele quando existe. Falha aqui
            // PROPAGA — engolir faria o VGV cair em silêncio para preço/m².
            const { data: instancias, error: instError } = await supabase
                .from('imovib_unit_instances')
                .select(INSTANCIA_VGV_COLS)
                .eq('study_id', id);
            if (instError) throw new Error(`Failed to fetch unit instances: ${instError.message}`);
            study.unit_instances = (instancias || []) as ImovibUnitInstance[];
        }

        return study;
    },

    async createStudy(study: ImovibStudyInsert): Promise<ImovibStudy> {
        const { data, error } = await supabase
            .from('imovib_studies')
            .insert(study)
            .select()
            .single();

        if (error) {
            console.error('Error creating IMOVIB study:', error);
            throw new Error(`Failed to create IMOVIB study: ${error.message}`);
        }

        return data;
    },

    async updateStudy(id: string, updates: ImovibStudyUpdate): Promise<ImovibStudy> {
        const { data, error } = await supabase
            .from('imovib_studies')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error(`Error updating IMOVIB study ${id}:`, error);
            throw new Error(`Failed to update IMOVIB study: ${error.message}`);
        }

        return data;
    },

    async deleteStudy(id: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_studies')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`Error deleting IMOVIB study ${id}:`, error);
            throw new Error(`Failed to delete IMOVIB study: ${error.message}`);
        }
    },

    // Blocks
    async getBlocksByStudyId(studyId: string): Promise<ImovibBlock[]> {
        const { data, error } = await supabase.from('imovib_blocks').select('id, study_id, name, construction_cost_sqm, sales_price_sqm, created_at, updated_at').eq('study_id', studyId).order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch IMOVIB blocks: ${error.message}`);
        return data || [];
    },

    async createBlock(block: ImovibBlockInsert): Promise<ImovibBlock> {
        const { data, error } = await supabase.from('imovib_blocks').insert(block).select().single();
        if (error) throw new Error(`Failed to create IMOVIB block: ${error.message}`);
        return data;
    },

    async updateBlock(id: string, updates: ImovibBlockUpdate): Promise<ImovibBlock> {
        const { data, error } = await supabase.from('imovib_blocks').update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Failed to update IMOVIB block: ${error.message}`);
        return data;
    },

    /**
     * Custo/m² e preço/m² de um bloco — o que o estudo guarda por torre.
     *
     * Bloco lido de uma torre ainda sem linha em `imovib_blocks` (id `torre:…`): a
     * linha nasce AQUI, no salvar — nunca na leitura —, levando os valores que a tela
     * mostrava, e a torre ganha `imovib_block_id` (a mesma ligação do espelho).
     */
    async salvarEconomiaDoBloco(
        block: ImovibBlock,
        patch: Pick<ImovibBlockUpdate, 'construction_cost_sqm' | 'sales_price_sqm'>,
    ): Promise<ImovibBlock> {
        if (!blocoSemLinha(block)) return this.updateBlock(block.id, patch);
        if (!block.tower_id) throw new Error('Bloco sem torre de origem: recarregue o estudo.');

        // Outro salvar (ou o espelho) pode ter ligado a torre depois da leitura.
        const { data: torre, error: torreError } = await supabase
            .from('empreendimento_towers').select('id, imovib_block_id').eq('id', block.tower_id).single();
        if (torreError) throw new Error(`Failed to read tower: ${torreError.message}`);
        if (torre.imovib_block_id) return this.updateBlock(torre.imovib_block_id, patch);

        const novo = await this.createBlock({
            study_id: block.study_id,
            name: block.name,
            construction_cost_sqm: block.construction_cost_sqm,
            sales_price_sqm: block.sales_price_sqm,
            ...patch,
        });
        // .select() confere que a escrita passou: RLS que recusa UPDATE devolve 0 linhas, sem erro.
        const { data: ligada, error: linkError } = await supabase
            .from('empreendimento_towers').update({ imovib_block_id: novo.id }).eq('id', block.tower_id).select('id');
        if (linkError || !ligada?.length) {
            await this.deleteBlock(novo.id).catch(() => undefined);
            throw new Error(`Não consegui ligar a torre "${block.name}" ao estudo${linkError ? `: ${linkError.message}` : ' (sem permissão para editar o empreendimento)'}.`);
        }
        return novo;
    },

    /** Empreendimentos da organização do estudo, para o campo "Empreendimento vinculado". */
    async listarEmpreendimentosParaVincular(organizationId: string): Promise<{ id: string; name: string; imovib_study_id: string | null }[]> {
        const { data, error } = await supabase
            .from('empreendimentos')
            .select('id, name, imovib_study_id')
            .eq('organization_id', organizationId)
            .order('name', { ascending: true });
        if (error) throw new Error(`Failed to list empreendimentos: ${error.message}`);
        return data || [];
    },

    /**
     * Liga o estudo a um empreendimento (`empreendimentos.imovib_study_id`), ou
     * desliga com `null`. Um estudo, um empreendimento: o vínculo anterior sai na
     * mesma operação (a coluna não tem UNIQUE e todo leitor usa `.maybeSingle()`).
     * Empreendimento já ligado a OUTRO estudo é recusado — tirar o vínculo de lá é
     * decisão de quem cuida daquele estudo.
     */
    async vincularEmpreendimento(studyId: string, empreendimentoId: string | null): Promise<void> {
        if (empreendimentoId) {
            const { data: alvo, error } = await supabase
                .from('empreendimentos').select('id, name, imovib_study_id').eq('id', empreendimentoId).single();
            if (error) throw new Error(`Failed to read empreendimento: ${error.message}`);
            if (alvo.imovib_study_id && alvo.imovib_study_id !== studyId) {
                throw new Error(`"${alvo.name}" já está vinculado a outro estudo de viabilidade.`);
            }
        }
        let desfaz = supabase.from('empreendimentos').update({ imovib_study_id: null }).eq('imovib_study_id', studyId);
        if (empreendimentoId) desfaz = desfaz.neq('id', empreendimentoId);
        const { error: desfazError } = await desfaz;
        if (desfazError) throw new Error(`Failed to unlink empreendimento: ${desfazError.message}`);
        if (!empreendimentoId) return;

        const { data: ligado, error: ligaError } = await supabase
            .from('empreendimentos').update({ imovib_study_id: studyId }).eq('id', empreendimentoId).select('id');
        if (ligaError) throw new Error(`Failed to link empreendimento: ${ligaError.message}`);
        if (!ligado?.length) throw new Error('Sem permissão para editar este empreendimento.');
    },

    async deleteBlock(id: string): Promise<void> {
        const { error } = await supabase.from('imovib_blocks').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete IMOVIB block: ${error.message}`);
    },

    // Units
    async getUnitsByBlockId(blockId: string): Promise<ImovibUnit[]> {
        const { data, error } = await supabase.from('imovib_units').select('id, block_id, name, quantity, private_area, common_area, pavimentos, is_vendavel, created_at, updated_at').eq('block_id', blockId).order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch IMOVIB units: ${error.message}`);
        return data || [];
    },

    async createUnit(unit: ImovibUnitInsert): Promise<ImovibUnit> {
        const { data, error } = await supabase.from('imovib_units').insert(unit).select().single();
        if (error) throw new Error(`Failed to create IMOVIB unit: ${error.message}`);
        return data;
    },

    async updateUnit(id: string, updates: ImovibUnitUpdate): Promise<ImovibUnit> {
        const { data, error } = await supabase.from('imovib_units').update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Failed to update IMOVIB unit: ${error.message}`);
        return data;
    },

    async deleteUnit(id: string): Promise<void> {
        const { error } = await supabase.from('imovib_units').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete IMOVIB unit: ${error.message}`);
    },

    // --- CAPEX Items (Sprint 7) ---

    async upsertCapexItems(items: import('../types').ImovibCapexItemInsert[]): Promise<import('../types').ImovibCapexItem[]> {
        if (!items || items.length === 0) return [];

        const { data, error } = await supabase
            .from('imovib_capex_items')
            .upsert(items, { onConflict: 'id' })
            .select();

        if (error) {
            console.error('Error upserting IMOVIB CAPEX items:', error);
            throw new Error(`Failed to upsert CAPEX items: ${error.message}`);
        }

        return data || [];
    },

    /**
     * Aplica o template de rubricas ao estudo UMA vez. Idempotente: a trava
     * UNIQUE (study_id, category, name) ignora rubrica que já existe (o efeito
     * do ImovibCapexForm rodava 2× no StrictMode e duplicava o template inteiro),
     * e `capex_seeded_at` impede que apagar todas as rubricas faça o template
     * voltar. Devolve as rubricas do estudo depois do seed.
     */
    async seedCapexTemplate(studyId: string, template: ImovibCapexItemInsert[]): Promise<ImovibCapexItem[]> {
        const { data: study, error: studyError } = await supabase
            .from('imovib_studies')
            .select('capex_seeded_at')
            .eq('id', studyId)
            .single();
        if (studyError) throw new Error(`Failed to read CAPEX seed state: ${studyError.message}`);

        if (!study?.capex_seeded_at && template.length > 0) {
            const { error: insertError } = await supabase
                .from('imovib_capex_items')
                .upsert(template, { onConflict: 'study_id,category,name', ignoreDuplicates: true });
            if (insertError) throw new Error(`Failed to seed CAPEX template: ${insertError.message}`);

            const { error: markError } = await supabase
                .from('imovib_studies')
                .update({ capex_seeded_at: new Date().toISOString() })
                .eq('id', studyId)
                .is('capex_seeded_at', null);
            if (markError) throw new Error(`Failed to mark CAPEX seed: ${markError.message}`);
        }

        const { data, error } = await supabase
            .from('imovib_capex_items')
            .select(CAPEX_COLS)
            .eq('study_id', studyId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to load CAPEX items: ${error.message}`);
        return (data || []) as ImovibCapexItem[];
    },

    async updateCapexItem(id: string, updates: Partial<import('../types').ImovibCapexItem>): Promise<void> {
        const { error } = await supabase
            .from('imovib_capex_items')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error(`Error updating CAPEX item ${id}:`, error);
            throw new Error(`Failed to update CAPEX item: ${error.message}`);
        }
    },

    async deleteCapexItem(id: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_capex_items')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`Error deleting CAPEX item ${id}:`, error);
            throw new Error(`Failed to delete CAPEX item: ${error.message}`);
        }
    },

    // Mapa Regulatório mudou de casa: mora no empreendimento (empreendimento_regulatory_zones,
    // via empreendimentoService), não mais em imovib_regulatory_zones. Os CRUDs regulatórios do
    // Imovib foram removidos (migration 20270218000002). A tabela antiga persiste inerte.

    // ── Unit Instances (Vendas de Ativos da Viabilidade) ─────────────────────

    async getUnitInstances(studyId: string): Promise<import('../types').ImovibUnitInstance[]> {
        const { data, error } = await supabase
            .from('imovib_unit_instances')
            .select('id, study_id, block_id, unit_id, name, floor, private_area, position_type, sun_orientation, price, status, created_at, updated_at')
            .eq('study_id', studyId)
            .order('floor', { ascending: true })
            .order('name', { ascending: true });
        if (error) throw new Error(`Failed to fetch unit instances: ${error.message}`);
        return data || [];
    },

    async createUnitInstances(instances: import('../types').ImovibUnitInstanceInsert[]): Promise<import('../types').ImovibUnitInstance[]> {
        if (!instances || instances.length === 0) return [];
        const { data, error } = await supabase
            .from('imovib_unit_instances')
            .insert(instances)
            .select();
        if (error) throw new Error(`Failed to create unit instances: ${error.message}`);
        return data || [];
    },

    async updateUnitInstance(id: string, updates: Partial<import('../types').ImovibUnitInstanceInsert>): Promise<void> {
        const { error } = await supabase
            .from('imovib_unit_instances')
            .update(updates)
            .eq('id', id);
        if (error) throw new Error(`Failed to update unit instance: ${error.message}`);
    },

    async deleteUnitInstancesByStudy(studyId: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_unit_instances')
            .delete()
            .eq('study_id', studyId);
        if (error) throw new Error(`Failed to delete unit instances: ${error.message}`);
    },

    async deleteUnitInstancesByIds(ids: string[]): Promise<void> {
        if (!ids.length) return;
        const { error } = await supabase
            .from('imovib_unit_instances')
            .delete()
            .in('id', ids);
        if (error) throw new Error(`Failed to delete unit instances: ${error.message}`);
    },

    async deleteUnitInstancesByUnit(unitId: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_unit_instances')
            .delete()
            .eq('unit_id', unitId);
        if (error) throw new Error(`Failed to delete unit instances by unit: ${error.message}`);
    },

};
