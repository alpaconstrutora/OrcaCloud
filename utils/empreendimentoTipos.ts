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
