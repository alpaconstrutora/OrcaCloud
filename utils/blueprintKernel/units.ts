/**
 * Unidades e política numérica do kernel geométrico (Spike A, braço TypeScript).
 *
 * Regra única do PRD §9.2: comprimento persiste em MILÍMETROS INTEIROS. Ponto
 * flutuante só existe dentro de um cálculo intermediário e nunca sobrevive a ele —
 * toda saída volta a inteiro por `roundToMm`.
 *
 * Por que inteiros: o critério do Spike A é igualdade bit a bit do payload canônico
 * entre navegador e servidor. Com float, duas somas na mesma ordem lógica mas em
 * ordem de avaliação diferente já divergem no último bit, e o hash muda sem que a
 * geometria tenha mudado. Com inteiro, a igualdade é estrutural.
 *
 * Faixa segura: uma edificação cabe em ±100.000 mm (100 m). Produtos vetoriais em
 * `geom.ts` chegam a ~1e10, muito abaixo de Number.MAX_SAFE_INTEGER (~9e15), então
 * os predicados de orientação são EXATOS — não aproximados.
 */

/**
 * Identifica a implementação e a política numérica. Entra no hash do snapshot.
 *
 * 0.2.0 — o payload canônico passou a referenciar nível e parede por ÍNDICE em vez
 * de `levelId`/`wallId`. A geometria não mudou; a serialização sim, e por isso todo
 * hash anterior é incompatível por construção. Snapshot gravado com 0.1.0 continua
 * legível pelo `kernel_version` que carrega — é para isso que ele existe.
 *
 * 0.4.0 (14/08/2026) — `Opening` ganhou `hingeAtStart`/`swingReversed` (girar e
 * espelhar o símbolo de porta). Payload gravado sob 0.3.0 não tem os dois campos;
 * `modelFromCanonicalPayload` os lê com `?? true`/`?? false`, o mesmo padrão de
 * `labels` na entrada 0.3.0 — snapshot antigo continua legível, só não recalcula
 * hash igual ao de hoje.
 */
export const KERNEL_VERSION = 'blueprint-kernel-ts-0.4.0';

/**
 * Tolerância de junção/snap em milímetros.
 *
 * Dois vértices a até esta distância são considerados o mesmo ponto no arranjo
 * planar. Não é preferência de UI: muda o resultado topológico, portanto acompanha
 * a versão do kernel e entra no hash.
 */
export const DEFAULT_TOLERANCE_MM = 5;

/** Maior coordenada aceita, em mm. Além disso os predicados exatos perdem garantia. */
export const MAX_COORD_MM = 1_000_000;

export class KernelError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'KernelError';
  }
}

/**
 * Arredonda para milímetro inteiro com desempate LONGE DE ZERO.
 *
 * `Math.round` desempata para +Infinito (`Math.round(-0.5) === -0`), o que é
 * assimétrico entre um ponto e seu espelho. Meio-longe-de-zero é simétrico e é a
 * convenção que o braço Rust precisa reproduzir para o payload bater — `f64::round`
 * do Rust já é meio-longe-de-zero, então esta escolha alinha as duas linguagens
 * sem nenhuma tabela de conversão.
 */
export function roundToMm(value: number): number {
  if (!Number.isFinite(value)) {
    throw new KernelError('NON_FINITE', `Coordenada não finita: ${value}`);
  }
  // `+ 0` normaliza -0 para 0: -0 e 0 são iguais em ===, mas JSON.stringify os
  // escreve diferente ("0" × "-0") e isso vazaria para o payload canônico.
  return (value < 0 ? -Math.round(-value) : Math.round(value)) + 0;
}

export function isIntegerMm(value: number): boolean {
  return Number.isInteger(value) && Math.abs(value) <= MAX_COORD_MM;
}

export function assertIntegerMm(value: number, field: string): number {
  if (!isIntegerMm(value)) {
    throw new KernelError(
      'NOT_INTEGER_MM',
      `${field} deve ser milímetro inteiro dentro de ±${MAX_COORD_MM}; recebido ${value}`,
    );
  }
  return value + 0;
}

/**
 * Converte da unidade de exibição para o interior do kernel.
 * Só deve ser chamado na borda da aplicação (PRD §9.2).
 */
export function metersToMm(meters: number): number {
  return roundToMm(meters * 1000);
}

export function mmToMeters(mm: number): number {
  return mm / 1000;
}
