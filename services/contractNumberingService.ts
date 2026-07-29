import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';
import { resolveOrderCodes, MissingCodeError } from './orderNumberingService';

/**
 * Numeração de Contratos (Suprimentos) — `CT-{empreendimento}-{obra}-{seq}`.
 *
 * Cópia literal do mecanismo de `orderNumberingService.ts` (Numeração de
 * Pedidos): a máscara mora no mesmo `AppSettings` (localStorage,
 * `opura_app_settings`), sempre ativa — sem toggle liga/desliga. O
 * sequencial é por obra e vem do banco (`fn_next_contract_seq`), igual ao
 * de pedidos, pelo mesmo motivo: dois usuários criando contrato na mesma
 * obra ao mesmo tempo não podem colidir com MAX+1 no cliente.
 *
 * Escopo: só contratos `domain === 'SUPRIMENTOS'` (ver ContractModal.tsx).
 * Serviços, Vendas e Locações continuam com o formato legado `001`.
 */

export { MissingCodeError };

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatContractNumber(
    codes: { empreendimentoCode: string; obraCode: string },
    seq: number,
    settings: Pick<AppSettings, 'contractPrefix' | 'contractNumberPattern' | 'contractSeqPadding'>,
): string {
    const prefixo = (settings.contractPrefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.contractSeqPadding) || 1);

    return (settings.contractNumberPattern || '{prefixo}-{empreendimento}-{obra}-{seq}')
        .replace(/{prefixo}/g, prefixo)
        .replace(/{empreendimento}/g, codes.empreendimentoCode)
        .replace(/{obra}/g, codes.obraCode)
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da obra e devolve o número completo do contrato.
 * Reusa `resolveOrderCodes` (mesma regra de vínculo obra→empreendimento do PC);
 * a mensagem de `MissingCodeError` fala em "pedido" — o chamador (ContractModal)
 * reescreve para "contrato" ao exibir.
 */
export async function generateContractNumber(projectId: string): Promise<string> {
    const codes = await resolveOrderCodes(projectId);

    const { data: seq, error } = await supabase.rpc('fn_next_contract_seq', {
        p_project_id: projectId,
    });
    if (error) throw new Error(`Falha ao gerar o número do contrato: ${error.message}`);

    return formatContractNumber(codes, Number(seq), appSettingsService.get());
}
