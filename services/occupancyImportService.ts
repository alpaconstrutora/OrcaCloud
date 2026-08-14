// services/occupancyImportService.ts
// Ponte Comercial → Condomínios: quem ocupa cada unidade do empreendimento.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A ÂNCORA É A UNIDADE DO EMPREENDIMENTO, não o contrato.
//
// A primeira versão percorria contratos e resolvia a unidade no fim do caminho.
// O efeito colateral matou o recurso na prática: unidade não publicada num eixo
// simplesmente NÃO APARECIA, e a tela ainda culpava a falta de contrato. Em
// 14/08/2026 isso levou à conclusão de que a importação de vendas estava
// quebrada, quando o real era que as 12 unidades do Galeria Altavista estavam
// publicadas só no eixo de locação.
//
// Invertido, o empreendimento manda: TODA unidade aparece na prévia, e Locação
// e Venda de Ativos entram só para responder duas perguntas sobre ela —
// quem é o LOCATÁRIO e quem é o PROPRIETÁRIO. Unidade sem resposta aparece
// como lacuna, que é informação: diz onde falta cadastro.
//
//   empreendimento_units
//     ├─ rental_property_id      ─┐
//     └─ commercial_property_id  ─┴→ commercial_deals (type SALE | RENTAL)
//                                      ├─ client_id  → a PESSOA
//                                      ├─ status     → só negócio efetivado conta
//                                      └─ contracts.deal_id → reforço: número e
//                                         data formal, quando o contrato existe
//
// O CONTRATO DEIXOU DE SER OBRIGATÓRIO. Ele é gerado por um botão
// (DealModal.handleGenerateContract), então uma venda pode estar completa sem
// nunca ter gerado `CV-`. Ancorar nele perdia esses proprietários em silêncio.

import { supabase } from '../lib/supabase';
import { empreendimentoService } from './empreendimentoService';
import { traduzirErroOcupacao } from './unitOccupancyService';
import type { OccupancyRole, UnitOccupancy } from '../types/empreendimento';

/**
 * Status de negociação em que a pessoa REALMENTE detém a unidade.
 * `RESERVA`, `IN_NEGOTIATION`, `PENDING` e `WAITING_PAYMENT` ficam de fora de
 * propósito: reserva não é posse, e criar proprietário a partir de negociação
 * em andamento é pior que não criar nenhum. Elas aparecem na prévia como
 * "negociação em andamento", para não sumirem sem explicação.
 */
const STATUS_EFETIVADOS = new Set(['CONTRATO', 'ASSINATURA', 'COMPLETED']);
const STATUS_EM_ANDAMENTO = new Set(['IN_NEGOTIATION', 'PENDING', 'WAITING_PAYMENT', 'RESERVA']);

export interface PessoaEncontrada {
    role: OccupancyRole;
    clientId: string;
    clientName: string;
    startedAt: string;
    /** Contrato formal, quando existe. Nulo = veio só da negociação. */
    sourceContractId: string | null;
    /** De onde a informação saiu, para a prévia poder justificar cada linha. */
    origem: string;
}

export interface ImportUnitRow {
    unitId: string;
    unitLabel: string;
    /** Proprietário e/ou locatário encontrados. Vazio = lacuna de cadastro. */
    pessoas: PessoaEncontrada[];
    /**
     * Quem recebe a cobrança do condomínio. Locatário quando há um; senão o
     * proprietário. Decidido aqui, numa passagem só — na versão anterior
     * dependia da ORDEM em que os eixos eram importados, o que é frágil.
     */
    responsavelFinanceiro: string | null;
    selected: boolean;
    motivo?: string;
}

export interface ImportPreview {
    rows: ImportUnitRow[];
    unidadesTotal: number;
    unidadesComPessoa: number;
    /** Unidades cuja negociação existe mas ainda não é posse. */
    unidadesEmNegociacao: number;
}

export interface ImportResult {
    criadas: number;
    puladas: number;
    erros: string[];
    novas: UnitOccupancy[];
}

const OCCUPANCY_COLS =
    'id, unit_id, client_id, organization_id, role, started_at, ended_at, notes, source_contract_id, created_at, updated_at';

interface DealBruto {
    id: string; client_id: string | null; property_id: string | null;
    type: string | null; status: string | null; date: string | null;
}

export const occupancyImportService = {
    /** Monta o que SERIA criado, sem gravar nada. */
    async previewImport(empreendimentoId: string, organizationId: string): Promise<ImportPreview> {
        // 1. A ÂNCORA: as unidades do empreendimento. Todas, publicadas ou não.
        const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimentoId);
        if (units.length === 0) {
            return { rows: [], unidadesTotal: 0, unidadesComPessoa: 0, unidadesEmNegociacao: 0 };
        }

        // 2. Os imóveis comerciais de cada unidade — os DOIS eixos juntos. A
        //    classificação vem depois, do `type` da negociação, e não da coluna
        //    de origem: assim uma unidade publicada na coluna trocada ainda é
        //    resolvida corretamente.
        const imovelParaUnidade = new Map<string, { id: string; label: string }>();
        for (const u of units) {
            const label = `${u._tower_name} · ${u.name}`;
            if (u.rental_property_id) imovelParaUnidade.set(u.rental_property_id, { id: u.id, label });
            if (u.commercial_property_id) imovelParaUnidade.set(u.commercial_property_id, { id: u.id, label });
        }

        const propertyIds = [...imovelParaUnidade.keys()];
        const dealsPorUnidade = new Map<string, DealBruto[]>();
        let unidadesEmNegociacao = 0;

        if (propertyIds.length > 0) {
            // Negociação pela unidade principal…
            const { data: deals, error } = await supabase
                .from('commercial_deals')
                .select('id, client_id, property_id, type, status, date')
                .in('property_id', propertyIds);
            if (error) throw new Error(`Falha ao carregar negociações: ${error.message}`);

            // …e pela lista de itens (apto + vaga + box sob um contrato só).
            const { data: dealUnits } = await supabase
                .from('commercial_deal_units')
                .select('deal_id, property_id')
                .in('property_id', propertyIds);

            const todos = new Map<string, DealBruto>();
            for (const d of (deals || []) as DealBruto[]) todos.set(d.id, d);

            const extraIds = [...new Set((dealUnits || []).map(du => du.deal_id))]
                .filter(id => !todos.has(id));
            if (extraIds.length > 0) {
                const { data: extras } = await supabase
                    .from('commercial_deals')
                    .select('id, client_id, property_id, type, status, date')
                    .in('id', extraIds);
                for (const d of (extras || []) as DealBruto[]) todos.set(d.id, d);
            }

            // Cada negociação alcança 1..N unidades.
            const imoveisPorDeal = new Map<string, Set<string>>();
            for (const d of todos.values()) {
                if (d.property_id) {
                    imoveisPorDeal.set(d.id, new Set([d.property_id]));
                }
            }
            for (const du of dealUnits || []) {
                if (!imoveisPorDeal.has(du.deal_id)) imoveisPorDeal.set(du.deal_id, new Set());
                imoveisPorDeal.get(du.deal_id)!.add(du.property_id);
            }

            for (const [dealId, imoveis] of imoveisPorDeal) {
                const deal = todos.get(dealId);
                if (!deal || !deal.client_id) continue;
                for (const imovel of imoveis) {
                    const unidade = imovelParaUnidade.get(imovel);
                    if (!unidade) continue;
                    if (!dealsPorUnidade.has(unidade.id)) dealsPorUnidade.set(unidade.id, []);
                    dealsPorUnidade.get(unidade.id)!.push(deal);
                }
            }
        }

        // 3. Contratos das negociações — reforço, não requisito: dão número e
        //    data formal, e a marca de origem que torna a importação repetível.
        const dealIds = [...new Set([...dealsPorUnidade.values()].flat().map(d => d.id))];
        const contratoPorDeal = new Map<string, { id: string; number: string | null; start_date: string | null }>();
        if (dealIds.length > 0) {
            const { data: contratos } = await supabase
                .from('contracts')
                .select('id, number, start_date, deal_id')
                .in('deal_id', dealIds);
            for (const c of contratos || []) {
                if (c.deal_id) contratoPorDeal.set(c.deal_id, { id: c.id, number: c.number, start_date: c.start_date });
            }
        }

        // 4. Ocupações que já existem — para não reoferecer o que já foi criado.
        const { data: jaExistentes } = await supabase
            .from('unit_occupancies')
            .select('unit_id, client_id, role, ended_at')
            .in('unit_id', units.map(u => u.id))
            .is('ended_at', null);
        const vigentes = new Set((jaExistentes || []).map(o => `${o.unit_id}|${o.client_id}|${o.role}`));
        const papelOcupado = new Set((jaExistentes || []).map(o => `${o.unit_id}|${o.role}`));

        // 5. Nomes.
        const clientIds = [...new Set([...dealsPorUnidade.values()].flat().map(d => d.client_id!).filter(Boolean))];
        const nomes = new Map<string, string>();
        if (clientIds.length > 0) {
            const { data: cs } = await supabase.from('clients').select('id, name').in('id', clientIds);
            for (const c of cs || []) nomes.set(c.id, c.name);
        }

        /** A negociação mais recente e efetivada de um tipo. */
        const melhorDeal = (lista: DealBruto[], tipo: 'SALE' | 'RENTAL'): DealBruto | null => {
            const candidatos = lista
                .filter(d => d.type === tipo && STATUS_EFETIVADOS.has(d.status || ''))
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return candidatos[0] || null;
        };

        // 6. Uma linha por UNIDADE — inclusive as sem ninguém.
        const rows: ImportUnitRow[] = [];
        let unidadesComPessoa = 0;

        for (const u of units) {
            const label = `${u._tower_name} · ${u.name}`;
            const lista = dealsPorUnidade.get(u.id) || [];
            const pessoas: PessoaEncontrada[] = [];
            const motivos: string[] = [];

            const montar = (deal: DealBruto | null, role: OccupancyRole) => {
                if (!deal || !deal.client_id) return;
                const contrato = contratoPorDeal.get(deal.id);
                pessoas.push({
                    role,
                    clientId: deal.client_id,
                    clientName: nomes.get(deal.client_id) || '(pessoa não encontrada)',
                    startedAt: contrato?.start_date || deal.date || new Date().toISOString().slice(0, 10),
                    sourceContractId: contrato?.id || null,
                    origem: contrato
                        ? `Contrato ${contrato.number || 's/ número'}`
                        : `Negociação (${deal.status})`,
                });
            };

            montar(melhorDeal(lista, 'SALE'), 'PROPRIETARIO');
            montar(melhorDeal(lista, 'RENTAL'), 'INQUILINO');

            const emAndamento = lista.filter(d => STATUS_EM_ANDAMENTO.has(d.status || ''));
            if (pessoas.length === 0 && emAndamento.length > 0) {
                unidadesEmNegociacao += 1;
                motivos.push(`Negociação em andamento (${emAndamento[0].status}) — reserva não é posse, então nada é criado.`);
            }

            // O responsável financeiro sai do LOCATÁRIO quando existe; senão do
            // proprietário. Por lei a taxa é do dono, mas o repasse ao inquilino
            // é a prática — e agora isso é decidido numa passagem só, não pela
            // ordem em que alguém clicou em importar.
            const locatario = pessoas.find(p => p.role === 'INQUILINO');
            const proprietario = pessoas.find(p => p.role === 'PROPRIETARIO');
            let responsavelFinanceiro: string | null = null;
            if (!papelOcupado.has(`${u.id}|RESPONSAVEL_FINANCEIRO`)) {
                responsavelFinanceiro = (locatario || proprietario)?.clientId || null;
            } else {
                motivos.push('Unidade já tem responsável financeiro — o papel não é tocado.');
            }

            const novas = pessoas.filter(p => !vigentes.has(`${u.id}|${p.clientId}|${p.role}`));
            if (pessoas.length > 0 && novas.length === 0) {
                motivos.unshift('Já importada.');
            }
            if (pessoas.length === 0 && emAndamento.length === 0) {
                motivos.push('Nenhum proprietário ou locatário encontrado no Comercial.');
            }
            if (pessoas.length > 0) unidadesComPessoa += 1;

            const temAlgoACriar = novas.length > 0
                || (responsavelFinanceiro !== null && !vigentes.has(`${u.id}|${responsavelFinanceiro}|RESPONSAVEL_FINANCEIRO`));

            rows.push({
                unitId: u.id,
                unitLabel: label,
                pessoas: novas,
                responsavelFinanceiro: temAlgoACriar ? responsavelFinanceiro : null,
                selected: temAlgoACriar,
                motivo: motivos.length ? motivos.join(' ') : undefined,
            });
        }

        rows.sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, 'pt-BR', { numeric: true }));
        return { rows, unidadesTotal: units.length, unidadesComPessoa, unidadesEmNegociacao };
    },

    /**
     * Grava só as linhas marcadas, uma ocupação por vez: um lote único faria o
     * primeiro conflito derrubar as boas junto.
     */
    async applyImport(rows: ImportUnitRow[]): Promise<ImportResult> {
        const criadas: UnitOccupancy[] = [];
        const erros: string[] = [];
        let puladas = 0;

        for (const row of rows.filter(r => r.selected)) {
            const aCriar: { role: OccupancyRole; clientId: string; startedAt: string; contractId: string | null; origem: string }[] =
                row.pessoas.map(p => ({
                    role: p.role, clientId: p.clientId, startedAt: p.startedAt,
                    contractId: p.sourceContractId, origem: p.origem,
                }));

            if (row.responsavelFinanceiro) {
                const base = row.pessoas.find(p => p.clientId === row.responsavelFinanceiro);
                aCriar.push({
                    role: 'RESPONSAVEL_FINANCEIRO',
                    clientId: row.responsavelFinanceiro,
                    startedAt: base?.startedAt || new Date().toISOString().slice(0, 10),
                    contractId: base?.sourceContractId || null,
                    origem: base?.origem || 'Comercial',
                });
            }

            for (const item of aCriar) {
                const { data, error } = await supabase
                    .from('unit_occupancies')
                    .insert({
                        unit_id: row.unitId,
                        client_id: item.clientId,
                        // A org é derivada pelo trigger a partir da unidade
                        // (CLAUDE.md regra #5).
                        organization_id: null,
                        role: item.role,
                        started_at: item.startedAt,
                        ended_at: null,
                        source_contract_id: item.contractId,
                        notes: `Importada do Comercial — ${item.origem}`,
                    })
                    .select(OCCUPANCY_COLS)
                    .single();

                if (error) {
                    // Corrida com outra aba, ou dado que mudou entre a prévia e o
                    // clique. Conta como pulada, não como falha.
                    if (error.message.includes('uidx_unit_occupancies')) {
                        puladas += 1;
                    } else {
                        erros.push(`${row.unitLabel}: ${traduzirErroOcupacao(error.message)}`);
                    }
                    continue;
                }
                criadas.push(data as UnitOccupancy);
            }
        }

        return { criadas: criadas.length, puladas, erros, novas: criadas };
    },
};
