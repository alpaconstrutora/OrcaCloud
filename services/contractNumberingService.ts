import { supabase } from '../lib/supabase';
import { resolveOrderCodes, MissingCodeError } from './orderNumberingService';

/**
 * Numeração de Contratos (Suprimentos) — `CT-{empreendimento}-{obra}-{seq}`.
 *
 * Espelha `orderNumberingService.ts` (Numeração de Pedidos), com uma diferença:
 * a configuração da máscara mora em tabela por organização
 * (`contract_numbering_settings`), não em `localStorage` — é config de empresa,
 * não de navegador/usuário.
 *
 * Escopo: só contratos `domain === 'SUPRIMENTOS'`. Serviços, Vendas e Locações
 * continuam com o formato legado `001` (services/contractService.ts).
 *
 * Off por padrão (`enabled: false`): enquanto o usuário não ativar em
 * Configurações do Sistema › Nomenclatura, `ContractModal` usa o fluxo antigo.
 */

export { MissingCodeError };

export interface ContractNumberingSettings {
    enabled: boolean;
    prefix: string;
    /** Máscara. Tokens: {prefixo} {empreendimento} {obra} {seq}. */
    pattern: string;
    /** Casas do sequencial por obra. */
    seqPadding: number;
}

export const CONTRACT_NUMBERING_DEFAULTS: ContractNumberingSettings = {
    enabled: false,
    prefix: 'CT',
    pattern: '{prefixo}-{empreendimento}-{obra}-{seq}',
    seqPadding: 4,
};

interface ContractNumberingSettingsRow {
    organization_id: string;
    enabled: boolean;
    prefix: string;
    pattern: string;
    seq_padding: number;
}

/** Busca a config da org; cai nos defaults (enabled:false) se não houver linha. */
export async function getSettings(organizationId: string | null): Promise<ContractNumberingSettings> {
    if (!organizationId) return { ...CONTRACT_NUMBERING_DEFAULTS };

    const { data, error } = await supabase
        .from('contract_numbering_settings')
        .select('organization_id, enabled, prefix, pattern, seq_padding')
        .eq('organization_id', organizationId)
        .maybeSingle();

    if (error) throw new Error(`Falha ao carregar numeração de contratos: ${error.message}`);
    if (!data) return { ...CONTRACT_NUMBERING_DEFAULTS };

    const row = data as ContractNumberingSettingsRow;
    return {
        enabled: row.enabled,
        prefix: row.prefix,
        pattern: row.pattern,
        seqPadding: row.seq_padding,
    };
}

export async function saveSettings(organizationId: string, settings: ContractNumberingSettings): Promise<void> {
    if (!organizationId) throw new Error('Selecione a organização para salvar a numeração de contratos.');

    const { error } = await supabase
        .from('contract_numbering_settings')
        .upsert({
            organization_id: organizationId,
            enabled: settings.enabled,
            prefix: settings.prefix,
            pattern: settings.pattern,
            seq_padding: settings.seqPadding,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });

    if (error) throw new Error(`Falha ao salvar numeração de contratos: ${error.message}`);
}

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatContractNumber(
    codes: { empreendimentoCode: string; obraCode: string },
    seq: number,
    settings: Pick<ContractNumberingSettings, 'prefix' | 'pattern' | 'seqPadding'>,
): string {
    const prefixo = (settings.prefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.seqPadding) || 1);

    return (settings.pattern || CONTRACT_NUMBERING_DEFAULTS.pattern)
        .replace(/{prefixo}/g, prefixo)
        .replace(/{empreendimento}/g, codes.empreendimentoCode)
        .replace(/{obra}/g, codes.obraCode)
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da obra e devolve o número completo do contrato.
 * Reusa `resolveOrderCodes` (mesma regra de vínculo obra→empreendimento do PC);
 * a mensagem de erro genérica de `MissingCodeError` fala em "pedido" — o
 * chamador (ContractModal) deve reescrever para "contrato" ao exibir.
 */
export async function generateContractNumber(projectId: string, settings: ContractNumberingSettings): Promise<string> {
    const codes = await resolveOrderCodes(projectId);

    const { data: seq, error } = await supabase.rpc('fn_next_contract_seq', {
        p_project_id: projectId,
    });
    if (error) throw new Error(`Falha ao gerar o número do contrato: ${error.message}`);

    return formatContractNumber(codes, Number(seq), settings);
}

/** Objeto de conveniência — mesmo padrão de `appSettingsService`. */
export const contractNumberingService = {
    getSettings,
    saveSettings,
    formatContractNumber,
    generateContractNumber,
};
