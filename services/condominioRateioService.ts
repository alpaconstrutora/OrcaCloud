// services/condominioRateioService.ts
// Rateio condominial — a primeira fatia do financeiro.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (🚪 portão)
//
// A ÂNCORA É O CENTRO DE CUSTO (decisão do usuário, 14/08/2026): a despesa do
// condomínio é a que cai em `cost_centers_v2` com `empreendimento_id` dele. Isso
// separa o caixa com ou sem organização própria, e reusa a dimensão que DRE e
// balancete já leem.
//
// Desde 2026-09-19 um empreendimento pode ter VÁRIOS centros de custo (caiu o
// índice único `uidx_cost_center_por_empreendimento`, migration 20270919000030).
// A regra do rateio virou "a despesa do condomínio é a SOMA dos lançamentos de
// todos os seus centros de custo" — `previa` recebe a lista (`costCenterIds`).
// Um centro de custo a mais nunca pode fazer despesa sumir do rateio em silêncio.

import { supabase } from '../lib/supabase';
import { generateDocumentNumber } from './documentNumbering';
import { rotuloDeDespesa, podarRuidoDeBoleto } from '../utils/despesaCondominio';

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
    /** `condominio_rateio_despesas.id`. Só no snapshot salvo — a prévia ainda
     *  não gravou nada, e é por este id que a descrição é corrigida. */
    id?: string;
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

/**
 * Centro de custo candidato ao vínculo com um condomínio, no formato que o
 * drawer padrão (`CostCenterSelect`) precisa para montar o accordion: os
 * FILHOS livres mais os GRUPOS deles, com `parent_id` apontando para um item
 * presente na mesma lista.
 */
export interface CentroDeCustoDisponivel {
    id: string;
    code: string;
    name: string;
    parent_id: string | null;
    organization_id: string | null;
    /** `false` nos grupos — só agrupam, não são escolhíveis. */
    selecionavel: boolean;
}

/**
 * Um lançamento do caixa do condomínio, como a aba Despesas mostra.
 *
 * Diferente de `DespesaRateio`, que é o SNAPSHOT congelado dentro de um rateio:
 * este é o lançamento vivo em `internal_transactions`, e traz de onde veio
 * (centro de custo) e se já foi rateado — as duas perguntas que o síndico faz
 * ao olhar uma despesa solta.
 */
/** O que o documento de origem de um lançamento tem a oferecer à lista. */
export interface DadosDoBoleto {
    codigo: string | null;
    documentoPath: string | null;
    documentoNome: string | null;
}

export interface LancamentoDoCondominio {
    id: string;
    /**
     * Código do DOCUMENTO de origem — hoje o nº do boleto, com os mesmos 4
     * dígitos que a Conciliação Bancária usa (`loadOriginCodes` em
     * `components/BankReconciliation.tsx`), para o mesmo título não ter dois
     * códigos diferentes em duas telas.
     *
     * `null` quando a origem não tem código próprio. Medido em 24/09/2026:
     * as 136 despesas de condomínio da base são TODAS `BOLETO` e todas com
     * `reference_id`, então só essa origem é resolvida aqui. Outra origem
     * (NFE, MANUAL, PURCHASE_ORDER) cai em `null` e a célula mostra "—" —
     * de propósito: inventar um código a partir do uuid seria pior que
     * admitir que não há um.
     */
    codigo: string | null;
    /**
     * Arquivo do documento de origem, no bucket PRIVADO `boletos`. Guarda o
     * PATH — a URL é assinada na hora de abrir (`boletoService.getDocumentoUrl`,
     * 15 min). Assinar as 136 linhas no carregamento seria gastar 136 chamadas
     * para o usuário abrir, no máximo, uma — e a assinatura expiraria antes.
     */
    documentoPath: string | null;
    /** Nome do arquivo, como o Boletos a Pagar mostra. `null` = sem arquivo. */
    documentoNome: string | null;
    data: string;
    descricao: string;
    valor: number;
    /**
     * Quem recebeu. Na ordem: o fornecedor **cadastrado** (`supplier_id` →
     * `suppliers.name`), depois `party_name`/`entity_name` podados.
     *
     * O cadastrado vem primeiro porque `party_name` na origem BOLETO é o bloco
     * de OCR da linha do beneficiário, com CNPJ, endereço e chamada
     * publicitária colados ("ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA
     * S.A. CADASTRE SUA FATURA EM DÉBI…"). É a mesma ordem que a Conciliação
     * Bancária usa em `displayPartyName` — sem isso o MESMO título aparece
     * como "Energisa" lá e como bloco de OCR (ou vazio) aqui.
     *
     * Medido em 24/09/2026 nas 136 despesas de condomínio da base: 35 estavam
     * **em branco** com o `supplier_id` preenchido — o vínculo existia e a
     * tela não o consultava. Nenhuma linha é realmente anônima.
     */
    fornecedor: string;
    /**
     * De ONDE o lançamento veio: `source_system` cru (BOLETO, NFE, MANUAL,
     * PURCHASE_ORDER…). O rótulo em português é de `origemLabel`, em
     * `components/ContasPagarParcelas.tsx` — o mesmo que Contas a Pagar usa,
     * para as duas telas não inventarem nomes diferentes para a mesma origem.
     */
    origem: string;
    costCenterId: string | null;
    costCenterLabel: string;
    /** Já entrou em algum rateio VIVO (não cancelado). */
    rateada: boolean;
    /**
     * Competência do rateio em que entrou (`YYYY-MM`), quando entrou.
     *
     * Existe porque ela nem sempre é o mês do próprio lançamento: o rateio
     * criado pelo Fechamento por Centro de Custo (Contas a Pagar) recebe os
     * títulos ESCOLHIDOS, e `previa` troca a janela de data por `.in('id', …)`.
     * Medido em 24/09/2026: o rateio de 07/2026 do Bella Vista contém um
     * título de **17/08/2026**. Sem este campo, a aba Despesas diria só "já
     * rateada" e o usuário não teria como saber em qual mês.
     */
    rateioCompetencia: string | null;
}

/** Uma cota já gravada, com os rótulos que a tela precisa. */
export interface CotaDoRateio {
    id: string;
    unitId: string;
    unitLabel: string;
    peso: number;
    valor: number;
    clientId: string | null;
    /** `null` = a cota foi calculada sem ninguém no papel de pagador. */
    clientNome: string | null;
    /** Já virou recebível em Contas a Receber. */
    temRecebivel: boolean;
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
    /**
     * Despesas da competência que ficaram de fora por já estarem em outro
     * rateio vivo. Zero é o caso normal; qualquer número acima disso precisa
     * aparecer na tela, senão o total "não bate" com o extrato do centro de
     * custo e ninguém sabe por quê.
     */
    jaRateadas: number;
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
    /** Os centros de custo do condomínio — a âncora da segregação — por código.
     *  Lista vazia = condomínio ainda sem centro de custo. */
    async getCentrosDeCusto(empreendimentoId: string): Promise<{ id: string; code: string; name: string }[]> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select('id, code, name')
            .eq('empreendimento_id', empreendimentoId)
            .order('code', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os centros de custo: ${error.message}`);
        return data || [];
    },

    /**
     * Os centros de custo de VÁRIOS condomínios de uma vez, agrupados por
     * `empreendimento_id`.
     *
     * Existe para a coluna "Centro de custo" da lista de Condomínios: chamar
     * `getCentrosDeCusto` por linha seria N+1 numa tela que já nasce com
     * dezenas de condomínios, e a coluna não vale uma consulta por linha.
     *
     * Devolve um Map — condomínio sem centro de custo simplesmente não tem
     * chave, e quem lê usa `?? []`. Não inventa entrada vazia para não fazer
     * "tem chave" parecer "tem centro de custo".
     */
    async getCentrosDeCustoPorEmpreendimento(
        empreendimentoIds: string[],
    ): Promise<Map<string, { id: string; code: string; name: string }[]>> {
        const mapa = new Map<string, { id: string; code: string; name: string }[]>();
        if (empreendimentoIds.length === 0) return mapa;

        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select('id, code, name, empreendimento_id')
            .in('empreendimento_id', empreendimentoIds)
            .order('code', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os centros de custo: ${error.message}`);

        for (const cc of data || []) {
            const chave = (cc as { empreendimento_id: string }).empreendimento_id;
            const lista = mapa.get(chave) ?? [];
            lista.push({ id: cc.id, code: cc.code, name: cc.name });
            mapa.set(chave, lista);
        }
        return mapa;
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
     * Centros de custo que ainda não são de nenhum empreendimento — candidatos ao
     * vínculo. Só FILHOS (parent_id preenchido): grupo não recebe lançamento, e
     * apontar o condomínio para um grupo faria a despesa cair num nível que não
     * é unidade de caixa. (Cada centro de custo pertence a no máximo um
     * empreendimento; o empreendimento pode ter vários.)
     */
    async listarDisponiveis(organizationId: string): Promise<CentroDeCustoDisponivel[]> {
        const { data, error } = await supabase
            .from('cost_centers_v2')
            .select('id, code, name, parent_id, organization_id')
            .eq('organization_id', organizationId)
            .is('empreendimento_id', null)
            .not('parent_id', 'is', null)
            .order('code', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os centros de custo: ${error.message}`);

        const linhas = data || [];
        if (linhas.length === 0) return [];

        // Os GRUPOS pais entram na lista junto com os filhos — não como enfeite:
        // é a presença de `parent_id` apontando para um item PRESENTE que faz o
        // `HierarchicalSelect` desenhar o accordion (grupo com chevron, código
        // em texto simples). Sem os pais na lista, todo filho vira raiz e o
        // componente cai no modo antigo: lista plana com badge escuro de código
        // — exatamente o que destoava do drawer de Suprimentos › Pedidos, que
        // recebe a árvore inteira de `costCenterService.list`.
        const paisIds = [...new Set(linhas.map((l: any) => l.parent_id).filter(Boolean))] as string[];
        const pais: CentroDeCustoDisponivel[] = [];
        if (paisIds.length > 0) {
            const { data: grupos } = await supabase
                .from('cost_centers_v2')
                .select('id, code, name, parent_id, organization_id')
                .in('id', paisIds)
                .order('code', { ascending: true });
            for (const g of grupos || []) {
                pais.push({
                    id: g.id, code: g.code, name: g.name,
                    parent_id: g.parent_id ?? null,
                    organization_id: g.organization_id ?? null,
                    // Grupo NÃO é escolhível: ele não recebe lançamento, e
                    // apontar o condomínio para um grupo faria a despesa cair
                    // num nível que não é unidade de caixa. Clicar nele só
                    // abre/fecha os filhos.
                    selecionavel: false,
                });
            }
        }

        const filhos: CentroDeCustoDisponivel[] = linhas.map((l: any) => ({
            id: l.id, code: l.code, name: l.name,
            parent_id: l.parent_id ?? null,
            organization_id: l.organization_id ?? null,
            selecionavel: true,
        }));

        return [...pais, ...filhos];
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
        if (error) throw new Error(`Falha ao vincular: ${error.message}`);
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
        /** TODOS os centros de custo do condomínio — a despesa é a soma deles. */
        costCenterIds: string[];
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
        /**
         * Escape para incluir despesa que JÁ está em outro rateio vivo. O
         * default é excluir — ver o bloco 1.5 abaixo. Existe para um caso
         * futuro de recálculo/refazimento; hoje ninguém passa.
         */
        incluirJaRateadas?: boolean;
    }): Promise<PreviaRateio> {
        const inicio = params.competencia;
        // Fim = 1º dia do mês seguinte, por aritmética de STRING. Com
        // `new Date('2026-09-01')` + `setMonth(+1)` + `toISOString()`, em
        // America/Sao_Paulo o resultado era '2026-10-02' (meia-noite UTC vira
        // 21h do dia anterior no fuso local, e o setMonth estoura o dia 31) —
        // a despesa lançada no dia 1º do mês seguinte entrava no rateio do mês
        // anterior. Achado pelo teste condominioRateioNCentros em 2026-09-19.
        const [anoIni, mesIni] = inicio.split('-').map(Number);
        const fimISO = mesIni === 12
            ? `${anoIni + 1}-01-01`
            : `${anoIni}-${String(mesIni + 1).padStart(2, '0')}-01`;

        // 1. Despesas dos centros de custo do condomínio na competência.
        // `transaction_date`, NÃO `due_date`: é por ela que fn_dre e fn_balancete
        // recortam o período. Usar vencimento aqui faria o rateio e o balancete
        // discordarem sobre a qual mês a mesma despesa pertence — e o condômino
        // receberia uma cota que a contabilidade não confirma.
        // Lista vazia → nenhuma despesa (não "todas"): sem CC não há de onde tirar.
        if (params.costCenterIds.length === 0) {
            throw new Error('Este condomínio não tem centro de custo — não há de onde tirar as despesas.');
        }
        let queryTx = supabase
            .from('internal_transactions')
            .select('id, description, amount, transaction_date, direction, party_name, entity_name')
            .in('cost_center_id', params.costCenterIds)
            .eq('direction', 'DEBIT');
        queryTx = params.transactionIds && params.transactionIds.length > 0
            ? queryTx.in('id', params.transactionIds)
            : queryTx.gte('transaction_date', inicio).lt('transaction_date', fimISO);
        const { data: txs, error: erroTx } = await queryTx;
        if (erroTx) throw new Error(`Falha ao carregar as despesas: ${erroTx.message}`);

        const despesas: DespesaRateio[] = (txs || []).map((t: any) => ({
            transaction_id: t.id,
            // O rateio nasce com o rótulo já podado: a descrição da transação é,
            // na origem BOLETO, nome de arquivo ou o bloco de OCR da linha do
            // beneficiário. Ver `utils/despesaCondominio.ts` — e o síndico pode
            // reescrever depois, no detalhe do rateio em rascunho.
            descricao: rotuloDeDespesa(t.description, t.party_name || t.entity_name)
                ?? 'Despesa sem descrição',
            valor: Number(t.amount || 0),
            data: t.transaction_date,
        }));
        // 1.5. Fora as que JÁ entraram em outro rateio vivo.
        //
        // Nada no banco impede a mesma despesa cair em dois rateios:
        // `uidx_rateio_despesa` é (rateio_id, transaction_id) — por rateio —, e
        // `uidx_rateio_competencia` é (empreendimento, competência, TIPO), o que
        // deixa ORDINÁRIO e EXTRAORDINÁRIO do mesmo mês conviverem. Como a
        // janela de despesas não olha o tipo, o extraordinário de 09/2026 puxava
        // exatamente a MESMA lista do ordinário de 09/2026 e o condômino pagava
        // a conta duas vezes.
        //
        // A trava já existia (`listarJaRateadas`) e só o caminho de Contas a
        // Pagar a usava. Movida para cá, onde TODO caminho passa — é o mesmo
        // raciocínio das REGRAS #2/#3: corte na origem, seguro por padrão, em
        // vez de cada tela nova ter de lembrar.
        let jaRateadas = 0;
        let despesasElegiveis = despesas;
        if (!params.incluirJaRateadas && despesas.length > 0) {
            const usadas = await this.listarJaRateadas(despesas.map(d => d.transaction_id));
            if (usadas.size > 0) {
                despesasElegiveis = despesas.filter(d => !usadas.has(d.transaction_id));
                jaRateadas = despesas.length - despesasElegiveis.length;
            }
        }

        const totalCentavos = despesasElegiveis.reduce((s, d) => s + paraCentavos(d.valor), 0);

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
            // As ELEGÍVEIS, não todas: é esta lista que vira
            // `condominio_rateio_despesas` no salvar, e gravar aqui uma despesa
            // que não entrou no total faria a prestação de contas somar
            // diferente da cota cobrada.
            despesas: despesasElegiveis,
            totalDespesas: paraReais(totalCentavos),
            itens,
            totalRateado: paraReais(valores.reduce((s, v) => s + v, 0)),
            semDado: itens.filter(i => i.peso === 0 && params.criterio !== 'GRUPO').length,
            semResponsavel: itens.filter(i => !i.clientId).length,
            jaRateadas,
        };
    },

    /**
     * Os lançamentos do caixa do condomínio numa competência — a aba Despesas.
     *
     * Mesmo recorte da prévia do rateio (`previa`), de propósito: `DEBIT` nos
     * centros de custo do condomínio, por `transaction_date`. Se esta lista
     * mostrasse um recorte diferente, o síndico veria uma despesa aqui que não
     * aparece no rateio do mesmo mês e não teria como explicar a diferença.
     *
     * A marca `rateada` vem de `listarJaRateadas`, a mesma que a prévia usa
     * para excluir — aqui ela não exclui nada, só rotula: a aba existe
     * justamente para mostrar o que ficou de fora.
     */
    async listarLancamentos(params: {
        costCenterIds: string[];
        competencia: string;   // 'YYYY-MM-01'
    }): Promise<LancamentoDoCondominio[]> {
        if (params.costCenterIds.length === 0) return [];

        const inicio = params.competencia;
        const [ano, mes] = inicio.split('-').map(Number);
        const fimISO = mes === 12
            ? `${ano + 1}-01-01`
            : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

        const { data, error } = await supabase
            .from('internal_transactions')
            .select('id, description, amount, transaction_date, cost_center_id, party_name, entity_name, source_system, reference_id, supplier_id')
            .in('cost_center_id', params.costCenterIds)
            .eq('direction', 'DEBIT')
            .gte('transaction_date', inicio)
            .lt('transaction_date', fimISO)
            .order('transaction_date', { ascending: false });
        if (error) throw new Error(`Falha ao carregar os lançamentos: ${error.message}`);

        const linhas = data || [];
        if (linhas.length === 0) return [];

        // Rótulo do centro de custo, em lote.
        const ccs = await this.getCentrosDeCustoPorEmpreendimentoNomes(params.costCenterIds);

        // Código e arquivo do documento, em lote. Best-effort como na
        // Conciliação: sem permissão de leitura em `boletos` as colunas ficam
        // vazias, mas a lista de despesas continua de pé.
        let docs = new Map<string, DadosDoBoleto>();
        try {
            docs = await this.dadosDoBoleto(
                linhas.filter((l: any) => l.source_system === 'BOLETO' && l.reference_id)
                    .map((l: any) => l.reference_id as string),
            );
        } catch {
            // Idem: falhar aqui só apaga as colunas Código e Documento.
        }

        // Nome do fornecedor cadastrado, em lote. Best-effort como os códigos:
        // sem leitura em `suppliers` a coluna cai no texto cru, não some.
        let fornecedores = new Map<string, string>();
        try {
            fornecedores = await this.nomesDeFornecedor(
                linhas.map((l: any) => l.supplier_id).filter(Boolean) as string[]);
        } catch {
            // Idem: falhar aqui só devolve a coluna ao texto cru.
        }

        let emRateio = new Map<string, string>();
        try {
            emRateio = await this.competenciaDosRateios(linhas.map((l: any) => l.id as string));
        } catch {
            // Falhar aqui só tira a marca de rateio — não some com a lista.
        }

        return linhas.map((l: any) => {
            const comp = emRateio.get(l.id as string) ?? null;
            const doc = (l.source_system === 'BOLETO' && l.reference_id)
                ? docs.get(l.reference_id as string)
                : undefined;
            return {
                id: l.id as string,
                codigo: doc?.codigo ?? null,
                documentoPath: doc?.documentoPath ?? null,
                documentoNome: doc?.documentoNome ?? null,
                data: l.transaction_date as string,
                // Mesma poda de rótulo do rateio: na origem BOLETO a descrição é
                // nome de arquivo ou bloco de OCR. Ver `utils/despesaCondominio.ts`.
                descricao: rotuloDeDespesa(l.description, l.party_name || l.entity_name)
                    ?? 'Despesa sem descrição',
                valor: Number(l.amount || 0),
                // `podarRuidoDeBoleto` no texto cru: sem fornecedor cadastrado,
                // mostrar o bloco de OCR inteiro é pior que mostrar o começo
                // legível dele. É o mesmo podador da descrição.
                fornecedor: (l.supplier_id ? fornecedores.get(l.supplier_id as string) : undefined)
                    ?? podarRuidoDeBoleto(String(l.party_name || l.entity_name || '')),
                origem: (l.source_system || '') as string,
                costCenterId: (l.cost_center_id ?? null) as string | null,
                costCenterLabel: ccs.get(l.cost_center_id) ?? '—',
                rateada: comp !== null,
                rateioCompetencia: comp,
            };
        });
    },

    /**
     * `supplier.id → nome cadastrado`, em lote.
     *
     * Existe para a coluna Fornecedor não depender do texto que o leitor de
     * boleto extraiu. O cadastro é a versão curada do mesmo nome, e é a que o
     * resto do app mostra.
     */
    async nomesDeFornecedor(supplierIds: string[]): Promise<Map<string, string>> {
        const mapa = new Map<string, string>();
        const ids = [...new Set(supplierIds)];
        if (ids.length === 0) return mapa;

        const { data, error } = await supabase
            .from('suppliers')
            .select('id, name')
            .in('id', ids);
        if (error) throw new Error(`Falha ao carregar os fornecedores: ${error.message}`);

        for (const f of data || []) {
            const nome = String(f.name ?? '').trim();
            if (nome) mapa.set(f.id as string, nome);
        }
        return mapa;
    },

    /**
     * `boleto.id → { código, arquivo }` do documento de origem.
     *
     * O código segue a regra da Conciliação Bancária (`loadOriginCodes`):
     * `String(numero).padStart(4, '0')`.
     *
     * Aqui a chave é o `reference_id` do lançamento porque, na origem BOLETO,
     * ele é o id do boleto puro — sem os sufixos compostos que as origens de
     * contrato usam (ver `lib/receivableRef.ts` e o aviso de 22P02 em
     * `BankReconciliation.tsx`). Por isso este método não tenta desmontar a
     * referência: se a origem não for BOLETO, ela nem chega aqui.
     *
     * Traz só o PATH do arquivo, nunca uma URL: o bucket é privado e a
     * assinatura vale 15 minutos — assiná-la no carregamento da lista a faria
     * expirar antes do clique.
     */
    async dadosDoBoleto(boletoIds: string[]): Promise<Map<string, DadosDoBoleto>> {
        const mapa = new Map<string, DadosDoBoleto>();
        const ids = [...new Set(boletoIds)];
        if (ids.length === 0) return mapa;

        const { data, error } = await supabase
            .from('boletos')
            .select('id, numero, documento_path, documento_nome')
            .in('id', ids);
        if (error) throw new Error(`Falha ao carregar os documentos: ${error.message}`);

        for (const b of data || []) {
            const caminho = String(b.documento_path ?? '').trim();
            mapa.set(b.id as string, {
                codigo: b.numero == null ? null : String(b.numero).padStart(4, '0'),
                documentoPath: caminho || null,
                // Arquivo sem nome ainda é arquivo: o rótulo cai para "Documento"
                // na tela em vez de a linha perder o link.
                documentoNome: caminho ? (String(b.documento_nome ?? '').trim() || 'Documento') : null,
            });
        }
        return mapa;
    },

    /**
     * `transaction_id → competência ('YYYY-MM')` do rateio VIVO em que o título
     * entrou. Irmã de `listarJaRateadas`, que só responde sim/não.
     *
     * A competência importa porque nem sempre é o mês do título: rateio criado
     * a partir dos títulos MARCADOS no Fechamento por Centro de Custo ignora a
     * janela de data. Um título de agosto pode estar, legitimamente, no rateio
     * de julho — e a tela precisa poder dizer isso.
     *
     * Com o título em mais de um rateio vivo (o índice único é por rateio, não
     * global), fica a PRIMEIRA que vier: a tela mostra "entrou em rateio de
     * MM/AAAA", não pretende ser a lista completa.
     */
    async competenciaDosRateios(transactionIds: string[]): Promise<Map<string, string>> {
        const mapa = new Map<string, string>();
        if (transactionIds.length === 0) return mapa;
        const { data, error } = await supabase
            .from('condominio_rateio_despesas')
            .select('transaction_id, condominio_rateios!inner(status, competencia)')
            .in('transaction_id', transactionIds)
            .neq('condominio_rateios.status', 'CANCELADO');
        if (error) throw new Error(`Falha ao verificar despesas já lançadas: ${error.message}`);
        for (const d of data || []) {
            const tid = (d as any).transaction_id as string;
            if (mapa.has(tid)) continue;
            const comp = (d as any).condominio_rateios?.competencia as string | undefined;
            if (comp) mapa.set(tid, comp.slice(0, 7));
        }
        return mapa;
    },

    /** `id → "código — nome"` dos centros de custo dados. */
    async getCentrosDeCustoPorEmpreendimentoNomes(ids: string[]): Promise<Map<string, string>> {
        const mapa = new Map<string, string>();
        if (ids.length === 0) return mapa;
        const { data } = await supabase
            .from('cost_centers_v2').select('id, code, name').in('id', ids);
        for (const c of data || []) mapa.set(c.id, `${c.code} — ${c.name}`);
        return mapa;
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

    /** Grava a prévia como RASCUNHO. Fechar é ação separada e explícita.
     *  `costCenterId` é o PRIMEIRO centro de custo do condomínio (por código) —
     *  a coluna `condominio_rateios.cost_center_id` é única e virou rótulo; o
     *  filtro real da despesa é a lista passada à `previa`. */
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
            .select('id, transaction_id, descricao, valor')
            .eq('rateio_id', rateioId)
            .order('descricao', { ascending: true });
        if (error) throw new Error(`Falha ao carregar as despesas: ${error.message}`);
        return (data || []).map((d: any) => ({
            id: d.id,
            transaction_id: d.transaction_id,
            // Poda na LEITURA também, e não só na criação: os rateios que já
            // existem foram gravados com a descrição crua, e o condômino já os
            // enxerga no portal. Descrição escrita à mão passa intacta.
            descricao: rotuloDeDespesa(d.descricao) ?? 'Despesa sem descrição',
            valor: Number(d.valor || 0),
        }));
    },

    /**
     * Corrige a descrição de uma despesa do rateio.
     *
     * Só faz sentido em rateio RASCUNHO: fechado é prestação de contas, e
     * reescrever a linha depois de fechado muda o documento que o condômino já
     * recebeu. Quem chama garante o estado — a tela só oferece a edição no
     * rascunho.
     */
    async atualizarDescricaoDespesa(despesaId: string, descricao: string): Promise<void> {
        const limpa = descricao.trim();
        if (!limpa) throw new Error('A descrição não pode ficar vazia.');
        const { error } = await supabase
            .from('condominio_rateio_despesas')
            .update({ descricao: limpa })
            .eq('id', despesaId);
        if (error) throw new Error(`Falha ao salvar a descrição: ${error.message}`);
    },

    /**
     * As cotas de um rateio salvo, prontas para a tela — com o rótulo da
     * unidade e o nome de quem paga.
     *
     * Existe porque `listarItens` devolve UUIDs, e por isso nunca teve
     * chamador: a única lista cota-a-cota que a aba mostrava era a da sheet de
     * cobrança, que some assim que `cobranca_gerada_em` é preenchido. Depois de
     * cobrar, "quem deve quanto" deixava de ser respondível na tela — que é
     * justamente a pergunta da prestação de contas.
     *
     * O `client_id` lido é o GRAVADO na cota (quem era o responsável quando o
     * rateio foi calculado), não o ocupante de hoje: é o que o documento diz,
     * e documento não se reescreve sozinho quando a ocupação muda.
     */
    async listarCotas(rateioId: string): Promise<CotaDoRateio[]> {
        const { data, error } = await supabase
            .from('condominio_rateio_itens')
            .select('id, unit_id, peso, valor, client_id, transaction_id')
            .eq('rateio_id', rateioId);
        if (error) throw new Error(`Falha ao carregar as cotas: ${error.message}`);
        const linhas = data || [];
        if (linhas.length === 0) return [];

        const unitIds = [...new Set(linhas.map((l: any) => l.unit_id as string))];
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

        const clientIds = [...new Set(linhas.map((l: any) => l.client_id).filter(Boolean))] as string[];
        const nomes = new Map<string, string>();
        if (clientIds.length > 0) {
            const { data: cs } = await supabase.from('clients').select('id, name').in('id', clientIds);
            for (const c of cs || []) nomes.set(c.id, c.name);
        }

        return linhas
            .map((l: any) => ({
                id: l.id as string,
                unitId: l.unit_id as string,
                unitLabel: rotulo.get(l.unit_id) || '—',
                peso: Number(l.peso || 0),
                valor: Number(l.valor || 0),
                clientId: (l.client_id ?? null) as string | null,
                clientNome: l.client_id ? (nomes.get(l.client_id) || '—') : null,
                temRecebivel: !!l.transaction_id,
            }))
            .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, 'pt-BR'));
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
