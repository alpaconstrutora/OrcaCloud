import { supabase } from '../../lib/supabase';
import { gerarNumeroDeDocumento } from './motor';
import { resolveVariables } from './resolvers';
import { getNumberingConfig } from './settingsService';
import { DocType, NumberingContext } from './types';

export { MissingCodeError } from './types';
export { formatDocumentNumber } from './format';
export { DOC_TYPE_CATALOG, getDocTypeDefault, MAIN_DOC_TYPES, ADVANCED_DOC_TYPES } from './catalog';
export { getNumberingConfig, listNumberingConfigs, saveNumberingConfig, resetNumberingConfig, hasSavedNumberingConfig } from './settingsService';
export type { DocType, NumberingConfig, NumberingContext, SlotToken, VariableToken } from './types';
export { ALL_VARIABLE_TOKENS } from './types';

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
    // A orquestração mora em `motor.ts` (a Edge Function `pedido-fast` usa a
    // mesma). Aqui só se pluga o que é do navegador: config e resolvedores pelos
    // módulos de sempre (os testes que os mocam continuam valendo) e a RPC com a
    // sessão do usuário.
    return gerarNumeroDeDocumento(
        {
            lerConfig: getNumberingConfig,
            resolver: resolveVariables,
            reservar: async (org, tipo, scopeKey) => {
                const { data: seq, error } = await supabase.rpc('fn_next_document_seq', {
                    p_org_id: org,
                    p_doc_type: tipo,
                    p_scope_key: scopeKey,
                });
                if (error) throw new Error(`Falha ao gerar o número do documento: ${error.message}`);
                return Number(seq);
            },
        },
        docType,
        organizationId,
        ctx,
    );
}
