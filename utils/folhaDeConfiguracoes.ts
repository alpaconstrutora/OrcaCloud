/**
 * Folha de Configurações do Sistema pedida por quem abre a tela de fora (ex.: o
 * endereço antigo `labor-fiscal` → Tributos e Impostos › INSS). Quem pede grava
 * a chave; `Settings` lê UMA vez ao abrir e apaga. Mora fora de Settings.tsx
 * porque a tela é carregada sob demanda (React.lazy no AppRouter).
 */
export const CHAVE_FOLHA_PEDIDA = 'settings_active_leaf';
