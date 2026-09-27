/**
 * O DETALHE DAS INSTALAÇÕES no 3D (27/09/2026): *"os tubos e conexoes devem ser
 * detalhados.veja print"* — bolsas das conexões, caixas de esgoto na cota certa
 * e rótulos ø.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { anguloDeLeitura, centroDoTerminal3D, corDaConexao, embutidoEmParede, corpoDaCaixa3D, escurecer, faixaDoTubo2D, pecasDasConexoes3D, pegadaDaCaixa2D, rotuloDoTrecho2D, rotulosDaRede3D, simbolosDasConexoes2D, textoDoRotulo } from '../utils/blueprintIsometrico';

function terreo(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const esgoto = (levelId: string, ax: number, ay: number, bx: number, by: number, dn: number, ca: number, cb: number, rotulo?: string): Command => ({
  type: 'AddTrecho', levelId, disciplina: 'ESGOTO', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn, ...(rotulo ? { rotulo } : {}),
});
const perto = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe('pecasDasConexoes3D', () => {
  it('joelho 90 (prumada + horizontal): uma bolsa por boca, na direção do ramal, mais grossa que o tubo; corpo no nó', () => {
    const { m, t } = terreo();
    const mm = applyBatch(m, [esgoto(t, 0, 0, 2000, 0, 100, -150, -150), esgoto(t, 0, 0, 0, 0, 100, 0, -150)]).model;
    const [peca] = pecasDasConexoes3D(mm);
    expect(peca.tipo).toBe('JOELHO_90');
    expect(peca.bolsas).toHaveLength(2);
    // Horizontal rumo a +x: bolsa de 100 mm centrada a 50 mm do nó (0, −0,15, 0).
    const h = peca.bolsas.find((b) => b.eixo[0] === 1)!;
    expect(perto(h.centro, [0.05, -0.15, 0])).toBe(true);
    expect(h.comprimentoM).toBeCloseTo(0.1);
    expect(h.raioM).toBeCloseTo(0.065); // 50 × 1,3
    // A prumada sobe (eixo +Y no 3D).
    expect(peca.bolsas.some((b) => perto(b.eixo, [0, 1, 0]))).toBe(true);
    expect(peca.corpo).toEqual({ centro: [0, -0.15, 0], raioM: h.raioM });
    // Esgoto: cinza-claro sobre o tubo cinza-escuro; água: a cor da rede escurecida.
    expect(peca.cor).toBe('#a1a1aa');
    expect(corDaConexao('AGUA_FRIA')).toBe(escurecer('#2563eb'));
  });

  it('redução: sem corpo, e cada bolsa com o diâmetro do seu tubo', () => {
    const { m, t } = terreo();
    const mm = applyBatch(m, [esgoto(t, 0, 0, 2000, 0, 50, -150, -150), esgoto(t, 2000, 0, 4000, 0, 100, -150, -150)]).model;
    const [peca] = pecasDasConexoes3D(mm);
    expect(peca.tipo).toBe('REDUCAO');
    expect(peca.corpo).toBeNull();
    expect(peca.bolsas.map((b) => b.raioM).sort()).toEqual([0.0325, 0.065].map((r) => expect.closeTo(r, 9)));
  });

  it('a elevação do pavimento entra na altura; pavimento escondido não desenha', () => {
    const { m } = terreo();
    const dois = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const s = dois.levels[1].id;
    const mm = applyBatch(dois, [esgoto(s, 0, 0, 2000, 0, 50, 500, 500), esgoto(s, 2000, 0, 2000, 2000, 50, 500, 500)]).model;
    const [peca] = pecasDasConexoes3D(mm);
    expect(peca.corpo!.centro[1]).toBeCloseTo(3.3);
    expect(pecasDasConexoes3D(mm, new Set([dois.levels[0].id]))).toEqual([]);
  });
});

describe('corpoDaCaixa3D', () => {
  it('CI: o FUNDO na cota (−600), 600 de altura → centro em −0,30; tampa no topo (0)', () => {
    const { m, t } = terreo();
    const mm = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: point(1000, 2000), cotaMm: -600, tipoHidraulico: 'CAIXA_INSPECAO' }).model;
    const c = corpoDaCaixa3D(mm.terminais![0], 0)!;
    expect(c.forma).toBe('PRISMA');
    expect(perto(c.centro, [1, -0.3, 2])).toBe(true);
    expect(perto(c.tamanho, [0.6, 0.6, 0.6])).toBe(true);
    expect(c.tampa.centro[1]).toBeCloseTo(0.02);
  });

  it('CS: a GRELHA (o topo) na cota 0, corpo para baixo; cilindro', () => {
    const { m, t } = terreo();
    const mm = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CS', at: point(0, 0), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA' }).model;
    const c = corpoDaCaixa3D(mm.terminais![0], 0)!;
    expect(c.forma).toBe('CILINDRO');
    expect(c.centro[1]).toBeCloseTo(-0.1);
    expect(c.tamanho[0]).toBeCloseTo(0.15);
  });

  it('não é caixa → null (o viewer segue com a caixa genérica)', () => {
    const { m, t } = terreo();
    const mm = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Vaso', at: point(0, 0), cotaMm: 0, tipoHidraulico: 'VASO_SANITARIO' }).model;
    expect(corpoDaCaixa3D(mm.terminais![0], 0)).toBeNull();
  });
});

describe('rotulosDaRede3D', () => {
  it('"ø100 mm" no meio do trecho, acima do tubo; TQ e ventilação com o nome; trecho curto sem rótulo', () => {
    const { m, t } = terreo();
    const mm = applyBatch(m, [
      esgoto(t, 0, 0, 2000, 0, 100, -150, -170),
      esgoto(t, 3000, 0, 3000, 0, 100, 2800, 0, 'TQ'),
      esgoto(t, 5000, 0, 5200, 0, 40, -150, -150),
    ]).model;
    const r = rotulosDaRede3D(mm);
    expect(r.map((x) => x.texto)).toEqual(['ø100 mm', 'TQ ø100 mm']);
    expect(r[0].posicao[0]).toBeCloseTo(1);
    expect(r[0].posicao[1]).toBeCloseTo(-0.16 + 0.05 + 0.06);
    expect(textoDoRotulo({ bitolaMm: 50, rotulo: 'Ventilação' })).toBe('Ventilação ø50 mm');
  });
});

describe('simbolosDasConexoes2D', () => {
  it('joelho prumada + horizontal: bolsa em planta na direção do ramal, anel da prumada, disco no nó', () => {
    const { m, t } = terreo();
    const mm = applyBatch(m, [esgoto(t, 0, 0, 2000, 0, 100, -150, -150), esgoto(t, 0, 0, 0, 0, 100, 0, -150)]).model;
    const [sc] = simbolosDasConexoes2D(mm, t);
    expect(sc.bolsas).toEqual([{ de: { x: 0, y: 0 }, para: { x: 100, y: 0 }, larguraMm: 130 }]);
    expect(sc.aneis).toEqual([65]);
    expect(sc.raioDoCorpoMm).toBe(65);
  });

  it('o ramal sob o piso do SUPERIOR aparece na planta do superior (e não na do térreo, onde fica a chave do nó)', () => {
    const { m, t } = terreo();
    const dois = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const s = dois.levels[1].id;
    const mm = applyBatch(dois, [esgoto(s, 0, 0, 2000, 0, 50, -150, -170), esgoto(s, 2000, 0, 2000, 2000, 50, -170, -190)]).model;
    expect(simbolosDasConexoes2D(mm, s)).toHaveLength(1);
    expect(simbolosDasConexoes2D(mm, t)).toHaveLength(0);
  });
});

describe('planta 2D detalhada ("detalhado também no 2d")', () => {
  it('faixa do tubo: duas bordas paralelas a meia largura do eixo; prumada → null', () => {
    expect(faixaDoTubo2D({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({
      bordaA: [{ x: 0, y: 2 }, { x: 10, y: 2 }],
      bordaB: [{ x: 0, y: -2 }, { x: 10, y: -2 }],
    });
    expect(faixaDoTubo2D({ x: 3, y: 3 }, { x: 3, y: 3 }, 4)).toBeNull();
  });

  it('o texto nunca fica de cabeça para baixo: o tubo para a esquerda lê como o tubo para a direita', () => {
    expect(anguloDeLeitura({ x: 10, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(0);
    expect(anguloDeLeitura({ x: 0, y: 0 }, { x: -10, y: -10 })).toBeCloseTo(Math.PI / 4);
    expect(anguloDeLeitura({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
  });

  it('rótulo: "ø100 mm · i 1 %" no esgoto com caimento; água sem o i; TQ com o nome', () => {
    const base = { a: point(0, 0), b: point(2000, 0) };
    expect(rotuloDoTrecho2D({ ...base, bitolaMm: 100, rotulo: null, disciplina: 'ESGOTO', cotaAMm: -150, cotaBMm: -170 })).toBe('ø100 mm · i 1 %');
    expect(rotuloDoTrecho2D({ ...base, bitolaMm: 25, rotulo: null, disciplina: 'AGUA_FRIA', cotaAMm: 2200, cotaBMm: 2200 })).toBe('ø25 mm');
    expect(rotuloDoTrecho2D({ a: point(0, 0), b: point(0, 0), bitolaMm: 100, rotulo: 'TQ', disciplina: 'ESGOTO', cotaAMm: 2800, cotaBMm: 0 })).toBe('TQ ø100 mm');
  });

  it('pegada da caixa: CI 600 × 600 (ficha, sem medida declarada); CS redonda de 150; vaso não é caixa', () => {
    const { m, t } = terreo();
    const mm = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: point(0, 0), cotaMm: -600, tipoHidraulico: 'CAIXA_INSPECAO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CS', at: point(900, 0), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'VS', at: point(1800, 0), cotaMm: 0, tipoHidraulico: 'VASO_SANITARIO' },
    ]).model;
    const [ci, cs, vs] = mm.terminais!;
    expect(pegadaDaCaixa2D(ci)).toEqual({ forma: 'PRISMA', larguraMm: 600, profundidadeMm: 600 });
    expect(pegadaDaCaixa2D(cs)).toEqual({ forma: 'CILINDRO', larguraMm: 150, profundidadeMm: 150 });
    expect(pegadaDaCaixa2D(vs)).toBeNull();
  });
});

describe('centroDoTerminal3D', () => {
  it("caixa d'água APOIA na cota (fundo 2800, 800 de altura → centro a 3,20 m); o resto segue com a cota no centro", () => {
    expect(centroDoTerminal3D({ at: point(1000, 2000), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' }, 0, 800)).toEqual([1, 3.2, 2]);
    expect(centroDoTerminal3D({ at: point(0, 0), cotaMm: 1600, tipoHidraulico: 'AQUECEDOR' }, 2800, 600)[1]).toBeCloseTo(4.4);
  });
});

describe('rótulo do tubo embutido', () => {
  it('o tubo dentro da parede opaca não leva rótulo; sem parede opaca, leva', () => {
    const { m, t } = terreo();
    const mm = applyBatch(m, [
      { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(500, 0), b: point(3500, 0), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(500, 1000), b: point(3500, 1000), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    ]).model;
    const [dentro, fora] = mm.trechos!;
    expect(embutidoEmParede(dentro, mm.walls)).toBe(true);
    expect(embutidoEmParede(fora, mm.walls)).toBe(false);
    expect(rotulosDaRede3D(mm, undefined, mm.walls).map((r) => r.chave)).toEqual([fora.id]);
    expect(rotulosDaRede3D(mm).map((r) => r.chave)).toEqual([dentro.id, fora.id]);
  });
});

