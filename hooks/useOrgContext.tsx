import React from 'react';
import { Building2, Check, Layers } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal, ModalHeader, ModalBody } from '../components/ui/modal';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXTO DE ORGANIZAÇÃO — FONTE ÚNICA DA VERDADE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O seletor do topo da página (`components/Layout.tsx`) é a AUTORIDADE sobre
 * qual organização o sistema usa. Regra de produto, sem exceção:
 *
 *   1. Topo apontando para uma organização  → usa ela e NÃO pergunta nada.
 *   2. Topo em "Todas as organizações"      → aí sim pergunta.
 *   3. Perguntado, o usuário mantém "Todas" → replica em cada organização DE
 *      QUE ELE É MEMBRO (`forEachTargetOrg`). Nunca `organization_id NULL`,
 *      que vazaria para os outros clientes do SaaS.
 *   4. Operação que exige org específica por natureza (fechamento contábil,
 *      faixa de alçada, chamado de garantia) → modo 'single', sem a opção
 *      "Todas" no modal.
 *   5. EMPRESA selecionada no topo herda a organização dona dela. A OBRA não —
 *      ver o comentário na cascata abaixo.
 *
 * ── Por que este arquivo existe ───────────────────────────────────────────
 *
 * Antes, cada tela recebia a organização por um caminho diferente e inventava
 * a própria regra. Três problemas nasciam disso e voltavam em toda tela nova:
 *
 *   • Três sentinelas para "Todas": `null` (store), `undefined` (prop
 *     opcional) e `''` (72 passagens de `activeOrganizationId || ''`). Como
 *     `??` não dispara para string vazia, `'' ?? fallback` devolvia `''` e o
 *     botão de criar virava um botão morto.
 *   • O topo é hierárquico (organização → empresa → obra) e mostra o rótulo
 *     do nível MAIS ESPECÍFICO. Com uma empresa selecionada o usuário lê
 *     "tenho contexto", mas `activeOrganizationId` continuava `null` e o
 *     sistema perguntava a organização mesmo assim.
 *   • Fallbacks `organizations[0]?.id` gravavam na PRIMEIRA organização da
 *     lista em vez da selecionada — silenciosamente, no registro errado.
 *
 * Por isso a leitura aqui é feita SEMPRE do store, nunca de prop: prop é o
 * que se deforma no caminho. Ver `__tests__/orgContextGuard.test.ts`, que
 * roda no CI e quebra o build se algum desses padrões reaparecer.
 */

export type OrgContextSource = 'organization' | 'company' | 'all';

export interface OrgContext {
    /**
     * Organização efetiva do seletor do topo.
     * `null` significa, e só significa, "Todas as organizações".
     *
     * LEITURA: passe direto ao service. `null` = sem `.eq('organization_id',…)`,
     * deixando a RLS recortar o que o usuário pode ver. Nunca bloqueie o
     * carregamento por causa de `null` — isso deixa a tela em branco.
     */
    orgId: string | null;
    /** `true` apenas quando o contexto é realmente "Todas as organizações". */
    isAllOrgs: boolean;
    /** De onde a organização foi derivada — útil para diagnóstico e testes. */
    source: OrgContextSource;
}

/**
 * Contexto de organização do topo da página, com a herança de empresa já
 * resolvida. Use em QUALQUER lugar que precise saber "qual organização".
 */
export function useOrgContext(): OrgContext {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const activeEmpresaId = useStore(state => state.activeEmpresaId);
    const companies = useStore(state => state.companies);

    return React.useMemo<OrgContext>(() => {
        // 1) Organização escolhida explicitamente no topo — tem precedência absoluta.
        if (activeOrganizationId) {
            return { orgId: activeOrganizationId, isAllOrgs: false, source: 'organization' };
        }

        // 2) Empresa ativa: o topo está exibindo o nome dela, então o contexto do
        //    usuário é a organização dona dessa empresa (Company.org_id).
        if (activeEmpresaId) {
            const orgFromCompany = companies.find(c => c.id === activeEmpresaId)?.org_id;
            if (orgFromCompany) {
                return { orgId: orgFromCompany, isAllOrgs: false, source: 'company' };
            }
        }

        // 3) "Todas as organizações".
        //
        // ⚠️ A OBRA ativa NÃO entra nesta cascata, de propósito.
        // `setActiveOrganizationId` zera a empresa (`activeEmpresaId: null`) mas
        // NÃO zera `projectId` — a obra sobrevive à troca de organização. Se a
        // organização fosse derivada da obra, clicar em "Todas as organizações"
        // com uma obra aberta continuaria preso na organização dela: a escolha
        // explícita do usuário seria ignorada, o oposto da regra de produto.
        // (Reportado em 2026-08-03: escolher "Todas" em Configurações do Sistema
        // com a obra "Coronel Lambert 345" aberta não surtia efeito.)
        //
        // Com a empresa não há esse risco justamente porque trocar de
        // organização já a zera.
        return { orgId: null, isAllOrgs: true, source: 'all' };
    }, [activeOrganizationId, activeEmpresaId, companies]);
}

/**
 * Destino de uma escrita: uma organização específica, ou todas as organizações
 * DO USUÁRIO (as que ele é membro) — nunca "global".
 *
 * ⚠️ Por que não existe `{ kind: 'global' }` (organization_id NULL):
 * o sistema é multi-tenant e a policy de leitura de registro global é
 * `organization_id IS NULL OR is_org_member(...)`. Um registro NULL apareceria
 * para TODOS os clientes do SaaS, não só para as organizações de quem criou —
 * vazamento cross-tenant de escrita. `organization_id NULL` fica reservado aos
 * seeds do próprio sistema (ex.: as 38 categorias financeiras padrão).
 * "Todas as organizações" no modal significa, e só pode significar, todas as
 * organizações DO USUÁRIO.
 */
export type WriteTarget =
    | { kind: 'org'; orgId: string }
    | { kind: 'all'; orgIds: string[] };

/**
 * `all-allowed` — catálogo/configuração (tipo de contrato, categoria, tributo,
 *   índice de reajuste…). O modal oferece "Todas as organizações", que resolve
 *   `{ kind: 'all', orgIds }` → replique a criação em cada uma (use
 *   `forEachTargetOrg`).
 *
 * `single` — registro operacional (chamado, lead, movimento de estoque…) ou
 *   operação inerentemente por-empresa (fechamento contábil, faixa de alçada).
 *   O modal NÃO oferece "Todas".
 */
export type WriteTargetMode = 'all-allowed' | 'single';

/** Organizações de destino, seja o alvo uma só ou todas as do usuário. */
export function targetOrgIds(target: WriteTarget): string[] {
    return target.kind === 'all' ? target.orgIds : [target.orgId];
}

/**
 * Mensagem legível de um erro, seja qual for o formato.
 *
 * ⚠️ NÃO use `e instanceof Error` para isso. Erro do Supabase é um objeto
 * `{ message, code, details, hint }` que NÃO é instância de `Error` — o
 * `instanceof` dá falso e a causa real (ex.: "new row violates row-level
 * security policy") é substituída por um texto genérico.
 *
 * Foi exatamente esse o bug reportado em 2026-08-04: a tela mostrava só
 * "Erro ao criar", escondendo o motivo, e o diagnóstico ficou impossível.
 */
export function errorMessage(e: unknown, fallback: string): string {
    if (e instanceof Error) return e.message;
    if (e && typeof e === 'object') {
        const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
        const msg = typeof o.message === 'string' && o.message ? o.message : null;
        const extra = typeof o.details === 'string' && o.details ? ` (${o.details})` : '';
        const code = typeof o.code === 'string' && o.code ? ` [${o.code}]` : '';
        if (msg) return `${msg}${extra}${code}`;
    }
    if (typeof e === 'string' && e) return e;
    return fallback;
}

/**
 * Roda a criação uma vez por organização de destino, tolerando falhas
 * individuais — numa replicação para 4 organizações, se 1 já tiver um item de
 * mesmo nome (UNIQUE), as outras 3 não podem ser perdidas junto.
 *
 *   const { ok, failed } = await forEachTargetOrg(target, orgId =>
 *       service.create(orgId, nome));
 *   showToast(ok > 1 ? `Criado em ${ok} organizações.` : 'Criado.');
 */
export async function forEachTargetOrg<T>(
    target: WriteTarget,
    fn: (orgId: string) => Promise<T>,
): Promise<{ ok: number; failed: { orgId: string; error: unknown }[] }> {
    const results = await Promise.allSettled(targetOrgIds(target).map(fn));
    const failed = results.flatMap((r, i) =>
        r.status === 'rejected' ? [{ orgId: targetOrgIds(target)[i], error: r.reason }] : [],
    );
    return { ok: results.length - failed.length, failed };
}

/**
 * Resumo honesto de uma replicação parcial, para o toast.
 *
 * Não assuma que toda falha é duplicata: em 2026-08-04 a mensagem dizia
 * sempre "as demais já tinham" e escondia `42501` (RLS) — o usuário achava
 * que o item já existia quando na verdade não tinha permissão de gravar ali.
 */
export function partialFailureNote(failed: { error: unknown }[]): string {
    if (failed.length === 0) return '';
    const msgs = failed.map(f => errorMessage(f.error, '').toLowerCase());
    const semPermissao = msgs.filter(m => m.includes('row-level security') || m.includes('42501')).length;
    const duplicadas = msgs.filter(m => m.includes('unique') || m.includes('duplicate')).length;

    if (semPermissao === failed.length) return 'as demais você não tem permissão de gravar';
    if (duplicadas === failed.length) return 'as demais já tinham';
    if (semPermissao > 0) return `${duplicadas} já tinham, ${semPermissao} sem permissão`;
    return `${failed.length} falharam: ${errorMessage(failed[0].error, 'erro desconhecido')}`;
}

/**
 * Resolve a organização de destino de uma CRIAÇÃO, obedecendo ao topo.
 *
 * Auto-contido (não exige Provider no root, igual ao antigo useOrganizationPicker):
 *
 *   const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
 *   ...
 *   const target = await resolveWriteOrg('global-allowed');
 *   if (!target) return;                       // usuário cancelou
 *   await service.create(targetToOrgId(target), dados);
 *   ...
 *   return (<> … {orgTargetModal} </>);
 *
 * Quando o modal aparece:
 *   • topo com organização (ou empresa/obra) → NUNCA. Resolve direto.
 *   • topo em "Todas" e o usuário só tem 1 organização → NUNCA. Resolve com ela.
 *   • topo em "Todas" e há N organizações → aí sim.
 */
export function useOrgWriteTarget() {
    const { orgId } = useOrgContext();
    const allOrganizations = useStore(state => state.organizations);
    const currentEmail = useStore(state => state.currentProfile.email);

    /**
     * Organizações em que o usuário PODE GRAVAR — não as que ele enxerga.
     *
     * A RLS de `organizations` é mais permissiva que a das tabelas de dados:
     * o seletor do topo lista organizações das quais o usuário não é membro
     * (confirmado em 2026-08-04: 4 no seletor, membro de 1). Replicar "em
     * todas" usando a lista inteira faria 3 de 4 gravações falharem com
     * `42501 new row violates row-level security policy`, e o aviso de
     * replicação parcial ("as demais já tinham") mentiria sobre a causa.
     */
    const organizations = React.useMemo(() => {
        const email = currentEmail?.toLowerCase();
        if (!email) return allOrganizations;
        const writable = allOrganizations.filter(o =>
            (o.members ?? []).some(m => m.email?.toLowerCase() === email),
        );
        // Sem informação de membro (lista ainda carregando, ou `members` não
        // veio) não dá para afirmar que não pode gravar — melhor deixar o banco
        // decidir do que esconder organização legítima.
        return writable.length > 0 ? writable : allOrganizations;
    }, [allOrganizations, currentEmail]);
    const [pending, setPending] = React.useState<{
        mode: WriteTargetMode;
        resolve: (t: WriteTarget | null) => void;
    } | null>(null);

    const resolveWriteOrg = React.useCallback(
        (mode: WriteTargetMode = 'single'): Promise<WriteTarget | null> => {
            // O topo manda: havendo organização no contexto, não se pergunta nada.
            if (orgId) return Promise.resolve({ kind: 'org', orgId });

            // "Todas" com uma única organização: o alvo não é ambíguo.
            if (organizations.length === 1) {
                return Promise.resolve({ kind: 'org', orgId: organizations[0].id });
            }

            // Sem organização alguma: nada a resolver.
            if (organizations.length === 0) return Promise.resolve(null);

            return new Promise<WriteTarget | null>(resolve => setPending({ mode, resolve }));
        },
        [orgId, organizations],
    );

    const settle = React.useCallback((target: WriteTarget | null) => {
        setPending(prev => {
            prev?.resolve(target);
            return null;
        });
    }, []);

    const orgTargetModal = (
        <Modal open={!!pending} onClose={() => settle(null)} size="sm" zIndex={210}>
            <ModalHeader
                title="Selecionar organização"
                description={
                    pending?.mode === 'all-allowed'
                        ? 'O seletor do topo está em "Todas as organizações". Escolha onde cadastrar, ou mantenha em todas.'
                        : 'O seletor do topo está em "Todas as organizações". Escolha onde cadastrar.'
                }
                icon={
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Building2 className="w-5 h-5" />
                    </div>
                }
                onClose={() => settle(null)}
            />
            <ModalBody className="space-y-2">
                {pending?.mode === 'all-allowed' && (
                    <>
                        <button
                            onClick={() => settle({ kind: 'all', orgIds: organizations.map(o => o.id) })}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group active:scale-[0.99]"
                        >
                            <Layers className="w-4 h-4 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-gray-800">Todas as organizações</span>
                                <span className="block text-xs font-normal text-gray-500 mt-0.5">
                                    Cadastra em cada uma das suas {organizations.length} organizações. Depois cada uma pode editar a sua.
                                </span>
                            </span>
                            <Check className="w-4 h-4 shrink-0 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <div className="pt-1 pb-0.5 text-xs font-semibold text-slate-500">Ou uma organização específica</div>
                    </>
                )}
                {organizations.map(org => (
                    <button
                        key={org.id}
                        onClick={() => settle({ kind: 'org', orgId: org.id })}
                        className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group active:scale-[0.99]"
                    >
                        <span className="text-sm font-semibold text-gray-800">{org.name}</span>
                        <Check className="w-4 h-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                ))}
            </ModalBody>
        </Modal>
    );

    return { resolveWriteOrg, orgTargetModal };
}
