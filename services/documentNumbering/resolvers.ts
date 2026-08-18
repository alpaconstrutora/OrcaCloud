import { supabase } from '../../lib/supabase';
import { MissingCodeError, NumberingContext, VariableToken } from './types';

const clean = (v?: string | null) => (v ?? '').trim();

/**
 * Códigos do empreendimento e da obra a partir de `projects.id`.
 *
 * Mesma lógica de `orderNumberingService.resolveOrderCodes` (obra→empreendimento
 * via `empreendimentos.project_id`, com fallback para `empreendimento_towers.project_id`),
 * trazida para cá para ser reusada por todos os doc_types que passam por obra.
 *
 * Correção em relação ao original: lê `projects.code` (coluna) com fallback
 * para `settings->>'code'` (JSONB) — o serviço antigo lia só o JSONB, enquanto
 * a UI de Obras (`ProjectList.tsx`) já lê a coluna com esse mesmo fallback.
 *
 * `necessario` diz quais dos dois códigos a máscara REALMENTE usa — uma
 * máscara com {Empreendimento} mas sem {Obra} não pode ser bloqueada por
 * falta de código na obra, já que esse valor nem entra no número final.
 */
async function resolveEmpreendimentoEObraPorProjeto(
    projectId: string,
    necessario: { empreendimento: boolean; obra: boolean },
): Promise<{ empreendimento: string; obra: string }> {
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, code, settings')
        .eq('id', projectId)
        .single();
    if (projectError) throw projectError;

    const obraCode = clean(project?.code) || clean((project?.settings as { code?: string } | null)?.code);
    const projectName = project?.name || 'a obra selecionada';

    const { data: empDirect } = await supabase
        .from('empreendimentos')
        .select('id, name, code')
        .eq('project_id', projectId)
        .limit(1);

    type EmpRow = { id: string; name: string; code?: string };
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

    const faltando: string[] = [];
    if (necessario.empreendimento) {
        if (!emp) {
            faltando.push(`a obra "${projectName}" não está vinculada a nenhum empreendimento`);
        } else if (!clean(emp.code)) {
            faltando.push(`o empreendimento "${emp.name}" está sem código`);
        }
    }
    if (necessario.obra && !obraCode) faltando.push(`a obra "${projectName}" está sem código`);

    if (faltando.length > 0) {
        throw new MissingCodeError(
            `Não é possível gerar o número do documento: ${faltando.join(' e ')}. ` +
            'Cadastre o código antes de continuar (Empreendimentos › Dados Gerais e Obra › Editar).',
        );
    }

    return { empreendimento: clean(emp?.code), obra: obraCode };
}

async function resolveEmpreendimentoDireto(empreendimentoId: string): Promise<string> {
    const { data, error } = await supabase
        .from('empreendimentos')
        .select('id, name, code')
        .eq('id', empreendimentoId)
        .single();
    if (error) throw error;

    const code = clean(data?.code);
    if (!code) {
        throw new MissingCodeError(
            `Não é possível gerar o número do documento: o empreendimento "${data?.name ?? ''}" está sem código. ` +
            'Cadastre o código em Empreendimentos › Dados Gerais.',
        );
    }
    return code;
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
    const { data, error } = await supabase
        .from('vw_unit_property_map')
        .select('unit_id, unit_name, empreendimento_code')
        .eq('property_id', propertyId)
        .eq('purpose', purpose)
        .maybeSingle();
    if (error) throw error;

    if (!data?.unit_id) {
        throw new MissingCodeError(
            'Não é possível gerar o número do documento: o imóvel não está vinculado a uma unidade de Empreendimento. ' +
            'Vincule a unidade em Empreendimentos › Torres › Unidades.',
        );
    }

    return {
        unidade: clean((data as { unit_name?: string }).unit_name),
        empreendimento: clean((data as { empreendimento_code?: string }).empreendimento_code),
    };
}

async function resolveCodigoSimples(
    table: 'clients' | 'suppliers' | 'organizations' | 'cost_centers_v2',
    id: string,
    entidadeLabel: string,
    ondeCadastrar: string,
): Promise<string> {
    const { data, error } = await supabase.from(table).select('id, name, code').eq('id', id).single();
    if (error) throw error;

    const code = clean((data as { code?: string } | null)?.code);
    if (!code) {
        const nome = (data as { name?: string } | null)?.name ?? '';
        throw new MissingCodeError(
            `Não é possível gerar o número do documento: ${entidadeLabel} "${nome}" está sem código. Cadastre em ${ondeCadastrar}.`,
        );
    }
    return code;
}

/**
 * Resolve todas as variáveis que a máscara usa, a partir do contexto
 * fornecido pelo chamador. Lança `MissingCodeError` (bloqueia a criação) se
 * alguma variável usada na máscara não puder ser resolvida — inclui tanto
 * "faltou código cadastrado" quanto "este contexto não traz o identificador
 * necessário" (erro de integração, não deveria acontecer em produção se o
 * catálogo/F4 estiverem certos).
 */
export async function resolveVariables(
    tokens: VariableToken[],
    ctx: NumberingContext,
): Promise<Partial<Record<VariableToken, string>>> {
    const values: Partial<Record<VariableToken, string>> = {};
    const need = new Set(tokens);
    if (need.size === 0) return values;

    // EMPREENDIMENTO + OBRA compartilham uma resolução só quando vêm da obra —
    // mas só EXIGE código do que a máscara realmente usa (uma máscara sem
    // {Obra} não pode travar por falta de código NA obra).
    if ((need.has('EMPREENDIMENTO') || need.has('OBRA')) && ctx.projectId) {
        const { empreendimento, obra } = await resolveEmpreendimentoEObraPorProjeto(ctx.projectId, {
            empreendimento: need.has('EMPREENDIMENTO'),
            obra: need.has('OBRA'),
        });
        if (need.has('EMPREENDIMENTO')) values.EMPREENDIMENTO = empreendimento;
        if (need.has('OBRA')) values.OBRA = obra;
    } else if (need.has('OBRA') && !ctx.projectId) {
        throw new MissingCodeError('Não é possível gerar o número do documento: selecione a obra antes de salvar.');
    }

    if ((need.has('UNIDADE') || (need.has('EMPREENDIMENTO') && !values.EMPREENDIMENTO)) && ctx.propertyId) {
        const { unidade, empreendimento } = await resolveUnidadeEEmpreendimentoPorImovel(
            ctx.propertyId, ctx.unitPurpose ?? 'SALE',
        );
        if (need.has('UNIDADE')) values.UNIDADE = unidade;
        if (need.has('EMPREENDIMENTO')) values.EMPREENDIMENTO = empreendimento;
    }

    if (need.has('UNIDADE') && !values.UNIDADE) {
        throw new MissingCodeError('Não é possível gerar o número do documento: selecione a unidade antes de continuar.');
    }

    if (need.has('EMPREENDIMENTO') && !values.EMPREENDIMENTO) {
        if (ctx.empreendimentoId) {
            values.EMPREENDIMENTO = await resolveEmpreendimentoDireto(ctx.empreendimentoId);
        } else {
            throw new MissingCodeError(
                'Não é possível gerar o número do documento: a máscara usa {Empreendimento}, mas este documento não está ' +
                'vinculado a uma obra nem a um empreendimento. Selecione uma obra, ou ajuste a máscara em Configurações do ' +
                'Sistema › Nomenclatura para não usar essa variável neste tipo de documento.',
            );
        }
    }

    if (need.has('CLIENTE')) {
        if (!ctx.clientId) throw new MissingCodeError('Não é possível gerar o número do documento: selecione o cliente antes de continuar.');
        values.CLIENTE = await resolveCodigoSimples('clients', ctx.clientId, 'o cliente', 'Clientes');
    }

    if (need.has('FORNECEDOR')) {
        if (!ctx.supplierId) throw new MissingCodeError('Não é possível gerar o número do documento: selecione o fornecedor antes de continuar.');
        values.FORNECEDOR = await resolveCodigoSimples('suppliers', ctx.supplierId, 'o fornecedor', 'Fornecedores');
    }

    if (need.has('ORGANIZACAO')) {
        values.ORGANIZACAO = await resolveCodigoSimples('organizations', ctx.organizationId, 'a organização', 'Configurações › Organização');
    }

    if (need.has('CENTRO_CUSTO')) {
        if (!ctx.costCenterId) throw new MissingCodeError('Não é possível gerar o número do documento: selecione o centro de custo antes de continuar.');
        values.CENTRO_CUSTO = await resolveCodigoSimples('cost_centers_v2', ctx.costCenterId, 'o centro de custo', 'Configurações › Centro de Custo');
    }

    return values;
}
