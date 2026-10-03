/**
 * OUTORGA ONEROSA no estudo de massa (pendências de 03/10/2026): a zona tem CA BÁSICO e CA MÁXIMO; entre os dois a
 * área computável depende de outorga. O editor só lia o máximo. Agora o básico é lido da zona (e acusa deriva), e a
 * massa diz quantos m² estão sujeitos a outorga.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { lerZona, recuosDaZona, zonaDerivou, type ZonaRegulatoria } from '../utils/blueprintZonaUrbanistica';

const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

/** Lote 30 × 40 m (1.200 m²) com uma torre 20 × 30 m de `pav` pavimentos residenciais (600 m² por pavimento). */
function comTorre(pav: number): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return applyBatch(m, [{ type: 'AddBloco', levelId: t, nome: 'Torre', pontos: ret(5000, 5000, 25000, 35000), pavimentos: pav }]).model;
}
const medir = (m: BlueprintModel, zona: ZonaDaMassa) => medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona });

describe('a zona: CA básico lido e conferido', () => {
  const zona: ZonaRegulatoria = { id: 'z1', zona: 'ZC', ca_basico: '2', ca_maximo: '4,0' };

  it('lê o básico ao lado do máximo; texto ilegível é dito', () => {
    const { valores, naoAplicados } = lerZona(zona);
    expect([valores.coeficienteBasico, valores.coeficienteMax]).toEqual([2, 4]);
    expect(lerZona({ id: 'z2', ca_basico: 'ver anexo' }).naoAplicados.map((n) => n.campo)).toEqual(['coeficiente_basico']);
    expect(naoAplicados).toEqual([]);
    expect(lerZona({ id: 'z3' }).valores.coeficienteBasico).toBeNull();
  });

  it('a zona mudar o básico é deriva; ajustado à mão, não', () => {
    // Como o estudo grava: os recuos passam por `recuosDaZona` (lado sem valor = 0).
    const gravado = (z: ZonaRegulatoria) => {
      const v = lerZona(z).valores;
      return { ...v, recuoMm: recuosDaZona(v) };
    };
    const aplicados = gravado(zona);
    expect(zonaDerivou(aplicados, {}, { ...zona, ca_basico: '2,5' })).toBe(true);
    expect(zonaDerivou(aplicados, { coeficiente_basico: 'MANUAL' }, { ...zona, ca_basico: '2,5' })).toBe(false);
    // Estudo gravado antes da coluna (sem o básico) contra zona que também não tem: sem deriva.
    expect(zonaDerivou({ ...gravado({ id: 'z4' }), coeficienteBasico: undefined as never }, {}, { id: 'z4' })).toBe(false);
  });
});

describe('a massa: área sujeita a outorga', () => {
  const ZONA: ZonaDaMassa = { ...ZONA_DA_MASSA_VAZIA, coeficienteMax: 4, coeficienteBasico: 2 };

  it('6 pavimentos de 600 m² num lote de 1.200 m² com CA básico 2: 2.400 de direito, 1.200 m² sujeitos a outorga', () => {
    const r = medir(comTorre(6), ZONA);
    expect(r.areaComputavelM2).toBe(3600);
    expect(r.outorga).toEqual({ caBasico: 2, basicoM2: 2400, maximoM2: 4800, sujeitaM2: 1200 });
    expect(r.ca.estado).toBe('ATENDE');
  });

  it('dentro do básico: nada sujeito; acima do máximo: o CA acusa e a outorga conta até onde há computável', () => {
    expect(medir(comTorre(3), ZONA).outorga!.sujeitaM2).toBe(0);
    const acima = medir(comTorre(10), ZONA);
    expect(acima.ca.estado).toBe('EXCEDE');
    expect(acima.outorga!.sujeitaM2).toBe(6000 - 2400);
  });

  it('sem CA básico na zona, o estudo não fala em outorga', () => {
    expect(medir(comTorre(6), { ...ZONA, coeficienteBasico: null }).outorga).toBeNull();
    expect(medir(comTorre(6), ZONA_DA_MASSA_VAZIA).outorga).toBeNull();
  });
});
