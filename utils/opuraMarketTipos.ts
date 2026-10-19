// utils/opuraMarketTipos.ts
//
// Tipos de imóvel que entram nas médias de preço do ÒPURA Market.
// Plano: docs/planos/2026-10-19-opura-market-media-por-tipo.md, item 2.
//
// ─── Por que existe ─────────────────────────────────────────────────────────
// Até 19/10/2026 as médias do raio e do bairro misturavam todos os tipos. Em
// Cambuí o terreno anuncia a R$ 385/m² e o apartamento a R$ 6 mil/m²: no raio
// de 2 km do Centro a média caía de R$ 4.947 para R$ 4.218/m², e com ela o VGV
// e a faixa de velocidade do estudo de vocação. Agora a tela escolhe os tipos e
// manda para a RPC (`p_tipos`).
//
// O padrão é "tudo menos Terreno": o estudo compara produto construído. Terreno
// continua escolhível — preço de terreno por bairro é dado de incorporação.
//
// O vocabulário é o mesmo que a importação grava (`tipoDoImovel` e
// `TIPOS_GRAVAVEIS` em supabase/functions/opura-market-import/logica.ts).

export const TIPOS_DE_IMOVEL = ['Apartamento', 'Casa', 'Comercial', 'Terreno', 'Outro'] as const;

export type TipoDeImovel = (typeof TIPOS_DE_IMOVEL)[number];

/** Padrão das médias: produto construído, sem terreno. */
export const TIPOS_PADRAO: readonly TipoDeImovel[] = TIPOS_DE_IMOVEL.filter((t) => t !== 'Terreno');

const ehTipo = (v: unknown): v is TipoDeImovel => typeof v === 'string' && (TIPOS_DE_IMOVEL as readonly string[]).includes(v);

/**
 * Lista válida de tipos, na ordem do vocabulário. Descarta o que não é tipo
 * conhecido e o repetido; lista vazia (ou que não é lista) vira o padrão —
 * "nenhum tipo" daria média vazia, e o seletor não deixa chegar lá.
 */
export function normalizarTipos(valor: unknown): TipoDeImovel[] {
  const escolhidos = new Set(Array.isArray(valor) ? valor.filter(ehTipo) : []);
  const lista = TIPOS_DE_IMOVEL.filter((t) => escolhidos.has(t));
  return lista.length > 0 ? lista : [...TIPOS_PADRAO];
}

export function mesmosTipos(a: readonly string[], b: readonly string[]): boolean {
  const na = normalizarTipos(a);
  const nb = normalizarTipos(b);
  return na.length === nb.length && na.every((t, i) => t === nb[i]);
}

/** Texto curto para o gatilho do seletor: "Todos", "Sem terreno", "Só Terreno", "Apartamento, Casa", "3 tipos". */
export function resumoDosTipos(tipos: readonly string[]): string {
  const lista = normalizarTipos(tipos);
  if (lista.length === TIPOS_DE_IMOVEL.length) return 'Todos';
  if (lista.length === TIPOS_DE_IMOVEL.length - 1) {
    const fora = TIPOS_DE_IMOVEL.find((t) => !lista.includes(t))!;
    return `Sem ${fora.toLowerCase()}`;
  }
  if (lista.length === 1) return `Só ${lista[0]}`;
  if (lista.length === 2) return lista.join(', ');
  return `${lista.length} tipos`;
}

/** Lista por extenso, para subtítulo e relatório: "Apartamento, Casa, Comercial e Outro". */
export function descricaoDosTipos(tipos: readonly string[]): string {
  const lista = normalizarTipos(tipos);
  if (lista.length === TIPOS_DE_IMOVEL.length) return 'todos os tipos';
  return lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

/**
 * Tipos com que a estatística de um estudo salvo foi medida. `null` = estudo
 * salvo antes de 19/10/2026, quando a média levava todos os tipos (e o campo
 * `tipos` não existia em `radius_stats`).
 */
export function tiposDoEstudo(radiusStats: { tipos?: unknown } | null | undefined): TipoDeImovel[] | null {
  if (!radiusStats || !Array.isArray(radiusStats.tipos)) return null;
  return normalizarTipos(radiusStats.tipos);
}
