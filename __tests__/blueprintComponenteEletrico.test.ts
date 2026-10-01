/**
 * COMPONENTE COM CARGA e CAIXA DE PASSAGEM (E1.2 do roadmap elétrico, 29/09/2026, kernel 0.70.0).
 *
 * A evaporadora desenhada não era vista pelo quadro de cargas — o Componente
 * não tem circuito nem potência. Agora a ficha diz que ponto ELÉTRICO a peça
 * pede, inserir a peça lança o ponto (molde da louça → ponto hidráulico), a
 * ligação é derivada e a caixa de passagem existe como terminal com medidas.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, applyBatch, applyCommand, emptyModel, point, pontoEletricoDoComponente, CATALOGO_DE_COMPONENTES, TIPOS_DE_PONTO_ELETRICO, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { pontosDasLoucasCriadas, pontosEletricosDoComponente } from '../utils/blueprintPontosHidraulicos';
import { COTA_USUAL_DO_PONTO_ELETRICO, GRUPO_DO_PONTO_ELETRICO, MEDIDAS_PADRAO_CAIXA_DE_PASSAGEM, ROTULO_DO_PONTO_ELETRICO, SIGLA_DO_PONTO_ELETRICO } from '../utils/blueprintRede';
import { TIPOS_SEM_CARGA, grupoDeCarga, usoDoCircuito } from '../utils/blueprintEletricaDimensionamento';
import { funcaoDoPonto } from '../utils/blueprintCircuitosAutomaticos';
import { gerarIfc } from '../utils/blueprintIfc';

/** Sala 4 × 4 com paredes de 150. */
function sala(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  return applyBatch(base, [w(0, 0, 4000, 0), w(4000, 0, 4000, 4000), w(4000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
}

describe('componente com carga (E1.2)', () => {
  it('kernel 0.70.0; a evaporadora e o exaustor dizem que ponto elétrico pedem; a louça não', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.81.0');
    expect(CATALOGO_DE_COMPONENTES.EVAPORADORA.ligaAoPontoEletrico).toBe('AR_CONDICIONADO');
    expect(CATALOGO_DE_COMPONENTES.EXAUSTOR.ligaAoPontoEletrico).toBe('VENTILADOR_EXAUSTOR');
    expect(CATALOGO_DE_COMPONENTES.VASO.ligaAoPontoEletrico).toBeUndefined();
  });

  it('⚠️ inserir a evaporadora lança o ponto de AR_CONDICIONADO na FACE da parede atrás, na cota usual, com a potência típica', () => {
    const m0 = sala();
    const t = m0.levels[0].id;
    // Evaporadora encostada na parede de y = 0 (face interna em y = 75).
    const r = applyCommand(m0, { type: 'AddComponente', levelId: t, tipoId: 'EVAPORADORA', at: point(2000, 200) });
    const pontos = pontosDasLoucasCriadas(r.model, r.diff.created);
    expect(pontos).toHaveLength(1);
    const p = pontos[0];
    expect(p.disciplina).toBe('ELETRICA');
    expect(p.tipoEletrico).toBe('AR_CONDICIONADO');
    expect(p.cotaMm).toBe(COTA_USUAL_DO_PONTO_ELETRICO.AR_CONDICIONADO);
    expect(p.potenciaW).toBe(1400);
    // Na face da parede (y = 75), não no centro da peça (y = 200).
    expect(p.at.y).toBe(75);
    expect(p.at.x).toBe(2000);
    // Aplicado, o componente encontra o ponto (derivado) e não lança outro.
    const m = applyBatch(r.model, pontos).model;
    const comp = m.componentes![0];
    expect(pontoEletricoDoComponente(m, comp)?.tipoEletrico).toBe('AR_CONDICIONADO');
    expect(pontosEletricosDoComponente(m, comp)).toEqual([]);
  });

  it('peça solta no ambiente: o ponto nasce no centro dela; o vaso não lança ponto elétrico', () => {
    const m0 = sala();
    const t = m0.levels[0].id;
    const r = applyCommand(m0, { type: 'AddComponente', levelId: t, tipoId: 'EXAUSTOR', at: point(2000, 2000) });
    const pontos = pontosDasLoucasCriadas(r.model, r.diff.created).filter((p) => p.disciplina === 'ELETRICA');
    expect(pontos).toHaveLength(1);
    expect(pontos[0].tipoEletrico).toBe('VENTILADOR_EXAUSTOR');
    expect(pontos[0].at).toEqual({ x: 2000, y: 2000 });
    const vaso = applyCommand(m0, { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(1000, 300) });
    expect(pontosDasLoucasCriadas(vaso.model, vaso.diff.created).filter((p) => p.disciplina === 'ELETRICA')).toEqual([]);
  });
});

describe('caixa de passagem (E1.2)', () => {
  it('existe na taxonomia, com tabelas, grupo próprio e medidas 4×4; não é carga', () => {
    expect(TIPOS_DE_PONTO_ELETRICO).toContain('CAIXA_PASSAGEM');
    expect(ROTULO_DO_PONTO_ELETRICO.CAIXA_PASSAGEM).toMatch(/Caixa de passagem/);
    expect(SIGLA_DO_PONTO_ELETRICO.CAIXA_PASSAGEM).toBe('CP');
    expect(GRUPO_DO_PONTO_ELETRICO.CAIXA_PASSAGEM).toBe('Elétrica — caixas');
    expect(MEDIDAS_PADRAO_CAIXA_DE_PASSAGEM).toEqual({ larguraMm: 100, alturaMm: 100, profundidadeMm: 50 });
    expect(TIPOS_SEM_CARGA.has('CAIXA_PASSAGEM')).toBe(true);
    expect(grupoDeCarga('CAIXA_PASSAGEM')).toBeNull();
    expect(funcaoDoPonto('CAIXA_PASSAGEM')).toBeNull();
    // Só caixa no "circuito": não há carga — cai em iluminação por exclusão, como o interruptor sozinho.
    expect(usoDoCircuito([{ tipoEletrico: 'CAIXA_PASSAGEM' }])).toBe('ILUMINACAO');
  });

  it('sai no IFC como IfcJunctionBox .POWER., com as medidas declaradas', () => {
    const m0 = sala();
    const t = m0.levels[0].id;
    let m = applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Caixa', at: point(2000, 2000), cotaMm: 2800, tipoEletrico: 'CAIXA_PASSAGEM' }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, ...MEDIDAS_PADRAO_CAIXA_DE_PASSAGEM }).model;
    expect(m.terminais[0].larguraMm).toBe(100);
    const ifc = gerarIfc(m, { titulo: 'caixa', revisao: 1, hash: 'c'.repeat(64), data: new Date('2026-09-29T12:00:00Z') });
    expect(ifc).toMatch(/IFCJUNCTIONBOX\([^)]*'CAIXA_PASSAGEM'[^)]*\.POWER\./);
  });
});
