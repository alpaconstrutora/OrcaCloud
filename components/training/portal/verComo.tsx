import React from 'react';

/**
 * "Ver como" — prévia do gestor no Portal de Treinamentos.
 * Plano: docs/planos/2026-10-16-portal-treinamentos-previa-ver-como.md
 *
 * Valor = id de `academy_portal_users` da pessoa; null = o treinando logado.
 * As abas leem daqui para passar `p_ver_como` às RPCs e separar o cache
 * (`academyKeys.trainee*(alvo)`) do de "Meus Treinamentos" do próprio gestor.
 */
export const VerComoContext = React.createContext<string | null>(null);

export const useVerComo = (): string | null => React.useContext(VerComoContext);
