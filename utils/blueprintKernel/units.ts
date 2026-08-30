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
 *
 * 0.5.0 (21/08/2026) — `Boundary` ganhou `kind` (TERRENO/DIVISA) e `papel`
 * (frente/fundos/laterais), para a ferramenta de terreno. Os atributos viajam no
 * PAYLOAD, e não numa tabela ao lado, porque `modelFromCanonicalPayload`
 * reconstrói os limites com ids `bnd_` NOVOS — id de limite não sobrevive a
 * publicar+recarregar, então referência externa por id se perderia no primeiro
 * publish. Payload sob 0.4.0 não tem os campos; lidos como `'DIVISA'`/`null`,
 * que é o que aquele desenho significava.
 *
 * 0.6.0 (21/08/2026) — a ESCRITURA entrou no modelo: `Boundary` ganhou
 * `medidaEscrituraMm` e `confrontante`, e o modelo ganhou `areaEscrituraMm2`. É a
 * mesma razão da entrada 0.5.0 levada ao dado da matrícula — e vale também para o
 * RASCUNHO, não só para o snapshot: `blueprint_branches.draft_payload` guarda este
 * mesmo payload canônico, então o que não está aqui se perde já no autosave, sem
 * publicação nenhuma. Payload sob 0.5.0 não tem os campos; lidos como `null`, que
 * é "ninguém informou" — e não se compara desenho com escritura que ninguém deu.
 *
 * 0.7.0 (23/08/2026) — a PORTA DE CORRER: `Opening` ganhou o tipo `sliding` e o
 * campo `embutida` (folha no bolso da parede ou sobre a face). A entrada estava
 * FALTANDO nesta lista — a constante subiu e o histórico não, e quem viesse
 * depois leria "0.6.0" como a última mudança. Registrada aqui em 30/08/2026, ao
 * subir para 0.8.0. `embutida` é emitida só em abertura de correr, então nenhum
 * desenho sem porta de correr mudou de forma.
 *
 * 0.8.0 (30/08/2026) — `Wall` ganhou `alinhamento` (`EIXO`/`DIREITA`/`ESQUERDA`):
 * de que lado do eixo estava o traço que o usuário clicou. O campo não move nada
 * e não muda a topologia — `a`/`b` continuam sendo o eixo, e a conexão continua
 * pelo eixo. Ele existe porque o lado era estado só da FERRAMENTA de desenho,
 * aplicado uma vez no clique e esquecido: mudar a espessura depois crescia a
 * parede para os dois lados e a face apontada andava meia espessura. Emitido
 * SÓ quando difere de `'EIXO'` — pela razão da entrada 0.6.0 levada à parede:
 * a chave entraria em toda parede do acervo, mudando a forma canônica de
 * desenhos que não têm nada a ver com traçado pela face. Ausente = `'EIXO'`,
 * que é exatamente o que aquelas paredes sempre significaram.
 */
export const KERNEL_VERSION = 'blueprint-kernel-ts-0.8.0';

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
