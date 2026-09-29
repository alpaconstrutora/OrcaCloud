/**
 * O CAMINHO REAL DO ELETRODUTO — no kernel desde 29/09/2026 (E0.4 do roadmap
 * elétrico). Veio inteiro de `utils/blueprintRede.ts` (10/09/2026), porque o
 * clash de `conflitos.ts` precisava do MESMO "L" que o 3D, o corte e o
 * quantitativo já usavam — e medir a DIAGONAL entre as pontas acusava e deixava
 * de acusar colisão em lugares diferentes dos que o 3D mostrava.
 */
import type { Point } from './geom';
import type { DisciplinaDeRede } from './model';

/** Um pedaço RETO do caminho: horizontal (mesma cota) ou vertical (mesmo ponto). */
export interface SegmentoDoTrecho {
  a: Point;
  b: Point;
  cotaAMm: number;
  cotaBMm: number;
}

/**
 * O caminho que o eletroduto faz de verdade — seguindo a parede, o teto ou o
 * piso —, em um ou dois segmentos RETOS.
 *
 * ─── O PEDIDO (10/09/2026) ─────────────────────────────────────────────────
 *
 * *"na planta 3D o eletroduto deve ser representado seguindo a parede, teto ou
 * piso"*
 *
 * ─── ⚠️ O QUE ESTAVA ERRADO ─────────────────────────────────────────────────
 *
 * Um trecho de (a, 300) a (b, 2800) saía como uma DIAGONAL no espaço: um tubo
 * atravessando o cômodo em linha reta da tomada à luminária, no ar. Eletroduto
 * embutido não faz isso — ele sobe pela parede e corre pelo teto, ou corre pelo
 * piso e sobe pela parede. Sempre em "L": um trecho horizontal numa laje ou ao
 * longo da parede, e um vertical dentro da parede.
 *
 * ─── A REGRA: A HORIZONTAL FICA NA PONTA MAIS PERTO DE UMA LAJE ────────────
 *
 * Das duas pontas, a que está mais perto do piso (cota 0) ou do teto (cota =
 * pé-direito) é onde o eletroduto corre na horizontal — porque é ali que ele
 * está embutido na laje. A vertical acontece na OUTRA ponta, dentro da parede.
 *
 *   tomada (300) → luminária (2.800): sobe na tomada, corre no teto até a luz;
 *   quadro (1.600) → tomada (300): corre… na tomada? Não — 300 está mais perto
 *   do piso que 1.600 do teto, então corre a 300 e sobe até o quadro.
 *
 * ⚠️ A regra é DERIVADA, e pode não ser o caminho que o eletricista escolheu.
 * Ela é a melhor leitura do que o desenho sabe — duas cotas e dois pontos — e
 * é honesta sobre isso: o modelo não guarda o caminho, guarda as pontas. Quem
 * precisar do caminho exato desenha dois trechos.
 *
 * A prumada (a = b) e o trecho horizontal (cotas iguais) já são retos e voltam
 * inteiros.
 */
export function segmentosDoEletroduto(
  t: { a: Point; b: Point; cotaAMm: number; cotaBMm: number; disciplina: DisciplinaDeRede },
  peDireitoMm: number,
): SegmentoDoTrecho[] {
  const reto: SegmentoDoTrecho[] = [{ a: t.a, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm }];
  // ⚠️ SÓ O ELETRODUTO anda em "L". O esgoto com caimento é uma DIAGONAL de
  // verdade — o cano corre inclinado, é assim que ele escoa —, e a água
  // pressurizada pode correr como o projetista a desenhou. Aplicar o "L" a
  // todas as disciplinas foi o meu primeiro erro aqui, e os testes do caimento
  // de 2 % em 10 m o pegaram: o comprimento inclinado virava planta + desnível.
  if (t.disciplina !== 'ELETRICA') return reto;
  const prumada = t.a.x === t.b.x && t.a.y === t.b.y;
  const horizontal = t.cotaAMm === t.cotaBMm;
  if (prumada || horizontal) return reto;

  const distanciaALaje = (cota: number) => Math.min(Math.abs(cota), Math.abs(peDireitoMm - cota));
  const horizontalEmA = distanciaALaje(t.cotaAMm) <= distanciaALaje(t.cotaBMm);

  return horizontalEmA
    ? [
        // Corre na cota de A até o ponto B, e sobe/desce em B.
        { a: t.a, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaAMm },
        { a: t.b, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm },
      ]
    : [
        // Sobe/desce em A, e corre na cota de B até o ponto B.
        { a: t.a, b: t.a, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm },
        { a: t.a, b: t.b, cotaAMm: t.cotaBMm, cotaBMm: t.cotaBMm },
      ];
}

