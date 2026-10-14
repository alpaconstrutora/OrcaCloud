/**
 * As telas do editor da Planta que um LINK DIRETO pode abrir:
 * `#/blueprint?studyId=…&tela=…` (14/10/2026 — o Empreendimento abre o estudo
 * já em "Áreas NBR 12721"). Arquivo próprio e leve porque o módulo (que lê o
 * endereço) e o editor (que abre a tela) dependem dele, e o editor é pesado.
 */
export const TELAS_DO_LINK_DIRETO = ['areas-nbr12721', 'unidades'] as const;
export type TelaDoLinkDireto = (typeof TELAS_DO_LINK_DIRETO)[number];
