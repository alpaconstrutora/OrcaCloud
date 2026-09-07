/**
 * Encostar no eixo a ponta que o arquivo desenhou até a face.
 *
 * ─── O QUE ESTÁ EM JOGO ─────────────────────────────────────────────────────
 *
 * Sem isto, a importação entrega desenho e não entrega número: o anel não
 * fecha, não há ambiente, e sem ambiente não há área, piso, forro nem
 * quantitativo.
 *
 * Com isto, o risco vira o oposto — mover ponta que ninguém pediu para mover.
 * Por isso a permissão é estreita (a ponta tem de estar DENTRO do corpo da
 * outra parede) e metade dos casos abaixo é sobre o que NÃO se move.
 */
import { describe, expect, it } from 'vitest';
import { encostarNasFaces } from '../utils/ifcEncostarParedes';

const p = (ax: number, ay: number, bx: number, by: number, espessuraMm = 300) => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  espessuraMm,
});

describe('encostar no eixo · o que se move', () => {
  it('a ponta que parou na FACE vai até o EIXO', () => {
    // Fachada horizontal de 300 mm no y=0; divisória vertical que sobe e para
    // em y=150, que é a face de baixo da fachada. Medido no FZK-Haus: 120 e
    // 150 mm, exatamente metade das espessuras 240 e 300.
    const r = encostarNasFaces([p(-2000, 0, 2000, 0, 300), p(0, 150, 0, 3000, 150)]);
    expect(r.encostadas).toBe(1);
    expect(r.paredes[1].a).toEqual({ x: 0, y: 0 });
    // E a outra ponta da divisória não se mexeu.
    expect(r.paredes[1].b).toEqual({ x: 0, y: 3000 });
  });

  it('a ponta anda só na DIREÇÃO DA PRÓPRIA PAREDE, mesmo em junção oblíqua', () => {
    // Numa junção a 45°, alcançar o eixo exige andar mais que meia espessura —
    // 150/sen(45°) ≈ 212. Andar só 150 deixaria a ponta no meio do concreto, e
    // andar de lado giraria o trecho.
    // A divisória desce a 45° e para em y=150, a face de baixo da fachada.
    // Para alcançar o eixo (y=0) ela anda 150·√2 ≈ 212 na sua própria direção,
    // e o x cai de −62 para −212.
    const r = encostarNasFaces([p(-2000, 0, 2000, 0, 300), p(1000, 1212, -62, 150, 150)]);
    expect(r.encostadas).toBe(1);
    expect(r.paredes[1].b).toEqual({ x: -212, y: 0 });
  });

  it('encosta as DUAS pontas quando as duas param em face', () => {
    const r = encostarNasFaces([
      p(-2000, 0, 2000, 0, 300),
      p(-2000, 3000, 2000, 3000, 300),
      p(0, 150, 0, 2850, 150),
    ]);
    expect(r.encostadas).toBe(2);
    expect(r.paredes[2].a).toEqual({ x: 0, y: 0 });
    expect(r.paredes[2].b).toEqual({ x: 0, y: 3000 });
  });
});

describe('encostar no eixo · o que NÃO se move', () => {
  it('a ponta LONGE fica onde está, e é relatada', () => {
    // O caso de 1.624 mm do FZK-Haus: parede de fato solta. Emendá-la seria
    // desenhar por cima do projeto de outra pessoa.
    const r = encostarNasFaces([p(-2000, 0, 2000, 0, 300), p(0, 1624, 0, 3000, 150)]);
    expect(r.encostadas).toBe(0);
    expect(r.paredes[1].a).toEqual({ x: 0, y: 1624 });
  });

  it('meia espessura MAIS UM MILÍMETRO já é longe demais', () => {
    // O limite é a face, e a folga de 1 mm existe só para o arredondamento da
    // conversão. Frouxo aqui move ponta que ninguém desenhou naquele lugar.
    expect(encostarNasFaces([p(-2000, 0, 2000, 0, 300), p(0, 151, 0, 3000)]).encostadas).toBe(1);
    expect(encostarNasFaces([p(-2000, 0, 2000, 0, 300), p(0, 152, 0, 3000)]).encostadas).toBe(0);
  });

  it('ponta que JÁ CRUZA a outra parede fica intacta', () => {
    // `splitAtIntersections` do arranjo já cria o nó; mexer só afastaria.
    const r = encostarNasFaces([p(-2000, 0, 2000, 0, 300), p(0, 0, 0, 3000, 150)]);
    expect(r.encostadas).toBe(0);
    expect(r.paredes[1].a).toEqual({ x: 0, y: 0 });
  });

  it('ponta que já coincide com a ponta de outra parede fica intacta', () => {
    const r = encostarNasFaces([p(0, 0, 4000, 0), p(4000, 0, 4000, 3000)]);
    expect(r.encostadas).toBe(0);
    expect(r.paredes[1].a).toEqual({ x: 4000, y: 0 });
  });

  it('parede PARALELA e próxima não puxa nada', () => {
    // Duas paredes de face colada nunca se cruzam. Sem a guarda de paralelismo,
    // a conta do encontro dividiria por zero ou mandaria a ponta para o
    // infinito.
    const r = encostarNasFaces([p(0, 0, 4000, 0, 300), p(0, 150, 4000, 150, 150)]);
    expect(r.encostadas).toBe(0);
    expect(r.paredes[1].a).toEqual({ x: 0, y: 150 });
  });

  it('encontro FORA do trecho do alvo não conta', () => {
    // A ponta está perto do prolongamento da outra parede, não dela. Emendar
    // ali inventaria uma junção que o desenho não tem.
    const r = encostarNasFaces([p(0, 0, 1000, 0, 300), p(3000, 150, 3000, 3000, 150)]);
    expect(r.encostadas).toBe(0);
  });

  it('`soltas` conta TODA ponta que não toca em nada — inclusive as do alvo', () => {
    // Não é "quantas falharam em encostar": é quantas pontas do desenho ficaram
    // sem tocar em parede nenhuma. Num prédio inteiro isso é o número útil (no
    // FZK-Haus, 1); em duas paredes soltas, são as quatro pontas.
    const r = encostarNasFaces([p(0, 0, 1000, 0, 300), p(3000, 150, 3000, 3000, 150)]);
    expect(r.soltas).toBe(4);
  });

  it('lista com uma parede só não muda nada', () => {
    const r = encostarNasFaces([p(0, 0, 4000, 0)]);
    expect(r.encostadas).toBe(0);
    expect(r.paredes[0]).toEqual(p(0, 0, 4000, 0));
  });
});
