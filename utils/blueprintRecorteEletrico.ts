/**
 * O RECORTE ELÉTRICO — planta de ILUMINAÇÃO × planta de TOMADAS E FORÇA
 * (E5.1 do roadmap elétrico, 29/09/2026).
 *
 * O projeto executivo separa a elétrica em duas plantas: a de luz (luminárias,
 * interruptores, comandos e os eletrodutos que só os servem) e a de tomadas e
 * força (TUG, TUE, ligação direta, equipamentos, dados, entrada). O que serve
 * aos dois — o quadro, a caixa de passagem, o eletroduto por onde passam
 * circuitos dos dois tipos — é COMUM e aparece nas duas.
 *
 * Tudo DERIVADO do tipo do ponto e dos pontos de cada circuito: nada novo é
 * gravado. Um circuito é de iluminação quando todos os pontos dele são de
 * iluminação (luminária ou interruptor); tem ponto de força, é de força; sem
 * ponto, é comum (não se sabe).
 */
import type { BlueprintModel, ObjectId, TipoDePontoEletrico, Trecho } from './blueprintKernel';

export type CategoriaEletrica = 'COMUM' | 'ILUMINACAO' | 'FORCA';
export type RecorteEletrico = 'ILUMINACAO' | 'FORCA';

export const ROTULO_DO_RECORTE: Record<RecorteEletrico, string> = {
  ILUMINACAO: 'Iluminação',
  FORCA: 'Tomadas e força',
};

const DE_ILUMINACAO: ReadonlySet<string> = new Set(['ILUMINACAO_TETO', 'ILUMINACAO_PAREDE', 'ILUMINACAO_PISO', 'INTERRUPTOR']);
const COMUNS: ReadonlySet<string> = new Set(['CAIXA_PASSAGEM']);

/** A categoria de um ponto pelo tipo. Sem tipo e caixa de passagem = comum. */
export function categoriaDoPonto(tipoEletrico: TipoDePontoEletrico | null | undefined): CategoriaEletrica {
  if (!tipoEletrico || COMUNS.has(tipoEletrico)) return 'COMUM';
  return DE_ILUMINACAO.has(tipoEletrico) ? 'ILUMINACAO' : 'FORCA';
}

/** A categoria de cada circuito, pelos pontos dele. */
export function categoriasDosCircuitos(model: BlueprintModel): Map<ObjectId, CategoriaEletrica> {
  const cats = new Map<ObjectId, Set<CategoriaEletrica>>();
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA' || !t.circuitoId) continue;
    const c = categoriaDoPonto(t.tipoEletrico);
    if (c === 'COMUM') continue;
    cats.set(t.circuitoId, (cats.get(t.circuitoId) ?? new Set()).add(c));
  }
  const saida = new Map<ObjectId, CategoriaEletrica>();
  for (const c of model.circuitos ?? []) {
    const s = cats.get(c.id);
    saida.set(c.id, !s || s.size === 0 ? 'COMUM' : s.has('FORCA') ? 'FORCA' : 'ILUMINACAO');
  }
  return saida;
}

/**
 * A categoria de um eletroduto pelos circuitos que passam nele: só de
 * iluminação → ILUMINACAO; só de força → FORCA; dos dois, ou sem circuito
 * conhecido → COMUM (aparece nas duas plantas).
 */
export function categoriaDoTrecho(t: Pick<Trecho, 'circuitoIds'>, porCircuito: ReadonlyMap<ObjectId, CategoriaEletrica>): CategoriaEletrica {
  const s = new Set((t.circuitoIds ?? []).map((id) => porCircuito.get(id) ?? 'COMUM').filter((c) => c !== 'COMUM'));
  if (s.size !== 1) return 'COMUM';
  return [...s][0];
}

/** O elemento entra na planta do recorte? COMUM entra nas duas; sem recorte, tudo entra. */
export function entraNoRecorte(categoria: CategoriaEletrica, recorte: RecorteEletrico | null | undefined): boolean {
  return !recorte || categoria === 'COMUM' || categoria === recorte;
}

/**
 * Os ids que a VISTA do editor esconde quando uma das duas camadas está
 * desligada (pontos e eletrodutos da categoria desligada). Quadros, caixas e
 * eletrodutos comuns nunca somem por aqui.
 */
export function idsForaDaVistaEletrica(model: BlueprintModel, mostrar: { iluminacao: boolean; forca: boolean }): Set<string> {
  const ocultos = new Set<string>();
  if (mostrar.iluminacao && mostrar.forca) return ocultos;
  const esconde = (c: CategoriaEletrica) => (c === 'ILUMINACAO' && !mostrar.iluminacao) || (c === 'FORCA' && !mostrar.forca);
  for (const t of model.terminais ?? []) if (t.disciplina === 'ELETRICA' && esconde(categoriaDoPonto(t.tipoEletrico))) ocultos.add(t.id);
  const porCircuito = categoriasDosCircuitos(model);
  for (const t of model.trechos ?? []) if (t.disciplina === 'ELETRICA' && esconde(categoriaDoTrecho(t, porCircuito))) ocultos.add(t.id);
  return ocultos;
}
