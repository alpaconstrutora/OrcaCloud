// supabase/functions/_shared/assinaturaPropagar.ts
//
// UMA regra para "este documento foi assinado" — usada pelos dois provedores:
//   • ZapSign (sign-contract › processarWebhook), que identifica pela token;
//   • assinatura interna (assinatura-interna › finalizar), que identifica pelo envelope.
//
// A regra (vinda do webhook do ZapSign, achado C3-03 e Emissão documento único):
//   1. a VERSÃO (contract_document_versions) recebe status/data/arquivo;
//   2. versão de ADITIVO → o aditivo (contract_addendums) recebe o mesmo;
//   3. só a versão do tipo CONTRATO do próprio contrato propaga para `contracts`
//      — minuta e anexo assinados NÃO sobrescrevem o status nem o PDF do contrato;
//   4. documento da NEGOCIAÇÃO (commercial_deal_documents) só recebe a projeção.
//
// Sem import nenhum: o cliente admin é injetado (o Vitest testa com um falso —
// __tests__/assinaturaPropagar.test.ts).

/** O mínimo do cliente supabase-js que a propagação usa. */
export interface ClienteAdmin {
    from(tabela: string): {
        update(valores: Record<string, unknown>): {
            eq(coluna: string, valor: unknown): PromiseLike<{ error: { message: string } | null }> & {
                eq(coluna: string, valor: unknown): PromiseLike<{ error: { message: string } | null }>;
            };
        };
    };
}

export interface VersaoAssinavel {
    id: string;
    owner_type: string | null;
    owner_id: string | null;
    kind: string | null;
}

export interface Conclusao {
    /** true = assinado; false = ainda em andamento (ZapSign manda eventos intermediários). */
    assinado: boolean;
    /** Arquivo assinado: URL do provedor (ZapSign) ou caminho no bucket `documents` (interno). */
    arquivo?: string | null;
    /** Quando concluiu (ISO). */
    quando: string;
}

async function conferir(p: PromiseLike<{ error: { message: string } | null }>, onde: string) {
    const { error } = await p;
    if (error) throw new Error(`${onde}: ${error.message}`);
}

/** Propaga a conclusão de uma VERSÃO para ela, o aditivo e (só CONTRATO) o contrato. */
export async function propagarVersao(
    admin: ClienteAdmin,
    versao: VersaoAssinavel,
    c: Conclusao,
    opcoes: { envelopeId?: string } = {},
): Promise<void> {
    const status = c.assinado ? 'SIGNED' : 'SENT';
    const quando = c.assinado ? { signature_completed_at: c.quando } : {};
    const arquivo = c.assinado && c.arquivo ? c.arquivo : null;

    const naVersao = admin.from('contract_document_versions').update({
        signature_status: status, ...quando, ...(arquivo ? { signed_file_url: arquivo } : {}),
    }).eq('id', versao.id);
    // Interno: só se a versão ainda aponta este envelope (versão nova cancela o envelope antigo).
    await conferir(opcoes.envelopeId ? naVersao.eq('assinatura_envelope_id', opcoes.envelopeId) : naVersao, 'versão');

    if (versao.owner_type === 'ADDENDUM' && versao.owner_id) {
        await conferir(admin.from('contract_addendums').update({
            signature_status: status, ...quando, ...(arquivo ? { signed_document_url: arquivo } : {}),
        }).eq('id', versao.owner_id), 'aditivo');
    }

    if (versao.kind === 'CONTRATO' && versao.owner_type === 'CONTRACT' && versao.owner_id) {
        await conferir(admin.from('contracts').update({
            signature_status: status, ...quando, ...(arquivo ? { signed_contract_url: arquivo } : {}),
        }).eq('id', versao.owner_id), 'contrato');
    }
}

/** Documento da negociação assinado pelo fluxo interno. */
export async function propagarDocumentoDaNegociacao(
    admin: ClienteAdmin,
    documentoId: string,
    envelopeId: string,
    c: { arquivo: string; quando: string },
): Promise<void> {
    await conferir(admin.from('commercial_deal_documents').update({
        signature_status: 'SIGNED', signed_path: c.arquivo, signed_at: c.quando,
    }).eq('id', documentoId).eq('assinatura_envelope_id', envelopeId), 'documento da negociação');
}
