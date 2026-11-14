interface TipoComOrg {
  slug: string;
  organization_id: string | null;
}

// Com "Todas", tipo de catálogo é replicado em cada org do usuário (REGRA #5) — mesmo
// slug em N linhas. Seletor mostra um por slug: o da org escolhida, senão o de sistema,
// senão o primeiro. Mantém a ordem de chegada.
export function tiposUnicosPorSlug<T extends TipoComOrg>(tipos: T[], orgId?: string | null): T[] {
  const escolhido = new Map<string, T>();
  const peso = (t: T) => (orgId && t.organization_id === orgId ? 2 : t.organization_id === null ? 1 : 0);
  for (const t of tipos) {
    const atual = escolhido.get(t.slug);
    if (!atual || peso(t) > peso(atual)) escolhido.set(t.slug, t);
  }
  const vistos = new Set<string>();
  return tipos.filter(t => {
    if (vistos.has(t.slug)) return false;
    vistos.add(t.slug);
    return true;
  }).map(t => escolhido.get(t.slug)!);
}

/**
 * Como a aba de unidades do empreendimento se monta (09/11/2026) — `empreendimento_types.estrutura`.
 * TORRES = torres → pavimentos → unidades; LOTE = a unidade é o próprio terreno; IMOVEL_UNICO = uma
 * unidade sobre o terreno (casa, chácara). Plano: docs/planos/2026-11-09-empreendimento-unidade-unica.md.
 * UNIDADE_AUTONOMA (13/11/2026) = uma unidade dentro de um prédio que não é do empreendimento
 * (apartamento, sala): aba "Unidade" sem a seção Terreno. Plano: docs/planos/2026-11-13-empreendimento-apartamento-unidade.md.
 */
export type EstruturaDoTipo = 'TORRES' | 'LOTE' | 'IMOVEL_UNICO' | 'UNIDADE_AUTONOMA';

export const ESTRUTURAS_DO_TIPO: { value: EstruturaDoTipo; label: string }[] = [
  { value: 'TORRES', label: 'Torres e unidades' },
  { value: 'LOTE', label: 'Lote (a unidade é o próprio terreno)' },
  { value: 'IMOVEL_UNICO', label: 'Imóvel único (casa, chácara)' },
  { value: 'UNIDADE_AUTONOMA', label: 'Unidade sem terreno (apartamento, sala)' },
];

const ehEstrutura = (v: unknown): v is EstruturaDoTipo => ESTRUTURAS_DO_TIPO.some(e => e.value === v);

/**
 * A estrutura do tipo do empreendimento. O slug se repete entre orgs, então vale o registro da org do
 * empreendimento, senão o de sistema (a mesma escolha de `tiposUnicosPorSlug`). Sem tipo, tipo fora
 * do catálogo ou valor desconhecido → 'TORRES' (o comportamento de sempre).
 */
export function estruturaDoTipo<T extends TipoComOrg & { estrutura?: string | null }>(
  tipos: T[], slug: string | null | undefined, orgId?: string | null,
): EstruturaDoTipo {
  if (!slug) return 'TORRES';
  const tipo = tiposUnicosPorSlug(tipos.filter(t => t.slug === slug), orgId)[0];
  return ehEstrutura(tipo?.estrutura) ? tipo.estrutura : 'TORRES';
}
