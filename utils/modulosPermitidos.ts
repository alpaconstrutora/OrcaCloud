import React from 'react';
import { useStore } from '../store/useStore';
import type { Company, Organization } from '../types';
import { podeVerTreinamentos } from './permissaoTreinamentos';
import { podeVerRiscos } from './permissaoRiscos';
import { podeVerQualidadeSiac } from './permissaoQualidadeSiac';
import { podeVerDiretoria } from './permissaoDiretoria';
import { temAcessoTotal } from '../lib/acessoTotal';

/**
 * Quais módulos o usuário vê no menu lateral — a regra que era o `allowedMods`
 * do `Layout.tsx`, extraída SEM MUDANÇA em 11/11/2026 para a tela "Bom dia" usar
 * a MESMA decisão ("o cartão aparece se o módulo para onde ele leva aparece no
 * menu" — docs/planos/2026-11-10-central-bom-dia.md). Mexer aqui muda o menu e
 * a Central juntos, que é o ponto.
 */
type MembroDaOrg = NonNullable<Organization['members']>[number];

export interface EntradaModulos {
  activeEmpresa: Company | null;
  profile: { group: string };
  currentMember: MembroDaOrg | null;
  activeOrg: Organization | undefined;
  isDevEmail: boolean;
}

function modulosDoUsuario({ activeEmpresa, profile, currentMember, activeOrg, isDevEmail }: EntradaModulos) {
  const baseMods = activeEmpresa?.modulos_habilitados || {
    obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: false, offices: false, reformas: false
  };
  // Diretoria (ÒPURA CEO, 17/11/2026): fora de todos os atalhos (DESENVOLVEDOR, admin, sem
  // membro) — só a flag do membro ou o acesso total, a mesma regra do banco
  // (`_diretoria_orgs`). Ver utils/permissaoDiretoria.ts.
  const diretoria = podeVerDiretoria({
    permissoes: currentMember?.permissions as unknown as Record<string, unknown> | undefined,
    acessoTotal: isDevEmail,
  });

  if (profile.group === 'DESENVOLVEDOR' || isDevEmail) {
    return {
      obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: true, offices: true, reformas: true, quality: true, ecommerce: true, treinamentos: true, riscos: true, qualidade_siac: true, rentals: true, diretoria
    };
  }

  if (!currentMember) return { ...baseMods, rentals: Boolean(baseMods.crm), ecommerce: false, treinamentos: baseMods.rh !== false, riscos: baseMods.obras !== false, qualidade_siac: baseMods.obras !== false, diretoria };

  if (currentMember.role === 'admin') {
    return {
      obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: true, offices: true, reformas: true, quality: true, ecommerce: true, treinamentos: true, riscos: true, qualidade_siac: true, rentals: true, diretoria
    };
  }

  const roleId = currentMember.customRoleId || currentMember.role;
  const matrix = activeOrg?.settings?.module_visibility || {};

  // Suporte à nova estrutura por produto (platform | pro | offices)
  // Retrocompatível: se não houver dimensão de produto, trata como 'platform'
  const productCtx = (currentMember as any).productContext || 'platform';
  let productMatrix: Record<string, Record<string, boolean>>;
  if ((matrix as any).platform !== undefined || (matrix as any).pro !== undefined || (matrix as any).offices !== undefined) {
    productMatrix = ((matrix as any)[productCtx] as Record<string, Record<string, boolean>>) || {};
  } else {
    productMatrix = matrix as Record<string, Record<string, boolean>>;
  }
  const roleConfig = productMatrix[roleId] || {};

  const checkModule = (layoutKey: string, userPermKey: string, matrixKey: string): boolean => {
    // O tipo UserPermissions é estendido com canView*
    const userPerm = currentMember.permissions ? (currentMember.permissions as any)[userPermKey] : undefined;
    if (userPerm !== undefined) {
      return !!userPerm;
    }
    if (roleConfig[matrixKey] !== undefined) {
      return !!roleConfig[matrixKey];
    }
    return !!baseMods[layoutKey as keyof typeof baseMods];
  };

  // Para usuários Pro: somente módulo pro habilitado por padrão
  if (productCtx === 'pro') {
    return {
      obras: false, compras: false, rh: false, financeiro: false, fiscal: false,
      incorporacao: false, crm: false, estoque: false, broker_portal: false,
      reformas: false, quality: false,
      offices: false,
      pro: checkModule('pro', 'canViewPro', 'pro'),
      rentals: false,
      ecommerce: false,
      treinamentos: false,
      riscos: false,
      qualidade_siac: false,
      diretoria,
    };
  }

  // Para usuários Offices: somente módulos offices e crm de serviços
  if (productCtx === 'offices') {
    return {
      obras: false, compras: false, rh: false, financeiro: false, fiscal: false,
      incorporacao: false, estoque: false, broker_portal: false, reformas: false,
      quality: false, pro: false,
      offices: checkModule('offices', 'canViewOffices', 'offices'),
      crm: checkModule('crm', 'canViewSales', 'crm'),
      rentals: checkModule('crm', 'canViewRentals', 'rentals'),
      ecommerce: false,
      treinamentos: false,
      riscos: false,
      qualidade_siac: false,
      diretoria,
    };
  }

  const rh = checkModule('rh', 'canViewLabor', 'rh');
  const obras = checkModule('obras', 'canViewBudget', 'obras');
  return {
    obras,
    compras: checkModule('compras', 'canViewOrders', 'compras'),
    rh,
    // Gestão de treinamentos fora do RH (16/10/2026): chave própria; sem nada
    // gravado, herda o que o RH decide para o usuário (utils/permissaoTreinamentos.ts).
    treinamentos: podeVerTreinamentos({
      permissoes: currentMember.permissions as unknown as Record<string, unknown> | undefined,
      matrizDoCargo: roleConfig,
      podeVerRh: rh,
    }),
    // Riscos (14/11/2026): chave própria; sem nada gravado, herda o que Obras
    // decide para o usuário (utils/permissaoRiscos.ts) — a MESMA herança da rota
    // (AppRouter: `isModuleAllowed('canViewRisks', 'riscos', () => isModuleAllowed('canViewBudget', 'obras'))`).
    riscos: podeVerRiscos({
      permissoes: currentMember.permissions as unknown as Record<string, unknown> | undefined,
      matrizDoCargo: roleConfig,
      podeVerObras: obras,
    }),
    // Qualidade (SiAC) (25/11/2026): chave própria; sem nada gravado, herda Obras
    // (utils/permissaoQualidadeSiac.ts) — a MESMA herança da rota.
    qualidade_siac: podeVerQualidadeSiac({
      permissoes: currentMember.permissions as unknown as Record<string, unknown> | undefined,
      matrizDoCargo: roleConfig,
      podeVerObras: obras,
    }),
    offices: checkModule('offices', 'canViewOffices', 'offices'),
    pro: checkModule('pro', 'canViewPro', 'pro'),
    crm: checkModule('crm', 'canViewSales', 'crm'),
    rentals: checkModule('crm', 'canViewRentals', 'rentals'),
    incorporacao: checkModule('incorporacao', 'canViewImovib', 'incorporacao'),
    fiscal: checkModule('fiscal', 'canViewFiscal', 'fiscal'),
    quality: checkModule('quality', 'canViewQuality', 'quality'),
    ecommerce: checkModule('ecommerce', 'canViewEcommerce', 'ecommerce'),
    
    financeiro: baseMods.financeiro !== false,
    reformas: baseMods.reformas !== false,
    estoque: baseMods.estoque !== false,
    broker_portal: baseMods.broker_portal !== false,
    diretoria,
  };
}

// ── Módulos da ORGANIZAÇÃO (27/11/2026) ──────────────────────────────────────
// Plano: docs/planos/2026-11-27-modulos-por-organizacao.md. A organização desliga um
// módulo para TODOS que entram nela pelo topo — admin, owner, acesso total e
// DESENVOLVEDOR inclusive: o módulo não existe para aquela organização (ex.: a org de
// condomínio sem Engenharia). Gravado em `settings.modulos_da_organizacao` como
// `{ chave: false }`; chave ausente = ligado, então nenhuma org muda até alguém desligar.

export type ChaveModuloDaOrganizacao =
  | 'obras' | 'riscos' | 'qualidade_siac' | 'rh' | 'treinamentos' | 'compras'
  | 'financeiro' | 'fiscal' | 'crm' | 'rentals' | 'incorporacao' | 'broker_portal'
  | 'diretoria' | 'pro' | 'offices' | 'reformas' | 'ecommerce';

export interface ModuloDaOrganizacao {
  chave: ChaveModuloDaOrganizacao;
  titulo: string;
  /** O que some do menu — os nomes que o usuário vê lá. */
  descricao: string;
  grupo: string;
  /** Mora dentro da seção de outro módulo no menu: desligado o pai, desliga junto. */
  dependeDe?: ChaveModuloDaOrganizacao;
}

/** O painel "Módulos" da ficha da organização lista estes, nesta ordem (a do menu). */
export const MODULOS_DA_ORGANIZACAO: ModuloDaOrganizacao[] = [
  { grupo: 'Gestão', chave: 'diretoria', titulo: 'Diretoria', descricao: 'Tela Diretoria (ÒPURA CEO). Continua exigindo a permissão de cada usuário.' },
  { grupo: 'Operação', chave: 'obras', titulo: 'Engenharia', descricao: 'Obras, orçamentos, composições, planejamento, controle operacional, diário de obra e pós-obra.' },
  { grupo: 'Operação', chave: 'riscos', titulo: 'Riscos', descricao: 'Fica dentro de Engenharia.', dependeDe: 'obras' },
  { grupo: 'Operação', chave: 'qualidade_siac', titulo: 'Qualidade (SiAC)', descricao: 'Fica dentro de Engenharia.', dependeDe: 'obras' },
  { grupo: 'Operação', chave: 'rh', titulo: 'Recursos Humanos', descricao: 'Colaboradores, folha, ponto, SST e Portal do Colaborador.' },
  { grupo: 'Operação', chave: 'treinamentos', titulo: 'Treinamentos', descricao: 'Portal de Treinamentos (gestão).' },
  { grupo: 'Operação', chave: 'compras', titulo: 'Suprimentos', descricao: 'Solicitações, cotações, pedidos, contratos, recebimento e almoxarifado.' },
  { grupo: 'Financeiro', chave: 'financeiro', titulo: 'Financeiro', descricao: 'Contas a pagar e a receber, boletos, tributos, conciliação, dívidas e análises.' },
  { grupo: 'Financeiro', chave: 'fiscal', titulo: 'Fiscal e NF-e', descricao: 'Notas fiscais.' },
  { grupo: 'Comercial', chave: 'crm', titulo: 'Comercial', descricao: 'Vendas de ativos, condomínios, contratos de serviço e CRM de serviços.' },
  { grupo: 'Comercial', chave: 'rentals', titulo: 'Locações', descricao: 'Contratos de locação.' },
  { grupo: 'Comercial', chave: 'incorporacao', titulo: 'Incorporação', descricao: 'Empreendimentos, Planta Inteligente, viabilidade, oportunidades e laudo de avaliação.' },
  { grupo: 'Comercial', chave: 'broker_portal', titulo: 'Portal do Corretor', descricao: 'Acesso ao Portal do Corretor pelo menu Portais.' },
  { grupo: 'Especialidades', chave: 'pro', titulo: 'ÒPURA Pro', descricao: 'Painel ÒPURA Pro.' },
  { grupo: 'Especialidades', chave: 'offices', titulo: 'ÒPURA Offices', descricao: 'Painel ÒPURA Offices.' },
  { grupo: 'Especialidades', chave: 'reformas', titulo: 'ÒPURA Reformas', descricao: 'Painel ÒPURA Reformas.' },
  { grupo: 'Especialidades', chave: 'ecommerce', titulo: 'ÒPURA E-commerce', descricao: 'E-commerce, CNO e Previdência, Governança Corporativa.' },
];

/** Pós-Obra (`quality`) não tem interruptor: o item mora em Engenharia, segue Engenharia. */
const DEPENDE_DE: Record<string, string> = {
  ...Object.fromEntries(MODULOS_DA_ORGANIZACAO.filter(m => m.dependeDe).map(m => [m.chave, m.dependeDe as string])),
  quality: 'obras',
};

/** A organização tem o módulo? Sem org (ou sem nada gravado) = tem. */
export function moduloLigadoNaOrg(org: Pick<Organization, 'settings'> | null | undefined, chave: string): boolean {
  const desligados = org?.settings?.modulos_da_organizacao as Record<string, boolean> | undefined;
  if (!desligados) return true;
  if (desligados[chave] === false) return false;
  const pai = DEPENDE_DE[chave];
  return pai ? moduloLigadoNaOrg(org, pai) : true;
}

function aplicarModulosDaOrg<T extends object>(modulos: T, org: Organization | undefined): T {
  if (!org?.settings?.modulos_da_organizacao) return modulos;
  const r = { ...modulos } as Record<string, unknown>;
  for (const chave of new Set([...Object.keys(r), ...MODULOS_DA_ORGANIZACAO.map(m => m.chave)])) {
    if (!moduloLigadoNaOrg(org, chave)) r[chave] = false;
  }
  return r as T;
}

/** O que o usuário vê NUMA organização: a permissão dele, recortada pelos módulos da org. */
export function modulosPermitidos(entrada: EntradaModulos) {
  return aplicarModulosDaOrg(modulosDoUsuario(entrada), entrada.activeOrg);
}

export type ModulosPermitidos = ReturnType<typeof modulosPermitidos>;

// ── "Todas as organizações" (15/11/2026) ─────────────────────────────────────
// Plano: docs/planos/2026-11-15-permissoes-todas-orgs-busca-truncate.md.
// Até aqui, com o topo em "Todas" não havia membro resolvido e o menu caía nos
// módulos padrão da empresa (quase tudo ligado), e o guard de rota liberava
// qualquer tela (`!activeOrganizationId → true`). Regra nova: em "Todas", um
// módulo aparece e abre se o usuário o tem em PELO MENOS UMA organização de que
// é membro — ninguém perde o que usa em alguma org, e ninguém ganha o que não
// tem em nenhuma.

export interface VinculoDoUsuario { org: Organization; member: MembroDaOrg }

/** Organizações em que o e-mail é membro, com o membro de cada uma. */
export function vinculosDoUsuario(organizations: Organization[], email: string | null | undefined): VinculoDoUsuario[] {
  if (!email) return [];
  const alvo = email.toLowerCase();
  const vinculos: VinculoDoUsuario[] = [];
  for (const org of organizations) {
    const member = org.members?.find(m => m.email?.toLowerCase() === alvo);
    if (member) vinculos.push({ org, member });
  }
  return vinculos;
}

/** OU chave a chave: o módulo fica ligado se alguma das leituras o liga. */
export function uniaoDeModulos(leituras: ModulosPermitidos[]): ModulosPermitidos {
  const uniao: Record<string, boolean> = {};
  for (const l of leituras) for (const [k, v] of Object.entries(l)) uniao[k] = Boolean(uniao[k]) || Boolean(v);
  return uniao as unknown as ModulosPermitidos;
}

/**
 * O que o menu, a Central e a busca rápida usam. Com organização no topo, é a
 * `modulosPermitidos` de sempre; em "Todas", a união das organizações do usuário.
 * Sem vínculo conhecido (lista ainda carregando), mantém a leitura antiga.
 */
export function modulosPermitidosNoContexto(entrada: EntradaModulos & { organizations: Organization[]; email?: string | null }): ModulosPermitidos {
  const { organizations, email, ...base } = entrada;
  if (base.activeOrg || base.profile.group === 'DESENVOLVEDOR' || base.isDevEmail) {
    const m = modulosPermitidos(base);
    // Diretoria fica fora do atalho do grupo DESENVOLVEDOR (vale a flag, utils/permissaoDiretoria.ts):
    // em "Todas", sem membro ativo, vale a flag em alguma organização do usuário — a mesma conta do
    // guard do AppRouter (revisão de 17/11; antes o menu escondia e a rota abria).
    if (!base.activeOrg && !base.isDevEmail && !m.diretoria
        && vinculosDoUsuario(organizations, email).some(v => moduloLigadoNaOrg(v.org, 'diretoria') && podeVerDiretoria({
          permissoes: v.member.permissions as unknown as Record<string, unknown> | undefined, acessoTotal: false,
        }))) {
      return { ...m, diretoria: true };
    }
    return m;
  }
  const vinculos = vinculosDoUsuario(organizations, email);
  if (!vinculos.length) return modulosPermitidos(base);
  return uniaoDeModulos(vinculos.map(v =>
    modulosPermitidos({ ...base, activeEmpresa: null, activeOrg: v.org, currentMember: v.member })));
}

/**
 * Decisão de UMA chave numa organização — a regra que o guard de rota do
 * `AppRouter` aplicava inline: admin vê tudo; permissão do membro manda; depois a
 * matriz do cargo (por produto); sem nada gravado, `padrao` (herança, ex.:
 * Treinamentos herda do RH, Riscos herda de Obras) ou libera.
 * `padrao` recebe a mesma decisão NA MESMA organização — em "Todas" a herança não
 * pode misturar organizações (RH numa, Treinamentos noutra).
 */
export function permitidoNaOrg(
  member: MembroDaOrg,
  org: Organization | undefined,
  userPermKey: string,
  matrixKey: string,
  padrao?: (naMesmaOrg: (userPermKey: string, matrixKey: string) => boolean) => boolean,
): boolean {
  // Módulo que a organização desligou não abre para ninguém — admin inclusive.
  if (!moduloLigadoNaOrg(org, matrixKey)) return false;
  if (member.role === 'admin') return true;
  const roleId = member.customRoleId || member.role;
  const matrix = (org?.settings?.module_visibility || {}) as Record<string, unknown>;
  const productCtx = (member as { productContext?: string }).productContext || 'platform';
  const porProduto = matrix.platform !== undefined || matrix.pro !== undefined || matrix.offices !== undefined;
  const productMatrix = (porProduto ? (matrix[productCtx] || {}) : matrix) as Record<string, Record<string, boolean>>;
  const roleConfig = productMatrix[roleId] || {};
  const userPerm = member.permissions ? (member.permissions as unknown as Record<string, unknown>)[userPermKey] : undefined;
  if (userPerm !== undefined) return Boolean(userPerm);
  if (roleConfig[matrixKey] !== undefined) return Boolean(roleConfig[matrixKey]);
  return padrao ? padrao((u, m) => permitidoNaOrg(member, org, u, m)) : true;
}

/**
 * Busca rápida (Ctrl+K) do `Layout`: tela → chave do menu que a mostra. Item sem
 * entrada aqui é geral (Dashboard, Notificações, Documentos…) e sempre aparece.
 * Mesma condição dos `NavItem`/`DropdownItem` do menu — até 15/11/2026 a busca
 * listava todos os módulos para qualquer usuário (o clique caía no guard).
 */
export const MODULO_DO_ITEM_DE_BUSCA: Record<string, keyof ModulosPermitidos> = {
  'eng-obras': 'obras', 'eng-orcamentos': 'obras', 'eng-planejamento': 'obras',
  riscos: 'riscos', diretoria: 'diretoria', 'qualidade-siac': 'qualidade_siac',
  'supplies-solicitacoes': 'compras', 'supplies-contracts': 'compras', 'supplies-quotations': 'compras', 'supplies-orders': 'compras',
  'financial-dashboard': 'financeiro', 'contas-a-pagar': 'financeiro', 'project-financial': 'financeiro',
  'fluxo-financeiro': 'financeiro', 'contas-a-receber': 'financeiro', 'boletos-pagar': 'financeiro',
  'conta-asaas': 'financeiro', 'dividas-financiamentos': 'financeiro', 'credit-rooms': 'financeiro',
  sales: 'crm',
  empreendimentos: 'incorporacao', 'regulatory-maps': 'incorporacao', imovib: 'incorporacao',
  treinamentos: 'treinamentos', 'labor-portal': 'rh',
};

/**
 * Telas de módulo que o guard de rota não confere por chave de usuário (não há
 * `canView*` para elas): só a organização as desliga. Junto com a tabela da busca,
 * diz ao guard "esta tela é do módulo X" (27/11/2026).
 */
const TELAS_SEM_CHAVE_DE_USUARIO: Record<string, ChaveModuloDaOrganizacao> = {
  ...Object.fromEntries([
    'contas-a-receber', 'financial-boletos', 'contas-a-pagar', 'boletos-pagar', 'tributos-a-pagar',
    'dividas-financiamentos', 'credit-rooms', 'bank-reconciliation', 'conta-asaas', 'financial-calendar',
    'dunning', 'financial-approval', 'fluxo-financeiro', 'financial-dashboard', 'fpa-module',
    'financial-intelligence', 'project-financial', 'financial-dre', 'financial-cashflow',
  ].map(id => [id, 'financeiro' as const])),
  // Engenharia: o 'dashboard' fica de fora — é o destino do redirecionamento do guard.
  ...Object.fromEntries([
    'org-type-templates', 'reports', 'estrutural', 'project-settings', 'eng-obra-types',
    'operacional', 'project-diary',
  ].map(id => [id, 'obras' as const])),
  'service-contracts': 'crm', 'services-commercial': 'crm',
  blueprint: 'incorporacao', opportunities: 'incorporacao', 'bim-viewer': 'incorporacao',
  'reformas-dashboard': 'reformas',
  'ecommerce-dashboard': 'ecommerce', 'opura-cno': 'ecommerce', 'opura-governance': 'ecommerce',
  'broker-area': 'broker_portal',
};

/** De que módulo é a tela (`activeView`), quando é de algum. */
export function moduloDaTela(view: string): string | undefined {
  return MODULO_DO_ITEM_DE_BUSCA[view] ?? TELAS_SEM_CHAVE_DE_USUARIO[view];
}

/**
 * O módulo existe no contexto do topo? Com organização: a dela. Em "Todas": em pelo
 * menos uma organização do usuário (a mesma união do menu); acesso total vê tudo;
 * sem vínculo conhecido (lista carregando) não bloqueia.
 */
export function moduloLigadoNoContexto(
  ctx: { activeOrg: Organization | undefined; organizations: Organization[]; email?: string | null; acessoTotal: boolean },
  chave: string,
): boolean {
  if (ctx.activeOrg) return moduloLigadoNaOrg(ctx.activeOrg, chave);
  if (ctx.acessoTotal) return true;
  const vinculos = vinculosDoUsuario(ctx.organizations, ctx.email);
  return !vinculos.length || vinculos.some(v => moduloLigadoNaOrg(v.org, chave));
}

/** Mesmo cálculo do menu, a partir do store — para telas fora do `Layout`. */
export function useModulosPermitidos(profile: { group: string; email?: string }): ModulosPermitidos {
  const { companies, activeEmpresaId, organizations, activeOrganizationId } = useStore();
  const activeEmpresa = companies.find(c => c.id === activeEmpresaId) ?? null;
  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  const currentMember = React.useMemo(() => {
    if (!activeOrg?.members || !profile.email) return null;
    return activeOrg.members.find(m => m.email.toLowerCase() === profile.email?.toLowerCase()) || null;
  }, [activeOrg, profile.email]);
  const isDevEmail = temAcessoTotal(profile.email);
  return React.useMemo(
    () => modulosPermitidosNoContexto({ activeEmpresa, profile, currentMember, activeOrg, isDevEmail, organizations, email: profile.email }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEmpresa, profile.group, profile.email, currentMember, activeOrg, isDevEmail, organizations],
  );
}
