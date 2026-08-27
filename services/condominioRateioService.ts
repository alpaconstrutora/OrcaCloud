// services/condominioRateioService.ts
// Rateio condominial — a primeira fatia do financeiro.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (🚪 portão)
//
// A ÂNCORA É O CENTRO DE CUSTO (decisão do usuário, 14/08/2026): a despesa do
// condomínio é a que cai em `cost_centers_v2` com `empreendimento_id` dele. Isso
// separa o caixa com ou sem organização própria, e reusa a dimensão que DRE e
// balancete já leem.

import { supabase } from '../lib/supabase';
import { generateDocumentNumber } from './documentNumbering';

export type CriterioRateio = 'FRACAO_IDEAL' | 'IGUAL' | 'AREA_PRIVATIVA' | 'GRUPO' | 'FIXO';
export type TipoRateio = 'ORDINARIO' | 'EXTRAORDINARIO';
export type StatusRateio = 'RASCUNHO' | 'FECHADO' | 'CANCELADO';

export const CRITERIO_LABEL: Record<CriterioRateio, string> = {
    FRACAO_IDEAL: 'Fração ideal',
    IGUAL: 'Valor igual por unidade',
    AREA_PRIVATIVA: 'Área privativa',
    GRUPO: 'Grupo de unidades',
    FIXO: 'Valor fixo por unidade',
};

/** O que cada critério exige da unidade para poder ser aplicado. */
export const CRITERIO_EXIGE: Record<CriterioRateio, string> = {
    FRACAO_IDEAL: 'fração ideal transcrita na aba Frações',
    IGUAL: 'nada — divide igual entre as unidades',
    AREA_PRIVATIVA: 'área privativa cadastrada na unidade',
    GRUPO: 'seleção manual das unidades do grupo',
    FIXO: 'valor digitado por unidade',
};

export interface DespesaRateio {
    transaction_id: string;
    descricao: string;
    valor: number;
    /** Só na prévia (vem de `internal_transactions`) — o snapshot salvo não guarda data. */
    data?: string;
}

export interface ItemPrevia {
    unitId: string;
    unitLabel: string;
    peso: number;
    valor: number;
    clientId: string | null;
    clientNome: string;
    /** Por que esta unidade não entrou, ou entrou com peso zero. */
    aviso?: string;
}

export interface PreviaRateio {
    despesas: DespesaRateio[];
    totalDespesas: number;
    itens: ItemPrevia[];
    totalRateado: number;
    /** Unidades sem o dado que o critério exige. */
    semDado: number;
    /** Unidades sem ninguém para cobrar. */
    semResponsavel: number;
}

export interface Rateio {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    cost_center_id?: string | null;
    competencia: string;
    tipo: TipoRateio;
    criterio: CriterioRateio;
    status: StatusRateio;
    total_despesas: number;
    total_rateado: number;
    observacoes?: string | null;
    /** Número do rateio, atribuído no fechamento — Configurações do Sistema › Nomenclatura (CONDO_RATEIO). */
    number?: string | null;
    /** Quando as cotas viraram recebíveis. NULO = fechado mas ainda não cobrado.
     *  Não é status: cobrança é eixo próprio (ver migration 20270914000012). */
    cobranca_gerada_em?: string | null;
    fechado_em?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * De quem cobrar a cota. É ESCOLHA do usuário no momento de gerar, não regra
 * fixa — decisão de 27/08/2026: "opção para o usuário escolher entre
 * proprietario e responsavel".
 *
 * O motivo de existir: rateio EXTRAORDINÁRIO é obra e benfeitoria, que por lei
 * é obrigação do PROPRIETÁRIO, não de quem mora. Até aqui o rateio mandava toda
 * cota ao responsável financeiro (na prática o inquilino), ignorando o tipo —
 * a separação ordinário × extraordinário existia no schema e nunca chegava ao
 * pagador.
 */
export type PagadorDaCota = 'RESPONSAVEL' | 'PROPRIETARIO';

const RATEIO_COLS =
    'id, empreendimento_id, organization_id, cost_center_id, competencia, tipo, criterio, status, total_despesas, total_rateado, observacoes, number, fechado_em, cobranca_gerada_em, created_at, updated_at';

/** Centavos, para não somar float. */
const paraCentavos = (v: number) => Math.round(v * 100);
const paraReais = (c: number) => c / 100;

/**
 * Distribui um total entre pesos, em CENTAVOS, e devolve a soma EXATA do total.
 *
 * O resto do arredondamento vai para a maior cota — não some, e não é
 * distribuído em migalhas. 1000,00 entre 3 unidades iguais dá 333,33 + 333,33 +
 * 333,34: se cada uma ficasse com 333,33, o condomínio arrecadaria 999,99 e a
 * diferença apareceria como furo na prestação de contas todo mês.
 */
export function distribuir(totalCentavos: number, pesos: number[]): number[] {
    const somaPesos = pesos.reduce((s, p) => s + p, 0);
    if (somaPesos <= 0) return pesos.map(() => 0);

    const bruto = pesos.map(p => (totalCentavos * p) / somaPesos);
    const arredondado = bruto.map(v => Math.floor(v));
    let resto = totalCentavos - arredondado.reduce((s, v) => s + v, 0);

    // O resto (sempre < nº de itens) vai para quem tem as maiores frações
    // perdidas — o mesmo critério do "maior resto", que é como se faz rateio.
    const ordem = bruto
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < ordem.length && resto > 0; k++, resto--) {
        arredondado[ordem[k].i] += 1;
    }
    return arredondado;
}

/**
 * Próximo código, derivado do MAIOR existente — nunca de COUNT: com contagem,
 * excluir um centro de custo faz o próximo repetir um código já usado, e o
 * índice único `(organization_id, code)` recusa a criação sem o usuário
 * entender por quê. Mesmo raciocínio de `nextRentalNumber`.
 */
async function proximoCodigo(organizationId: string): Promise<string> {
    const { data } = await supabase
        .from('cost_centers_v2')
        .select('code')
        .eq('organization_id', organizationId)
        .order('code', { ascending: false })
        .limit(1)
        .maybeSingle();
    return String((parseInt(data?.code || '0', 10) || 0) + 1).padStart(3, '0');
}

export const condominioRateioService = {
    /** O centro de custo do condomínio — a âncora da segregação. */
    async getCentroDeCusto(empreendimentoId: string): Promise<{ id: string; code: string; name: string } | null> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select('id, code, name')
            .eq('empreendimento_id', empreendimentoId)
            .maybeSingle();
        if (error) throw new Error(`Falha ao carregar o centro de custo: ${error.message}`);
        return data;
    },

    /**
     * O GRUPO "Condomínios", criado sob demanda. `cost_centers_v2` tem 2 níveis
     * via `parent_id`: grupo (parent nulo) e centro de custo (filho). O
     * condomínio é FILHO — criá-lo solto no primeiro nível o põe lado a lado com
     * Obra, Administrativo e Comercial, que são famílias de despesa, não
     * unidades de caixa.
     */
    async garantirGrupoCondominios(organizationId: string): Promise<string> {
        const { data: existente } = await supabase
            .from('cost_centers_v2')
            .select('id, name')
            .eq('organization_id', organizationId)
            .is('parent_id', null)
            .ilike('name', 'condomínio%')
            .limit(1)
            .maybeSingle();
        if (existente) return existente.id;

        // Acentuação varia no cadastro manual — tenta sem acento antes de criar.
        const { data: semAcento } = await supabase
            .from('cost_centers_v2')
            .select('id')
            .eq('organization_id', organizationId)
            .is('parent_id', null)
            .ilike('name', 'condominio%')
            .limit(1)
            .maybeSingle();
        if (semAcento) return semAcento.id;

        const { data, error } = await supabase
            .from('cost_centers_v2')
            .insert({
                organization_id: organizationId,
                code: await proximoCodigo(organizationId),
                name: 'Condomínios',
                description: 'Grupo dos centros de custo de condomínios.',
            })
            .select('id')
            .single();
        if (error) throw new Error(`Falha ao criar o grupo Condomínios: ${error.message}`);
        return data.id;
    },

    async criarCentroDeCusto(
        empreendimentoId: string, organizationId: string, nome: string,
    ): Promise<{ id: string; code: string; name: string }> {
        const parentId = await this.garantirGrupoCondominios(organizationId);

        const { data, error } = await supabase
            .from('cost_centers_v2')
            .insert({
                organization_id: organizationId,
                empreendimento_id: empreendimentoId,
                parent_id: parentId,
                code: await proximoCodigo(organizationId),
                name: nome,
                description: 'Centro de custo do condomínio — âncora da segregação do caixa.',
            })
            .select('id, code, name')
            .single();
        if (error) throw new Error(`Falha ao criar o centro de custo: ${error.message}`);
        return data;
    },

    /**
     * Centros de custo que ainda não são de nenhum condomínio — candidatos ao
     * vínculo. Só FILHOS (parent_id preenchido): grupo não recebe lançamento, e
     * apontar o condomínio para um grupo faria a despesa cair num nível que não
     * é unidade de caixa.
     */
    async listarDisponiveis(organizationId: string): Promise<{ id: string; code: string; name: string; grupo: string | null }[]> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select('id, code, name, parent_id')
            .eq('organization_id', organizationId)
            .is('empreendimento_id', null)
            .not('parent_id', 'is', null)
            .order('code', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os centros de custo: ${error.message}`);

        const linhas = data || [];
        const paisIds = [...new Set(linhas.map((l: any) => l.parent_id).filter(Boolean))];
        const nomePai = new Map<string, string>();
        if (paisIds.length > 0) {
            const { data: pais } = await supabase
                .from('cost_centers_v2').select('id, name').in('id', paisIds);
            for (const p of pais || []) nomePai.set(p.id, p.name);
        }
        return linhas.map((l: any) => ({
            id: l.id, code: l.code, name: l.name, grupo: nomePai.get(l.parent_id) || null,
        }));
    },

    /**
     * Aponta um centro de custo EXISTENTE para o condomínio. Útil quando ele já
     * foi cadastrado à mão — foi o que aconteceu com o Bella Vista, que tinha
     * "Condomínio Bella Vista" no grupo certo antes de o módulo criar o dele.
     */
    async vincular(costCenterId: string, empreendimentoId: string): Promise<{ id: string; code: string; name: string }> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .update({ empreendimento_id: empreendimentoId })
            .eq('id', costCenterId)
            .select('id, code, name')
            .single();
        if (error) {
            if (error.message.includes('uidx_cost_center_por_empreendimento')) {
                throw new Error('Este condomínio já tem um centro de custo vinculado.');
            }
            throw new Error(`Falha ao vincular: ${error.message}`);
        }
        return data;
    },

    /** Desfaz o vínculo sem apagar o centro de custo nem os lançamentos dele. */
    async desvincular(costCenterId: string): Promise<void> {
        const { error } = await supabase
            .from('cost_centers_v2')
            .update({ empreendimento_id: null })
            .eq('id', costCenterId);
        if (error) throw new Error(`Falha ao desvincular: ${error.message}`);
    },

    /**
     * Monta a prévia sem gravar nada: quais despesas entram e quanto cada
     * unidade paga. É o que a tela mostra antes de fechar.
     */
    async previa(params: {
        empreendimentoId: string;
        costCenterId: string;
        competencia: string;      // 'YYYY-MM-01'
        criterio: CriterioRateio;
        /** Só para GRUPO: as unidades que participam. */
        unidadesDoGrupo?: string[];
        /** Só para FIXO: valor por unidade. */
        valorFixo?: number;
        /**
         * Quando vem preenchido, troca a janela de data pelos títulos
         * ESCOLHIDOS (ex: marcados no Fechamento por Centro de Custo, Contas a
         * Pagar) — `.in('id', …)` no lugar do intervalo de `transaction_date`.
         * Os guardas de CC e direção continuam valendo: um título que foi
         * reclassificado para outro centro de custo entre o clique e o cálculo
         * some da lista, em vez de entrar num caixa que não é o dele.
         */
        transactionIds?: string[];
        /**
         * De quem cobrar. Default `RESPONSAVEL` — é o comportamento que já
         * existia, então quem não passar nada não muda de resultado.
         */
        pagador?: PagadorDaCota;
    }): Promise<PreviaRateio> {
        const inicio = params.competencia;
        const fim = new Date(inicio);
        fim.setMonth(fim.getMonth() + 1);
        const fimISO = fim.toISOString().slice(0, 10);

        // 1. Despesas do centro de custo na competência.
        // `transaction_date`, NÃO `due_date`: é por ela que fn_dre e fn_balancete
        // recortam o período. Usar vencimento aqui faria o rateio e o balancete
        // discordarem sobre a qual mês a mesma despesa pertence — e o condômino
        // receberia uma cota que a contabilidade não confirma.
        let queryTx = supabase
            .from('internal_transactions')
            .select('id, description, amount, transaction_date, direction')
            .eq('cost_center_id', params.costCenterId)
            .eq('direction', 'DEBIT');
        queryTx = params.transactionIds && params.transactionIds.length > 0
            ? queryTx.in('id', params.transactionIds)
            : queryTx.gte('transaction_date', inicio).lt('transaction_date', fimISO);
        const { data: txs, error: erroTx } = await queryTx;
        if (erroTx) throw new Error(`Falha ao carregar as despesas: ${erroTx.message}`);

        const despesas: DespesaRateio[] = (txs || []).map((t: any) => ({
            transaction_id: t.id,
            descricao: t.description || 'Sem descrição',
            valor: Number(t.amount || 0),
            data: t.transaction_date,
        }));
        const totalCentavos = despesas.reduce((s, d) => s + paraCentavos(d.valor), 0);

        // 2. Unidades e seus pesos.
        const { empreendimentoService } = await import('./empreendimentoService');
        const units = await empreendimentoService.listAllUnitsForEmpreendimento(params.empreendimentoId);

        // 3. Quem paga cada unidade. Sem ninguém no papel, a cota fica SEM
        //    pagador — cobrar do "provavelmente o dono" é como nasce cobrança
        //    para a pessoa errada.
        //
        //    Busca os DOIS papéis numa consulta só: o papel pedido é o alvo, e o
        //    outro entra para poder DIZER o que existe quando o alvo falta. Um
        //    "sem proprietário cadastrado" que não menciona o inquilino que está
        //    ali manda o usuário procurar no lugar errado.
        const papelAlvo: 'RESPONSAVEL_FINANCEIRO' | 'PROPRIETARIO' =
            params.pagador === 'PROPRIETARIO' ? 'PROPRIETARIO' : 'RESPONSAVEL_FINANCEIRO';
        const { data: ocupacoes } = await supabase
            .from('unit_occupancies')
            .select('unit_id, client_id, role')
            .in('unit_id', units.map(u => u.id))
            .is('ended_at', null)
            .in('role', ['RESPONSAVEL_FINANCEIRO', 'PROPRIETARIO']);

        const responsavel = new Map<string, string>();
        const outroPapel = new Map<string, string>();
        for (const o of ocupacoes || []) {
            if (!o.client_id) continue;
            if (o.role === papelAlvo) responsavel.set(o.unit_id, o.client_id);
            else outroPapel.set(o.unit_id, o.client_id);
        }

        const clientIds = [...new Set([...responsavel.values(), ...outroPapel.values()])];
        const nomes = new Map<string, string>();
        if (clientIds.length > 0) {
            const { data: cs } = await supabase.from('clients').select('id, name').in('id', clientIds);
            for (const c of cs || []) nomes.set(c.id, c.name);
        }

        const noGrupo = new Set(params.unidadesDoGrupo || []);
        const pesoDe = (u: typeof units[number]): { peso: number; aviso?: string } => {
            switch (params.criterio) {
                case 'FRACAO_IDEAL':
                    return u.fracao_ideal_decimal != null && u.fracao_ideal_decimal > 0
                        ? { peso: u.fracao_ideal_decimal }
                        : { peso: 0, aviso: 'Sem fração ideal — transcreva a convenção na aba Frações.' };
                case 'AREA_PRIVATIVA':
                    return u.private_area != null && u.private_area > 0
                        ? { peso: u.private_area }
                        : { peso: 0, aviso: 'Sem área privativa cadastrada.' };
                case 'GRUPO':
                    return noGrupo.has(u.id)
                        ? { peso: 1 }
                        : { peso: 0, aviso: 'Fora do grupo selecionado.' };
                case 'IGUAL':
                case 'FIXO':
                default:
                    return { peso: 1 };
            }
        };

        const base = units.map(u => {
            const { peso, aviso } = pesoDe(u);
            const clientId = responsavel.get(u.id) || null;
            const rotuloAlvo = papelAlvo === 'PROPRIETARIO' ? 'proprietário' : 'responsável financeiro';
            // Quando o papel pedido não existe, o aviso NOMEIA quem está no
            // outro papel. Fallback silencioso aqui cobraria a pessoa errada
            // sem ninguém perceber — por isso a cota fica sem pagador e o
            // usuário decide.
            const alternativa = !clientId ? outroPapel.get(u.id) : undefined;
            const semPagador = alternativa
                ? `Sem ${rotuloAlvo} nesta unidade — quem consta é ${nomes.get(alternativa) || 'outra pessoa'}, em outro papel.`
                : `Ninguém definido como ${rotuloAlvo}.`;
            return {
                unitId: u.id,
                unitLabel: `${u._tower_name} · ${u.name}`,
                peso,
                clientId,
                clientNome: clientId
                    ? (nomes.get(clientId) || '—')
                    : `Sem ${rotuloAlvo}`,
                aviso: aviso || (clientId ? undefined : semPagador),
            };
        });

        // 4. Distribuição.
        let valores: number[];
        if (params.criterio === 'FIXO') {
            // FIXO não distribui o total: cada unidade paga o valor digitado, e o
            // total arrecadado é consequência — pode não bater com a despesa, e
            // isso é informação, não erro.
            const fixoCent = paraCentavos(params.valorFixo || 0);
            valores = base.map(b => (b.peso > 0 ? fixoCent : 0));
        } else {
            valores = distribuir(totalCentavos, base.map(b => b.peso));
        }

        const itens: ItemPrevia[] = base.map((b, i) => ({ ...b, valor: paraReais(valores[i]) }));

        return {
            despesas,
            totalDespesas: paraReais(totalCentavos),
            itens,
            totalRateado: paraReais(valores.reduce((s, v) => s + v, 0)),
            semDado: itens.filter(i => i.peso === 0 && params.criterio !== 'GRUPO').length,
            semResponsavel: itens.filter(i => !i.clientId).length,
        };
    },

    async listar(empreendimentoId: string): Promise<Rateio[]> {
        const { data, error } = await supabase
            .from('condominio_rateios')
            .select(RATEIO_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('competencia', { ascending: false })
            .order('id', { ascending: false });
        if (error) throw new Error(`Falha ao carregar os rateios: ${error.message}`);
        return (data || []) as Rateio[];
    },

    /** Grava a prévia como RASCUNHO. Fechar é ação separada e explícita. */
    async salvar(params: {
        empreendimentoId: string; organizationId: string; costCenterId: string;
        competencia: string; tipo: TipoRateio; criterio: CriterioRateio;
        previa: PreviaRateio; observacoes?: string;
    }): Promise<Rateio> {
        const { data: rateio, error } = await supabase
            .from('condominio_rateios')
            .insert({
                empreendimento_id: params.empreendimentoId,
                organization_id: params.organizationId,
                cost_center_id: params.costCenterId,
                competencia: params.competencia,
                tipo: params.tipo,
                criterio: params.criterio,
                status: 'RASCUNHO',
                total_despesas: params.previa.totalDespesas,
                total_rateado: params.previa.totalRateado,
                observacoes: params.observacoes || null,
            })
            .select(RATEIO_COLS)
            .single();
        if (error) {
            if (error.message.includes('uidx_rateio_competencia')) {
                throw new Error('Já existe um rateio desta competência e tipo. Cancele o anterior antes de refazer.');
            }
            throw new Error(`Falha ao salvar o rateio: ${error.message}`);
        }

        const r = rateio as Rateio;

        // Só as unidades que entraram: linha com valor zero polui a cobrança e
        // a prestação de contas sem acrescentar informação.
        const itens = params.previa.itens.filter(i => i.valor > 0).map(i => ({
            rateio_id: r.id,
            organization_id: params.organizationId,
            unit_id: i.unitId,
            peso: i.peso,
            valor: i.valor,
            client_id: i.clientId,
        }));
        if (itens.length > 0) {
            const { error: e1 } = await supabase.from('condominio_rateio_itens').insert(itens);
            if (e1) throw new Error(`Rateio criado, mas falhou ao gravar as cotas: ${e1.message}`);
        }

        const despesas = params.previa.despesas.map(d => ({
            rateio_id: r.id,
            transaction_id: d.transaction_id,
            descricao: d.descricao,
            valor: d.valor,
        }));
        if (despesas.length > 0) {
            const { error: e2 } = await supabase.from('condominio_rateio_despesas').insert(despesas);
            if (e2) throw new Error(`Rateio criado, mas falhou ao gravar as despesas: ${e2.message}`);
        }

        return r;
    },

    async fechar(id: string): Promise<Rateio> {
        // Número atribuído SÓ no fechamento (RASCUNHO recalcula à vontade, sem
        // consumir sequencial) — Configurações do Sistema › Nomenclatura
        // (CONDO_RATEIO). Busca o que falta para gerar o número no mesmo
        // round-trip de fechamento, sem exigir um segundo carregamento.
        const { data: atual, error: fetchError } = await supabase
            .from('condominio_rateios')
            .select('organization_id, empreendimento_id, cost_center_id, number')
            .eq('id', id)
            .single();
        if (fetchError) throw new Error(`Falha ao fechar o rateio: ${fetchError.message}`);

        let number = (atual as { number?: string | null }).number ?? undefined;
        if (!number) {
            number = await generateDocumentNumber('CONDO_RATEIO', atual.organization_id, {
                empreendimentoId: atual.empreendimento_id,
                costCenterId: atual.cost_center_id ?? undefined,
            });
        }

        const { data, error } = await supabase
            .from('condominio_rateios')
            .update({ status: 'FECHADO', fechado_em: new Date().toISOString(), number })
            .eq('id', id)
            .select(RATEIO_COLS)
            .single();
        if (error) throw new Error(`Falha ao fechar o rateio: ${error.message}`);
        return data as Rateio;
    },

    async cancelar(id: string): Promise<Rateio> {
        const { data, error } = await supabase
            .from('condominio_rateios')
            .update({ status: 'CANCELADO' })
            .eq('id', id)
            .select(RATEIO_COLS)
            .single();
        if (error) throw new Error(`Falha ao cancelar o rateio: ${error.message}`);
        return data as Rateio;
    },

    /**
     * As despesas que compuseram um rateio já salvo — o rastro gravado em
     * `condominio_rateio_despesas` no momento do cálculo. Serve tanto para
     * conferir um rascunho antes de fechar quanto para a prestação de contas
     * de um rateio fechado: uma vez salvo, é ESSA lista (não a competência
     * corrente do centro de custo) que vale como comprovação.
     */
    async listarDespesas(rateioId: string): Promise<DespesaRateio[]> {
        const { data, error } = await supabase
            .from('condominio_rateio_despesas')
            .select('transaction_id, descricao, valor')
            .eq('rateio_id', rateioId)
            .order('descricao', { ascending: true });
        if (error) throw new Error(`Falha ao carregar as despesas: ${error.message}`);
        return (data || []).map((d: any) => ({
            transaction_id: d.transaction_id,
            descricao: d.descricao || 'Sem descrição',
            valor: Number(d.valor || 0),
        }));
    },

    async listarItens(rateioId: string): Promise<{ unit_id: string; peso: number; valor: number; client_id: string | null }[]> {
        const { data, error } = await supabase
            .from('condominio_rateio_itens')
            .select('unit_id, peso, valor, client_id')
            .eq('rateio_id', rateioId);
        if (error) throw new Error(`Falha ao carregar as cotas: ${error.message}`);
        return data || [];
    },

    /**
     * De quais condomínios são os centros de custo dados — usado pelo botão
     * "Lançamento" do Fechamento por Centro de Custo (Contas a Pagar) para
     * agrupar os títulos marcados por condomínio antes de abrir o rateio.
     * A organização sai de `empreendimentos.organization_id` (mesmo caminho de
     * `FinanceiroTab.tsx`), não do seletor do topo — quem manda aqui é o CC.
     */
    async listarPorCentrosDeCusto(costCenterIds: string[]): Promise<{
        costCenterId: string; empreendimentoId: string; empreendimentoNome: string; organizationId: string;
    }[]> {
        if (costCenterIds.length === 0) return [];
        const { data: ccs, error: erroCc } = await supabase
            .from('cost_centers_v2')
            .select('id, empreendimento_id')
            .in('id', costCenterIds)
            .not('empreendimento_id', 'is', null);
        if (erroCc) throw new Error(`Falha ao carregar os centros de custo: ${erroCc.message}`);

        const empIds = [...new Set((ccs || []).map((c: any) => c.empreendimento_id as string))];
        if (empIds.length === 0) return [];
        const { data: emps, error: erroEmp } = await supabase
            .from('empreendimentos')
            .select('id, name, organization_id')
            .in('id', empIds);
        if (erroEmp) throw new Error(`Falha ao carregar os condomínios: ${erroEmp.message}`);
        const empById = new Map((emps || []).map((e: any) => [e.id, e]));

        return (ccs || [])
            .map((c: any) => {
                const emp = empById.get(c.empreendimento_id);
                return emp ? {
                    costCenterId: c.id as string,
                    empreendimentoId: emp.id as string,
                    empreendimentoNome: emp.name as string,
                    organizationId: emp.organization_id as string,
                } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
    },

    /**
     * Quais dos títulos dados JÁ entraram em algum rateio vivo (não cancelado).
     * Nada no banco impede a mesma despesa cair em dois rateios — sem essa
     * checagem o mesmo título poderia ser lançado duas vezes e o condômino
     * pagaria a cota em dobro.
     */
    async listarJaRateadas(transactionIds: string[]): Promise<Set<string>> {
        if (transactionIds.length === 0) return new Set();
        const { data, error } = await supabase
            .from('condominio_rateio_despesas')
            .select('transaction_id, condominio_rateios!inner(status)')
            .in('transaction_id', transactionIds)
            .neq('condominio_rateios.status', 'CANCELADO');
        if (error) throw new Error(`Falha ao verificar despesas já lançadas: ${error.message}`);
        return new Set((data || []).map((d: any) => d.transaction_id as string));
    },
};
