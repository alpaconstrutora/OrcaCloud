// services/rentalOccupancyImportService.ts
// Ponte Locações → Condomínios: importar ocupações dos contratos de locação.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A corrente já existia inteira, só nunca tinha sido percorrida até o fim — o
// Espelho de Locações para no imóvel e nunca alcança o locatário:
//
//   contracts (domain='LOCACAO')
//     ├─ client_id            → o LOCATÁRIO
//     ├─ start_date/end_date  → a vigência da ocupação
//     ├─ parent_contract_id   → renovação (contrato-FILHO, não aditivo)
//     └─ deal_id → commercial_deal_units.property_id  (N unidades por contrato)
//                  ou commercial_deals.property_id    (principal, legado)
//                    ↓ commercial_properties.id
//                    ↓ empreendimento_units.rental_property_id
//
// PRÉVIA ANTES DE GRAVAR: importação que escreve direto no banco sem mostrar o
// que vai fazer é irreversível na prática — ninguém desfaz 40 ocupações à mão.

import { supabase } from '../lib/supabase';
import { empreendimentoService } from './empreendimentoService';
import { traduzirErroOcupacao } from './unitOccupancyService';
import type { OccupancyRole, UnitOccupancy } from '../types/empreendimento';

/** Status que significam "este contrato não vale mais" — viram histórico. */
const STATUS_MORTOS = new Set(['Encerrado', 'Cancelado', 'Suspenso']);
/** Status que nunca viram ocupação: contrato que ainda não existe de fato. */
const STATUS_NAO_IMPORTAVEIS = new Set(['Rascunho', 'Minuta', 'Revisão', 'Cancelado']);

export interface ImportPreviewRow {
    /** Chave estável da linha (contrato vivo + unidade). */
    key: string;
    /** Contrato VIVO da cadeia — o mais recente da renovação. */
    contractId: string;
    contractNumber: string;
    /** Quantos contratos a cadeia de renovação colapsou nesta linha. */
    chainSize: number;
    unitId: string;
    unitLabel: string;
    clientId: string;
    clientName: string;
    startedAt: string;
    /** Nulo = vigente. Preenchido = histórico. */
    endedAt: string | null;
    roles: OccupancyRole[];
    selected: boolean;
    /** Por que a linha veio desmarcada, ou o que foi ajustado nela. */
    motivo?: string;
}

export interface ImportPreview {
    rows: ImportPreviewRow[];
    /** Contratos de locação da org que não alcançam nenhuma unidade deste empreendimento. */
    contratosSemVinculo: number;
    /** Contratos ignorados por status (rascunho, minuta…). */
    contratosNaoImportaveis: number;
}

export interface ImportResult {
    criadas: number;
    puladas: number;
    erros: string[];
    /** As ocupações criadas, para a tela atualizar o array local (§22). */
    novas: UnitOccupancy[];
}

const OCCUPANCY_COLS =
    'id, unit_id, client_id, organization_id, role, started_at, ended_at, notes, source_contract_id, created_at, updated_at';

function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ContratoBruto {
    id: string; number: string | null; client_id: string | null;
    start_date: string | null; end_date: string | null; status: string | null;
    deal_id: string | null; parent_contract_id: string | null;
}

/**
 * Sobe a cadeia de renovação até o contrato original. Renovar cria um contrato
 * NOVO que substitui o anterior (`parent_contract_id`), não um aditivo — então
 * uma locação de 6 anos são 6 contratos, e importar cru geraria 6 ocupações
 * idênticas em sequência. Juridicamente é a MESMA ocupação continuando.
 */
function raizDaCadeia(id: string, porId: Map<string, ContratoBruto>): string {
    const visitados = new Set<string>();
    let atual = id;
    for (;;) {
        if (visitados.has(atual)) return atual; // ciclo de dado corrompido: para
        visitados.add(atual);
        const pai = porId.get(atual)?.parent_contract_id;
        if (!pai || !porId.has(pai)) return atual;
        atual = pai;
    }
}

export const rentalOccupancyImportService = {
    /**
     * Monta o que SERIA criado, sem gravar nada. A tela mostra e o usuário
     * confirma.
     */
    async previewImport(empreendimentoId: string, organizationId: string): Promise<ImportPreview> {
        // 1. As unidades deste empreendimento, indexadas pelo imóvel de locação.
        const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimentoId);
        const porImovel = new Map<string, { id: string; label: string }>();
        for (const u of units) {
            if (u.rental_property_id) {
                porImovel.set(u.rental_property_id, { id: u.id, label: `${u._tower_name} · ${u.name}` });
            }
        }
        if (porImovel.size === 0) {
            return { rows: [], contratosSemVinculo: 0, contratosNaoImportaveis: 0 };
        }

        // 2. Contratos de locação da organização.
        const { data: contratosData, error: erroContratos } = await supabase
            .from('contracts')
            .select('id, number, client_id, start_date, end_date, status, deal_id, parent_contract_id')
            .eq('organization_id', organizationId)
            .eq('domain', 'LOCACAO');
        if (erroContratos) throw new Error(`Falha ao carregar contratos de locação: ${erroContratos.message}`);

        const contratos = (contratosData || []) as ContratoBruto[];
        const porId = new Map(contratos.map(c => [c.id, c]));

        const importaveis = contratos.filter(c =>
            c.client_id && c.start_date && !STATUS_NAO_IMPORTAVEIS.has(c.status || ''));
        const contratosNaoImportaveis = contratos.length - importaveis.length;

        // 3. Unidades de cada contrato: a lista de itens, com a unidade principal
        //    do negócio como retaguarda para contratos anteriores a
        //    commercial_deal_units (20270825000020).
        const dealIds = [...new Set(importaveis.map(c => c.deal_id).filter(Boolean) as string[])];
        const imoveisPorDeal = new Map<string, Set<string>>();

        if (dealIds.length > 0) {
            const { data: dealUnits } = await supabase
                .from('commercial_deal_units')
                .select('deal_id, property_id')
                .in('deal_id', dealIds);
            for (const du of dealUnits || []) {
                if (!imoveisPorDeal.has(du.deal_id)) imoveisPorDeal.set(du.deal_id, new Set());
                imoveisPorDeal.get(du.deal_id)!.add(du.property_id);
            }

            const { data: deals } = await supabase
                .from('commercial_deals')
                .select('id, property_id')
                .in('id', dealIds);
            for (const d of deals || []) {
                if (!d.property_id) continue;
                if (!imoveisPorDeal.has(d.id)) imoveisPorDeal.set(d.id, new Set());
                imoveisPorDeal.get(d.id)!.add(d.property_id);
            }
        }

        // 4. Colapsa a cadeia de renovação: uma ocupação por (cadeia × unidade).
        interface Cadeia {
            vivo: ContratoBruto; tamanho: number;
            inicio: string; fim: string | null; imoveis: Set<string>; ids: string[];
        }
        const cadeias = new Map<string, Cadeia>();

        for (const c of importaveis) {
            const raiz = raizDaCadeia(c.id, porId);
            const imoveis = imoveisPorDeal.get(c.deal_id || '') || new Set<string>();
            const existente = cadeias.get(raiz);
            if (!existente) {
                cadeias.set(raiz, {
                    vivo: c, tamanho: 1,
                    inicio: c.start_date!, fim: c.end_date ?? null,
                    imoveis: new Set(imoveis), ids: [c.id],
                });
                continue;
            }
            existente.tamanho += 1;
            existente.ids.push(c.id);
            for (const i of imoveis) existente.imoveis.add(i);
            if (c.start_date! < existente.inicio) existente.inicio = c.start_date!;
            // O contrato VIVO é o de vigência mais recente — é dele que sai a
            // data de saída e a marca de origem.
            const fimAtual = existente.vivo.end_date || '9999-12-31';
            const fimNovo = c.end_date || '9999-12-31';
            if (fimNovo >= fimAtual) {
                existente.vivo = c;
                existente.fim = c.end_date ?? null;
            }
        }

        // 5. Estado atual: o que já foi importado e quem já é responsável financeiro.
        const todosContratoIds = [...cadeias.values()].flatMap(c => c.ids);
        const unitIds = units.map(u => u.id);

        const { data: jaExistentes } = await supabase
            .from('unit_occupancies')
            .select('unit_id, role, ended_at, source_contract_id, client_id')
            .in('unit_id', unitIds);

        const importadas = new Set(
            (jaExistentes || [])
                .filter(o => o.source_contract_id && todosContratoIds.includes(o.source_contract_id))
                .map(o => `${o.source_contract_id}|${o.unit_id}|${o.role}`),
        );
        const responsavelVigentePorUnidade = new Map<string, string>(
            (jaExistentes || [])
                .filter(o => !o.ended_at && o.role === 'RESPONSAVEL_FINANCEIRO')
                .map(o => [o.unit_id, o.client_id]),
        );

        // 6. Nomes das pessoas.
        const clientIds = [...new Set([...cadeias.values()].map(c => c.vivo.client_id!).filter(Boolean))];
        const nomes = new Map<string, string>();
        if (clientIds.length > 0) {
            const { data: cs } = await supabase.from('clients').select('id, name').in('id', clientIds);
            for (const c of cs || []) nomes.set(c.id, c.name);
        }

        // 7. As linhas.
        const rows: ImportPreviewRow[] = [];
        let contratosSemVinculo = 0;
        const hoje = hojeISO();

        for (const cadeia of cadeias.values()) {
            const unidadesAlcancadas = [...cadeia.imoveis]
                .map(p => porImovel.get(p))
                .filter(Boolean) as { id: string; label: string }[];

            if (unidadesAlcancadas.length === 0) { contratosSemVinculo += 1; continue; }

            const morto = STATUS_MORTOS.has(cadeia.vivo.status || '');
            const venceu = !!cadeia.fim && cadeia.fim < hoje;
            // Histórico é o que já acabou — por status ou por data. Só a ocupação
            // VIGENTE disputa o índice de responsável financeiro único, então o
            // histórico entra sem colidir com nada.
            const endedAt = morto || venceu ? (cadeia.fim || hoje) : null;

            for (const unidade of unidadesAlcancadas) {
                const roles: OccupancyRole[] = ['INQUILINO'];
                const motivos: string[] = [];

                // Responsável financeiro só entra em ocupação VIGENTE: para
                // histórico o papel não faz sentido (ninguém é responsável por
                // uma cobrança que já não existe) e poluiria a lista.
                if (!endedAt) {
                    const ocupanteDoPapel = responsavelVigentePorUnidade.get(unidade.id);
                    if (!ocupanteDoPapel) {
                        roles.push('RESPONSAVEL_FINANCEIRO');
                    } else if (ocupanteDoPapel !== cadeia.vivo.client_id) {
                        motivos.push(
                            `Unidade já tem responsável financeiro (${nomes.get(ocupanteDoPapel) || 'outra pessoa'}) — só o inquilino será criado.`,
                        );
                    }
                }

                if (cadeia.tamanho > 1) {
                    motivos.push(`${cadeia.tamanho} contratos da mesma renovação unidos numa ocupação só.`);
                }

                const pendentes = roles.filter(r => !importadas.has(`${cadeia.vivo.id}|${unidade.id}|${r}`));
                if (pendentes.length === 0) {
                    motivos.unshift('Já importada deste contrato.');
                }

                rows.push({
                    key: `${cadeia.vivo.id}|${unidade.id}`,
                    contractId: cadeia.vivo.id,
                    contractNumber: cadeia.vivo.number || '(sem número)',
                    chainSize: cadeia.tamanho,
                    unitId: unidade.id,
                    unitLabel: unidade.label,
                    clientId: cadeia.vivo.client_id!,
                    clientName: nomes.get(cadeia.vivo.client_id!) || '(pessoa não encontrada)',
                    startedAt: cadeia.inicio,
                    endedAt,
                    roles: pendentes,
                    selected: pendentes.length > 0,
                    motivo: motivos.length ? motivos.join(' ') : undefined,
                });
            }
        }

        rows.sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, 'pt-BR', { numeric: true }));
        return { rows, contratosSemVinculo, contratosNaoImportaveis };
    },

    /**
     * Grava só as linhas marcadas. Uma a uma, de propósito: um lote único faria
     * o primeiro conflito derrubar as 39 ocupações boas junto — e o que importa
     * aqui é aproveitar o máximo, relatando o que sobrou.
     */
    async applyImport(rows: ImportPreviewRow[]): Promise<ImportResult> {
        const selecionadas = rows.filter(r => r.selected && r.roles.length > 0);
        const criadas: UnitOccupancy[] = [];
        const erros: string[] = [];
        let puladas = 0;

        for (const row of selecionadas) {
            for (const role of row.roles) {
                const { data, error } = await supabase
                    .from('unit_occupancies')
                    .insert({
                        unit_id: row.unitId,
                        client_id: row.clientId,
                        // A org é derivada pelo trigger a partir da unidade
                        // (CLAUDE.md regra #5) — mandar do client é o caminho de
                        // gravar na org errada.
                        organization_id: null,
                        role,
                        started_at: row.startedAt,
                        ended_at: row.endedAt,
                        source_contract_id: row.contractId,
                        notes: `Importada do contrato ${row.contractNumber}`,
                    })
                    .select(OCCUPANCY_COLS)
                    .single();

                if (error) {
                    // Corrida com outra aba, ou dado que mudou entre a prévia e o
                    // clique: conta como pulada, não como falha da importação.
                    if (error.message.includes('uidx_unit_occupancies_origem')
                        || error.message.includes('uidx_unit_occupancies_vigente')
                        || error.message.includes('uidx_unit_occupancies_um_responsavel')) {
                        puladas += 1;
                    } else {
                        erros.push(`${row.unitLabel} (${row.clientName}): ${traduzirErroOcupacao(error.message)}`);
                    }
                    continue;
                }
                criadas.push(data as UnitOccupancy);
            }
        }

        return { criadas: criadas.length, puladas, erros, novas: criadas };
    },
};
