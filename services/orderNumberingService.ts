import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';

/**
 * Numeração de Pedido de Compra — `PC-{empreendimento}-{obra}-{seq}`.
 *
 * Regras de produto (Configurações do Sistema › Nomenclatura):
 *  - o sequencial é POR OBRA e vem do banco (`fn_next_purchase_order_seq`), não
 *    de MAX+1 no cliente — dois usuários na mesma obra colidiriam;
 *  - se o Empreendimento ou a Obra não tiver código cadastrado, a criação do
 *    pedido é BLOQUEADA com mensagem explícita (decisão do usuário, 28/07/2026).
 */

export class MissingCodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingCodeError';
    }
}

interface ResolvedCodes {
    empreendimentoCode: string;
    obraCode: string;
}

const clean = (v?: string | null) => (v ?? '').trim();

/**
 * Códigos do empreendimento e da obra de um `projects.id`.
 *
 * O vínculo obra→empreendimento mora nos dois sentidos do módulo
 * (`empreendimentos.project_id` = obra principal, `empreendimento_towers.project_id`
 * = obra por torre). O principal tem precedência, igual a
 * `empreendimentoService.mapObrasToEmpreendimentos`.
 */
export async function resolveOrderCodes(projectId: string): Promise<ResolvedCodes> {
    if (!projectId) throw new MissingCodeError('Selecione a obra antes de salvar o pedido.');

    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, settings')
        .eq('id', projectId)
        .single();
    if (projectError) throw projectError;

    const obraCode = clean((project?.settings as { code?: string } | null)?.code);
    const projectName = project?.name || 'a obra selecionada';

    // Vínculo principal primeiro; só cai para torre se não achar.
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
    if (!emp) {
        faltando.push(`a obra "${projectName}" não está vinculada a nenhum empreendimento`);
    } else if (!clean(emp.code)) {
        faltando.push(`o empreendimento "${emp.name}" está sem código`);
    }
    if (!obraCode) faltando.push(`a obra "${projectName}" está sem código`);

    if (faltando.length > 0) {
        throw new MissingCodeError(
            `Não é possível gerar o número do pedido: ${faltando.join(' e ')}. ` +
            'Cadastre o código antes de criar o pedido (Empreendimentos › Dados Gerais e Obra › Editar).',
        );
    }

    return { empreendimentoCode: clean(emp!.code), obraCode };
}

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatOrderNumber(
    codes: ResolvedCodes,
    seq: number,
    settings: Pick<AppSettings, 'orderPrefix' | 'orderNumberPattern' | 'orderSeqPadding'>,
): string {
    // Prefixo legado era 'PO-' (com hífen); a máscara já traz os separadores,
    // então o hífen de borda sairia duplicado.
    const prefixo = clean(settings.orderPrefix).replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.orderSeqPadding) || 1);

    return (settings.orderNumberPattern || '{prefixo}-{empreendimento}-{obra}-{seq}')
        .replace(/{prefixo}/g, prefixo)
        .replace(/{empreendimento}/g, codes.empreendimentoCode)
        .replace(/{obra}/g, codes.obraCode)
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da obra e devolve o número completo.
 * O sequencial é consumido mesmo que o insert do pedido falhe depois — buraco na
 * numeração é preferível a número repetido.
 */
export async function generateOrderNumber(projectId: string): Promise<string> {
    const codes = await resolveOrderCodes(projectId);

    const { data: seq, error } = await supabase.rpc('fn_next_purchase_order_seq', {
        p_project_id: projectId,
    });
    if (error) throw new Error(`Falha ao gerar o número do pedido: ${error.message}`);

    return formatOrderNumber(codes, Number(seq), appSettingsService.get());
}
