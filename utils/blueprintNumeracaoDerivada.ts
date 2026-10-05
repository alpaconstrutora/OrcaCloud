/**
 * A NUMERAÇÃO DERIVADA de peças da rede (04/10/2026, E3.4 do roadmap de
 * climatização) — o algoritmo que nasceu no incêndio (`blueprintNumeracaoIncendio.ts`,
 * E1.4), extraído para a climatização numerar do mesmo jeito (EV-1, CD-2, DF-7)
 * sem copiar o laço. O incêndio continua chamando por aqui.
 *
 * DERIVADA, nunca gravada: apagar a peça 2 renumera o desenho sem comando. Quem
 * precisa de um número fixo DECLARA o rótulo da peça, e o declarado vence: ele
 * reserva o número, e os derivados pulam por cima dele.
 *
 * A ordem é a de quem lê o projeto: pavimento de baixo para cima; dentro do
 * pavimento, de cima para baixo e da esquerda para a direita na planta (y do
 * modelo cresce para cima).
 */
import type { BlueprintModel, ObjectId, Terminal } from './blueprintKernel';

export interface NumeroDaPeca {
  numero: string;
  origem: 'DECLARADO' | 'DERIVADO';
}

/**
 * O número de cada peça que `prefixoDe` reconhece (devolve `null` para as que
 * não entram). Tipos com o MESMO prefixo dividem a série.
 */
export function numeracaoDerivada(model: BlueprintModel, prefixoDe: (t: Terminal) => string | null | undefined): Map<ObjectId, NumeroDaPeca> {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const porPrefixo = new Map<string, Terminal[]>();
  for (const t of model.terminais ?? []) {
    const p = prefixoDe(t);
    if (!p) continue;
    porPrefixo.set(p, [...(porPrefixo.get(p) ?? []), t]);
  }
  const resultado = new Map<ObjectId, NumeroDaPeca>();
  for (const [prefixo, pecas] of porPrefixo) {
    const doPrefixo = new RegExp(`^${prefixo}-(\\d+)$`, 'i');
    const reservados = new Set<number>();
    for (const t of pecas) {
      const r = t.rotulo?.trim();
      if (!r) continue;
      resultado.set(t.id, { numero: r, origem: 'DECLARADO' });
      const m = doPrefixo.exec(r);
      if (m) reservados.add(Number(m[1]));
    }
    const ordenadas = pecas
      .filter((t) => !t.rotulo?.trim())
      .sort(
        (a, b) =>
          (elevacao.get(a.levelId) ?? 0) - (elevacao.get(b.levelId) ?? 0) ||
          b.at.y - a.at.y ||
          a.at.x - b.at.x ||
          a.id.localeCompare(b.id),
      );
    let n = 1;
    for (const t of ordenadas) {
      while (reservados.has(n)) n++;
      resultado.set(t.id, { numero: `${prefixo}-${n}`, origem: 'DERIVADO' });
      n++;
    }
  }
  return resultado;
}
