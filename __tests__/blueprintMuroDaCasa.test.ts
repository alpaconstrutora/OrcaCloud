/**
 * F26 da casa automática — o muro, os portões e as calçadas (`planejarMuroDaCasa`), no lote 12 × 30 com a frente ao sul
 * (y = 0), o quadro da frente igual ao do desenho.
 *
 * ⚠️ Todo valor esperado está CALCULADO À MÃO no comentário.
 */
import { describe, expect, it } from 'vitest';
import { point, type Boundary, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_DO_MURO_DA_CASA_PADRAO, planejarMuroDaCasa, type EntradaDoMuroDaCasa } from '../utils/blueprintMuroDaCasa';

const anel = [point(0, 0), point(12000, 0), point(12000, 30000), point(0, 30000)];
const papeis: Boundary['papel'][] = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'];
const limites = anel.map((a, i) => ({ id: `b${i}`, uid: `u${i}`, levelId: 'L', a, b: anel[(i + 1) % 4], kind: 'TERRENO', papel: papeis[i] })) as unknown as Boundary[];
const base = (mudanca: Partial<EntradaDoMuroDaCasa> = {}): EntradaDoMuroDaCasa => ({
  levelId: 'L',
  anelDoLote: anel,
  limites,
  quadro: { ex: point(1, 0), ey: point(0, 1) },
  portaX: 8000,
  faceDaFachadaY: 2900,
  inicioDaEscadaY: null,
  // A casa 9 × 16,85 m (eixos de 1500 a 10500, de 3000 a 19850), parede de 20 cm.
  casaNoMundo: [point(1500, 3000), point(10500, 3000), point(10500, 19850), point(1500, 19850)],
  meiaParedeMm: 100,
  obstaculos: [],
  garagem: { x0: 1500, x1: 4200, yFim: 2900 },
  vagasDescobertas: null,
  cotaDoTerreno: null,
  ...mudanca,
});
const muros = (c: Command[]) => c.filter((x): x is Extract<Command, { type: 'AddMuro' }> => x.type === 'AddMuro');
const regioes = (c: Command[]) => c.filter((x): x is Extract<Command, { type: 'AddSubRegiao' }> => x.type === 'AddSubRegiao');

describe('planejarMuroDaCasa — o muro na divisa', () => {
  it('a frente em mureta com grade; laterais e fundos em alvenaria, um percurso só; o eixo a 7,5 cm da divisa', () => {
    const p = planejarMuroDaCasa(base(), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    const [frente, divisas] = muros(p.comandos);
    expect(frente).toMatchObject({ tipo: 'MURETA_COM_GRADE', alturaMm: 1800, alturaDaMuretaMm: 600, espessuraMm: 150, rotulo: 'Muro da frente' });
    // O anel 7,5 cm para dentro: a frente de (75, 75) a (11925, 75) = 11,85 m.
    expect(frente.pontos).toEqual([{ x: 75, y: 75 }, { x: 11925, y: 75 }]);
    expect(divisas).toMatchObject({ tipo: 'ALVENARIA', alturaMm: 1800, rotulo: 'Muro de divisa' });
    expect(divisas.pontos).toEqual([{ x: 11925, y: 75 }, { x: 11925, y: 29925 }, { x: 75, y: 29925 }, { x: 75, y: 75 }]);
    // 29,85 + 11,85 + 29,85 = 71,55 m de divisas.
    expect(p.resumo).toMatchObject({ frenteM: 11.85, divisasM: 71.55 });
  });

  it('os portões: o de garagem diante da garagem, o de pedestre diante da porta', () => {
    const p = planejarMuroDaCasa(base(), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    // Garagem 1500–4200: o meio 2850 → 2775 do início (x 75); largura min(3000, 2700) = 2700 → de 1425 a 4125.
    // Porta em 8000 → 7925; 1000 de largura → de 7425 a 8425.
    expect(muros(p.comandos)[0].portoes).toEqual([
      { tipo: 'GARAGEM', offsetMm: 1425, larguraMm: 2700 },
      { tipo: 'PEDESTRE', offsetMm: 7425, larguraMm: 1000 },
    ]);
    expect(p.resumo).toMatchObject({ portoesDePedestre: 1, portoesDeGaragem: 1 });
  });

  it('a porta encostada na garagem: o portão de pedestre vai para o lado que tem lugar', () => {
    // Porta em 4800 → 4725 − 500 = 4225, a menos de 30 cm do fim do de garagem (4125). Antes não cabe (1425 − 300 − 1000
    // = 125 < 300); depois: 4125 + 300 = 4425.
    const p = planejarMuroDaCasa(base({ portaX: 4800 }), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    expect(muros(p.comandos)[0].portoes.find((g) => g.tipo === 'PEDESTRE')).toEqual({ tipo: 'PEDESTRE', offsetMm: 4425, larguraMm: 1000 });
    expect(p.pendencias.some((x) => /portão de pedestre foi para o lado do de garagem/.test(x.texto))).toBe(true);
  });

  it('sem porta na frente: só o de garagem, e a pendência diz', () => {
    const p = planejarMuroDaCasa(base({ portaX: null }), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    expect(muros(p.comandos)[0].portoes.map((g) => g.tipo)).toEqual(['GARAGEM']);
    expect(p.pendencias.some((x) => x.grupo === 'NAO_DECIDIDO' && /porta de entrada não está na fachada da frente/.test(x.texto))).toBe(true);
  });
});

describe('planejarMuroDaCasa — a base no terreno', () => {
  it('um vértice a cada 3 m no máximo, a cota do terreno em cada um', () => {
    // Terreno subindo 10 % para os fundos: cota = y / 10. A lateral direita (29,85 m) vira 10 trechos de 2,985 m.
    const p = planejarMuroDaCasa(base({ cotaDoTerreno: (q) => q.y / 10 }), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    const [frente, divisas] = muros(p.comandos);
    // A frente: 11,85 m em 4 trechos; a base toda em 7,5 mm (y = 75).
    expect(frente.pontos).toHaveLength(5);
    expect(frente.cotasDaBaseMm).toEqual([8, 8, 8, 8, 8]);
    expect(divisas.pontos[10]).toEqual({ x: 11925, y: 29925 });
    expect(divisas.cotasDaBaseMm![0]).toBe(8);
    expect(divisas.cotasDaBaseMm![10]).toBe(2993);
    expect(divisas.cotasDaBaseMm).toHaveLength(divisas.pontos.length);
  });

  it('a topografia que não cobre o lote: sem a cota (o pé no piso) e a premissa dita', () => {
    const p = planejarMuroDaCasa(base({ cotaDoTerreno: (q) => (q.y > 20000 ? null : 0) }), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    expect(muros(p.comandos)[1].cotasDaBaseMm).toBeUndefined();
    expect(p.pendencias.some((x) => x.grupo === 'PREMISSA' && /topografia não cobre o lote inteiro/.test(x.texto))).toBe(true);
  });
});

describe('planejarMuroDaCasa — as calçadas', () => {
  it('o acesso da garagem (intertravado) e a calçada da entrada (concreto), do muro à fachada', () => {
    const p = planejarMuroDaCasa(base(), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    const [garagem, entrada] = regioes(p.comandos);
    // Garagem 1500–4200 × do muro (150) à fachada (2900): 2,7 × 2,75 = 7,425 m².
    expect(garagem).toMatchObject({ material: 'INTERTRAVADO', nome: 'Acesso da garagem', pontos: [{ x: 1500, y: 150 }, { x: 4200, y: 150 }, { x: 4200, y: 2900 }, { x: 1500, y: 2900 }] });
    // A calçada: o meio do portão de pedestre (7425 + 500 = 7925 do início → x 8000), 1,2 m: 7400–8600 × 150–2900 = 3,3 m².
    expect(entrada).toMatchObject({ material: 'CONCRETO', nome: 'Calçada da entrada', pontos: [{ x: 7400, y: 150 }, { x: 8600, y: 150 }, { x: 8600, y: 2900 }, { x: 7400, y: 2900 }] });
    // 7,425 + 3,3 = 10,725 m², os dois impermeáveis.
    // (arredondado a centésimo, 10,72 ou 10,73 conforme o ponto flutuante)
    expect(Math.abs(p.resumo.calcadasM2 - 10.725)).toBeLessThanOrEqual(0.0051);
    expect(p.resumo.impermeavelM2).toBe(p.resumo.calcadasM2);
  });

  it('com a escada de acesso, a calçada para no pé dela', () => {
    const p = planejarMuroDaCasa(base({ inicioDaEscadaY: 660 }), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    expect(regioes(p.comandos).find((r) => r.nome === 'Calçada da entrada')!.pontos[2]).toEqual({ x: 8600, y: 660 });
  });

  it('vagas descobertas: o piso delas no lugar do acesso; o portão de garagem diante delas', () => {
    const p = planejarMuroDaCasa(base({ garagem: null, vagasDescobertas: { x0: 1500, x1: 6500, y0: 0, y1: 5000 } }), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    expect(regioes(p.comandos)[0]).toMatchObject({ nome: 'Vagas descobertas', pontos: [{ x: 1500, y: 150 }, { x: 6500, y: 150 }, { x: 6500, y: 5000 }, { x: 1500, y: 5000 }] });
    // O meio das vagas (4000 → 3925 do início), 3 m: 2425–5425.
    expect(muros(p.comandos)[0].portoes[0]).toEqual({ tipo: 'GARAGEM', offsetMm: 2425, larguraMm: 3000 });
  });

  it('calçadas desligadas: só o muro', () => {
    const p = planejarMuroDaCasa(base(), { ...HIPOTESES_DO_MURO_DA_CASA_PADRAO, calcadas: false });
    expect(regioes(p.comandos)).toEqual([]);
    expect(muros(p.comandos)).toHaveLength(2);
  });
});

describe('planejarMuroDaCasa — o jardim (a permeabilidade desenhada)', () => {
  it('o lote dentro do muro, menos a casa e as calçadas, em grama — sem sobrepor nada', () => {
    // Dentro do muro: 150–11850 × 150–29850 = 11,7 × 29,7 = 347,49 m². A casa pela face: 1400–10600 × 2900–19950 =
    // 9,2 × 17,05 = 156,86 m². Calçadas: 7,425 + 3,3. Jardim = 347,49 − 156,86 − 7,425 − 3,3 = 179,905 m².
    const p = planejarMuroDaCasa(base(), HIPOTESES_DO_MURO_DA_CASA_PADRAO);
    const jardim = regioes(p.comandos).filter((r) => r.nome === 'Jardim');
    expect(jardim.every((r) => r.material === 'GRAMA')).toBe(true);
    expect(Math.abs(p.resumo.jardimM2 - 179.905)).toBeLessThanOrEqual(0.0051);
    // As faixas vizinhas de mesmos lados se juntam: frente (em 3 pedaços entre as calçadas), laterais e fundos.
    expect(jardim.length).toBeLessThanOrEqual(8);
    const dentroDaCasa = (q: { x: number; y: number }) => q.x > 1400 && q.x < 10600 && q.y > 2900 && q.y < 19950;
    for (const r of jardim) {
      const c = { x: r.pontos.reduce((a, q) => a + q.x, 0) / r.pontos.length, y: r.pontos.reduce((a, q) => a + q.y, 0) / r.pontos.length };
      expect(dentroDaCasa(c)).toBe(false);
    }
  });

  it('a escada de acesso fica fora do jardim', () => {
    // A escada 4200–5400 × 660–2900 tira 1,2 × 2,24 = 2,688 m² do jardim (a calçada está noutro lugar).
    const sem = planejarMuroDaCasa(base(), HIPOTESES_DO_MURO_DA_CASA_PADRAO).resumo.jardimM2;
    const com = planejarMuroDaCasa(base({ obstaculos: [{ x0: 4200, x1: 5400, y0: 660, y1: 2900 }] }), HIPOTESES_DO_MURO_DA_CASA_PADRAO).resumo.jardimM2;
    expect(Math.abs(sem - com - 2.688)).toBeLessThanOrEqual(0.011);
  });
});
