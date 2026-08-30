import { supabase } from '../../lib/supabase';
import { NumberingContext, VariableToken } from './types';

const clean = (v?: string | null) => (v ?? '').trim();

/**
 * Resolução de variáveis da Nomenclatura — NUNCA bloqueia a criação do
 * documento. Decisão revista em 2026-08-18 (usuário: "nada tem que ser
 * exigido!"): a primeira versão lançava `MissingCodeError` quando faltava
 * código cadastrado, e isso travou contratos reais em produção (obra sem
 * vínculo de empreendimento, fornecedor sem código, etc.). Agora, o que não
 * puder ser resolvido simplesmente fica de fora do número — `formatDocumentNumber`
 * já descarta slots sem valor (mesmo tratamento de slot `EMPTY`). Preferir um
 * número mais curto do que travar a operação.
 */

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
    const { data: project } = await supabase
        .from('projects')
        .select('id, name, code, settings')
        .eq('id', projectId)
        .maybeSingle();

    const obraCode = clean(project?.code) || clean((project?.settings as { code?: string } | null)?.code);

    type EmpRow = { id: string; name: string; code?: string };
    const { data: empDirect } = await supabase
        .from('empreendimentos')
        .select('id, name, code')
        .eq('project_id', projectId)
        .limit(1);
    let emp = (empDirect || [])[0] as EmpRow | undefined;

    if (!emp) {
        const { data: tower } = await supabase
            .from('empreendimento_towers')
            .select('empreendimento_id')
            .eq('project_id', projectId)
            .limit(1);
        const empreendimentoId = (tower || [])[0]?.empreendimento_id;
        if (empreendimentoId) {
            const { data: empByTower } = await supabase
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
    const { data } = await supabase
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
    const { data } = await supabase
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
    const { data } = await supabase.from(table).select('id, code').eq('id', id).maybeSingle();
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
    const { data } = await supabase.from('projects').select('id, code, settings').eq('id', projectId).maybeSingle();
    return clean(data?.code) || clean((data?.settings as { code?: string } | null)?.code);
}

/**
 * Resolve as variáveis que a máscara usa, a partir do contexto fornecido pelo
 * chamador. O que não puder ser resolvido (identificador ausente no contexto,
 * ou entidade sem código cadastrado) simplesmente não entra no resultado —
 * NUNCA lança erro. Ver comentário do topo do arquivo.
 */
export async function resolveVariables(
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

    return values;
}
