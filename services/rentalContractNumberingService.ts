import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';

/**
 * Numeração de Contratos de LOCAÇÃO — `CL-{ano}-{seq}`.
 *
 * Cópia do mecanismo de `orderNumberingService.ts` (Numeração de Pedidos): a
 * máscara mora no mesmo `AppSettings` (localStorage, `opura_app_settings`),
 * configurável em Configurações do Sistema › Nomenclatura › Contratos de
 * Locação, e o sequencial vem do banco.
 *
 * A diferença é o ESCOPO do sequencial: em Pedidos é por obra; aqui é por
 * organização + ano, porque contrato de locação não tem obra
 * (`contracts.project_id` fica nulo — REGRA #2 em contractService.ts). É o
 * mesmo escopo que a numeração já usava; o que muda é sair de MAX+1 no
 * navegador para um contador atômico (`fn_next_rental_contract_seq`), que dois
 * usuários gerando contrato ao mesmo tempo não conseguem colidir.
 *
 * Por não depender de obra/empreendimento, NÃO existe aqui o bloqueio por
 * código faltando (`MissingCodeError`) que Pedidos e Contratos de Suprimentos
 * aplicam.
 */

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatRentalContractNumber(
    year: number,
    seq: number,
    settings: Pick<AppSettings, 'rentalContractPrefix' | 'rentalContractNumberPattern' | 'rentalContractSeqPadding'>,
): string {
    const prefixo = (settings.rentalContractPrefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.rentalContractSeqPadding) || 1);

    return (settings.rentalContractNumberPattern || '{prefixo}-{ano}-{seq}')
        .replace(/{prefixo}/g, prefixo)
        .replace(/{ano}/g, String(year))
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da organização/ano e devolve o número completo.
 * O sequencial é consumido mesmo que o insert do contrato falhe depois — buraco
 * na numeração é preferível a número repetido.
 */
export async function generateRentalContractNumber(orgId: string, year: number): Promise<string> {
    if (!orgId) throw new Error('Negociação sem organização — impossível gerar o número do contrato.');

    const { data: seq, error } = await supabase.rpc('fn_next_rental_contract_seq', {
        p_org_id: orgId,
        p_year: year,
    });
    if (error) throw new Error(`Falha ao gerar o número do contrato de locação: ${error.message}`);

    return formatRentalContractNumber(year, Number(seq), appSettingsService.get());
}
