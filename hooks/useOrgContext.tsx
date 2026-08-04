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
 *   3. Perguntado, o usuário mantém "Todas" → grava GLOBAL (organization_id
 *      NULL), válido para todas — não N cópias.
 *   4. Operação que exige org específica por natureza (fechamento contábil,
 *      faixa de alçada, chamado de garantia) → modo 'single', sem a opção
 *      "Todas" no modal.
 *   5. Empresa/obra selecionada no topo HERDA a organização dona dela.
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

export type OrgContextSource = 'organization' | 'company' | 'project' | 'all';

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
 * Contexto de organização do topo da página, com a herança de empresa/obra
 * já resolvida. Use em QUALQUER lugar que precise saber "qual organização".
 */
export function useOrgContext(): OrgContext {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const activeEmpresaId = useStore(state => state.activeEmpresaId);
    const companies = useStore(state => state.companies);
    const projectId = useStore(state => state.projectId);
    const allProjects = useStore(state => state.allProjects);

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

        // 3) Obra ativa: mesma lógica. `organization_id` (coluna nativa) tem
        //    precedência sobre `settings.organizationId` — obra vinculada a uma
        //    empresa só tem a organização na coluna, nunca no JSONB.
        //    Ver services/projectService.ts:14-17.
        if (projectId) {
            const project = allProjects.find(p => p.id === projectId);
            const orgFromProject = project?.organization_id ?? project?.settings?.organizationId;
            if (orgFromProject) {
                return { orgId: orgFromProject, isAllOrgs: false, source: 'project' };
            }
        }

        // 4) Nada selecionado: "Todas as organizações".
        return { orgId: null, isAllOrgs: true, source: 'all' };
    }, [activeOrganizationId, activeEmpresaId, companies, projectId, allProjects]);
}

/** Destino de uma escrita: uma organização específica, ou global (todas). */
export type WriteTarget =
    | { kind: 'org'; orgId: string }
    | { kind: 'global' };

/**
 * `global-allowed` — catálogo/configuração. O modal oferece "Todas as
 *   organizações", que resolve `{ kind: 'global' }` → grave `organization_id`
 *   NULL. Só use onde a tabela aceita NULL e a policy cobre o ramo global.
 *
 * `single` — registro operacional (chamado, lead, movimento de estoque…) ou
 *   operação inerentemente por-empresa (fechamento contábil, faixa de alçada).
 *   O modal NÃO oferece "Todas".
 */
export type WriteTargetMode = 'global-allowed' | 'single';

/** Converte o destino para o valor de `organization_id` a gravar. */
export function targetToOrgId(target: WriteTarget): string | null {
    return target.kind === 'global' ? null : target.orgId;
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
    const organizations = useStore(state => state.organizations);
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
                    pending?.mode === 'global-allowed'
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
                {pending?.mode === 'global-allowed' && (
                    <>
                        <button
                            onClick={() => settle({ kind: 'global' })}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group active:scale-[0.99]"
                        >
                            <Layers className="w-4 h-4 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-gray-800">Todas as organizações</span>
                                <span className="block text-xs font-normal text-gray-500 mt-0.5">
                                    Cadastra uma vez e vale para todas. Cada organização pode duplicar para editar a sua versão.
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
