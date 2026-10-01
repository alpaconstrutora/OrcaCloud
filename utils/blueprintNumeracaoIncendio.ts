/**
 * A NUMERAÇÃO da rede de incêndio (30/09/2026, E1.4 do roadmap de incêndio):
 * H-1, H-2…, MG-1, SPK-12, VGA-1. DERIVADA, nunca gravada — o mesmo modelo de
 * `nomesDasColunas` (`blueprintEsquemaVertical.ts`): apagar o H-2 renumera o
 * desenho sem comando nenhum. Quem precisa de um número fixo (a prancha
 * aprovada chama o hidrante de "H-3") DECLARA o rótulo da peça, e o declarado
 * vence: ele reserva o número, e os derivados pulam por cima dele.
 *
 * A ordem é a de quem lê o projeto: pavimento de baixo para cima; dentro do
 * pavimento, de cima para baixo e da esquerda para a direita na planta (y do
 * modelo cresce para cima).
 */
import type { BlueprintModel, ObjectId, Terminal, TipoDePontoHidraulico } from './blueprintKernel';

/** O prefixo de cada tipo numerado. Tipos com o MESMO prefixo dividem a série (hidrante simples e duplo). */
export const PREFIXO_DA_NUMERACAO: Partial<Record<TipoDePontoHidraulico, string>> = {
  HIDRANTE_SIMPLES: 'H',
  HIDRANTE_DUPLO: 'H',
  MANGOTINHO: 'MG',
  HIDRANTE_RECALQUE: 'RR',
  SPRINKLER: 'SPK',
  VGA: 'VGA',
  CHAVE_FLUXO: 'CF',
  BOMBA_INCENDIO: 'BI',
  BOMBA_JOCKEY: 'BJ',
  PRESSOSTATO: 'PS',
  EXTINTOR: 'EXT',
  PLACA: 'PL',
};

export interface NumeroDaPeca {
  numero: string;
  origem: 'DECLARADO' | 'DERIVADO';
}

/** O número de cada peça de incêndio numerável, por id do terminal. */
export function numeracaoDeIncendio(model: BlueprintModel): Map<ObjectId, NumeroDaPeca> {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const numeraveis = (model.terminais ?? []).filter(
    (t): t is Terminal & { tipoHidraulico: TipoDePontoHidraulico } => t.disciplina === 'INCENDIO' && !!t.tipoHidraulico && !!PREFIXO_DA_NUMERACAO[t.tipoHidraulico],
  );
  const porPrefixo = new Map<string, typeof numeraveis>();
  for (const t of numeraveis) {
    const p = PREFIXO_DA_NUMERACAO[t.tipoHidraulico]!;
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
