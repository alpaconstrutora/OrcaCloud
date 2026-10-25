/**
 * Eletroduto e caixa EMBUTIDOS na parede, no 3D (25/10/2026).
 *
 * *"veja prints. Conduites descem embutidos na parede. as caixas de tomadas e interrrptores tambem"* — o ponto da
 * tomada mora na FACE da parede (é onde a barra do símbolo encosta, #157), e o 3D centrava a caixa e a descida ali:
 * metade de cada uma ficava no ambiente. A caixa passa a ter a frente rente à face e o corpo dentro da parede; o
 * eletroduto que desce na face anda junto, até o centro da caixa.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { EMBUTIDO_DO_ELETRODUTO_MM, RESSALTO_DA_CAIXA_MM, embutimentoEletrico } from '../utils/blueprintEletricaEmbutida';

/** O centro da caixa de 100 de fundo: meio fundo para dentro da face, menos o ressalto do espelho. */
const MEIO_FUNDO = 50 - RESSALTO_DA_CAIXA_MM;

/** Térreo com uma parede no eixo y = 0, de x = 0 a 4000, e a espessura pedida. */
function cena(espessuraMm: number): { m: BlueprintModel; levelId: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddWall', levelId, a: point(0, 0), b: point(4000, 0), thicknessMm: espessuraMm, heightMm: 2800 }).model;
  return { m, levelId };
}
const tomada = (m: BlueprintModel, levelId: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, y), cotaMm: 300, tipoEletrico: 'TUG', ...extra } as never).model;

describe('embutimentoEletrico · a caixa', () => {
  it('⚠️ tomada na face de uma parede de 200: a caixa (100 de fundo) tem a frente na face e o corpo na parede', () => {
    const { m, levelId } = cena(200);
    const mm = tomada(m, levelId, 2000, 100); // face do lado +y
    const t = mm.terminais![0];
    // Centro a meio fundo para dentro da face (y = 100), com a frente 3 mm à frente dela.
    expect(embutimentoEletrico(mm).caixa(t)).toEqual({ x: 2000, y: 100 - MEIO_FUNDO });
  });

  it('o lado da parede vem do ponto: na face −y, a caixa entra para +y', () => {
    const { m, levelId } = cena(200);
    const mm = tomada(m, levelId, 2000, -100);
    expect(embutimentoEletrico(mm).caixa(mm.terminais![0])).toEqual({ x: 2000, y: -100 + MEIO_FUNDO });
  });

  it('o interruptor arrastado 10 mm para fora da face (parede de 150) volta para dentro dela', () => {
    const { m, levelId } = cena(150);
    const mm = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Interruptor', at: point(1000, 85), cotaMm: 1100, tipoEletrico: 'INTERRUPTOR' } as never).model;
    // A face é y = 75; a caixa a meio fundo dela.
    expect(embutimentoEletrico(mm).caixa(mm.terminais![0])).toEqual({ x: 1000, y: 75 - MEIO_FUNDO });
  });

  it('caixa mais funda que a parede: fica no eixo (nunca atravessa para o outro lado)', () => {
    const { m, levelId } = cena(150);
    const mm = tomada(m, levelId, 1000, 75, { profundidadeMm: 300 });
    expect(embutimentoEletrico(mm).caixa(mm.terminais![0])).toEqual({ x: 1000, y: 0 });
  });

  it('não embute: luz de teto, ponto longe da parede, ponto no eixo e o que não é elétrico', () => {
    const { m, levelId } = cena(200);
    let mm = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', at: point(2000, 100), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO' } as never).model;
    mm = tomada(mm, levelId, 2000, 1500);
    mm = tomada(mm, levelId, 3000, 0);
    mm = applyCommand(mm, { type: 'AddTerminal', levelId, disciplina: 'AGUA_FRIA', tipo: 'Torneira', at: point(1000, 100), cotaMm: 600 } as never).model;
    const e = embutimentoEletrico(mm);
    expect(mm.terminais!.map((t) => e.caixa(t))).toEqual([null, null, null, null]);
  });
});

const eletroduto = (levelId: string, ax: number, ay: number, ca: number, bx: number, by: number, cb: number) =>
  ({ type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25 }) as const;

describe('embutimentoEletrico · o eletroduto', () => {
  it('⚠️ a descida na face vai para dentro da parede, até o centro da caixa da tomada', () => {
    const { m, levelId } = cena(200);
    const mm = applyBatch(tomada(m, levelId, 2000, 100), [eletroduto(levelId, 2000, 100, 2700, 2000, 100, 300)]).model;
    const [sg] = embutimentoEletrico(mm).segmentos(mm.trechos![0]);
    expect(sg.a).toEqual({ x: 2000, y: 100 - MEIO_FUNDO });
    expect(sg.b).toEqual({ x: 2000, y: 100 - MEIO_FUNDO });
  });

  it('o toco do forro que chega no alto da descida anda junto na ponta dela; a outra ponta (no cômodo) fica', () => {
    const { m, levelId } = cena(200);
    const mm = applyBatch(tomada(m, levelId, 2000, 100), [
      eletroduto(levelId, 2000, 600, 2700, 2000, 100, 2700),
      eletroduto(levelId, 2000, 100, 2700, 2000, 100, 300),
    ]).model;
    const [toco] = embutimentoEletrico(mm).segmentos(mm.trechos![0]);
    expect(toco.a).toEqual({ x: 2000, y: 600 });
    expect(toco.b).toEqual({ x: 2000, y: 100 - MEIO_FUNDO });
  });

  it('a descida na face sem caixa ali (o rasgo de passagem) entra o embutido padrão', () => {
    const { m, levelId } = cena(200);
    const mm = applyBatch(m, [eletroduto(levelId, 1000, 100, 2700, 1000, 100, 1200)]).model;
    expect(embutimentoEletrico(mm).segmentos(mm.trechos![0])[0].a).toEqual({ x: 1000, y: 100 - EMBUTIDO_DO_ELETRODUTO_MM });
  });

  it('o horizontal que só passa rente à face (no forro), sem descida ali, fica onde está', () => {
    const { m, levelId } = cena(200);
    const mm = applyBatch(m, [eletroduto(levelId, 500, 100, 2700, 3500, 100, 2700)]).model;
    const [sg] = embutimentoEletrico(mm).segmentos(mm.trechos![0]);
    expect([sg.a, sg.b]).toEqual([{ x: 500, y: 100 }, { x: 3500, y: 100 }]);
  });

  it('a parede de OUTRO pavimento não conta, e a água não entra', () => {
    const { m, levelId } = cena(200);
    const dois = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const cima = dois.levels.find((l) => l.id !== levelId)!.id;
    const mm = applyBatch(dois, [
      eletroduto(cima, 1000, 100, 2700, 1000, 100, 300),
      { type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: point(1500, 100), b: point(1500, 100), cotaAMm: 2700, cotaBMm: 600, bitolaMm: 25 },
    ]).model;
    const e = embutimentoEletrico(mm);
    expect(e.segmentos(mm.trechos![0])[0].a).toEqual({ x: 1000, y: 100 });
    expect(e.segmentos(mm.trechos![1])[0].a).toEqual({ x: 1500, y: 100 });
  });
});
