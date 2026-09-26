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
import { rotuloDeDespesa, podarRuidoDeBoleto, rotuloDeFornecedor } from '../utils/despesaCondominio';

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

/** Buckets PRIVADOS de cada origem — a assinatura precisa saber qual. */
const BUCKET_BOLETOS = 'boletos';
const BUCKET_FISCAL = 'fiscal-documents';
const BUCKET_DOCUMENTOS = 'documents';

/** Origens cujo documento é a minuta do contrato. */
const ORIGENS_DE_CONTRATO = [
    'COMMERCIAL', 'CONTRACT_AVISTA', 'CONTRACT_PARCELADO',
    'CONTRACT_RECURRING', 'CONTRACT_MEASUREMENT',
] as const;

/**
 * O primeiro UUID que aparece no `reference_id`, em qualquer das grafias.
 *
 * `originIdFromRef` (lib/receivableRef.ts) corta no primeiro `-p` ou `:`, o que
 * resolve `<id>-p2020-11-15` e `<id>:p3` — mas NÃO resolve `tax-<uuid>-p…-pis`,
 * que começa com um prefixo. Medido em 25/09/2026: das 1.245 linhas
 * `COMMERCIAL`, boa parte usa essa terceira grafia. Procurar o UUID por forma,
 * em vez de cortar por posição, atende as três — e devolve `null` em vez de um
 * pedaço de string quando não há UUID nenhum, que é o que gerava 22P02 em
 * `.in()` (ver o aviso em `BankReconciliation.tsx`).
 */
export function uuidDaReferencia(ref?: string | null): string | null {
    const m = String(ref ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0].toLowerCase() : null;
}

/**
 * Número da NF-e (nNF) extraído da chave de acesso.
 *
 * `nfe_invoices` não guarda o número em coluna própria — só `access_key`. A
 * chave tem layout FIXO de 44 dígitos (MOC 6.0, anexo I):
 *
 *   cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 *                                            └ posições 25..33
 *
 * Fora dos 44 dígitos devolve `null` em vez de recortar posição nenhuma: chave
 * truncada existe (veio de OCR em outras telas), e um número inventado na
 * coluna Código é pior que a coluna vazia.
 */
export function numeroDaChaveNfe(chave?: string | null): string | null {
    const limpa = String(chave ?? '').replace(/\D/g, '');
    if (limpa.length !== 44) return null;
    const numero = Number(limpa.slice(25, 34));
    return Number.isFinite(numero) && numero > 0 ? String(numero) : null;
}

/** Último segmento do path, que é o nome do arquivo. Serve de rótulo quando a
 *  origem não guarda um nome próprio (é o caso do XML de NF-e). */
function nomeDoArquivo(path: string): string {
    const partes = path.split('/').filter(Boolean);
    return partes[partes.length - 1] || 'Documento';
}

export interface DespesaRateio {
    /** `condominio_rateio_despesas.id`. Só no snapshot salvo — a prévia ainda
     *  não gravou nada, e é por este id que a descrição é corrigida. */
    id?: string;
    transaction_id: string;
    descricao: string;
    valor: number;
    /** Só na prévia (vem de `internal_transactions`) — o snapshot salvo não guarda data. */
    data?: string;
    /**
     * Quem recebeu. Resolvido a partir do `transaction_id`, com a mesma ordem
     * da aba Despesas: fornecedor CADASTRADO primeiro, `party_name` podado
     * depois (`rotuloDeFornecedor`). `null` = não há nome em lugar nenhum.
     *
     * Não é coluna de `condominio_rateio_despesas`: o snapshot guarda
     * descrição e valor, e o fornecedor vem do lançamento de origem. Medido em
     * 25/09/2026: as 38 despesas de rateio da base acham o lançamento, e todas
     * as 38 têm fornecedor cadastrado.
     */
    fornecedor?: string | null;
    /**
     * O COMPROVANTE — o arquivo que originou a despesa (boleto, XML de NF-e,
     * minuta de contrato). É o que o relatório anexa quando o síndico marca
     * "incluir os comprovantes".
     *
     * Mesmo resolvedor por origem da aba Despesas (`resolverOrigens`), para o
     * mesmo lançamento não apontar para dois arquivos diferentes em duas telas.
     */
    documento?: DocumentoDeOrigem | null;
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
/**
 * O arquivo que originou a despesa, onde quer que ele esteja guardado.
 *
 * Carrega o BUCKET junto do path porque cada origem guarda no seu: boleto em
 * `boletos`, XML de NF-e em `fiscal-documents`. Assinar exige os dois, e
 * deixar o bucket implícito na tela seria espalhar essa decisão por quem
 * apenas exibe.
 */
export interface DocumentoDeOrigem {
    bucket: string;
    path: string;
    nome: string;
}

/** O que a origem de um lançamento oferece à lista: um código e um arquivo. */
export interface OrigemResolvida {
    codigo: string | null;
    documento: DocumentoDeOrigem | null;
}

/** O que `dadosDoBoleto` devolve — a origem BOLETO já resolvida. */
export type DadosDoBoleto = OrigemResolvida;

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
     * Arquivo do documento de origem, em bucket PRIVADO. Guarda o PATH — a URL
     * é assinada na hora de abrir (`storageService.createSignedUrl`, 15 min).
     * Assinar as 136 linhas no carregamento seria gastar 136 chamadas para o
     * usuário abrir, no máximo, uma — e a assinatura expiraria antes.
     *
     * `null` quando a origem não tem arquivo. Medido em 25/09/2026 sobre os
     * 2.053 lançamentos a DÉBITO da base:
     *
     *   BOLETO            635  → `boletos.documento_path`          ✅
     *   NFE                 3  → XML em `raw_documents.file_path`  ✅
     *   COMMERCIAL       1245  → minuta do contrato, via `commercial_deals`  ✅
     *                            (817 acham o contrato, 274 chegam ao arquivo)
     *   CONTRACT_*         59  → minuta do contrato, via `contracts.id`       ✅
     *                            (54 acham o contrato, 0 têm arquivo hoje)
     *   PURCHASE_ORDER     12  → `receipt_photo_path` existe, mas 0 de 20
     *                            pedidos têm foto, e o `reference_id` não casa
     *                            com `purchase_orders.id`
     *   LABOR/PROLABORE/PROJECT/MANUAL/ASSET_MAINTENANCE  99 → sem arquivo
     *
     * As origens sem resolvedor caem em `null` e a célula mostra "—".
     * Acrescentar uma é acrescentar um ramo em `resolverOrigens`.
     */
    documento: DocumentoDeOrigem | null;
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

        // Código e arquivo do documento, em lote e por origem.
        let origens = new Map<string, OrigemResolvida>();
        try {
            origens = await this.resolverOrigens(linhas as any);
        } catch {
            // `resolverOrigens` já isola cada origem; isto é a rede final.
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
            const origem = origens.get(l.id as string);
            return {
                id: l.id as string,
                codigo: origem?.codigo ?? null,
                documento: origem?.documento ?? null,
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
                // Arquivo sem nome ainda é arquivo: o rótulo cai para o nome do
                // arquivo no path, e só então para "Documento" — a linha nunca
                // perde o link por falta de rótulo.
                documento: caminho
                    ? { bucket: BUCKET_BOLETOS, path: caminho, nome: String(b.documento_nome ?? '').trim() || nomeDoArquivo(caminho) }
                    : null,
            });
        }
        return mapa;
    },

    /**
     * Origem `NFE` → o XML da nota, em `fiscal-documents`.
     *
     * `reference_id` é o id de `nfe_invoices` (conferido: casa 3 de 3 na base),
     * e o arquivo mora no `raw_document` de onde a nota foi extraída — a nota é
     * o dado normalizado, o XML é o documento. Duas consultas porque o vínculo
     * é `nfe_invoices.raw_document_id`, e o embed do PostgREST aqui já deu
     * PGRST201 por ambiguidade em outras telas.
     */
    async dadosDaNfe(nfeIds: string[]): Promise<Map<string, OrigemResolvida>> {
        const mapa = new Map<string, OrigemResolvida>();
        const ids = [...new Set(nfeIds)];
        if (ids.length === 0) return mapa;

        const { data: notas, error } = await supabase
            .from('nfe_invoices')
            .select('id, raw_document_id, access_key')
            .in('id', ids);
        if (error) throw new Error(`Falha ao carregar as notas: ${error.message}`);

        // O código sai da chave e não depende do XML: nota sem documento bruto
        // ainda mostra o número.
        const porRaw = new Map<string, string[]>();
        for (const n of notas || []) {
            mapa.set(n.id as string, { codigo: numeroDaChaveNfe(n.access_key as string), documento: null });
            const raw = n.raw_document_id as string | null;
            if (!raw) continue;
            if (!porRaw.has(raw)) porRaw.set(raw, []);
            porRaw.get(raw)!.push(n.id as string);
        }
        if (porRaw.size === 0) return mapa;

        const { data: brutos, error: erroBruto } = await supabase
            .from('raw_documents')
            .select('id, file_path')
            .in('id', [...porRaw.keys()]);
        if (erroBruto) throw new Error(`Falha ao carregar os XMLs: ${erroBruto.message}`);

        for (const r of brutos || []) {
            const caminho = String(r.file_path ?? '').trim();
            if (!caminho) continue;
            for (const nfeId of porRaw.get(r.id as string) || []) {
                const atual = mapa.get(nfeId);
                mapa.set(nfeId, {
                    codigo: atual?.codigo ?? null,
                    documento: { bucket: BUCKET_FISCAL, path: caminho, nome: nomeDoArquivo(caminho) },
                });
            }
        }
        return mapa;
    },

    /**
     * Origens de contrato → a minuta, no bucket `documents`.
     *
     * O `reference_id` aponta para DOIS alvos diferentes, conferido na base em
     * 25/09/2026:
     *
     *   COMMERCIAL           → `commercial_deals.id`  (817 de 1.245 casam)
     *   CONTRACT_AVISTA      → `contracts.id`         (11 de 16)
     *   CONTRACT_PARCELADO   → `contracts.id`         (43 de 43)
     *
     * Por isso a busca é pelos dois caminhos e o que casar vale. Do contrato
     * sai o número (coluna Código) e a última versão de documento COM arquivo —
     * há versão de minuta com `storage_path` nulo, que é registro sem arquivo.
     */
    async dadosDeContrato(refs: string[]): Promise<Map<string, OrigemResolvida>> {
        const mapa = new Map<string, OrigemResolvida>();
        const porUuid = new Map<string, string[]>();
        for (const ref of refs) {
            const uuid = uuidDaReferencia(ref);
            if (!uuid) continue;
            if (!porUuid.has(uuid)) porUuid.set(uuid, []);
            porUuid.get(uuid)!.push(ref);
        }
        if (porUuid.size === 0) return mapa;
        const uuids = [...porUuid.keys()];

        // Um SELECT só: o contrato casa pelo próprio id OU pelo negócio.
        const { data: contratos, error } = await supabase
            .from('contracts')
            .select('id, number, deal_id')
            .or(`id.in.(${uuids.join(',')}),deal_id.in.(${uuids.join(',')})`);
        if (error) throw new Error(`Falha ao carregar os contratos: ${error.message}`);

        /** uuid da referência → contrato. */
        const contratoDoUuid = new Map<string, { id: string; number: string | null }>();
        for (const c of contratos || []) {
            const resumo = { id: c.id as string, number: (c.number ?? null) as string | null };
            if (porUuid.has(c.id as string)) contratoDoUuid.set(c.id as string, resumo);
            const deal = (c.deal_id ?? null) as string | null;
            if (deal && porUuid.has(deal)) contratoDoUuid.set(deal, resumo);
        }
        if (contratoDoUuid.size === 0) return mapa;

        const idsDeContrato = [...new Set([...contratoDoUuid.values()].map(c => c.id))];
        const { data: versoes } = await supabase
            .from('contract_document_versions')
            .select('contract_id, v, name, storage_path')
            .in('contract_id', idsDeContrato)
            .not('storage_path', 'is', null)
            .order('v', { ascending: false });

        /** contrato → a versão mais recente COM arquivo (a lista já vem por `v` desc). */
        const docDoContrato = new Map<string, DocumentoDeOrigem>();
        for (const v of versoes || []) {
            const contrato = v.contract_id as string;
            if (docDoContrato.has(contrato)) continue;
            const caminho = String(v.storage_path ?? '').trim();
            if (!caminho) continue;
            docDoContrato.set(contrato, {
                bucket: BUCKET_DOCUMENTOS,
                path: caminho,
                nome: String(v.name ?? '').trim() || nomeDoArquivo(caminho),
            });
        }

        for (const [uuid, refsDoUuid] of porUuid) {
            const contrato = contratoDoUuid.get(uuid);
            if (!contrato) continue;
            const valor: OrigemResolvida = {
                codigo: contrato.number,
                documento: docDoContrato.get(contrato.id) ?? null,
            };
            for (const ref of refsDoUuid) mapa.set(ref, valor);
        }
        return mapa;
    },

    /**
     * Código e documento de cada lançamento, UMA entrada por `source_system`.
     *
     * É aqui que uma origem nova entra: um ramo que sabe ler o
     * `reference_id` daquela origem e devolver `{ codigo, documento }`.
     * Cada ramo falha sozinho — uma origem sem permissão de leitura apaga a
     * própria coluna, não a lista inteira.
     */
    async resolverOrigens(
        linhas: { id: string; source_system?: string | null; reference_id?: string | null }[],
    ): Promise<Map<string, OrigemResolvida>> {
        const porTransacao = new Map<string, OrigemResolvida>();
        const refsPorOrigem = new Map<string, Map<string, string[]>>();
        for (const l of linhas) {
            const origem = l.source_system || '';
            const ref = l.reference_id || '';
            if (!origem || !ref) continue;
            if (!refsPorOrigem.has(origem)) refsPorOrigem.set(origem, new Map());
            const porRef = refsPorOrigem.get(origem)!;
            if (!porRef.has(ref)) porRef.set(ref, []);
            porRef.get(ref)!.push(l.id);
        }

        const aplicar = (porRef: Map<string, string[]>, ref: string, valor: OrigemResolvida) => {
            for (const txId of porRef.get(ref) || []) porTransacao.set(txId, valor);
        };

        const boletos = refsPorOrigem.get('BOLETO');
        if (boletos) {
            try {
                const dados = await this.dadosDoBoleto([...boletos.keys()]);
                for (const [ref, valor] of dados) aplicar(boletos, ref, valor);
            } catch {
                // Só apaga as colunas Código e Documento das linhas de boleto.
            }
        }

        const notas = refsPorOrigem.get('NFE');
        if (notas) {
            try {
                const dados = await this.dadosDaNfe([...notas.keys()]);
                for (const [ref, valor] of dados) aplicar(notas, ref, valor);
            } catch {
                // Idem, para as linhas de NF-e.
            }
        }

        // Origens de contrato: todas caem no MESMO resolvedor, porque o
        // documento é o mesmo (a minuta) — só a grafia da referência muda.
        const refsDeContrato = new Map<string, string[]>();
        for (const origem of ORIGENS_DE_CONTRATO) {
            for (const [ref, txIds] of refsPorOrigem.get(origem) || []) {
                if (!refsDeContrato.has(ref)) refsDeContrato.set(ref, []);
                refsDeContrato.get(ref)!.push(...txIds);
            }
        }
        if (refsDeContrato.size > 0) {
            try {
                const dados = await this.dadosDeContrato([...refsDeContrato.keys()]);
                for (const [ref, valor] of dados) aplicar(refsDeContrato, ref, valor);
            } catch {
                // Idem, para as linhas de contrato.
            }
        }

        // Demais origens: sem arquivo hoje. Ver o comentário de `documento` em
        // `LancamentoDoCondominio` para a medição que sustenta isso.
        return porTransacao;
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

        // ⚠️ CONGELA a descrição antes de fechar. Em rascunho a tela mostra o
        // texto do lançamento; se o snapshot não fosse atualizado aqui, o
        // documento sairia com o texto ANTIGO — o síndico veria uma coisa na
        // tela e outra no PDF que o condômino recebe.
        //
        // Best-effort: falhar aqui não pode impedir o fechamento, que é o que
        // gera o número. Na pior hipótese o documento fica com o snapshot
        // antigo, que é o comportamento de antes desta mudança.
        try {
            await this.congelarDescricoes(id);
        } catch {
            // segue o fechamento
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

    /**
     * Grava no snapshot o texto que o rascunho estava mostrando. Chamado no
     * fechamento: dali em diante a linha é documento e não muda mais.
     */
    async congelarDescricoes(rateioId: string): Promise<void> {
        const { data } = await supabase
            .from('condominio_rateio_despesas')
            .select('id, transaction_id, descricao')
            .eq('rateio_id', rateioId);
        const linhas = (data || []).filter((d: any) => d.transaction_id);
        if (linhas.length === 0) return;

        const vivos = await this.lancamentosDasDespesas(linhas.map((d: any) => d.transaction_id));
        for (const d of linhas) {
            const v = vivos.get((d as any).transaction_id);
            if (!v) continue;
            const rotulo = rotuloDeDespesa(v.description, v.credor);
            // Só escreve o que MUDOU: um UPDATE por linha idêntica só gasta
            // round-trip e suja o histórico.
            if (!rotulo || rotulo === (d as any).descricao) continue;
            await supabase
                .from('condominio_rateio_despesas')
                .update({ descricao: rotulo })
                .eq('id', (d as any).id);
        }
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
    /**
     * Despesas de um rateio.
     *
     * ⚠️ RASCUNHO segue o LANÇAMENTO; FECHADO e CANCELADO seguem o snapshot.
     *
     * `condominio_rateio_despesas.descricao` é uma cópia tirada quando o rateio
     * foi criado. Isso é certo para um rateio fechado — é o documento que o
     * condômino recebeu, e documento não se reescreve sozinho. Mas num rascunho
     * a cópia envelhece: medido em 26/09/2026, as 38 despesas de rateio da base
     * divergiam do lançamento, porque as descrições boas ("Consumo de Energia",
     * "Manutençao do Elevador") foram escritas DEPOIS, e 5 snapshots ainda eram
     * nome de arquivo enquanto nenhum lançamento vivo era.
     *
     * A decisão de qual usar fica AQUI, e não em quem chama: a tela de detalhe e
     * o relatório leem a mesma lista, e um deles escolhendo diferente daria dois
     * textos para a mesma despesa.
     */
    async listarDespesas(rateioId: string): Promise<DespesaRateio[]> {
        const { data: rateio } = await supabase
            .from('condominio_rateios')
            .select('status')
            .eq('id', rateioId)
            .single();
        // Sem conseguir ler o status, trata como documento: mostrar o snapshot
        // nunca reescreve nada, e é o comportamento antigo.
        const seguirLancamento = (rateio as { status?: string } | null)?.status === 'RASCUNHO';

        const { data, error } = await supabase
            .from('condominio_rateio_despesas')
            .select('id, transaction_id, descricao, valor')
            .eq('rateio_id', rateioId)
            .order('descricao', { ascending: true });
        if (error) throw new Error(`Falha ao carregar as despesas: ${error.message}`);
        const linhas = data || [];

        // Fornecedor E descrição do lançamento de origem, em lote. Best-effort:
        // sem eles a linha cai no snapshot e o relatório continua de pé.
        let credores = new Map<string, string | null>();
        let lancamentos = new Map<string, { description: string | null; credor: string | null }>();
        try {
            const dados = await this.lancamentosDasDespesas(
                linhas.map((d: any) => d.transaction_id).filter(Boolean));
            lancamentos = dados;
            for (const [id, v] of dados) credores.set(id, rotuloDeFornecedor(v.fornecedor, v.credor));
        } catch {
            // Só apaga a coluna Fornecedor e mantém o snapshot na Descrição.
        }

        // O COMPROVANTE de cada despesa, pelo mesmo resolvedor por origem que a
        // aba Despesas usa. Best-effort: sem ele o relatório sai sem anexo.
        let comprovantes = new Map<string, OrigemResolvida>();
        try {
            const ids = linhas.map((d: any) => d.transaction_id).filter(Boolean);
            if (ids.length > 0) {
                const { data: txs } = await supabase
                    .from('internal_transactions')
                    .select('id, source_system, reference_id')
                    .in('id', ids);
                comprovantes = await this.resolverOrigens((txs || []) as any);
            }
        } catch {
            // Só tira o anexo; a lista continua de pé.
        }

        return linhas.map((d: any) => {
            const vivo = lancamentos.get(d.transaction_id);
            // Poda na LEITURA também, e não só na criação: os rateios que já
            // existem foram gravados com a descrição crua, e o condômino já os
            // enxerga no portal. Descrição escrita à mão passa intacta.
            //
            // O credor entra como segunda chance, igual à aba Despesas — sem
            // ele, descrição que é nome de arquivo virava "Despesa sem
            // descrição" aqui e o nome do fornecedor lá.
            const rotulo = seguirLancamento && vivo
                ? rotuloDeDespesa(vivo.description, vivo.credor)
                : rotuloDeDespesa(d.descricao, vivo?.credor);
            return {
                id: d.id,
                transaction_id: d.transaction_id,
                descricao: rotulo ?? 'Despesa sem descrição',
                valor: Number(d.valor || 0),
                fornecedor: credores.get(d.transaction_id) ?? null,
                documento: comprovantes.get(d.transaction_id)?.documento ?? null,
            };
        });
    },

    /**
     * `transaction_id → { descrição viva, credor cru, fornecedor cadastrado }`.
     *
     * Traz os três de uma vez porque quem chama precisa dos três pela MESMA
     * despesa: a descrição para o rascunho, o credor como segunda chance do
     * rótulo, e o fornecedor para a coluna própria.
     *
     * Duas consultas e não um embed: `internal_transactions → suppliers` já deu
     * `PGRST201` por ambiguidade noutras telas, e o custo de evitar isso é uma
     * consulta a mais sobre um punhado de ids.
     */
    async lancamentosDasDespesas(transactionIds: string[]): Promise<Map<string, {
        description: string | null; credor: string | null; fornecedor: string | null;
    }>> {
        const mapa = new Map<string, { description: string | null; credor: string | null; fornecedor: string | null }>();
        const ids = [...new Set(transactionIds)];
        if (ids.length === 0) return mapa;

        const { data: txs, error } = await supabase
            .from('internal_transactions')
            .select('id, description, supplier_id, party_name, entity_name')
            .in('id', ids);
        if (error) throw new Error(`Falha ao carregar os lançamentos: ${error.message}`);

        const nomes = await this.nomesDeFornecedor(
            (txs || []).map((t: any) => t.supplier_id).filter(Boolean) as string[]);

        for (const t of txs || []) {
            mapa.set(t.id as string, {
                description: (t.description ?? null) as string | null,
                credor: (t.party_name || t.entity_name || null) as string | null,
                fornecedor: t.supplier_id ? (nomes.get(t.supplier_id as string) ?? null) : null,
            });
        }
        return mapa;
    },

    /**
     * Corrige a descrição de uma despesa — no LANÇAMENTO, não no rateio.
     *
     * Decisão do usuário em 26/09/2026: uma descrição, um lugar. Corrigir aqui
     * conserta a despesa em Contas a Pagar, na aba Despesas, nos outros rateios
     * e no portal — não só dentro deste rateio. Era o contrário antes, e por
     * isso o mesmo boleto aparecia com dois textos em duas telas.
     *
     * Só faz sentido em rateio RASCUNHO: fechado é prestação de contas, e o
     * fechamento CONGELA o texto no snapshot (`fechar`). Quem chama garante o
     * estado — a tela só oferece a edição no rascunho.
     *
     * Sem `transactionId` (despesa de rateio montado à mão, sem lançamento de
     * origem), grava no snapshot mesmo: é o único lugar que existe.
     */
    async atualizarDescricaoDespesa(
        despesaId: string, descricao: string, transactionId?: string | null,
    ): Promise<void> {
        const limpa = descricao.trim();
        if (!limpa) throw new Error('A descrição não pode ficar vazia.');
        if (transactionId) {
            const { error } = await supabase
                .from('internal_transactions')
                .update({ description: limpa })
                .eq('id', transactionId);
            if (error) throw new Error(`Falha ao salvar a descrição: ${error.message}`);
            return;
        }
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
