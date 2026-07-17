// services/sync/imovibAdapter.ts
//
// Normaliza o estudo de Viabilidade (Imovib) para o lado canônico. O adapter conhece SÓ a
// origem — nada do Empreendimento. Quem casa origem com destino é o planner.
//
// Cardinalidade: 1 imovib_block = 1 torre (N blocos por estudo, sem limite), e
// 1 imovib_unit_instance = 1 unidade. Sem instâncias (estudo sem espelho de vendas), o
// fallback expande as tipologias vendáveis — mas só se a torre estiver vazia, decisão que
// depende do destino e portanto é do planner.

import { imovibService } from '../imovibService';
import {
    Empreendimento, EmpreendimentoUnitInsert, UnitStatus, CommonAreaCategory,
} from '../../types/empreendimento';
import { ImovibUnit, ImovibUnitInstance } from '../../types/imovib';
import { CanonicalSide, CanonicalTower, CanonicalUnit } from './types';

/** Status do Imovib vem acentuado ('DISPONÍVEL'); o do Empreendimento, não. */
export const translateStatus = (s?: string): UnitStatus => {
    switch (s) {
        case 'DISPONÍVEL': case 'DISPONIVEL': return 'DISPONIVEL';
        case 'RESERVADO': return 'RESERVADO';
        case 'PERMUTADO': return 'PERMUTADO';
        case 'VENDIDO': return 'VENDIDO';
        default: return 'DISPONIVEL';
    }
};

/** Heurística de categoria pelo nome da tipologia não-vendável. */
export const inferCommonAreaCategory = (name: string): CommonAreaCategory => {
    const n = (name || '').toLowerCase();
    if (/(piscina|academia|festa|gourmet|playground|quadra|lazer|churrasq|sal[ãa]o|spa|sauna|brinquedo|cinema|coworking)/.test(n)) return 'LAZER';
    if (/(garagem|vaga|estacion)/.test(n)) return 'GARAGEM';
    if (/(hall|circula|corredor|escada|elevador)/.test(n)) return 'CIRCULACAO';
    if (/(t[ée]cnic|casa de m[áa]quinas|barrilete|reservat[óo]rio|medidor|lixo|gerador)/.test(n)) return 'TECNICA';
    return 'COMUM';
};

/** Campos de uma instância que participam do diff (ver fieldRegistry: SYNC_FIELDS.imovib). */
function unitFieldsFromInstance(inst: ImovibUnitInstance, meta?: ImovibUnit): Record<string, unknown> {
    const priv = inst.private_area;
    const common = meta?.common_area;
    return {
        name: inst.name,
        floor: inst.floor,
        typology: meta?.name,
        private_area: priv,
        common_area: common,
        total_area: (priv ?? 0) + (common ?? 0),
        position_type: inst.position_type,
        sun_orientation: inst.sun_orientation,
        // Grupo 'comercial' — no diff, mas protegido pela heurística do planner enquanto a
        // inbox de curadoria não existir.
        price: inst.price,
        status: translateStatus(inst.status),
    };
}

export async function loadImovibSide(empreendimento: Empreendimento): Promise<CanonicalSide> {
    if (!empreendimento.imovib_study_id) {
        throw new Error('Este empreendimento não está vinculado a um estudo de viabilidade (Imovib).');
    }

    const study = await imovibService.getStudyById(empreendimento.imovib_study_id, true);
    if (!study) throw new Error('Estudo de viabilidade vinculado não foi encontrado.');

    // Blindagem multi-tenant: o estudo precisa ser da mesma organização.
    if (study.organization_id !== empreendimento.organization_id) {
        throw new Error('O estudo vinculado pertence a outra organização. Sincronização bloqueada.');
    }

    const instances = await imovibService.getUnitInstances(empreendimento.imovib_study_id);
    const blocks = study.blocks || [];

    // Tipologias por id — dão nome e área comum à instância.
    const unitMetaById = new Map<string, ImovibUnit>();
    for (const b of blocks) for (const u of (b.units || [])) unitMetaById.set(u.id, u);

    const instancesByBlock = new Map<string, ImovibUnitInstance[]>();
    for (const inst of instances) {
        const arr = instancesByBlock.get(inst.block_id) || [];
        arr.push(inst);
        instancesByBlock.set(inst.block_id, arr);
    }

    const towers: CanonicalTower[] = [];
    const commonAreaCandidates: CanonicalSide['commonAreaCandidates'] = [];
    const liveUnitSourceIds = new Set<string>();

    for (const block of blocks) {
        const blockInstances = instancesByBlock.get(block.id) || [];
        const units: CanonicalUnit[] = blockInstances.map(inst => {
            liveUnitSourceIds.add(inst.id);
            const meta = inst.unit_id ? unitMetaById.get(inst.unit_id) : undefined;
            return {
                sourceId: inst.id,
                fields: unitFieldsFromInstance(inst, meta),
                createOnly: {
                    imovib_unit_id: inst.unit_id ?? undefined,
                    imovib_instance_id: inst.id,
                    // is_vendavel só na criação: uma unidade marcada como não-vendável no
                    // Empreendimento não deve ser revertida por um sync. (O código antigo
                    // reescrevia `true` em todo update, mas só quando algum OUTRO campo
                    // divergia — inconsistência que some ao tratar o campo como create-only.)
                    is_vendavel: true,
                },
            };
        });

        // Sem espelho de vendas: expandir tipologias vendáveis. Só se a torre estiver vazia —
        // quem sabe disso é o planner.
        const vendaveis = (block.units || []).filter(u => u.is_vendavel !== false);
        const typologyFallback = (blockInstances.length === 0 && vendaveis.length > 0)
            ? {
                units: vendaveis.flatMap(meta => {
                    const qty = Math.max(1, meta.quantity || 1);
                    return Array.from({ length: qty }, (_, i): Omit<EmpreendimentoUnitInsert, 'tower_id'> => ({
                        imovib_unit_id: meta.id,
                        name: `${meta.name} ${i + 1}`,
                        typology: meta.name,
                        private_area: meta.private_area,
                        common_area: meta.common_area,
                        total_area: (meta.private_area ?? 0) + (meta.common_area ?? 0),
                        is_vendavel: true,
                        status: 'DISPONIVEL' as UnitStatus,
                    }));
                }),
                warning: `Bloco "${block.name}": gerado a partir das tipologias (sem espelho de vendas). Gere as instâncias no Imovib para detalhar por pavimento/posição.`,
                warningIfHasUnits: `Bloco "${block.name}": sem espelho de vendas no estudo e a torre já tem unidades — nada foi regenerado.`,
            }
            : undefined;

        towers.push({
            sourceId: block.id,
            fields: {
                name: block.name,
                construction_cost_sqm: block.construction_cost_sqm,
                sales_price_sqm: block.sales_price_sqm,
            },
            createOnly: { imovib_block_id: block.id, name: block.name },
            units,
            typologyFallback,
        });

        // Tipologias não-vendáveis viram área comum.
        for (const meta of (block.units || [])) {
            if (meta.is_vendavel === false) {
                commonAreaCandidates.push({
                    empreendimento_id: empreendimento.id,
                    name: meta.name,
                    category: inferCommonAreaCategory(meta.name),
                    area: meta.common_area || meta.private_area,
                    is_vendavel: false,
                });
            }
        }
    }

    return {
        origin: 'imovib',
        empreendimento,
        towers,
        commonAreaCandidates,
        liveTowerSourceIds: new Set(blocks.map(b => b.id)),
        liveUnitSourceIds,
        warnings: [],
    };
}
