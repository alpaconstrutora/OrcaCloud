import { NumberingConfig, SlotToken, VariableToken } from './types';

/**
 * Aplica a máscara. Função pura — reusada pelo preview em Configurações do
 * Sistema › Nomenclatura e pela geração real. Espelha exatamente
 * `fn_format_document_number` em
 * `supabase/migrations/20270912000004_services_numbering_triggers.sql`; se
 * mudar aqui, mude lá também.
 *
 * `values` traz o código já resolvido de cada variável presente nos slots.
 * Slots `EMPTY` são descartados; `PREFIX` usa `config.prefix` (limpo de
 * separador de borda); o `{seq}` é sempre o último bloco.
 */
export function formatDocumentNumber(
    config: Pick<NumberingConfig, 'slots' | 'prefix' | 'separator' | 'seqPadding'>,
    values: Partial<Record<VariableToken, string>>,
    seq: number,
): string {
    const separator = config.separator || '-';
    const padding = Math.max(1, Number(config.seqPadding) || 1);

    const parts: string[] = [];
    for (const token of config.slots) {
        if (token === 'EMPTY') continue;
        if (token === 'PREFIX') {
            const prefixo = (config.prefix ?? '').trim().replace(/^[-.]+|[-.]+$/g, '');
            if (prefixo) parts.push(prefixo);
            continue;
        }
        const valor = (values[token as VariableToken] ?? '').trim();
        if (valor) parts.push(valor);
    }
    parts.push(String(seq).padStart(padding, '0'));

    return parts.join(separator);
}

/**
 * Monta a chave de escopo do contador: os valores das variáveis presentes na
 * máscara, NA ORDEM em que aparecem, separados por `|`. É o que faz o {seq}
 * reiniciar pela combinação de variáveis escolhidas (decisão de produto
 * 2026-08-17) — mudar a máscara muda o escopo. Slots `EMPTY`/`PREFIX` não
 * entram (não são variável).
 */
export function buildScopeKey(slots: SlotToken[], values: Partial<Record<VariableToken, string>>): string {
    return slots
        .filter((t): t is VariableToken => t !== 'EMPTY' && t !== 'PREFIX')
        .map(t => values[t] ?? '')
        .join('|');
}

/** As variáveis que a máscara efetivamente usa (para saber o que resolver). */
export function variablesInUse(slots: SlotToken[]): VariableToken[] {
    return slots.filter((t): t is VariableToken => t !== 'EMPTY' && t !== 'PREFIX');
}
