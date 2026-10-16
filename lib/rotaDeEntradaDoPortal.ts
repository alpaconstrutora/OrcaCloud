import { ProfileGroup } from '../types';

/**
 * Portais que têm ENTRADA PRÓPRIA no endereço, sem token: a pessoa entra por
 * e-mail e senha numa página só daquele portal.
 *
 * O App usa este mapa em dois lugares: ao clicar no cartão do seletor de
 * portais (troca o endereço para a rota ANTES de escolher o grupo) e para
 * decidir qual tela de login mostrar. O efeito de rota correspondente em
 * `App.tsx` (`/portal-treinamentos`) sustenta o grupo em memória depois de
 * sair ou de ser recusado — ver docs/planos/2026-10-16-login-exclusivo-portal-treinamentos.md.
 *
 * O Portal do Parceiro (`/portal-parceiro`) fica FORA de propósito: o cartão
 * dele ainda abre o `Auth` genérico na raiz, e mudar isso é uma decisão de
 * produto que não foi pedida. Quando for, entra aqui — e o teste que trava o
 * tamanho do mapa é atualizado junto.
 */
export const ROTA_DE_ENTRADA_DO_PORTAL: Partial<Record<ProfileGroup, string>> = {
    [ProfileGroup.TRAINEE]: '/portal-treinamentos',
};

/** Rota de entrada própria do grupo, ou `null` quando o grupo entra pelo seletor comum. */
export function rotaDeEntradaDoPortal(grupo: ProfileGroup | null | undefined): string | null {
    return (grupo && ROTA_DE_ENTRADA_DO_PORTAL[grupo]) || null;
}
