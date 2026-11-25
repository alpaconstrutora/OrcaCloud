import { UserProfile } from '../types';

/**
 * Quem gere o Portal do Investidor e as Oportunidades (cria, edita, publica, vê rascunho e interesses).
 * Uma regra só para o painel do investidor (InvestorDashboard) e para Incorporação › Oportunidades
 * (OportunidadesModule) — plano docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md.
 */
export const ehGestorDoInvestidor = (profile?: { group?: string; role?: string } | null): boolean =>
    profile?.role === UserProfile.ADMIN
    || profile?.role === UserProfile.DEVELOPER
    || profile?.group === 'DESENVOLVEDOR';
