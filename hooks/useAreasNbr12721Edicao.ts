// hooks/useAreasNbr12721Edicao.ts
//
// Quem pode EDITAR as Áreas NBR 12721 de um estudo da Planta (permissão
// `canEditAreaEngine`, Usuários › Permissões Detalhadas › Incorporação).
//
// Até 14/10/2026 a permissão era só declarada (era do Motor de Áreas antigo).
// Fase 10 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md: sem
// ela, a tela Áreas NBR 12721 abre SÓ PARA LEITURA (classificação, acessórios,
// ambientes declarados e hipóteses desligados, com o motivo) e os botões de
// aprovar / levar ao Empreendimento ficam desligados. O BANCO confere a mesma
// regra (`fn_pode_editar_areas_nbr12721`, dentro das RPCs) — aqui é só para o
// botão dizer por quê antes de a pessoa tentar.
//
// Molde: hooks/useImovibEdicao.tsx. A regra vale para a organização DONA DO
// ESTUDO, não para o topo (REGRA #5): com o topo em "Todas", o estudo tem org.

import { useMemo } from 'react';
import { useStore } from '../store/useStore';

export interface AreasNbr12721Edicao {
  pode: boolean;
  /** Por que não pode — vai no `title` dos controles e no aviso da tela. */
  motivo?: string;
}

export const MOTIVO_SEM_PERMISSAO_AREAS =
  'Seu usuário não tem permissão para editar as Áreas NBR 12721 nesta organização (Usuários › Permissões Detalhadas › Incorporação).';
const MOTIVO_NAO_MEMBRO = 'Você não é membro da organização dona deste estudo — as Áreas NBR 12721 abrem só para leitura.';

interface MembroLido {
  role?: string | null;
  permissions?: Record<string, unknown> | null;
}

/**
 * Regra pura — a MESMA de `fn_pode_editar_areas_nbr12721` no banco
 * (aplicar_20271014300000), testada em __tests__/areasNbr12721Edicao.test.ts:
 * - desenvolvedor: pode (mesma exceção do guard de rota em AppRouter);
 * - org do estudo ainda não carregada: pode (o banco segue conferindo);
 * - não é membro: não pode; admin/owner: pode;
 * - `canEditAreaEngine` definido no membro: vale ele;
 * - sem definição: o padrão do papel — viewer não, os demais sim.
 */
export function avaliarEdicaoAreasNbr12721(args: { desenvolvedor: boolean; orgCarregada: boolean; membro: MembroLido | null }): AreasNbr12721Edicao {
  if (args.desenvolvedor || !args.orgCarregada) return { pode: true };
  const m = args.membro;
  if (!m) return { pode: false, motivo: MOTIVO_NAO_MEMBRO };
  if (m.role === 'admin' || m.role === 'owner') return { pode: true };
  const perm = m.permissions ? m.permissions['canEditAreaEngine'] : undefined;
  const pode = perm !== undefined ? !!perm : m.role !== 'viewer';
  return pode ? { pode: true } : { pode: false, motivo: MOTIVO_SEM_PERMISSAO_AREAS };
}

// Mesmo e-mail de desenvolvedor do guard de rota (AppRouter.tsx, isDevEmail) e do useImovibEdicao.
const EMAIL_DESENVOLVEDOR = 'altair.rosa@alpaconstrutora.com.br';

/** Avalia a permissão para o estudo da organização `orgDoEstudo`. */
export function useAreasNbr12721PodeEditar(orgDoEstudo: string | null | undefined): AreasNbr12721Edicao {
  const group = useStore((s) => s.currentProfile.group);
  const email = useStore((s) => s.session?.user?.email);
  const organizations = useStore((s) => s.organizations);
  return useMemo(() => {
    const emailLower = (email || '').toLowerCase();
    const desenvolvedor = String(group) === 'DESENVOLVEDOR' || emailLower === EMAIL_DESENVOLVEDOR;
    const org = orgDoEstudo ? organizations.find((o) => o.id === orgDoEstudo) : undefined;
    const membro = org?.members?.find((m) => (m.email || '').toLowerCase() === emailLower) || null;
    return avaliarEdicaoAreasNbr12721({ desenvolvedor, orgCarregada: !!org?.members, membro: membro as MembroLido | null });
  }, [group, email, organizations, orgDoEstudo]);
}
