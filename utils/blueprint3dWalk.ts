// utils/blueprint3dWalk.ts
//
// Andar dentro do desenho — a conta do passo.
//
// ─── POR QUE ISTO É UM MÓDULO, E NÃO UM `useFrame` ───────────────────────────
//
// O viewer 3D está sob `@ts-nocheck`: nem compilador nem teste alcançam lá
// dentro. Três defeitos já nasceram assim nesta frente — enquadramento, grade e
// clique. A conta do passo vem para cá antes de existir um quarto.

/** Altura do olho, em metros. Uma pessoa em pé olhando o próprio desenho. */
export const ALTURA_DO_OLHO_M = 1.6;

/** Metros por segundo a pé. Andar de obra, não corrida. */
export const VELOCIDADE_M_S = 3.2;

export interface TeclasDeAndar {
  frente: boolean;
  tras: boolean;
  esquerda: boolean;
  direita: boolean;
}

export const SEM_TECLAS: TeclasDeAndar = {
  frente: false,
  tras: false,
  esquerda: false,
  direita: false,
};

/**
 * Traduz a tecla física para a intenção. `null` quando a tecla não é de andar.
 *
 * WASD e as setas juntos, e isso não é firula: quem vem de jogo usa WASD, quem
 * vem de CAD usa as setas, e escolher um dos dois deixaria metade das pessoas
 * apertando teclas que não fazem nada.
 *
 * `code` e não `key`: em teclado ABNT2 e AZERTY o `key` do W muda, e o layout
 * de quem desenha não deveria decidir se ele consegue andar.
 */
export function direcaoDaTecla(code: string): keyof TeclasDeAndar | null {
  if (code === 'KeyW' || code === 'ArrowUp') return 'frente';
  if (code === 'KeyS' || code === 'ArrowDown') return 'tras';
  if (code === 'KeyA' || code === 'ArrowLeft') return 'esquerda';
  if (code === 'KeyD' || code === 'ArrowRight') return 'direita';
  return null;
}

/**
 * O deslocamento do passo, no plano — nunca na vertical.
 *
 * `frente` é para onde a câmera OLHA, projetado no chão: olhar para cima e
 * andar não pode fazer a pessoa decolar, e olhar para o chão não pode enterrá-la.
 * É o que separa "andar" de "voar", e é a razão de a altura ser fixada fora
 * daqui.
 *
 * A diagonal é NORMALIZADA. Sem isso, frente+direita andaria 1,41× mais rápido
 * que frente — o bug clássico de movimentação, que se sente antes de se
 * entender.
 *
 * `dt` em segundos: o passo é por TEMPO, não por quadro. Num monitor de 144 Hz
 * o passo por quadro andaria mais que o dobro do de 60 Hz.
 */
export function passo(
  teclas: TeclasDeAndar,
  olharParaX: number,
  olharParaZ: number,
  dt: number,
): { dx: number; dz: number } {
  const frente = (teclas.frente ? 1 : 0) - (teclas.tras ? 1 : 0);
  const lado = (teclas.direita ? 1 : 0) - (teclas.esquerda ? 1 : 0);
  if (frente === 0 && lado === 0) return { dx: 0, dz: 0 };

  // A direção do olhar, achatada no plano e normalizada.
  const norma = Math.hypot(olharParaX, olharParaZ);
  if (norma < 1e-9) return { dx: 0, dz: 0 };
  const fx = olharParaX / norma;
  const fz = olharParaZ / norma;
  // A direita é a frente girada 90° no plano.
  const dx = fx * frente + fz * lado;
  const dz = fz * frente - fx * lado;

  const n = Math.hypot(dx, dz);
  const avanco = VELOCIDADE_M_S * dt;
  return { dx: (dx / n) * avanco, dz: (dz / n) * avanco };
}
