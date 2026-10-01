/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — iluminação pela IT 13 do CBMMG: os
 * 15 m (5.4), a luminária abaixo de 2,5 m em 30 V ou com DR 30 mA + 10 A (5.5/5.5.1), e a
 * regressão do vazamento da IT 15 (a placa de 15 m não é ponto de luminária).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { ALTURA_DA_BAIXA_TENSAO_MM, ESPACAMENTO_MAXIMO_PADRAO_M, HIPOTESES_ILUMINACAO_PADRAO as HI, analisarIluminacao } from '../utils/blueprintIluminacaoEmergencia';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';
import { pontosDeSinalizacaoDaRota } from '../utils/blueprintSinalizacao';

const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it13-itens.txt'), 'utf-8');

function corredor(L: number): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  m = applyBatch(m, [w(0, 0, L, 0), w(L, 0, L, 2000), w(L, 2000, 0, 2000), w(0, 2000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!.id, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  return applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: 'Corredor' }) as Command)).model;
}

describe('D1.2 · IT 13 do CBMMG', () => {
  it('a transcrição tem os itens usados; 15 m e 2,5 m no código', () => {
    expect(texto).toMatch(/^5\.4 A distância máxima entre dois pontos de iluminação de aclaramento deve ser de 15 m/m);
    expect(texto).toMatch(/^5\.5\.1 .*30 mA.*10 A/m);
    expect(ESPACAMENTO_MAXIMO_PADRAO_M).toBe(15);
    expect(ALTURA_DA_BAIXA_TENSAO_MM).toBe(2500);
  });

  it('⚠️ regressão: as placas de 15 m da IT 15 não viram ponto obrigatório de luminária; o térreo curto não isenta a luz', () => {
    const m = corredor(40000);
    const l = m.levels[0].id;
    const p = percursoDeFuga(m, 'A', l);
    expect(pontosDeSinalizacaoDaRota(p, l).filter((x) => x.codigo === 'S1').length).toBeGreaterThan(0);
    expect(analisarIluminacao(m, p, l, HI).pontosObrigatorios.map((x) => x.tipo)).toEqual(['SAIDA']);
    const curto = corredor(10000);
    const lc = curto.levels[0].id;
    expect(pontosDeSinalizacaoDaRota(percursoDeFuga(curto, 'A', lc), lc)).toEqual([]); // a placa: isenta (IT 15, 6.1.3.5)
    expect(analisarIluminacao(curto, percursoDeFuga(curto, 'A', lc), lc, HI).pontosObrigatorios.map((x) => x.tipo)).toEqual(['SAIDA']); // a luz, não
  });

  it('5.5: a luminária a 2,2 m no circuito sem DR é falta; com DR 30 mA e disjuntor de 10 A, não; a 2,6 m, não se cobra', () => {
    const base = corredor(10000);
    const l = base.levels[0].id;
    const comQuadro = applyCommand(base, { type: 'AddQuadro', levelId: l, nome: 'QDC', at: point(9000, 1000) } as Command).model;
    const quadro = comQuadro.quadros![0].id;
    const montar = (dr: boolean, disjuntor: number, cota: number) => {
      let m = applyCommand(comQuadro, { type: 'AddCircuito', quadroId: quadro, nome: 'C1', protecaoDR: dr, disjuntorA: disjuntor } as Command).model;
      const c = m.circuitos![0].id;
      m = applyBatch(m, [
        { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'Luminária', tipoHidraulico: 'LUMINARIA_EMERGENCIA', at: point(5000, 1000), cotaMm: cota } as Command,
        { type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'Alimentação', tipoEletrico: 'ILUMINACAO_PAREDE', at: point(5000, 1000), cotaMm: cota } as Command,
      ]).model;
      const ponto = m.terminais!.find((t) => t.disciplina === 'ELETRICA')!.id;
      m = applyCommand(m, { type: 'SetTerminalProps', terminalId: ponto, circuitoId: c } as Command).model;
      return analisarIluminacao(m, null, l, HI);
    };
    expect(montar(false, 10, 2200).tensaoSemProtecao).toHaveLength(1);
    expect(montar(true, 16, 2200).tensaoSemProtecao).toHaveLength(1);
    expect(montar(true, 10, 2200).tensaoSemProtecao).toEqual([]);
    expect(montar(false, 16, 2600).tensaoSemProtecao).toEqual([]);
  });
});
