// hooks/useContextTree.ts
//
// Árvore do seletor de contexto do topo: Organização → Empreendimento → Obra,
// com as Empresas da organização como nó irmão dos empreendimentos.
//
// Consumido por `components/ContextSelector.tsx`. Carrega sob demanda (na
// primeira abertura do painel), não no boot — são quatro queries que só
// interessam a quem abre o seletor.
//
// ⚠️ NÃO usar `useStore().projects` nem `useStore().companies` como fonte:
// as duas listas já vêm recortadas pela organização ativa
// (`store/useStore.ts` — `fetchProjects` filtra por `activeOrganizationId` e
// `setActiveOrganizationId` zera `companies`). Numa árvore que precisa mostrar
// TODAS as organizações, só o nó da org ativa ficaria povoado e os demais
// apareceriam vazios, como se o usuário não tivesse nada lá. A busca aqui é
// sem filtro de organização: a RLS recorta pelas orgs de que ele é membro
// (mesmo precedente de `components/empreendimento/VinculacoesTab.tsx`).
import React from 'react';
import { useStore } from '../store/useStore';
import { onlyObras } from '../utils/projectClassification';
import { projectService } from '../services/projectService';
import { empreendimentoService } from '../services/empreendimentoService';
import { companyService } from '../services/companyService';

export interface ContextObraNode {
    id: string;
    name: string;
    code?: string | null;
    /** Nome da torre, quando o vínculo com o empreendimento é por torre. */
    towerName?: string | null;
}

export interface ContextEmpreendimentoNode {
    id: string;
    name: string;
    code?: string | null;
    obras: ContextObraNode[];
}

export interface ContextEmpresaNode {
    id: string;
    name: string;
    cor?: string | null;
}

export interface ContextOrgNode {
    id: string;
    name: string;
    empreendimentos: ContextEmpreendimentoNode[];
    /** Obras da organização sem vínculo com nenhum empreendimento. */
    obrasSemEmpreendimento: ContextObraNode[];
    empresas: ContextEmpresaNode[];
}

interface ContextTree {
    orgs: ContextOrgNode[];
    loading: boolean;
    error: string | null;
    /** Recarrega do zero, ignorando o que já foi carregado. */
    reload: () => void;
}

/** Linha crua de `projects` — o suficiente para classificar e agrupar. */
type ProjectRow = {
    id?: string;
    name: string;
    code?: string | null;
    organization_id?: string | null;
    settings?: { classification?: string; organizationId?: string; code?: string } | null;
};

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

export interface BuildContextTreeInput {
    organizations: { id: string; name: string }[];
    /** Linhas cruas de `projects`, ainda sem o corte de classificação. */
    projectRows: unknown[];
    emps: { id: string; name: string; code?: string | null; organization_id: string }[];
    /** Saída de `empreendimentoService.mapObrasToEmpreendimentos`. */
    obraToEmp: Record<string, { id: string; name: string; towerName?: string }>;
    empresas: { id: string; org_id?: string | null; razao_social: string; nome_fantasia?: string | null; cor_sistema?: string | null }[];
}

/**
 * Monta a árvore a partir das quatro listas cruas. Função pura, separada do hook
 * para ser testável sem Supabase — as regras de agrupamento aqui são exatamente
 * as que já morderam o módulo de empreendimentos antes (obra órfã, vínculo entre
 * organizações diferentes, obra de torre).
 */
export function buildContextTree({
    organizations, projectRows, emps, obraToEmp, empresas,
}: BuildContextTreeInput): ContextOrgNode[] {
    // Regra #3: o seletor fala em "obra", então mostra só OBRA —
    // orçamento/planejamento/diário ficam de fora.
    const obras = onlyObras(projectRows as ProjectRow[])
        .filter((p): p is ProjectRow & { id: string } => !!p.id);

    const nodes = new Map<string, ContextOrgNode>();
    for (const org of organizations) {
        nodes.set(org.id, {
            id: org.id,
            name: org.name,
            empreendimentos: [],
            obrasSemEmpreendimento: [],
            empresas: [],
        });
    }

    // Guarda a org junto do nó: a obra só entra no empreendimento se os
    // dois estiverem na MESMA organização (ver comentário abaixo).
    const empNodes = new Map<string, { node: ContextEmpreendimentoNode; orgId: string }>();
    for (const emp of emps) {
        const org = nodes.get(emp.organization_id);
        if (!org) continue;
        const node: ContextEmpreendimentoNode = {
            id: emp.id,
            name: emp.name,
            code: emp.code ?? null,
            obras: [],
        };
        empNodes.set(emp.id, { node, orgId: emp.organization_id });
        org.empreendimentos.push(node);
    }

    for (const obra of obras) {
        // A obra é pendurada na organização DELA, não na do empreendimento:
        // empreendimento costuma ser SPE própria enquanto as obras vivem na
        // organização do grupo (ver VinculacoesTab.tsx). Quando as duas
        // divergem, a obra aparece em "Sem empreendimento" da sua própria
        // organização — que é onde o usuário a procura.
        const orgId = obra.organization_id ?? obra.settings?.organizationId ?? null;
        const org = orgId ? nodes.get(orgId) : undefined;
        if (!org) continue;

        const vinculo = obraToEmp[obra.id];
        const node: ContextObraNode = {
            id: obra.id,
            name: obra.name,
            code: obra.code ?? obra.settings?.code ?? null,
            towerName: vinculo?.towerName ?? null,
        };
        // Vínculo apontando para empreendimento de outra organização (ou já
        // apagado) cai em "Sem empreendimento": as colunas de vínculo não
        // têm FK, então id morto é normal aqui e não deve virar erro.
        const alvo = vinculo ? empNodes.get(vinculo.id) : undefined;
        if (alvo && alvo.orgId === orgId) {
            alvo.node.obras.push(node);
        } else {
            org.obrasSemEmpreendimento.push(node);
        }
    }

    for (const c of empresas) {
        const org = c.org_id ? nodes.get(c.org_id) : undefined;
        if (!org) continue;
        org.empresas.push({
            id: c.id,
            name: c.nome_fantasia ?? c.razao_social,
            cor: c.cor_sistema ?? null,
        });
    }

    const lista = Array.from(nodes.values()).sort(byName);
    for (const org of lista) {
        org.empreendimentos.sort(byName);
        org.empreendimentos.forEach(e => e.obras.sort(byName));
        org.obrasSemEmpreendimento.sort(byName);
        org.empresas.sort(byName);
    }
    return lista;
}

/**
 * @param enabled só dispara a carga quando `true` (o painel foi aberto ao menos
 *                uma vez). Depois de carregada, a árvore fica em memória.
 */
export function useContextTree(enabled: boolean): ContextTree {
    const organizations = useStore(s => s.organizations);

    const [orgs, setOrgs] = React.useState<ContextOrgNode[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [nonce, setNonce] = React.useState(0);
    const loadedRef = React.useRef(false);

    const reload = React.useCallback(() => {
        loadedRef.current = false;
        setNonce(n => n + 1);
    }, []);

    // A lista de organizações mudando (login, criação de org) invalida a árvore.
    const orgsKey = organizations.map(o => o.id).join(',');
    React.useEffect(() => { loadedRef.current = false; }, [orgsKey]);

    React.useEffect(() => {
        if (!enabled || loadedRef.current) return;
        let cancelado = false;
        loadedRef.current = true;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [projectRows, emps, obraToEmp, empresas] = await Promise.all([
                    // Sem organização e sem projeto de sistema (o service já corta —
                    // CLAUDE.md regra #2). `includeOrphans=true` para que obra com
                    // organization_id nulo ainda seja visível na árvore.
                    // Árvore de contexto: mostra a hierarquia inteira, não só obras.
                    projectService.listProjects({ includeOrphans: true, classifications: 'ALL' }),
                    empreendimentoService.list(undefined),
                    // Mapa obra → empreendimento. É ele que cobre os DOIS caminhos de
                    // vínculo do módulo (`empreendimentos.project_id` e
                    // `empreendimento_towers.project_id`); montar o join no sentido
                    // inverso, a partir do empreendimento, perderia as obras de torre.
                    empreendimentoService.mapObrasToEmpreendimentos(undefined),
                    companyService.list(undefined),
                ]);
                if (cancelado) return;
                setOrgs(buildContextTree({ organizations, projectRows, emps, obraToEmp, empresas }));
            } catch (err: any) {
                if (cancelado) return;
                console.error('[useContextTree] erro ao montar a árvore de contexto:', err);
                setError(err?.message || 'Não foi possível carregar o contexto.');
                setOrgs([]);
                loadedRef.current = false; // permite nova tentativa ao reabrir
            } finally {
                if (!cancelado) setLoading(false);
            }
        })();

        return () => { cancelado = true; };
    }, [enabled, organizations, orgsKey, nonce]);

    return { orgs, loading, error, reload };
}

export default useContextTree;
