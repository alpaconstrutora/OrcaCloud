// utils/empreendimentoOrdemDasUnidades.ts
//
// A ORDEM DAS UNIDADES DE UM PAVIMENTO (27/10/2026): *"Temos que fazer uma ordenação de duas maneiras, automática
// como você está sugerindo e manual"*. Plano: docs/planos/2026-10-27-ordem-das-unidades-no-pavimento.md.
//
//  - MANUAL: a ordem do Empreendimento (`sort_order`), mudada pelas setas da aba Torres e Unidades. É a que a massa da
//    Planta segue no modo "Ordem do Empreendimento".
//  - AUTOMÁTICA: pelo número da unidade, pela COLUNA (os dois últimos dígitos): 101, 201 e 301 caem no mesmo lugar
//    de cada andar, mesmo quando o cadastro trouxe o andar fora de ordem (o 3º da Torre A do Garden: 303, 204, 201,
//    202).
//
// O cadastro do Garden tinha andares inteiros com `sort_order` 0: mover renumera o pavimento todo, a partir do menor
// valor dele, para os valores ficarem distintos. Puro.

interface Ordenavel {
  name?: string | null;
  sort_order?: number | null;
}

export interface NovaOrdem {
  id: string;
  sort_order: number;
}

const COLECAO = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** A ordem da aba: `sort_order`, e no empate o nome com número. */
export function compararNaOrdemDoEmpreendimento(a: Ordenavel, b: Ordenavel): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || COLECAO.compare(a.name ?? '', b.name ?? '');
}

/** O número da unidade: os dígitos do fim do nome ("303", "Apto 12"); sem dígitos, null. */
function numeroDe(nome: string): { coluna: number; inteiro: number } | null {
  const m = /(\d+)\s*$/.exec(nome.trim());
  if (!m) return null;
  const inteiro = Number(m[1]);
  // Três dígitos ou mais = andar + coluna (303 → coluna 3); menos = o número é a própria posição (Casa 12).
  return { coluna: m[1].length >= 3 ? inteiro % 100 : inteiro, inteiro };
}

/** A ordem automática pelo nome: pela coluna, depois pelo número inteiro; nome sem número vai para o fim. */
export function compararNomesPorNumero(a: string, b: string): number {
  const na = numeroDe(a);
  const nb = numeroDe(b);
  if (na && nb) return na.coluna - nb.coluna || na.inteiro - nb.inteiro || COLECAO.compare(a, b);
  if (na) return -1;
  if (nb) return 1;
  return COLECAO.compare(a, b);
}

/** A ordem automática de duas unidades do cadastro. */
export function compararPorNumero(a: Ordenavel, b: Ordenavel): number {
  return compararNomesPorNumero(a.name ?? '', b.name ?? '');
}

/**
 * Os `sort_order` de `lista` reescritos na ordem de `nova`: os valores que o pavimento já tem, quando distintos;
 * senão, do menor deles em diante. Devolve só o que muda.
 */
function renumerar<T extends Ordenavel & { id: string }>(lista: readonly T[], nova: readonly T[]): NovaOrdem[] {
  const valores = lista.map((u) => u.sort_order ?? 0).sort((a, b) => a - b);
  const distintos = valores.every((v, i) => i === 0 || v > valores[i - 1]);
  const base = valores[0] ?? 0;
  const out: NovaOrdem[] = [];
  nova.forEach((u, i) => {
    const so = distintos ? valores[i] : base + i;
    if ((u.sort_order ?? 0) !== so) out.push({ id: u.id, sort_order: so });
  });
  return out;
}

/** A unidade `indice` de `lista` (na ordem da aba) uma posição para cima (-1) ou para baixo (+1). */
export function moverNaOrdem<T extends Ordenavel & { id: string }>(lista: readonly T[], indice: number, passo: -1 | 1): NovaOrdem[] {
  const alvo = indice + passo;
  if (indice < 0 || indice >= lista.length || alvo < 0 || alvo >= lista.length) return [];
  const nova = [...lista];
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return renumerar(lista, nova);
}

/** O pavimento inteiro na ordem automática, gravado como a ordem do Empreendimento ("Ordenar por número"). */
export function ordemPorNumero<T extends Ordenavel & { id: string }>(lista: readonly T[]): NovaOrdem[] {
  const naAba = [...lista].sort(compararNaOrdemDoEmpreendimento);
  return renumerar(naAba, [...lista].sort(compararPorNumero));
}
