/**
 * O DETALHE DAS INSTALAÇÕES no 3D (27/09/2026): *"os tubos e conexoes devem ser
 * detalhados.veja print"* — bolsas das conexões, caixas de esgoto na cota certa
 * e rótulos ø.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { corDaConexao, corpoDaCaixa3D, escurecer, pecasDasConexoes3D, rotulosDaRede3D, simbolosDasConexoes2D, textoDoRotulo } from '../utils/blueprintIsometrico';

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

