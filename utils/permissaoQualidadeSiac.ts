/**
 * Quem vê e quem edita o módulo Qualidade (SiAC) — fase 1 do desenho
 * docs/planos/2026-11-25-qualidade-siac-pbqph.md.
 *
 * Chaves próprias (`canViewQualitySystem`/`canEditQualitySystem` e o módulo
 * `qualidade_siac` na matriz por cargo). Sem valor gravado, **herda de Obras**:
 * o sistema de qualidade é da obra, e quem hoje opera obra não pode perder o
 * módulo novo por não ter a chave gravada no perfil. Mesmo molde de
 * `utils/permissaoRiscos.ts`. (`quality` é o Pós-Obra & Garantia — outro módulo.)
 *
 * Ordem (a mesma de `checkModule`/`isModuleAllowed`): permissão do usuário →
 * matriz do cargo → herança de Obras.
 */

type Permissoes = Record<string, unknown> | null | undefined;
type MatrizDoCargo = Record<string, boolean> | null | undefined;

const definido = (v: unknown): v is boolean => typeof v === 'boolean';

export function podeVerQualidadeSiac(args: {
    permissoes: Permissoes;
    matrizDoCargo: MatrizDoCargo;
    /** o que Obras já decide para este usuário (`canViewBudget` → matriz `obras` → padrão) */
    podeVerObras: boolean;
}): boolean {
    const propria = args.permissoes?.canViewQualitySystem;
    if (definido(propria)) return propria;
    const doCargo = args.matrizDoCargo?.qualidade_siac;
    if (definido(doCargo)) return doCargo;
    return args.podeVerObras;
}

/** Motivo exibido na tela quando ela abre só para leitura (botão desligado sempre diz o porquê). */
export const MOTIVO_SEM_EDICAO_QUALIDADE =
    'Você pode consultar a Qualidade (SiAC), mas não editar: peça a permissão "Qualidade (SiAC) · editar" a um administrador da organização.';

export function podeEditarQualidadeSiac(args: {
    permissoes: Permissoes;
    /** admin da organização, desenvolvedor, ou organização ativa com membro ainda carregando — editam sempre */
    administrador: boolean;
    /** papel do membro na organização ativa (`viewer` = visitante) */
    papel?: string | null;
}): boolean {
    if (args.administrador) return true;
    const propria = args.permissoes?.canEditQualitySystem;
    if (definido(propria)) return propria;
    // Sem a chave gravada: herda de quem edita obra (Orçamento é a chave de Obras).
    const deObras = args.permissoes?.canEditBudget;
    if (definido(deObras)) return deObras;
    return args.papel !== 'viewer';
}

/** O vínculo do usuário com uma organização — o `VinculoDoUsuario` de `utils/modulosPermitidos`. */
interface VinculoParaEditar {
    member: { permissions?: unknown; role?: string | null };
}

/**
 * Topo em "Todas as organizações": não há membro ativo, e a tela mostra (e deixa gravar) itens de
 * todas as organizações do usuário. Edita só se pode editar em CADA uma delas — basta uma sem a
 * permissão para a tela abrir só para leitura (antes, "Todas" contava como administrador).
 * Desenvolvedor (grupo DESENVOLVEDOR ou e-mail de acesso total) edita sempre. Sem vínculo conhecido
 * (lista de organizações ainda carregando) não bloqueia — o mesmo do guard de rota do AppRouter;
 * quem barra a gravação, no fim, é a RLS.
 */
export function podeEditarQualidadeSiacEmTodas(vinculos: ReadonlyArray<VinculoParaEditar>, dev: boolean): boolean {
    if (dev) return true;
    if (vinculos.length === 0) return true;
    return vinculos.every(v => podeEditarQualidadeSiac({
        permissoes: v.member.permissions as Permissoes,
        administrador: v.member.role === 'admin',
        papel: v.member.role ?? null,
    }));
}

/**
 * A decisão que a tela usa (pendência da fase 1 corrigida em 25/11, REGRA #5 item 5): a permissão segue a
 * organização que a tela MOSTRA — a do `useOrgContext()` —, não o `activeOrganizationId` cru do topo.
 * Com uma EMPRESA no topo o valor cru é `null`, mas o contexto resolve a organização dona dela e a lista
 * mostra só essa; decidir por "Todas" ali (`every` sobre todas as organizações) deixava só leitura quem
 * edita nela e é visitante em outra.
 *
 *  - acesso total (grupo DESENVOLVEDOR ou e-mail de acesso total) → edita sempre;
 *  - "Todas" (`isAllOrgs`) → `podeEditarQualidadeSiacEmTodas`;
 *  - organização resolvida → o membro DELA; admin edita; membro ainda carregando não bloqueia (o mesmo
 *    do guard de rota do AppRouter; quem barra a gravação, no fim, é a RLS).
 */
export function podeEditarQualidadeSiacNoContexto(args: {
    orgId: string | null;
    isAllOrgs: boolean;
    vinculos: ReadonlyArray<VinculoParaEditar & { org: { id: string } }>;
    acessoTotal: boolean;
}): boolean {
    if (args.acessoTotal) return true;
    if (args.isAllOrgs || !args.orgId) return podeEditarQualidadeSiacEmTodas(args.vinculos, false);
    const vinculo = args.vinculos.find(v => v.org.id === args.orgId);
    if (!vinculo) return true;
    return podeEditarQualidadeSiac({
        permissoes: vinculo.member.permissions as Permissoes,
        administrador: vinculo.member.role === 'admin',
        papel: vinculo.member.role ?? null,
    });
}

// ─── Fase 2: inspecionar e aprovar inspeção de serviço controlado ───────────
//
// Chaves `canInspectQualitySystem` (responder a ficha de OE de serviço controlado) e
// `canReleaseQualitySystem` (a ação "Aprovar inspeção"). Mesma régua de `_qualidade_pode` no banco:
// dono/admin da organização (ou acesso total) sempre; os demais só com a chave `true` — sem herança
// (editar Qualidade ou Obras não liga). O banco confere na organização DONA DO SERVIÇO CONTROLADO da OE
// (`quality_controlled_items.organization_id`): quem chama passa as permissões e o papel do membro
// DESSA organização.

interface ArgsQualidadeOE {
    permissoes: Permissoes;
    /** papel do membro na organização dona do serviço controlado (`owner`/`admin` ligam) */
    papel?: string | null;
    /**
     * SÓ o e-mail de acesso total (`temAcessoTotal`) — o espelho de `is_superadmin()` (tabela
     * `superadmins`), o único atalho de `_qualidade_pode`. O grupo DESENVOLVEDOR NÃO conta: ele é dado
     * a quem entra pela "Área do Desenvolvedor" e o banco não o conhece — ligar por ele mostra botão
     * que o banco recusa com 42501.
     */
    acessoTotal: boolean;
}

const donoOuAdmin = (papel?: string | null) => papel === 'owner' || papel === 'admin';

export const MOTIVO_SEM_INSPECAO =
    'Sem permissão para inspecionar serviço controlado: peça a permissão "Qualidade — inspecionar serviço controlado" a um administrador da organização.';

export const MOTIVO_SEM_LIBERACAO =
    'Sem permissão para aprovar a inspeção de serviço controlado: peça a permissão "Qualidade — aprovar inspeção" a um administrador da organização.';

export function podeInspecionarQualidade(args: ArgsQualidadeOE): boolean {
    if (args.acessoTotal || donoOuAdmin(args.papel)) return true;
    return args.permissoes?.canInspectQualitySystem === true;
}

export function podeLiberarQualidade(args: ArgsQualidadeOE): boolean {
    if (args.acessoTotal || donoOuAdmin(args.papel)) return true;
    return args.permissoes?.canReleaseQualitySystem === true;
}
