import { supabase } from '../../lib/supabase';
import { buildScopeKey, formatDocumentNumber, variablesInUse } from './format';
import { resolveVariables } from './resolvers';
import { getNumberingConfig } from './settingsService';
import { DocType, NumberingContext } from './types';

export { MissingCodeError } from './types';
export { formatDocumentNumber } from './format';
export { DOC_TYPE_CATALOG, getDocTypeDefault } from './catalog';
export { getNumberingConfig, listNumberingConfigs, saveNumberingConfig, resetNumberingConfig } from './settingsService';
export type { DocType, NumberingConfig, NumberingContext, SlotToken, VariableToken } from './types';

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
export async function generateDocumentNumber(
    docType: DocType,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const config = await getNumberingConfig(organizationId, docType);
    const tokens = variablesInUse(config.slots);

    const values = await resolveVariables(tokens, { ...ctx, organizationId });
    const scopeKey = buildScopeKey(config.slots, values);

    const { data: seq, error } = await supabase.rpc('fn_next_document_seq', {
        p_org_id: organizationId,
        p_doc_type: docType,
        p_scope_key: scopeKey,
    });
    if (error) throw new Error(`Falha ao gerar o número do documento: ${error.message}`);

    return formatDocumentNumber(config, values, Number(seq));
}
