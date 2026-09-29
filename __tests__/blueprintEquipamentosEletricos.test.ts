/**
 * OS EQUIPAMENTOS ELÉTRICOS (E1.1 do roadmap elétrico, 29/09/2026, kernel 0.69.0).
 *
 * Ar-condicionado, motor/bomba, ventilador/exaustor, portão, carregador de
 * veículo, campainha, ponto de espera e aterramento entram na taxonomia
 * FECHADA. O que se prova: cada um tem rótulo, sigla, grupo, cota e entidade
 * IFC; o grupo de demanda MOTOR existe e é somado à parte; o uso do circuito e
 * o planejador tratam equipamento como uso específico; a 9.5.3.1 olha para
 * eles; a potência típica é HIPÓTESE (espera e terra ficam sem número); terra
 * não é carga.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, KERNEL_VERSION, TIPOS_DE_PONTO_ELETRICO, type BlueprintModel, type Command, type TipoDePontoEletrico } from '../utils/blueprintKernel';
import { COTA_USUAL_DO_PONTO_ELETRICO, GRUPO_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO, SIGLA_DO_PONTO_ELETRICO, TIPOS_DE_EQUIPAMENTO_ELETRICO } from '../utils/blueprintRede';
import { DEMANDA_SEM_FATOR, GRUPOS_DE_CARGA, HIPOTESES_PADRAO, TIPOS_DE_USO_ESPECIFICO, grupoDeCarga, preDimensionarQuadroCompleto, usoDoCircuito } from '../utils/blueprintEletricaDimensionamento';
import { funcaoDoPonto } from '../utils/blueprintCircuitosAutomaticos';
import { POTENCIA_TIPICA_DO_EQUIPAMENTO_VA, potenciaPadraoVA } from '../utils/blueprintPotenciaPadrao';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { gerarIfc } from '../utils/blueprintIfc';

const NOVOS: TipoDePontoEletrico[] = ['AR_CONDICIONADO', 'MOTOR_BOMBA', 'VENTILADOR_EXAUSTOR', 'PORTAO', 'CARREGADOR_VE', 'CAMPAINHA', 'PONTO_ESPERA', 'ATERRAMENTO'];

function casa(): { m: BlueprintModel; quadroId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  return { m, quadroId: m.quadros[0].id };
}

describe('equipamentos elétricos · taxonomia', () => {
  it('kernel 0.69.0; os oito tipos existem e todo tipo tem rótulo, sigla, grupo e cota', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.73.0');
    for (const t of NOVOS) expect(TIPOS_DE_PONTO_ELETRICO).toContain(t);
    for (const t of TIPOS_DE_PONTO_ELETRICO) {
      expect(ROTULO_DO_PONTO_ELETRICO[t], t).toBeTruthy();
      expect(SIGLA_DO_PONTO_ELETRICO[t], t).toBeTruthy();
      expect(GRUPO_DO_PONTO_ELETRICO[t], t).toMatch(/^Elétrica — /);
      expect(COTA_USUAL_DO_PONTO_ELETRICO[t], t).toBeGreaterThanOrEqual(0);
    }
    expect(GRUPO_DO_PONTO_ELETRICO.AR_CONDICIONADO).toBe('Elétrica — equipamentos');
    expect(GRUPO_DO_PONTO_ELETRICO.CAMPAINHA).toBe('Elétrica — especiais e dados');
    expect([...TIPOS_DE_EQUIPAMENTO_ELETRICO].sort()).toEqual(['AR_CONDICIONADO', 'CARREGADOR_VE', 'MOTOR_BOMBA', 'PONTO_ESPERA', 'PORTAO', 'VENTILADOR_EXAUSTOR']);
  });

  it('a invariante aceita os tipos novos num terminal ELÉTRICO', () => {
    const { m } = casa();
    const t = m.levels[0].id;
    const cmds: Command[] = NOVOS.map((tipoEletrico, i) => ({ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(1000 * (i + 1), 0), cotaMm: COTA_USUAL_DO_PONTO_ELETRICO[tipoEletrico], tipoEletrico }));
    const r = applyBatch(m, cmds).model;
    expect(r.terminais.filter((x) => x.disciplina === 'ELETRICA')).toHaveLength(8);
  });
});

describe('equipamentos elétricos · carga, uso e demanda', () => {
  it('grupo de carga: motores → MOTOR; VE e espera → FORCA; campainha → TUG; terra → nenhum', () => {
    expect(GRUPOS_DE_CARGA).toEqual(['ILUMINACAO', 'TUG', 'FORCA', 'MOTOR']);
    expect(grupoDeCarga('AR_CONDICIONADO')).toBe('MOTOR');
    expect(grupoDeCarga('MOTOR_BOMBA')).toBe('MOTOR');
    expect(grupoDeCarga('VENTILADOR_EXAUSTOR')).toBe('MOTOR');
    expect(grupoDeCarga('PORTAO')).toBe('MOTOR');
    expect(grupoDeCarga('CARREGADOR_VE')).toBe('FORCA');
    expect(grupoDeCarga('PONTO_ESPERA')).toBe('FORCA');
    expect(grupoDeCarga('CAMPAINHA')).toBe('TUG');
    expect(grupoDeCarga('ATERRAMENTO')).toBeNull();
    expect(grupoDeCarga('INTERRUPTOR')).toBeNull();
    expect(DEMANDA_SEM_FATOR.MOTOR).toBe(1);
    expect(HIPOTESES_PADRAO.demanda.MOTOR).toBe(1);
  });

  it('uso do circuito e planejador: equipamento é USO ESPECÍFICO (um circuito cada); terra fica fora do plano', () => {
    for (const t of ['AR_CONDICIONADO', 'MOTOR_BOMBA', 'PORTAO', 'CARREGADOR_VE', 'PONTO_ESPERA'] as const) {
      expect(TIPOS_DE_USO_ESPECIFICO.has(t), t).toBe(true);
      expect(usoDoCircuito([{ tipoEletrico: t }]), t).toBe('TUE');
      expect(funcaoDoPonto(t), t).toBe('TUE');
    }
    expect(usoDoCircuito([{ tipoEletrico: 'CAMPAINHA' }])).toBe('FORCA');
    expect(funcaoDoPonto('CAMPAINHA')).toBe('TUG');
    expect(funcaoDoPonto('ATERRAMENTO')).toBeNull();
    // Só terra e interruptor: não há carga — iluminação por exclusão, como o interruptor sozinho.
    expect(usoDoCircuito([{ tipoEletrico: 'ATERRAMENTO' }])).toBe('ILUMINACAO');
  });

  it('⚠️ o fator MOTOR reduz só a carga dos motores: AC 1.400 + TUG 600 com MOTOR 0,5 → demandada 1.300 VA', () => {
    const { m: m0, quadroId } = casa();
    const t = m0.levels[0].id;
    let m = applyCommand(m0, { type: 'AddCircuito', quadroId, nome: 'C1 — AC', tensaoV: 127, ligacao: 'FN' }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2 — TUG', tensaoV: 127, ligacao: 'FN' }).model;
    const [c1, c2] = m.circuitos.map((c) => c.id);
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'AC', at: point(1000, 0), cotaMm: 2200, tipoEletrico: 'AR_CONDICIONADO', potenciaW: 1400 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: c1 }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2000, 0), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, circuitoId: c2 }).model;
    const q = preDimensionarQuadroCompleto(m, quadroId, { ...HIPOTESES_PADRAO, demanda: { nome: 'teste', ILUMINACAO: 1, TUG: 1, FORCA: 1, MOTOR: 0.5 } })!;
    expect(q.porGrupoVA.MOTOR).toBe(1400);
    expect(q.porGrupoVA.TUG).toBe(600);
    expect(q.sInstaladaVA).toBe(2000);
    expect(q.sDemandadaVA).toBe(1300);
    // 9.5.3.1: o AC (11 A em 127 V) sozinho no circuito atende; dividido com a TUG, falta.
    expect(conferirNbr5410(m).regras.find((r) => r.codigo === '9.5.3.1')!.achados).toEqual([]);
    const dividido = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, circuitoId: c1 }).model;
    const r = conferirNbr5410(dividido).regras.find((x) => x.codigo === '9.5.3.1')!;
    expect(r.achados.some((a) => /AC.*11,0 A.*circuito independente/.test(a.mensagem))).toBe(true);
  });

  it('potência típica é HIPÓTESE: AC 1.400, VE 7.400, campainha 20; espera e terra ficam sem número', () => {
    expect(potenciaPadraoVA('AR_CONDICIONADO', null)).toBe(1400);
    expect(potenciaPadraoVA('CARREGADOR_VE', null)).toBe(7400);
    expect(potenciaPadraoVA('CAMPAINHA', null)).toBe(20);
    expect(potenciaPadraoVA('PONTO_ESPERA', null)).toBeNull();
    expect(potenciaPadraoVA('ATERRAMENTO', null)).toBeNull();
    expect(POTENCIA_TIPICA_DO_EQUIPAMENTO_VA.PONTO_ESPERA).toBeUndefined();
  });
});

describe('equipamentos elétricos · IFC', () => {
  it('cada equipamento sai na entidade certa: AC e VE = IfcOutlet; motor/portão = IfcJunctionBox .POWER.; campainha = IfcAudioVisualAppliance; espera e terra = IfcJunctionBox .USERDEFINED.', () => {
    const { m } = casa();
    const t = m.levels[0].id;
    const cmds: Command[] = NOVOS.map((tipoEletrico, i) => ({ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(1000 * (i + 1), 0), cotaMm: 300, tipoEletrico }));
    const ifc = gerarIfc(applyBatch(m, cmds).model, { titulo: 'equipamentos', revisao: 1, hash: 'e'.repeat(64), data: new Date('2026-09-29T12:00:00Z') });
    expect(ifc).toMatch(/IFCOUTLET\([^)]*'AR_CONDICIONADO'[^)]*\.POWEROUTLET\./);
    expect(ifc).toMatch(/IFCOUTLET\([^)]*'CARREGADOR_VE'[^)]*\.USERDEFINED\./);
    expect(ifc).toMatch(/IFCJUNCTIONBOX\([^)]*'MOTOR_BOMBA'[^)]*\.POWER\./);
    expect(ifc).toMatch(/IFCJUNCTIONBOX\([^)]*'PORTAO'[^)]*\.POWER\./);
    expect(ifc).toMatch(/IFCAUDIOVISUALAPPLIANCE\([^)]*'CAMPAINHA'[^)]*\.USERDEFINED\./);
    expect(ifc).toMatch(/IFCJUNCTIONBOX\([^)]*'PONTO_ESPERA'[^)]*\.USERDEFINED\./);
    expect(ifc).toMatch(/IFCJUNCTIONBOX\([^)]*'ATERRAMENTO'[^)]*\.USERDEFINED\./);
  });
});
