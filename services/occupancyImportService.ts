// services/occupancyImportService.ts
// Ponte Comercial → Condomínios: importar ocupações dos contratos.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A corrente já existia inteira, só nunca tinha sido percorrida até o fim — os
// Espelhos param no imóvel e nunca alcançam a pessoa:
//
//   contracts (domain='LOCACAO' | 'VENDAS')
//     ├─ client_id            → o LOCATÁRIO / o COMPRADOR
//     ├─ start_date/end_date  → a vigência
//     ├─ parent_contract_id   → renovação (contrato-FILHO, não aditivo)
//     └─ deal_id → commercial_deal_units.property_id  (N unidades por contrato)
//                  ou commercial_deals.property_id    (principal, legado)
//                    ↓ commercial_properties.id
//                    ↓ empreendimento_units.rental_property_id      (LOCACAO)
//                      empreendimento_units.commercial_property_id  (VENDAS)
//
// OS DOIS EIXOS SÃO PARECIDOS MAS NÃO IGUAIS, e a diferença não é cosmética:
//
//   LOCAÇÃO  vigência TERMINA. Contrato encerrado vira ocupação histórica —
//            o inquilino saiu. Renovação encadeia contratos, e a cadeia
//            colapsa numa ocupação só.
//   VENDA    propriedade NÃO TERMINA. Um contrato de venda com `end_date` no
//            passado não significa que a pessoa deixou de ser dona — significa
//            que o parcelamento acabou. Por isso ocupação de PROPRIETARIO
//            nunca nasce com `ended_at`, e contrato de venda cancelado é
//            IGNORADO em vez de virar histórico: a venda não aconteceu.
//
// PRÉVIA ANTES DE GRAVAR: importação que escreve direto no banco sem mostrar o
// que vai fazer é irreversível na prática — ninguém desfaz 40 ocupações à mão.

import { supabase } from '../lib/supabase';
import { empreendimentoService } from './empreendimentoService';
import { traduzirErroOcupacao } from './unitOccupancyService';
import type { OccupancyRole, UnitOccupancy } from '../types/empreendimento';

/** Eixo comercial de onde a ocupação vem. */
export type EixoImportacao = 'LOCACAO' | 'VENDAS';

/** Status que significam "este contrato não vale mais" — viram histórico (só locação). */
const STATUS_MORTOS = new Set(['Encerrado', 'Cancelado', 'Suspenso']);
/** Status que nunca viram ocupação: contrato que ainda não existe de fato. */
const STATUS_NAO_IMPORTAVEIS = new Set(['Rascunho', 'Minuta', 'Revisão', 'Cancelado']);

interface ConfigEixo {
    domain: EixoImportacao;
    /** Coluna de `empreendimento_units` que aponta para o imóvel comercial. */
    chaveImovel: 'rental_property_id' | 'commercial_property_id';
    papelPrincipal: OccupancyRole;
    /** Locação encerra; propriedade não. Ver o cabeçalho do arquivo. */
    geraHistorico: boolean;
    rotuloPessoa: string;
}

const EIXOS: Record<EixoImportacao, ConfigEixo> = {
    LOCACAO: {
        domain: 'LOCACAO',
        chaveImovel: 'rental_property_id',
        papelPrincipal: 'INQUILINO',
        geraHistorico: true,
        rotuloPessoa: 'locatário',
    },
    VENDAS: {
        domain: 'VENDAS',
        chaveImovel: 'commercial_property_id',
        papelPrincipal: 'PROPRIETARIO',
        // Propriedade não termina com o contrato: `end_date` no passado só diz
        // que o parcelamento acabou, não que a pessoa deixou de ser dona.
        geraHistorico: false,
        rotuloPessoa: 'comprador',
    },
};

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
    /**
     * Quantas unidades do condomínio estão publicadas NESTE eixo. Zero é a
     * causa mais comum de prévia vazia, e sem este número a tela culparia os
     * contratos por um problema que é de publicação da unidade — foi o que
     * aconteceu em 14/08/2026 com o Galeria Altavista (12 unidades no eixo de
     * locação, 0 no de venda).
     */
    unidadesNoEixo: number;
    /** Total de unidades do condomínio, publicadas ou não. */
    unidadesTotal: number;
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

export const occupancyImportService = {
    /**
     * Monta o que SERIA criado, sem gravar nada. A tela mostra e o usuário
     * confirma.
     */
    async previewImport(
        empreendimentoId: string,
        organizationId: string,
        eixo: EixoImportacao = 'LOCACAO',
    ): Promise<ImportPreview> {
        const cfg = EIXOS[eixo];

        // 1. As unidades deste empreendimento, indexadas pelo imóvel comercial
        //    do eixo pedido — venda e locação são colunas DIFERENTES e
        //    independentes na mesma unidade.
        const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimentoId);
        const porImovel = new Map<string, { id: string; label: string }>();
        for (const u of units) {
            const imovel = u[cfg.chaveImovel];
            if (imovel) {
                porImovel.set(imovel, { id: u.id, label: `${u._tower_name} · ${u.name}` });
            }
        }
        if (porImovel.size === 0) {
            return {
                rows: [], contratosSemVinculo: 0, contratosNaoImportaveis: 0,
                unidadesNoEixo: 0, unidadesTotal: units.length,
            };
        }

        // 2. Contratos do eixo, nesta organização.
        const { data: contratosData, error: erroContratos } = await supabase
            .from('contracts')
            .select('id, number, client_id, start_date, end_date, status, deal_id, parent_contract_id')
            .eq('organization_id', organizationId)
            .eq('domain', cfg.domain);
        if (erroContratos) throw new Error(`Falha ao carregar contratos (${cfg.domain}): ${erroContratos.message}`);

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

            // A diferença central entre os eixos. Em LOCAÇÃO, histórico é o que
            // já acabou — por status ou por data — e só a ocupação VIGENTE
            // disputa o índice de responsável financeiro único, então o
            // histórico entra sem colidir. Em VENDA não existe histórico:
            // propriedade não termina com o contrato, e venda cancelada não
            // gera dono nenhum (é ignorada logo abaixo).
            const endedAt = cfg.geraHistorico && (morto || venceu) ? (cadeia.fim || hoje) : null;

            if (!cfg.geraHistorico && morto) {
                // Venda desfeita: a pessoa nunca foi dona. Pular é mais correto
                // que criar ocupação encerrada, que sugeriria que ela foi.
                continue;
            }

            for (const unidade of unidadesAlcancadas) {
                const roles: OccupancyRole[] = [cfg.papelPrincipal];
                const motivos: string[] = [];

                // Responsável financeiro só entra em ocupação VIGENTE: para
                // histórico o papel não faz sentido (ninguém é responsável por
                // uma cobrança que já não existe) e poluiria a lista.
                //
                // Nos dois eixos o papel é oferecido, e a ORDEM DE IMPORTAÇÃO
                // decide quem fica com ele. Isso é desejável: por lei a taxa
                // condominial é obrigação do PROPRIETÁRIO, e o repasse ao
                // inquilino é cláusula. Se a locação foi importada antes, o
                // inquilino já tem o papel e o proprietário é reportado — a
                // unidade alugada fica com o inquilino pagando, que é a
                // prática; a unidade só vendida fica com o dono.
                if (!endedAt) {
                    const ocupanteDoPapel = responsavelVigentePorUnidade.get(unidade.id);
                    if (!ocupanteDoPapel) {
                        roles.push('RESPONSAVEL_FINANCEIRO');
                    } else if (ocupanteDoPapel !== cadeia.vivo.client_id) {
                        motivos.push(
                            `Unidade já tem responsável financeiro (${nomes.get(ocupanteDoPapel) || 'outra pessoa'}) — só o ${cfg.rotuloPessoa === 'locatário' ? 'inquilino' : 'proprietário'} será criado.`,
                        );
                    }
                }

                // Venda não renova; a cadeia só é plural em locação.
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
        return {
            rows, contratosSemVinculo, contratosNaoImportaveis,
            unidadesNoEixo: porImovel.size, unidadesTotal: units.length,
        };
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
