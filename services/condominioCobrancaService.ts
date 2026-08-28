// services/condominioCobrancaService.ts
// Cobrança condominial — fatia 2. Plano: docs/planos/2026-08-27-cobranca-condominial.md
//
// O ELO QUE FALTAVA: `asaas-charge` emite cobrança sobre um RECEBÍVEL
// (`internal_transactions`), não sobre o rateio. Então a cota tem de ser
// MATERIALIZADA como recebível antes de virar boleto. Este service faz os dois
// passos, nesta ordem, e mantém a fronteira entre eles: gerar recebível é
// reversível e interno; emitir é dinheiro indo para um gateway externo.
//
// POR QUE A PRÉVIA REPORTA TODOS OS BLOQUEIOS DE UMA VEZ: no piloto real, 8 das
// 10 cotas não podem ser cobradas porque a pessoa não tem CPF/CNPJ, e o Asaas
// devolve 422 uma a uma. Emitir dez e colher oito erros é a pior versão disso —
// a tela precisa dizer antes, com o nome de quem falta documento.
import { supabase } from '../lib/supabase';
import { clientChargeService, type BillingType } from './clientChargeService';
import {
    condominioRateioService, CRITERIO_LABEL,
    type Rateio, type PagadorDaCota,
} from './condominioRateioService';

/** Identifica na origem os recebíveis nascidos de rateio condominial. */
export const SOURCE_SYSTEM = 'CONDOMINIO_RATEIO';

export interface CotaCobranca {
    itemId: string;
    unitId: string;
    unitLabel: string;
    valor: number;
    clientId: string | null;
    clientNome: string;
    clientDocumento: string | null;
    /** Recebível já materializado desta cota, se houver. */
    transactionId: string | null;
    /**
     * Por que esta cota NÃO pode virar cobrança agora. `undefined` = pode.
     * É texto para o usuário, não código de erro: quem lê precisa saber o que
     * fazer, e onde.
     */
    bloqueio?: string;
}

export interface PreviaCobranca {
    rateio: Rateio;
    empreendimentoNome: string;
    multaPercent: number;
    jurosMesPercent: number;
    cotas: CotaCobranca[];
    /** Só as cobráveis — é o número que o usuário confere antes de gerar. */
    totalCobravel: number;
    qtdCobravel: number;
    qtdBloqueada: number;
}

export interface ResultadoEmissao {
    emitidas: number;
    falhas: { unitLabel: string; motivo: string }[];
}

/** 'YYYY-MM-01' → '05/2024', para descrição do recebível. */
function rotuloCompetencia(iso: string): string {
    const [a, m] = iso.slice(0, 10).split('-');
    return `${m}/${a}`;
}

export const condominioCobrancaService = {
    /**
     * Prévia da cobrança de um rateio FECHADO. Não grava nada.
     *
     * O `pagador` NÃO recalcula o rateio: as cotas e os valores já estão
     * fechados e travados por trigger. Ele decide apenas PARA QUEM cada cota
     * vai — que é a decisão do usuário de 27/08/2026, tomada na hora de gerar.
     */
    async previa(rateioId: string, opcoes?: { pagador?: PagadorDaCota }): Promise<PreviaCobranca> {
        const pagador: PagadorDaCota = opcoes?.pagador ?? 'RESPONSAVEL';

        const { data: rateio, error: eR } = await supabase
            .from('condominio_rateios')
            .select('id, empreendimento_id, organization_id, cost_center_id, competencia, tipo, criterio, status, total_despesas, total_rateado, observacoes, number, fechado_em, cobranca_gerada_em, created_at, updated_at')
            .eq('id', rateioId)
            .single();
        if (eR) throw new Error(`Falha ao carregar o rateio: ${eR.message}`);

        const { data: empr, error: eE } = await supabase
            .from('empreendimentos')
            .select('name, cobranca_multa_percent, cobranca_juros_mes_percent')
            .eq('id', rateio.empreendimento_id)
            .single();
        if (eE) throw new Error(`Falha ao carregar o condomínio: ${eE.message}`);

        const { data: itens, error: eI } = await supabase
            .from('condominio_rateio_itens')
            .select('id, unit_id, valor, client_id, transaction_id')
            .eq('rateio_id', rateioId);
        if (eI) throw new Error(`Falha ao carregar as cotas: ${eI.message}`);
        const linhas = itens || [];

        // Rótulo da unidade e o pagador do PAPEL escolhido — o `client_id`
        // gravado no item é o de quando o rateio foi calculado, e o usuário pode
        // estar escolhendo outro papel agora.
        const unitIds = [...new Set(linhas.map(l => l.unit_id))];
        const rotulo = new Map<string, string>();
        if (unitIds.length > 0) {
            const { data: us } = await supabase
                .from('empreendimento_units')
                .select('id, name, tower:empreendimento_towers(name)')
                .in('id', unitIds);
            for (const u of us || []) {
                const torre = (u as { tower?: { name?: string } }).tower?.name;
                rotulo.set(u.id, torre ? `${torre} · ${u.name}` : u.name);
            }
        }

        const papelAlvo = pagador === 'PROPRIETARIO' ? 'PROPRIETARIO' : 'RESPONSAVEL_FINANCEIRO';
        const { data: ocupacoes } = await supabase
            .from('unit_occupancies')
            .select('unit_id, client_id, role')
            .in('unit_id', unitIds)
            .is('ended_at', null)
            .in('role', ['RESPONSAVEL_FINANCEIRO', 'PROPRIETARIO']);

        const doPapel = new Map<string, string>();
        const doOutroPapel = new Map<string, string>();
        for (const o of ocupacoes || []) {
            if (!o.client_id) continue;
            if (o.role === papelAlvo) doPapel.set(o.unit_id, o.client_id);
            else doOutroPapel.set(o.unit_id, o.client_id);
        }

        // O documento é a pré-condição dura do Asaas — buscá-lo AQUI é o que
        // permite a tela avisar antes, em vez de colher 422 um a um.
        const clientIds = [...new Set([...doPapel.values(), ...doOutroPapel.values()])];
        const pessoas = new Map<string, { name: string; document: string | null }>();
        if (clientIds.length > 0) {
            const { data: cs } = await supabase
                .from('clients').select('id, name, document').in('id', clientIds);
            for (const c of cs || []) pessoas.set(c.id, { name: c.name, document: c.document ?? null });
        }

        const rotuloPapel = papelAlvo === 'PROPRIETARIO' ? 'proprietário' : 'responsável financeiro';

        const cotas: CotaCobranca[] = linhas.map(l => {
            const clientId = doPapel.get(l.unit_id) || null;
            const pessoa = clientId ? pessoas.get(clientId) : undefined;
            const outro = !clientId ? doOutroPapel.get(l.unit_id) : undefined;

            let bloqueio: string | undefined;
            if (l.transaction_id) {
                bloqueio = 'Cota já gerada — o recebível existe.';
            } else if (Number(l.valor) <= 0) {
                bloqueio = 'Cota zerada — nada a cobrar.';
            } else if (!clientId) {
                bloqueio = outro
                    ? `Sem ${rotuloPapel} nesta unidade. Quem consta é ${pessoas.get(outro)?.name || 'outra pessoa'}, em outro papel.`
                    : `Sem ${rotuloPapel} definido. Cadastre em Ocupações.`;
            } else if (!pessoa?.document) {
                // Não repete o nome: a linha já mostra `clientNome` logo antes,
                // e "Fulano · Fulano está sem CPF/CNPJ" lê mal.
                bloqueio = 'Sem CPF/CNPJ cadastrado. O Asaas exige documento para emitir.';
            }

            return {
                itemId: l.id,
                unitId: l.unit_id,
                unitLabel: rotulo.get(l.unit_id) || '—',
                valor: Number(l.valor),
                clientId,
                clientNome: pessoa?.name || `Sem ${rotuloPapel}`,
                clientDocumento: pessoa?.document ?? null,
                transactionId: l.transaction_id ?? null,
                bloqueio,
            };
        }).sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, 'pt-BR'));

        const cobraveis = cotas.filter(c => !c.bloqueio);
        return {
            rateio: rateio as Rateio,
            empreendimentoNome: empr.name,
            multaPercent: Number(empr.cobranca_multa_percent ?? 2),
            jurosMesPercent: Number(empr.cobranca_juros_mes_percent ?? 1),
            cotas,
            totalCobravel: cobraveis.reduce((s, c) => s + c.valor, 0),
            qtdCobravel: cobraveis.length,
            qtdBloqueada: cotas.length - cobraveis.length,
        };
    },

    /**
     * Materializa as cotas cobráveis como recebíveis. NÃO emite nada no Asaas —
     * é passo interno e reversível, e separá-lo da emissão é o que permite
     * conferir em Contas a Receber antes de mandar boleto para condômino.
     *
     * Idempotência: a cota que já tem `transaction_id` é pulada, e
     * `uidx_rateio_item_transaction` é a trava de verdade. Rodar duas vezes
     * cria ZERO na segunda.
     */
    async gerarRecebiveis(
        rateioId: string,
        opcoes: { vencimento: string; pagador?: PagadorDaCota },
    ): Promise<{ criados: number; pulados: number }> {
        const previa = await this.previa(rateioId, { pagador: opcoes.pagador });
        if (previa.rateio.status !== 'FECHADO') {
            throw new Error('Só rateio FECHADO vira cobrança — feche antes de gerar.');
        }

        const cobraveis = previa.cotas.filter(c => !c.bloqueio);
        if (cobraveis.length === 0) {
            throw new Error('Nenhuma cota pode ser cobrada. Veja os motivos na prévia.');
        }

        const competencia = rotuloCompetencia(previa.rateio.competencia);
        const tipoLabel = previa.rateio.tipo === 'EXTRAORDINARIO' ? 'extraordinária' : 'ordinária';

        let criados = 0;
        for (const cota of cobraveis) {
            // `reference_id` COMPOSTO, no padrão da casa ({origem}-p{vencimento}):
            // é o que dá idempotência e o que os helpers de lib/receivableRef
            // sabem ler. UUID puro aqui quebraria todo filtro por origem — em
            // silêncio, que foi como a inadimplência de Locações ficou zerada.
            const referenceId = `${cota.itemId}-p${opcoes.vencimento}`;

            const { data: tx, error } = await supabase
                .from('internal_transactions')
                .insert({
                    organization_id: previa.rateio.organization_id,
                    source_system: SOURCE_SYSTEM,
                    reference_id: referenceId,
                    // REGRA #2 (escrita): cota de condomínio NÃO tem obra.
                    project_id: null,
                    cost_center_id: previa.rateio.cost_center_id,
                    transaction_date: opcoes.vencimento,
                    due_date: opcoes.vencimento,
                    amount: cota.valor,
                    direction: 'CREDIT',
                    description: `Cota condominial ${tipoLabel} ${competencia} — ${cota.unitLabel}`,
                    entity_name: cota.clientNome,
                    party_id: cota.clientId,
                    party_type: 'CLIENT',
                    party_name: cota.clientNome,
                    status: 'PENDING',
                    business_status: 'PREVISTO',
                })
                .select('id')
                .single();
            if (error) throw new Error(`Falha ao gerar o recebível de ${cota.unitLabel}: ${error.message}`);

            const { error: eU } = await supabase
                .from('condominio_rateio_itens')
                .update({ transaction_id: tx.id })
                .eq('id', cota.itemId);
            if (eU) throw new Error(`Recebível criado, mas não vinculou à cota de ${cota.unitLabel}: ${eU.message}`);
            criados++;
        }

        await supabase
            .from('condominio_rateios')
            .update({ cobranca_gerada_em: new Date().toISOString() })
            .eq('id', rateioId);

        return { criados, pulados: previa.qtdBloqueada };
    },

    /**
     * Emite no Asaas as cobranças dos recebíveis já materializados.
     *
     * NÃO aborta o lote no primeiro erro: cada cota é um condômino, e falhar a
     * terceira não é motivo para deixar as outras sete sem boleto. As falhas
     * voltam nomeadas para a tela mostrar quem ficou de fora e por quê.
     */
    async emitir(
        rateioId: string,
        opcoes?: { billingType?: BillingType },
    ): Promise<ResultadoEmissao> {
        const previa = await this.previa(rateioId);
        const comRecebivel = previa.cotas.filter(c => c.transactionId);
        if (comRecebivel.length === 0) {
            throw new Error('Nenhum recebível gerado ainda — gere as cobranças antes de emitir.');
        }

        const falhas: ResultadoEmissao['falhas'] = [];
        let emitidas = 0;
        for (const cota of comRecebivel) {
            try {
                await clientChargeService.emit(
                    previa.rateio.organization_id,
                    cota.transactionId!,
                    opcoes?.billingType ?? 'BOLETO',
                    {
                        fine_percent: previa.multaPercent,
                        interest_percent_month: previa.jurosMesPercent,
                    },
                );
                emitidas++;
            } catch (e: unknown) {
                falhas.push({
                    unitLabel: cota.unitLabel,
                    motivo: e instanceof Error ? e.message : 'Erro desconhecido',
                });
            }
        }
        return { emitidas, falhas };
    },

    /** Cobranças já emitidas para as cotas deste rateio. */
    async listarEmitidas(rateioId: string): Promise<number> {
        const { data: itens } = await supabase
            .from('condominio_rateio_itens')
            .select('transaction_id')
            .eq('rateio_id', rateioId)
            .not('transaction_id', 'is', null);
        const ids = (itens || []).map(i => i.transaction_id).filter(Boolean) as string[];
        if (ids.length === 0) return 0;
        const { count } = await supabase
            .from('client_charges')
            .select('id', { count: 'exact', head: true })
            .in('transaction_id', ids);
        return count ?? 0;
    },
};

// Reexporta para a tela não precisar importar de dois lugares só por um rótulo.
export { CRITERIO_LABEL };
export type { PagadorDaCota };
