// utils/empreendimentoDistanciasEntreTorres.ts
//
// DISTÂNCIA ENTRE TORRES (28/10/2026): *"quando um empreendimento tem mais de uma torre a distância entre torres deve
// ser informada. implemente campo com esse objetivo em incorporação > empreendimento > aba torres e unidades. Essa
// informação deve ser considerada em incorporação > planta inteligente"*. Decisão do usuário: UMA POR PAR de torres.
// Plano: docs/planos/2026-10-28-distancia-entre-torres.md.
//
// Mora em `empreendimentos.distancias_entre_torres` (jsonb, lista de `{ torre_a, torre_b, distancia_m }`), com o par
// guardado em ordem (torre_a < torre_b) para valer nos dois sentidos. Par de torre apagada é ignorado na leitura. As
// quadras do loteamento não são torre. Puro.

export interface DistanciaEntreTorres {
  torre_a: string;
  torre_b: string;
  /** Metros, a menor distância permitida entre as duas torres (contorno a contorno). */
  distancia_m: number;
}

export const DISTANCIA_MAX_ENTRE_TORRES_M = 500;

interface TorreDoPar {
  id: string;
  name: string;
  sort_order?: number | null;
  blueprint_quadra_uid?: string | null;
}

/** Cada par de torres uma vez, na ordem da aba (sort_order, depois o nome). Quadra do loteamento fica fora. */
export function paresDeTorres<T extends TorreDoPar>(torres: readonly T[]): [T, T][] {
  const ts = torres
    .filter((t) => !t.blueprint_quadra_uid)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  const out: [T, T][] = [];
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) out.push([ts[i], ts[j]]);
  return out;
}

const emOrdem = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** O jsonb do banco, sanitizado: só pares de torres diferentes com distância positiva; o par em ordem. */
export function lerDistancias(valor: unknown): DistanciaEntreTorres[] {
  if (!Array.isArray(valor)) return [];
  const out: DistanciaEntreTorres[] = [];
  for (const v of valor) {
    if (!v || typeof v !== 'object') continue;
    const { torre_a, torre_b, distancia_m } = v as Record<string, unknown>;
    if (typeof torre_a !== 'string' || typeof torre_b !== 'string' || torre_a === torre_b) continue;
    const m = Number(distancia_m);
    if (!Number.isFinite(m) || m <= 0) continue;
    const [a, b] = emOrdem(torre_a, torre_b);
    out.push({ torre_a: a, torre_b: b, distancia_m: m });
  }
  return out;
}

/** A distância pedida para o par (nos dois sentidos); null = não informada. */
export function distanciaDoPar(lista: readonly DistanciaEntreTorres[], a: string, b: string): number | null {
  const [x, y] = emOrdem(a, b);
  return lista.find((d) => d.torre_a === x && d.torre_b === y)?.distancia_m ?? null;
}

/** A lista com a distância do par trocada (`null` tira o par). */
export function comDistancia(lista: readonly DistanciaEntreTorres[], a: string, b: string, metros: number | null): DistanciaEntreTorres[] {
  const [x, y] = emOrdem(a, b);
  const resto = lista.filter((d) => !(d.torre_a === x && d.torre_b === y));
  return metros == null ? resto : [...resto, { torre_a: x, torre_b: y, distancia_m: metros }];
}

/** "6,50" ou "6.5" → 6.5; vazio → null (sem distância); zero, negativo, acima de 500 m ou não número → false. */
export function lerDistanciaDigitada(texto: string): number | null | false {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  const v = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(v) && v > 0 && v <= DISTANCIA_MAX_ENTRE_TORRES_M ? v : false;
}
