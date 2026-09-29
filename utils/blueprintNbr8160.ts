/**
 * E5.1 — AS TABELAS DA NBR 8160:1999 (29/09/2026, roadmap hidrossanitário).
 *
 * O DN de um trecho de esgoto depende do PAPEL dele na árvore — não só das
 * UHC. Até aqui um degrau único (`dnPorUhc`, 40/50/75/100) valia para tudo, e
 * ele é, na verdade, só a tabela do ramal de esgoto. Aqui as tabelas:
 *
 *  - RAMAL DE DESCARGA: o DN mínimo do aparelho (tabela 3 — está na ficha).
 *  - RAMAL DE ESGOTO (tabela 5): DN 40 → 3 UHC; 50 → 6; 75 → 20; 100 → 160.
 *  - TUBO DE QUEDA (tabela 6): pela UHC total, e — prédio com mais de 3
 *    pavimentos — também pela UHC que entra num só pavimento.
 *  - SUBCOLETOR / COLETOR (tabela 7): pela UHC E pela DECLIVIDADE; DN mínimo
 *    100.
 *
 * O PAPEL sai da árvore (`esgotoTrechoATrecho`): o trecho "TQ" é tubo de
 * queda; o que recebe um tubo de queda, junta ambientes diferentes ou chega à
 * caixa de inspeção é subcoletor; o que leva um só aparelho é ramal de
 * descarga; o resto, ramal de esgoto.
 */

export type PapelNoEsgoto = 'RAMAL_DE_DESCARGA' | 'RAMAL_DE_ESGOTO' | 'TUBO_DE_QUEDA' | 'SUBCOLETOR';

export const ROTULO_DO_PAPEL: Record<PapelNoEsgoto, string> = {
  RAMAL_DE_DESCARGA: 'Ramal de descarga',
  RAMAL_DE_ESGOTO: 'Ramal de esgoto',
  TUBO_DE_QUEDA: 'Tubo de queda',
  SUBCOLETOR: 'Subcoletor',
};

/** Tabela 5 — ramais de esgoto: DN → UHC máxima. */
export const TABELA_RAMAL_DE_ESGOTO: readonly { dn: number; uhc: number }[] = [
  { dn: 40, uhc: 3 },
  { dn: 50, uhc: 6 },
  { dn: 75, uhc: 20 },
  { dn: 100, uhc: 160 },
];

/**
 * Tabela 6 — tubos de queda: DN → UHC máxima no prédio de até 3 pavimentos;
 * e, com mais de 3, a UHC máxima num pavimento e no tubo inteiro.
 */
export const TABELA_TUBO_DE_QUEDA: readonly { dn: number; ate3: number; porPavimento: number; total: number }[] = [
  { dn: 40, ate3: 4, porPavimento: 2, total: 8 },
  { dn: 50, ate3: 10, porPavimento: 6, total: 24 },
  { dn: 75, ate3: 30, porPavimento: 16, total: 70 },
  { dn: 100, ate3: 240, porPavimento: 90, total: 500 },
  { dn: 150, ate3: 960, porPavimento: 350, total: 1900 },
  { dn: 200, ate3: 2200, porPavimento: 600, total: 3600 },
  { dn: 250, ate3: 3800, porPavimento: 1000, total: 5600 },
  { dn: 300, ate3: 6000, porPavimento: 1500, total: 8400 },
];

/** Tabela 7 — subcoletores e coletor predial: DN → UHC máxima por declividade (0,5 / 1 / 2 / 4 %). */
export const DECLIVIDADES_DA_TABELA_7 = [0.5, 1, 2, 4] as const;
export const TABELA_SUBCOLETOR: readonly { dn: number; uhc: readonly (number | null)[] }[] = [
  { dn: 100, uhc: [null, 180, 216, 250] },
  { dn: 150, uhc: [null, 700, 840, 1000] },
  { dn: 200, uhc: [1400, 1600, 1920, 2300] },
  { dn: 250, uhc: [2500, 2900, 3500, 4200] },
  { dn: 300, uhc: [3900, 4600, 5600, 6700] },
  { dn: 400, uhc: [7000, 8300, 10000, 12000] },
];
export const DN_MINIMO_DO_SUBCOLETOR = 100;

/** Tabela 5: o menor DN do ramal de esgoto para as UHC; acima de 160, o do subcoletor a 1 %. */
export function dnDoRamalDeEsgoto(uhc: number): number {
  return TABELA_RAMAL_DE_ESGOTO.find((l) => uhc <= l.uhc)?.dn ?? dnDoSubcoletor(uhc, 1);
}

/** Tabela 6: o menor DN do tubo de queda. `pavimentos` = do prédio. */
export function dnDoTuboDeQueda(uhcTotal: number, uhcMaxNumPavimento: number, pavimentos: number): number {
  const linha = TABELA_TUBO_DE_QUEDA.find((l) => (pavimentos <= 3 ? uhcTotal <= l.ate3 : uhcTotal <= l.total && uhcMaxNumPavimento <= l.porPavimento));
  return linha?.dn ?? TABELA_TUBO_DE_QUEDA[TABELA_TUBO_DE_QUEDA.length - 1].dn;
}

/**
 * Tabela 7: o menor DN do subcoletor pelas UHC e a declividade. Vale a coluna
 * da maior declividade tabelada que o trecho TEM (abaixo de 0,5 %, a de
 * 0,5 %); o trecho vertical usa a de 4 %. Nunca abaixo de DN 100.
 */
export function dnDoSubcoletor(uhc: number, declividadePct: number | null): number {
  const i = declividadePct == null ? DECLIVIDADES_DA_TABELA_7.length - 1 : Math.max(0, DECLIVIDADES_DA_TABELA_7.filter((d) => d <= declividadePct + 1e-9).length - 1);
  // DN 100 e 150 não existem a 0,5 %: ali vale a coluna de 1 % (a declividade baixa é acusada à parte).
  const linha = TABELA_SUBCOLETOR.find((l) => uhc <= (l.uhc[i] ?? l.uhc[1] ?? 0));
  return Math.max(DN_MINIMO_DO_SUBCOLETOR, linha?.dn ?? TABELA_SUBCOLETOR[TABELA_SUBCOLETOR.length - 1].dn);
}
