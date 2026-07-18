/**
 * CLASSIFICAÇÃO DE PROJETO — fonte única da verdade
 * =================================================
 *
 * A tabela `projects` guarda quatro coisas diferentes no mesmo lugar,
 * separadas só por `settings.classification`:
 *
 *   OBRA         — a obra de verdade (Engenharia › Obras)
 *   ORCAMENTO    — orçamento (Engenharia › Orçamentos)
 *   PLANEJAMENTO — planejamento/cronograma
 *   DIARIO       — diário de obra
 *
 * ## A regra do produto
 *
 * **Quando a tela fala em "obra", ela mostra SÓ `OBRA`.** Orçamento e
 * planejamento só aparecem quando a tela pede por eles explicitamente (a tela
 * de Orçamentos, a de Planejamento, o seletor de "vincular orçamento"). Nunca
 * misturados num seletor genérico de obra.
 *
 * ## Por que este arquivo existe
 *
 * Isso era decidido tela a tela, e as telas discordavam entre si:
 *
 *   - 61 lugares usavam `classification === 'OBRA'` (estrito)
 *   - `NON_OBRA = new Set([...])` + `!has(...)` (frouxo — deixava passar
 *     projeto SEM classificação como se fosse obra)
 *   - dezenas de telas não filtravam nada e listavam os quatro tipos juntos
 *     (`CentralObra`, `BoletoFormModal`, `AreaEngineModule`, e a tela de
 *     seleção do ÒPURA CNO, que foi onde o usuário viu o problema)
 *
 * Agora `useStore().projects` já contém **apenas obras**. Quem precisa dos
 * outros tipos usa `allProjects` + os helpers daqui, de forma explícita e
 * visível na leitura do código.
 */

export type ProjectClassification = 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO';

/**
 * Valor legado que existe nos dados mas nunca entrou no tipo
 * `ProjectSettings['classification']`. Aparece em `ScheduleHeader.tsx` e
 * `SupplyChainQuotationForm.tsx`, nos dois casos tratado como irmão de
 * `ORCAMENTO` (seletor de "qual orçamento embasa isto").
 *
 * Aqui ele é reconhecido explicitamente para **não** cair no caso "sem
 * classificação": se caísse, um COST_ESTIMATION viraria obra no dia em que
 * alguém virasse `TRATAR_SEM_CLASSIFICACAO_COMO_OBRA`. Ele nunca é obra.
 */
export const LEGACY_CLASSIFICATIONS = ['COST_ESTIMATION'] as const;
export type LegacyClassification = typeof LEGACY_CLASSIFICATIONS[number];
export type AnyClassification = ProjectClassification | LegacyClassification;

/**
 * ⚠️ ESTA É A ÚNICA LINHA QUE DECIDE O CASO AMBÍGUO.
 *
 * Projeto legado cujo `settings.classification` está ausente/vazio conta como
 * obra?
 *
 * `false` (atual) = NÃO conta. Motivos:
 *   - é o comportamento dos 61 lugares que já usavam o padrão estrito;
 *   - `INITIAL_PROJECT_SETTINGS.classification` é `'ORCAMENTO'` (constants.ts),
 *     ou seja, o default do próprio sistema não é obra — tratar ausência como
 *     obra contradiz o default e traz orçamento antigo de volta para as listas.
 *
 * Consequência de manter `false`: uma obra antiga sem o campo preenchido some
 * das listas até alguém classificá-la. É um erro visível (falta um item) e não
 * silencioso (item errado no meio), que é o lado certo para errar.
 *
 * Para conferir o tamanho real do problema no banco:
 *   scripts/diagnostico-classificacao-projetos.sql
 *
 * Se o diagnóstico mostrar muitas obras legadas sem classificação, a correção
 * preferida é um backfill dirigido nelas — NÃO virar esta constante para
 * `true`, que reabriria a porta para orçamento antigo aparecer como obra.
 */
export const TRATAR_SEM_CLASSIFICACAO_COMO_OBRA = false;

/** Forma mínima que este módulo precisa enxergar de um projeto. */
export interface ClassifiableProject {
  settings?: { classification?: string | null } | null;
}

/**
 * Lê a classificação normalizada, ou `null` quando ausente/vazia.
 * Reconhece também os valores legados (ver `LEGACY_CLASSIFICATIONS`), que não
 * são `null` — só não são obra.
 */
export function getClassification(p: ClassifiableProject | null | undefined): AnyClassification | null {
  const raw = (p?.settings?.classification || '').trim().toUpperCase();
  if (raw === 'OBRA' || raw === 'ORCAMENTO' || raw === 'PLANEJAMENTO' || raw === 'DIARIO') {
    return raw;
  }
  if ((LEGACY_CLASSIFICATIONS as readonly string[]).includes(raw)) {
    return raw as LegacyClassification;
  }
  return null;
}

/** Orçamento, incluindo o legado COST_ESTIMATION — o par usado nos seletores de orçamento. */
export function isOrcamentoOuLegado(p: ClassifiableProject | null | undefined): boolean {
  const c = getClassification(p);
  return c === 'ORCAMENTO' || c === 'COST_ESTIMATION';
}

/** É uma obra de verdade (Engenharia › Obras)? */
export function isObra(p: ClassifiableProject | null | undefined): boolean {
  const c = getClassification(p);
  if (c === null) return TRATAR_SEM_CLASSIFICACAO_COMO_OBRA;
  return c === 'OBRA';
}

export function isOrcamento(p: ClassifiableProject | null | undefined): boolean {
  return getClassification(p) === 'ORCAMENTO';
}

export function isPlanejamento(p: ClassifiableProject | null | undefined): boolean {
  return getClassification(p) === 'PLANEJAMENTO';
}

export function isDiario(p: ClassifiableProject | null | undefined): boolean {
  return getClassification(p) === 'DIARIO';
}

/** Só obras. É o filtro que 99% das telas quer. */
export function onlyObras<T extends ClassifiableProject>(projects: T[]): T[] {
  return projects.filter(isObra);
}

export function onlyOrcamentos<T extends ClassifiableProject>(projects: T[]): T[] {
  return projects.filter(isOrcamento);
}

export function onlyPlanejamentos<T extends ClassifiableProject>(projects: T[]): T[] {
  return projects.filter(isPlanejamento);
}

export function onlyDiarios<T extends ClassifiableProject>(projects: T[]): T[] {
  return projects.filter(isDiario);
}

/** Filtro por um ou mais tipos, quando a tela precisa de uma combinação. */
export function onlyClassifications<T extends ClassifiableProject>(
  projects: T[],
  ...classifications: AnyClassification[]
): T[] {
  const set = new Set(classifications);
  const c = (p: T) => getClassification(p);
  return projects.filter(p => {
    const k = c(p);
    if (k === null) return TRATAR_SEM_CLASSIFICACAO_COMO_OBRA && set.has('OBRA');
    return set.has(k);
  });
}
