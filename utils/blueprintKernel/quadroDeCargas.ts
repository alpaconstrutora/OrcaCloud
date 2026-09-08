import type { BlueprintModel, ObjectId } from './model';

/**
 * O QUADRO DE CARGAS — o que cada circuito alimenta, somado.
 *
 * ─── ⚠️ SOMAR É REGISTRO; DECIDIR É PROJETO ─────────────────────────────────
 *
 * Tudo aqui é soma e contagem do que alguém DECLAROU. Nada é dimensionado: o
 * disjuntor que sai é o que o projetista escolheu, não o que a norma exigiria; a
 * seção é a que ele especificou, não a que a corrente e a distância pediriam.
 *
 * A fronteira é fina e precisa estar escrita, porque cruzá-la sem querer é
 * fácil e caro: um número "sugerido" numa tela vira decisão de projeto na
 * cabeça de quem lê, e projeto elétrico tem norma, responsabilidade técnica e
 * ART atrás. O dia em que este arquivo calcular queda de tensão, ele deixou de
 * ser modelagem.
 *
 * ─── E É DERIVADO, NUNCA GRAVADO ────────────────────────────────────────────
 *
 * Gravar o total o deixaria obsoleto no instante em que alguém mudasse a
 * potência de um ponto — e um total obsoleto não some da tela: vira um número
 * plausível, que é a pior espécie de erro. É o mesmo argumento do volume
 * descontado em `sobreposicao.ts` e da lista de conflitos.
 */
export interface CargaDoCircuito {
  circuitoId: ObjectId;
  uid: string;
  quadroId: ObjectId;
  nome: string;
  tipo: string | null;
  tensaoV: number | null;
  /** O disjuntor DECLARADO. `null` = ninguém informou. */
  disjuntorA: number | null;
  secaoMm2: number | null;
  /** Quantos pontos este circuito alimenta. */
  pontos: number;
  /**
   * A soma das potências DECLARADAS, em watts.
   *
   * ⚠️ Ponto sem potência informada entra como ZERO na soma e é contado em
   * `pontosSemPotencia`. Os dois números juntos é que são honestos: "480 W em 6
   * pontos" esconde que 4 deles não têm potência nenhuma, e a soma pareceria
   * completa.
   */
  potenciaW: number;
  pontosSemPotencia: number;
}

export interface CargaDoQuadro {
  quadroId: ObjectId;
  uid: string;
  nome: string;
  circuitos: CargaDoCircuito[];
  potenciaW: number;
  pontos: number;
  pontosSemPotencia: number;
}

export interface QuadroDeCargas {
  quadros: CargaDoQuadro[];
  /**
   * Pontos elétricos que não estão em circuito nenhum.
   *
   * ⚠️ Eles aparecem à parte, e não somem: um ponto fora de circuito é uma
   * pendência de projeto — alguém desenhou a tomada e não disse quem a
   * alimenta. Omiti-los faria o quadro de cargas parecer completo quando não é.
   */
  pontosSemCircuito: number;
}

export function quadroDeCargas(model: BlueprintModel): QuadroDeCargas {
  const terminais = (model.terminais ?? []).filter((t) => t.disciplina === 'ELETRICA');

  const porCircuito = new Map<ObjectId, { pontos: number; potenciaW: number; semPotencia: number }>();
  let pontosSemCircuito = 0;
  for (const t of terminais) {
    if (!t.circuitoId) {
      pontosSemCircuito++;
      continue;
    }
    const atual = porCircuito.get(t.circuitoId) ?? { pontos: 0, potenciaW: 0, semPotencia: 0 };
    atual.pontos += 1;
    atual.potenciaW += t.potenciaW ?? 0;
    if (t.potenciaW == null) atual.semPotencia += 1;
    porCircuito.set(t.circuitoId, atual);
  }

  const quadros: CargaDoQuadro[] = (model.quadros ?? [])
    .map((q) => {
      const circuitos: CargaDoCircuito[] = (model.circuitos ?? [])
        .filter((c) => c.quadroId === q.id)
        .map((c) => {
          const soma = porCircuito.get(c.id) ?? { pontos: 0, potenciaW: 0, semPotencia: 0 };
          return {
            circuitoId: c.id,
            uid: c.uid,
            quadroId: c.quadroId,
            nome: c.nome,
            tipo: c.tipo ?? null,
            tensaoV: c.tensaoV ?? null,
            disjuntorA: c.disjuntorA ?? null,
            secaoMm2: c.secaoMm2 ?? null,
            pontos: soma.pontos,
            potenciaW: soma.potenciaW,
            pontosSemPotencia: soma.semPotencia,
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome));

      return {
        quadroId: q.id,
        uid: q.uid,
        nome: q.nome,
        circuitos,
        potenciaW: circuitos.reduce((s, c) => s + c.potenciaW, 0),
        pontos: circuitos.reduce((s, c) => s + c.pontos, 0),
        pontosSemPotencia: circuitos.reduce((s, c) => s + c.pontosSemPotencia, 0),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { quadros, pontosSemCircuito };
}
