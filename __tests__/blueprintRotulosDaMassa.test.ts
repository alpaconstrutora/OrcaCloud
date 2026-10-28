import { describe, expect, it } from 'vitest';
import { FOLGA_DO_ROTULO_DO_BLOCO_M, rotulosDaMassa, type PecaDaMassaParaRotulo } from '../utils/blueprintRotulosDaMassa';

const retangulo = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

// Torre A: 10 × 20 m, 2 pavimentos de 3 m, cada um dividido em 2 unidades (fatias de 10 × 10 m).
const torre: PecaDaMassaParaRotulo[] = [
  { id: 'A', chave: 'A-1-u0', anel: retangulo(0, 0, 10000, 10000), baseMm: 0, topoMm: 3000, bloco: 'Torre A', rotuloDaUnidade: '101' },
  { id: 'A', chave: 'A-1-u1', anel: retangulo(0, 10000, 10000, 20000), baseMm: 0, topoMm: 3000, bloco: 'Torre A', rotuloDaUnidade: '102' },
  { id: 'A', chave: 'A-2-u0', anel: retangulo(0, 0, 10000, 10000), baseMm: 3000, topoMm: 6000, bloco: 'Torre A', rotuloDaUnidade: '201' },
  { id: 'A', chave: 'A-2-u1', anel: retangulo(0, 10000, 10000, 20000), baseMm: 3000, topoMm: 6000, bloco: 'Torre A', rotuloDaUnidade: '202' },
];
// O subsolo dela: 2 pavimentos abaixo do chão.
const garagem: PecaDaMassaParaRotulo[] = [
  { id: 'G', chave: 'G-1', anel: retangulo(0, 0, 10000, 20000), baseMm: -6000, topoMm: -3000, bloco: 'Torre A · Garagem' },
  { id: 'G', chave: 'G-2', anel: retangulo(0, 0, 10000, 20000), baseMm: -3000, topoMm: 0, bloco: 'Torre A · Garagem' },
];

describe('rotulosDaMassa', () => {
  it('um nome por bloco, no centro do contorno e acima do último pavimento', () => {
    const r = rotulosDaMassa(torre, { blocos: true, unidades: false });
    expect(r).toEqual([{ chave: 'bloco-A', texto: 'Torre A', tipo: 'BLOCO', posicao: [5, 6 + FOLGA_DO_ROTULO_DO_BLOCO_M, 10] }]);
  });

  it('o bloco inteiro abaixo do chão leva o nome abaixo do fundo, para não cair sobre a torre', () => {
    const r = rotulosDaMassa(garagem, { blocos: true, unidades: false });
    expect(r).toEqual([{ chave: 'bloco-G', texto: 'Torre A · Garagem', tipo: 'BLOCO', posicao: [5, -6 - FOLGA_DO_ROTULO_DO_BLOCO_M, 10] }]);
  });

  it('uma etiqueta por unidade em cada pavimento, no centro da fatia e a meia altura', () => {
    const r = rotulosDaMassa(torre, { blocos: false, unidades: true });
    expect(r.map((x) => [x.texto, x.posicao])).toEqual([
      ['101', [5, 1.5, 5]],
      ['102', [5, 1.5, 15]],
      ['201', [5, 4.5, 5]],
      ['202', [5, 4.5, 15]],
    ]);
    expect(r.every((x) => x.tipo === 'UNIDADE')).toBe(true);
  });

  it('cada opção liga só o seu tipo; desligadas, nada', () => {
    const tudo = [...torre, ...garagem];
    expect(rotulosDaMassa(tudo, { blocos: true, unidades: true })).toHaveLength(2 + 4);
    expect(rotulosDaMassa(tudo, { blocos: false, unidades: false })).toEqual([]);
  });

  it('sem nome de bloco ou de unidade não há etiqueta (massa sem divisão em unidades)', () => {
    const semNomes = torre.map(({ bloco: _b, rotuloDaUnidade: _u, ...p }) => p);
    expect(rotulosDaMassa(semNomes, { blocos: true, unidades: true })).toEqual([]);
  });
});
