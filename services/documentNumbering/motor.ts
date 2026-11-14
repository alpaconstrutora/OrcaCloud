// Imports com `.ts`: este arquivo também roda no Deno (Edge Function `pedido-fast`).
import { getDocTypeDefault } from './catalog.ts';
import { buildScopeKey, formatDocumentNumber, variablesInUse } from './format.ts';
import type { DocType, NumberingConfig, NumberingContext, VariableToken } from './types.ts';

/**
 * Motor da Nomenclatura com o cliente do banco INJETADO — o mesmo código no
 * navegador (`lib/supabase`, via `resolvers.ts`/`settingsService.ts`/`index.ts`)
 * e na Edge Function `pedido-fast` (service_role + `fn_next_document_seq_de`).
 * Molde: `criarMotor(db)` de `services/processMotor.ts`.
 *
 * Extraído SEM MUDANÇA de comportamento em 14/11/2026
 * (docs/planos/2026-11-14-pedido-fast.md, Parte 1 item 3): antes o código
 * importava `lib/supabase` direto, que no Deno não carrega (`import.meta.env`
 * do Vite). Os chamadores de sempre continuam importando de `index.ts`.
 *
 * Resolução de variáveis — NUNCA bloqueia a criação do documento. Decisão
 * revista em 2026-08-18 (usuário: "nada tem que ser exigido!"): a primeira
 * versão lançava `MissingCodeError` quando faltava código cadastrado, e isso
 * travou contratos reais em produção (obra sem vínculo de empreendimento,
 * fornecedor sem código, etc.). Agora, o que não puder ser resolvido
 * simplesmente fica de fora do número — `formatDocumentNumber` já descarta
 * slots sem valor (mesmo tratamento de slot `EMPTY`). Preferir um número mais
 * curto do que travar a operação.
 */

// deno-lint-ignore no-explicit-any
export type ClienteDeNumeracao = { from: (tabela: string) => any };

/** Reserva o próximo sequencial do escopo (RPC `fn_next_document_seq` ou o gêmeo `_de`). */
export type ReservarSequencial = (organizationId: string, docType: DocType, scopeKey: string) => Promise<number>;

const clean = (v?: string | null) => (v ?? '').trim();

interface LinhaDeConfig {
    organization_id: string;
    doc_type: DocType;
    slots: NumberingConfig['slots'];
    prefix: string;
    separator: NumberingConfig['separator'];
    seq_padding: number;
    year_suffix?: boolean | null;
}

export const configDaLinha = (row: LinhaDeConfig): NumberingConfig => ({
    slots: row.slots ?? [],
    prefix: row.prefix ?? '',
    separator: row.separator ?? '-',
    seqPadding: row.seq_padding ?? 4,
    yearSuffix: !!row.year_suffix,
});

export type { LinhaDeConfig };

/** Config de um único doc_type. Sem linha no banco → default do catálogo. */
export async function lerConfigDeNumeracao(
    db: ClienteDeNumeracao,
    organizationId: string,
    docType: DocType,
): Promise<NumberingConfig> {
    const { data, error } = await db
        .from('document_numbering_settings')
        .select('organization_id, doc_type, slots, prefix, separator, seq_padding, year_suffix')
        .eq('organization_id', organizationId)
        .eq('doc_type', docType)
        .maybeSingle();
    if (error) throw error;

    return data ? configDaLinha(data as LinhaDeConfig) : getDocTypeDefault(docType);
}

export function criarResolvedores(db: ClienteDeNumeracao) {
    /**
     * Códigos do empreendimento e da obra a partir de `projects.id`. Mesma lógica
     * de vínculo do antigo `orderNumberingService.resolveOrderCodes`
     * (obra→empreendimento via `empreendimentos.project_id`, com fallback para
     * `empreendimento_towers.project_id`), sem lançar erro quando falta algo —
     * devolve string vazia para o que não achar.
     */
    async function resolveEmpreendimentoEObraPorProjeto(
        projectId: string,
    ): Promise<{ empreendimento: string; obra: string }> {
        const { data: project } = await db
            .from('projects')
            .select('id, name, code, settings')
            .eq('id', projectId)
            .maybeSingle();

        const obraCode = clean(project?.code) || clean((project?.settings as { code?: string } | null)?.code);

        type EmpRow = { id: string; name: string; code?: string };
        const { data: empDirect } = await db
            .from('empreendimentos')
            .select('id, name, code')
            .eq('project_id', projectId)
            .limit(1);
        let emp = (empDirect || [])[0] as EmpRow | undefined;

        if (!emp) {
            const { data: tower } = await db
                .from('empreendimento_towers')
                .select('empreendimento_id')
                .eq('project_id', projectId)
                .limit(1);
            const empreendimentoId = (tower || [])[0]?.empreendimento_id;
            if (empreendimentoId) {
                const { data: empByTower } = await db
                    .from('empreendimentos')
                    .select('id, name, code')
                    .eq('id', empreendimentoId)
                    .limit(1);
                emp = (empByTower || [])[0] as EmpRow | undefined;
            }
        }

        return { empreendimento: clean(emp?.code), obra: obraCode };
    }

    async function resolveEmpreendimentoDireto(empreendimentoId: string): Promise<string> {
        const { data } = await db
            .from('empreendimentos')
            .select('id, code')
            .eq('id', empreendimentoId)
            .maybeSingle();
        return clean(data?.code);
    }

    /**
     * UNIDADE + EMPREENDIMENTO a partir do imóvel do Comercial, via
     * `vw_unit_property_map` — mesma view usada hoje por
     * rentalContractNumberingService/unitSaleContractNumberingService.
     */
    async function resolveUnidadeEEmpreendimentoPorImovel(
        propertyId: string,
        purpose: 'RENTAL' | 'SALE',
    ): Promise<{ unidade: string; empreendimento: string }> {
        const { data } = await db
            .from('vw_unit_property_map')
            .select('unit_id, unit_name, empreendimento_code')
            .eq('property_id', propertyId)
            .eq('purpose', purpose)
            .maybeSingle();

        return {
            unidade: clean((data as { unit_name?: string } | null)?.unit_name),
            empreendimento: clean((data as { empreendimento_code?: string } | null)?.empreendimento_code),
        };
    }

    async function resolveCodigoSimples(
        table: 'clients' | 'suppliers' | 'organizations' | 'cost_centers_v2' | 'investors',
        id: string,
    ): Promise<string> {
        const { data } = await db.from(table).select('id, code').eq('id', id).maybeSingle();
        return clean((data as { code?: string } | null)?.code);
    }

    /**
     * ORCAMENTO/PLANEJAMENTO: código do projeto indicado (`projects.code`, com
     * fallback para `settings.code` — mesma leitura de
     * `resolveEmpreendimentoEObraPorProjeto`). Não valida `classification`: quem
     * decide qual projeto é orçamento/planejamento é o chamador, ao passar o id
     * certo em `NumberingContext`.
     */
    async function resolveCodigoDeProjeto(projectId: string): Promise<string> {
        const { data } = await db.from('projects').select('id, code, settings').eq('id', projectId).maybeSingle();
        return clean(data?.code) || clean((data?.settings as { code?: string } | null)?.code);
    }

    /**
     * Resolve as variáveis que a máscara usa, a partir do contexto fornecido pelo
     * chamador. O que não puder ser resolvido (identificador ausente no contexto,
     * ou entidade sem código cadastrado) simplesmente não entra no resultado —
     * NUNCA lança erro. Ver comentário do topo do arquivo.
     */
    async function resolveVariables(
        tokens: VariableToken[],
        ctx: NumberingContext,
    ): Promise<Partial<Record<VariableToken, string>>> {
        const values: Partial<Record<VariableToken, string>> = {};
        const need = new Set(tokens);
        if (need.size === 0) return values;

        if ((need.has('EMPREENDIMENTO') || need.has('OBRA')) && ctx.projectId) {
            const { empreendimento, obra } = await resolveEmpreendimentoEObraPorProjeto(ctx.projectId);
            if (empreendimento) values.EMPREENDIMENTO = empreendimento;
            if (obra) values.OBRA = obra;
        }

        if (need.has('EMPREENDIMENTO') && !values.EMPREENDIMENTO && ctx.propertyId) {
            const { empreendimento } = await resolveUnidadeEEmpreendimentoPorImovel(ctx.propertyId, ctx.unitPurpose ?? 'SALE');
            if (empreendimento) values.EMPREENDIMENTO = empreendimento;
        }
        if (need.has('UNIDADE') && ctx.propertyId) {
            const { unidade } = await resolveUnidadeEEmpreendimentoPorImovel(ctx.propertyId, ctx.unitPurpose ?? 'SALE');
            if (unidade) values.UNIDADE = unidade;
        }

        if (need.has('EMPREENDIMENTO') && !values.EMPREENDIMENTO && ctx.empreendimentoId) {
            const empreendimento = await resolveEmpreendimentoDireto(ctx.empreendimentoId);
            if (empreendimento) values.EMPREENDIMENTO = empreendimento;
        }

        if (need.has('CLIENTE') && ctx.clientId) {
            const code = await resolveCodigoSimples('clients', ctx.clientId);
            if (code) values.CLIENTE = code;
        }

        if (need.has('FORNECEDOR') && ctx.supplierId) {
            const code = await resolveCodigoSimples('suppliers', ctx.supplierId);
            if (code) values.FORNECEDOR = code;
        }

        if (need.has('ORGANIZACAO') && ctx.organizationId) {
            const code = await resolveCodigoSimples('organizations', ctx.organizationId);
            if (code) values.ORGANIZACAO = code;
        }

        if (need.has('CENTRO_CUSTO') && ctx.costCenterId) {
            const code = await resolveCodigoSimples('cost_centers_v2', ctx.costCenterId);
            if (code) values.CENTRO_CUSTO = code;
        }

        // Tokens novos de 2026-08-30 (docs/planos/2026-08-30-nomenclatura-tabela-unica.md).
        // Nenhum dos 11 fluxos de criação passa esses ids ainda — resolvem para
        // vazio (some do número, nunca bloqueia) até um fluxo futuro ligar o contexto.
        if (need.has('INVESTIDOR') && ctx.investorId) {
            const code = await resolveCodigoSimples('investors', ctx.investorId);
            if (code) values.INVESTIDOR = code;
        }

        if (need.has('ORCAMENTO') && ctx.orcamentoProjectId) {
            const code = await resolveCodigoDeProjeto(ctx.orcamentoProjectId);
            if (code) values.ORCAMENTO = code;
        }

        if (need.has('PLANEJAMENTO') && ctx.planejamentoProjectId) {
            const code = await resolveCodigoDeProjeto(ctx.planejamentoProjectId);
            if (code) values.PLANEJAMENTO = code;
        }

        // Ofícios (08/10/2026). A emissão (`doc_gen_emitir`) resolve a sigla de novo
        // no banco — este valor serve à PRÉVIA do número na tela.
        if (need.has('DEPARTAMENTO') && ctx.departmentId) {
            const { data } = await db.from('company_departments').select('id, sigla').eq('id', ctx.departmentId).maybeSingle();
            const sigla = clean((data as { sigla?: string | null } | null)?.sigla).toUpperCase();
            if (sigla) values.DEPARTAMENTO = sigla;
        }

        return values;
    }

    return { resolveVariables };
}

export interface DependenciasDaNumeracao {
    lerConfig: (organizationId: string, docType: DocType) => Promise<NumberingConfig>;
    resolver: (tokens: VariableToken[], ctx: NumberingContext) => Promise<Partial<Record<VariableToken, string>>>;
    reservar: ReservarSequencial;
}

/**
 * Gera o próximo número de um documento: lê a máscara configurada (ou o
 * default do catálogo), resolve as variáveis que ela usa a partir do
 * contexto, reserva o sequencial atômico no banco (escopo = combinação das
 * variáveis, na ordem da máscara) e formata.
 *
 * O sequencial é consumido mesmo que o insert do documento falhe depois —
 * buraco na numeração é preferível a número repetido (mesma regra dos
 * serviços de numeração anteriores).
 */
export async function gerarNumeroDeDocumento(
    deps: DependenciasDaNumeracao,
    docType: DocType,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const config = await deps.lerConfig(organizationId, docType);
    const tokens = variablesInUse(config.slots);

    const values = await deps.resolver(tokens, { ...ctx, organizationId });
    // `yearSuffix` (Ofícios): o ano entra no escopo e no fim do número. Os 12 tipos
    // anteriores não usam — para eles nada muda.
    const year = new Date().getFullYear();
    const scopeKey = buildScopeKey(config.slots, values, config.yearSuffix ? { year } : undefined);

    const seq = await deps.reservar(organizationId, docType, scopeKey);

    return formatDocumentNumber(config, values, Number(seq), year);
}

/** O motor completo sobre um cliente — o que a Edge Function usa. */
export function criarNumeracao(db: ClienteDeNumeracao, reservar: ReservarSequencial) {
    const { resolveVariables } = criarResolvedores(db);
    const deps: DependenciasDaNumeracao = {
        lerConfig: (org, docType) => lerConfigDeNumeracao(db, org, docType),
        resolver: resolveVariables,
        reservar,
    };
    return {
        resolveVariables,
        gerar: (docType: DocType, organizationId: string, ctx: Omit<NumberingContext, 'organizationId'>) =>
            gerarNumeroDeDocumento(deps, docType, organizationId, ctx),
    };
}
