/**
 * Ids das abas do Portal do Cliente — fonte única, fora do componente, para que
 * a ajuda (utils/portalHelpDefaults.ts › PORTAL_SECTIONS.cliente) e o portal
 * (components/ClientArea.tsx › ALL_TABS) falem das mesmas seções (teste:
 * __tests__/portalHelpSections.test.ts). A ordem é a do menu do portal.
 */
export const CLIENT_PORTAL_TAB_IDS = [
  'dashboard', 'jornada', 'unidade', 'obra', 'cronograma-ff', 'visual', 'personalizacao',
  'diario', 'documentos', 'contratos', 'financeiro', 'suporte', 'manutencao', 'condominio',
] as const;
export type ClientPortalTabId = typeof CLIENT_PORTAL_TAB_IDS[number];

/**
 * As subseções da aba Condomínio (`client/CondominioTab.tsx › ABAS_CONDOMINIO`,
 * teste trava a igualdade). Para a AJUDA e o TOUR cada uma é uma seção própria
 * — `condominio.<id>` — com artigos e "como usar esta tela" dela.
 *
 * Por quê (14/10/2026): o mecanismo da ajuda só conhecia o 1º nível (aba), e o
 * Condomínio inteiro virou uma seção só — o usuário apontou, com print do menu,
 * que Dados gerais, Avisos, Documentos, Financeiro, Manutenção e Equipamentos
 * ficaram sem tour e sem ajuda próprios.
 */
export const CONDOMINIO_SECOES = ['dados', 'avisos', 'documentos', 'financeiro', 'manutencao', 'equipamentos'] as const;
export type CondominioSecao = typeof CONDOMINIO_SECOES[number];

/** Subseção salva que não existe mais cai em 'dados' — o mesmo que
 *  `CondominioTab › resolverAba` faz com a tela, para a ajuda não falar de
 *  uma seção diferente da que está aberta. */
export const secaoDoCondominio = (sub: string) =>
  `condominio.${(CONDOMINIO_SECOES as readonly string[]).includes(sub) ? sub : 'dados'}`;

/** Todas as seções da ajuda: abas + subseções do Condomínio logo depois dele. */
export const CLIENT_PORTAL_SECTION_IDS: string[] = CLIENT_PORTAL_TAB_IDS.flatMap(id =>
  id === 'condominio' ? [id, ...CONDOMINIO_SECOES.map(secaoDoCondominio)] : [id]);

/** Abas liberadas → seções da ajuda liberadas (o Condomínio leva as subseções). */
export function secoesLiberadas(abas: readonly string[]): string[] {
  return abas.includes('condominio') ? [...abas, ...CONDOMINIO_SECOES.map(secaoDoCondominio)] : [...abas];
}

/** Onde a pessoa está, no vocabulário da ajuda. */
export function secaoAtual(aba: string, subCondominio: string): string {
  return aba === 'condominio' ? secaoDoCondominio(subCondominio) : aba;
}

/** Seção da ajuda → aba + subseção, para a navegação do tour e do "Ir". */
export function destinoDaSecao(secao: string): { aba: string; sub: CondominioSecao | null } {
  const [aba, sub] = secao.split('.');
  return { aba, sub: sub && (CONDOMINIO_SECOES as readonly string[]).includes(sub) ? sub as CondominioSecao : null };
}
