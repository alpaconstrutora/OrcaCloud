import React from 'react';
import { useStore } from '../store/useStore';
import type { Company, Organization } from '../types';
import { podeVerTreinamentos } from './permissaoTreinamentos';
import { podeVerRiscos } from './permissaoRiscos';
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

export function modulosPermitidos({ activeEmpresa, profile, currentMember, activeOrg, isDevEmail }: EntradaModulos) {
  const baseMods = activeEmpresa?.modulos_habilitados || {
    obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: false, offices: false, reformas: false
  };

  if (profile.group === 'DESENVOLVEDOR' || isDevEmail) {
    return {
      obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: true, offices: true, reformas: true, quality: true, ecommerce: true, treinamentos: true, riscos: true
    };
  }

  if (!currentMember) return { ...baseMods, ecommerce: false, treinamentos: baseMods.rh !== false, riscos: baseMods.obras !== false };

  if (currentMember.role === 'admin') {
    return {
      obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: true, offices: true, reformas: true, quality: true, ecommerce: true, treinamentos: true, riscos: true
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
    broker_portal: baseMods.broker_portal !== false
  };
}

export type ModulosPermitidos = ReturnType<typeof modulosPermitidos>;

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
    () => modulosPermitidos({ activeEmpresa, profile, currentMember, activeOrg, isDevEmail }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEmpresa, profile.group, currentMember, activeOrg, isDevEmail],
  );
}
