import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { baseDoCorte, projetarCorte } from '../utils/blueprintCorte';
import { projetarElevacao } from '../utils/blueprintElevation';
import { comMassa, massaNaVista } from '../utils/blueprintMassaNaVista';
import { DesenhistaDeProva, desenharElevacao, enquadrarElevacao, PAPEIS, type OpcoesExportacao } from '../utils/blueprintExport';
import { CAMADAS, gerarDxf } from '../utils/blueprintDxf';

const ret = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/**
 * O Garden na Planta 26/10/2026: Torre A (y 6–32 m) e Torre B (y 32–58 m), 13,5 m de largura, 4 pavimentos de 3 m;
 * a garagem da Torre A embaixo, 2 pavimentos (−6 a 0).
 */
function garden(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const lv = m.levels[0].id;
  const bloco = (nome: string, pontos: { x: number; y: number }[], cotaBaseMm: number, pavimentos: number, uso: string): Command =>
    ({ type: 'AddBloco', levelId: lv, nome, pontos, cotaBaseMm, pavimentos, peDireitoMm: 3000, uso }) as Command;
  return applyBatch(m, [
    bloco('Torre A · Garagem', ret(2281, 6342, 15781, 32342), -6000, 2, 'GARAGEM'),
    bloco('Torre A', ret(2281, 6342, 15781, 32342), 0, 4, 'RESIDENCIAL'),
    bloco('Torre B', ret(2281, 32342, 15781, 58342), 0, 4, 'RESIDENCIAL'),
  ]).model;
}

describe('massaNaVista', () => {
  // O corte do print: uma linha vertical em x = 9 m, de baixo para cima, olhando para a esquerda (−x).
  const corte = { id: 'c', rotulo: 'A', a: { x: 9000, y: -2000 }, b: { x: 9000, y: 66000 }, olharPara: 'ESQUERDA' as const, levelId: '' };

  it('⚠️ PRONTO QUANDO: o corte que atravessa as torres mostra os blocos CORTADOS, com as linhas dos pavimentos', () => {
    const m = garden();
    const base = baseDoCorte(corte as never);
    const r = massaNaVista(m, base, corte.a);
    expect(r.map((b) => [b.nome, b.cortado])).toEqual([
      ['Torre A · Garagem', true],
      ['Torre A', true],
      ['Torre B', true],
    ]);
    const torreA = r.find((b) => b.nome === 'Torre A')!;
    expect([torreA.vMin, torreA.vMax]).toEqual([0, 12000]);
    expect(torreA.pisos).toEqual([3000, 6000, 9000]);
    expect(Math.abs(torreA.uMax - torreA.uMin)).toBe(26000);
    expect(r.find((b) => b.nome === 'Torre A · Garagem')!.enterrado).toBe(true);
  });

  it('o corte que passa ao lado: o bloco atrás sai em vista; o da frente não sai', () => {
    const m = garden();
    // A linha em x = 20 m (fora do lote), olhando para −x: as torres ficam ATRÁS do plano.
    const atras = { ...corte, a: { x: 20000, y: -2000 }, b: { x: 20000, y: 66000 } };
    const r = massaNaVista(m, baseDoCorte(atras as never), atras.a);
    expect(r).toHaveLength(3);
    expect(r.every((b) => !b.cortado)).toBe(true);
    // Olhando para +x a partir de x = 20 m, as torres ficam na FRENTE do plano.
    const frente = { ...atras, olharPara: 'DIREITA' as const };
    expect(massaNaVista(m, baseDoCorte(frente as never), frente.a)).toEqual([]);
  });

  it('na fachada (sem linha de corte), todo bloco sai em vista', () => {
    const m = garden();
    const r = massaNaVista(m, baseDoCorte(corte as never), null);
    expect(r).toHaveLength(3);
    expect(r.every((b) => !b.cortado)).toBe(true);
  });

  it('só os níveis da vista', () => {
    const m = garden();
    expect(massaNaVista(m, baseDoCorte(corte as never), corte.a, ['outro-nivel'])).toEqual([]);
  });
});

describe('a projeção com a massa: tela, prancha e DXF (29/10/2026)', () => {
  const corte = { id: 'c', uid: 'c', rotulo: 'A', a: { x: 9000, y: -2000 }, b: { x: 9000, y: 66000 }, olharPara: 'ESQUERDA' as const };
  const OPCOES: OpcoesExportacao = { denominador: 200, papel: PAPEIS[0], titulo: 'Estudo', revisao: 1, hash: 'h' };

  it('a caixa do corte só com blocos é a deles: 52 m ao longo, da garagem (−6 m) ao topo (+12 m)', () => {
    const m = garden();
    const proj = comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a);
    expect(proj.massa).toHaveLength(3);
    expect(proj.bbox.uMax - proj.bbox.uMin).toBe(52000);
    expect([proj.bbox.vMin, proj.bbox.vMax]).toEqual([-6000, 12000]);
  });

  it('⚠️ PRONTO QUANDO: a prancha do corte só com massa NÃO é recusada como vazia e escreve o nome dos blocos', () => {
    const m = garden();
    const proj = comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a);
    const enq = enquadrarElevacao(proj, 200, PAPEIS[0]);
    expect(enq.vazio).toBe(false);
    const d = new DesenhistaDeProva();
    desenharElevacao(d, proj, OPCOES, enq);
    const textos = d.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2]);
    expect(textos).toEqual(expect.arrayContaining(['Torre A', 'Torre B', 'Torre A · Garagem']));
    // Sem a massa, a mesma projeção era vazia.
    expect(enquadrarElevacao(projetarCorte(m, { corte: corte as never }), 200, PAPEIS[0]).vazio).toBe(true);
  });

  it('a fachada com a massa também sai na prancha', () => {
    const m = garden();
    const proj = comMassa(m, projetarElevacao(m, { direcao: 'FRENTE' }), null);
    expect(proj.massa!.length).toBeGreaterThan(0);
    expect(enquadrarElevacao(proj, 200, PAPEIS[0]).vazio).toBe(false);
  });

  it('o DXF leva os blocos na camada própria', () => {
    const m = garden();
    const proj = comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a);
    const dxf = gerarDxf(m, { titulo: 'T', revisao: 1, hash: 'h', elevacoes: [proj] });
    expect(dxf).toContain(CAMADAS.ELEV_MASSA);
  });
});
