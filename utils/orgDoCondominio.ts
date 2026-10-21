/**
 * De qual organização é a OPERAÇÃO de um condomínio (financeiro, rateio,
 * avisos, documentos, manutenção, ocupações).
 *
 * Desde 21/10/2026 um condomínio pode ter organização própria
 * (`empreendimentos.condominio_org_id`), operada pelo síndico; o CADASTRO do
 * prédio continua na org do empreendimento. Sem org própria, é a do
 * empreendimento — exatamente como antes.
 *
 * Espelho de `fn_org_do_condominio` no banco. Toda tela de
 * `components/condominio/` lê e grava por aqui — a catraca
 * `__tests__/orgDoCondominioGuard.test.ts` reprova `empreendimento.organization_id`
 * nessas telas, porque gravar na org do empreendimento depois da migração
 * mandaria o lançamento de volta para a construtora.
 * Plano: docs/planos/2026-10-21-sindico-operador-org-condominio.md
 */
export function orgDoCondominio(e: { organization_id: string; condominio_org_id?: string | null }): string {
    return e.condominio_org_id || e.organization_id;
}
