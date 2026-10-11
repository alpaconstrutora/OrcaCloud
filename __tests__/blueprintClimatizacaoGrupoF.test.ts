/**
 * CLIMATIZAÇÃO — grupo F, bloco "fazer já" (10/10/2026):
 *  - F10 a evaporadora inserida à mão traz o ponto elétrico, com a potência pela
 *    capacidade; mudar a capacidade muda a potência, se ela ainda é a automática;
 *  - F6  o equipamento real confere a CAIXA inteira: parede, vão, estrutura e móvel;
 *  - F14 a iluminação da carga sai das luminárias desenhadas quando não declarada;
 *  - F2  a transição redondo ↔ retangular e o colarinho do duto (quant-1.26.0);
 *  - F1  o raio da curva da linha em diâmetros, premissa editável.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, conflitosArquitetonicos, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';
import { comandosDaPotenciaDaEvaporadora, pontoEletricoDaEvaporadora, potenciaDaEvaporadoraVA } from '../utils/blueprintPontosHidraulicos';
import { volumesDasPecasDeClimatizacao } from '../utils/blueprintRede';
import { HIPOTESES_DO_AMBIENTE_VAZIAS, luminariasDoAmbienteW, premissasDoAmbiente } from '../utils/blueprintClimatizacaoAmbientes';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DA_LINHA_PADRAO, hipotesesClimatizacaoDaColuna, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { raioMinimoDaCurvaMm } from '../utils/blueprintLinhaFrigorigena';

const terminais = (m: BlueprintModel) => m.terminais ?? [];
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };

/** Uma sala 6 × 4 m; a parede norte de (0, 4000) a (6000, 4000), com uma porta de 0,80 m a 1,00 m do canto. */
function sala() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(0, 4000, 6000, 4000), w(0, 0, 0, 4000)]).model;
  const norte = m.walls.find((x) => x.a.y === 4000 && x.b.y === 4000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' },
    { type: 'AddOpening', wallId: norte.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 } as never,
  ]).model;
  return { m, t };
}
const peca = (t: string, tipo: string, x: number, y: number, cotaMm: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm, ...extra }) as Command;

describe('F10 · o ponto elétrico da evaporadora inserida à mão', () => {
  it('a potência pela capacidade ÷ EER; sem capacidade, a típica', () => {
    expect(potenciaDaEvaporadoraVA(12000, 3)).toBe(1172);
    expect(potenciaDaEvaporadoraVA(24000, 3)).toBe(2345);
    expect(potenciaDaEvaporadoraVA(null, 3)).toBe(1400);
  });

  it('o ponto nasce na FACE da parede, AO LADO da evaporadora, uma vez só', () => {
    const { m, t } = sala();
    const evap = { levelId: t, at: point(4500, 3815), capacidadeBtuH: null, larguraMm: 900, profundidadeMm: 220 };
    const cmds = pontoEletricoDaEvaporadora(m, evap, 3);
    expect(cmds).toEqual([expect.objectContaining({ type: 'AddTerminal', tipoEletrico: 'AR_CONDICIONADO', potenciaW: 1400 })]);
    // 11/10/2026 (teste no app real): na face ATRÁS do centro (4500, 3925) ficava escondido sob o
    // aparelho — agora na mesma face, meia largura + 150 mm ao lado.
    expect(cmds[0].at.y).toBe(3925);
    expect(Math.abs(cmds[0].at.x - 4500)).toBe(600);
    const depois = applyBatch(m, cmds).model;
    expect(pontoEletricoDaEvaporadora(depois, evap, 3)).toEqual([]);
  });

  it('sem parede perto, o ponto nasce AO LADO da evaporadora (meia largura + 150 mm), não em cima dela', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    const evap = { levelId: t, at: point(2000, 2000), capacidadeBtuH: null, larguraMm: 900, profundidadeMm: 220 };
    expect(pontoEletricoDaEvaporadora(m0, evap, 3)).toEqual([expect.objectContaining({ at: { x: 2600, y: 2000 } })]);
    // Girada 90°, o lado é em y; e o ponto ao lado ainda conta como o dela (não nasce outro).
    const girada = { ...evap, rotacaoGraus: 90 };
    const cmds = pontoEletricoDaEvaporadora(m0, girada, 3);
    expect(cmds[0].at.x).toBeCloseTo(2000, 6);
    expect(cmds[0].at.y).toBeCloseTo(2600, 6);
    expect(pontoEletricoDaEvaporadora(applyBatch(m0, pontoEletricoDaEvaporadora(m0, evap, 3)).model, evap, 3)).toEqual([]);
  });

  it('mudar a capacidade muda a potência automática; a digitada pelo projetista fica', () => {
    const { m, t } = sala();
    let x = applyCommand(m, peca(t, 'EVAPORADORA_HI_WALL', 4500, 3815, 2200, { larguraMm: 900, profundidadeMm: 220, alturaMm: 300 })).model;
    const ev = () => terminais(x).find((y) => y.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    x = applyBatch(x, pontoEletricoDaEvaporadora(x, ev(), 3)).model;
    const ponto = () => terminais(x).find((y) => y.tipoEletrico === 'AR_CONDICIONADO')!;
    const para = (cap: number) => {
      const cmds = comandosDaPotenciaDaEvaporadora(x, ev(), cap, 3);
      x = applyBatch(x, [{ type: 'SetTerminalProps', terminalId: ev().id, capacidadeBtuH: cap } as Command, ...cmds]).model;
      return cmds;
    };
    para(24000);
    expect(ponto().potenciaW).toBe(2345);
    para(12000);
    expect(ponto().potenciaW).toBe(1172);
    // O projetista digita a placa: a próxima troca de capacidade não mexe.
    x = applyCommand(x, { type: 'SetTerminalProps', terminalId: ponto().id, potenciaW: 1900 }).model;
    expect(para(18000)).toEqual([]);
    expect(ponto().potenciaW).toBe(1900);
  });
});

describe('F6 · o equipamento real × a arquitetura (a caixa inteira)', () => {
  const comPecas = (m: BlueprintModel) => conflitosArquitetonicos(m, { pecas: volumesDasPecasDeClimatizacao(m) });
  const daClasse = (m: BlueprintModel, classe: string) => comPecas(m).filter((c) => c.classe === classe);

  it('a condensadora na frente da porta: EQUIPAMENTO_X_VAO, com o trecho do vão tomado', () => {
    const { m, t } = sala();
    const x = applyCommand(m, peca(t, 'CONDENSADORA_SPLIT', 1400, 3600, 350, { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 })).model;
    expect(daClasse(x, 'EQUIPAMENTO_X_VAO').map((c) => c.medidaMm)).toEqual([800]);
    // Sem as caixas (o chamador antigo), nada disso aparece.
    expect(conflitosArquitetonicos(x).filter((c) => c.classe.startsWith('EQUIPAMENTO_'))).toEqual([]);
  });

  it('a evaporadora atravessada na parede: EQUIPAMENTO_X_PAREDE; a encostada na face, não', () => {
    const { m, t } = sala();
    const dentro = applyCommand(m, peca(t, 'EVAPORADORA_HI_WALL', 4000, 4000, 2200, { larguraMm: 900, profundidadeMm: 220, alturaMm: 300 })).model;
    expect(daClasse(dentro, 'EQUIPAMENTO_X_PAREDE')).toHaveLength(1);
    const naFace = applyCommand(m, peca(t, 'EVAPORADORA_HI_WALL', 4500, 3815, 2200, { larguraMm: 900, profundidadeMm: 220, alturaMm: 300 })).model;
    expect(comPecas(naFace).filter((c) => c.classe.startsWith('EQUIPAMENTO_'))).toEqual([]);
  });

  it('a evaporadora a 2,20 m sobre a porta de 2,10 m encosta na verga (50 mm) e não é acusada', () => {
    const { m, t } = sala();
    const x = applyCommand(m, peca(t, 'EVAPORADORA_HI_WALL', 1400, 3815, 2200, { larguraMm: 900, profundidadeMm: 220, alturaMm: 300 })).model;
    expect(daClasse(x, 'EQUIPAMENTO_X_VAO')).toEqual([]);
  });

  it('pilar dentro da caixa: EQUIPAMENTO_X_ESTRUTURA — e o "centro dentro da estrutura" não repete', () => {
    const { m, t } = sala();
    const x = applyBatch(m, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(3000, 2000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 } as Command,
      peca(t, 'CONDENSADORA_SPLIT', 3000, 2000, 350, { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 }),
    ]).model;
    const cond = terminais(x).find((y) => y.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    expect(daClasse(x, 'EQUIPAMENTO_X_ESTRUTURA').map((c) => c.pecaId)).toEqual([cond.id]);
    expect(comPecas(x).filter((c) => c.classe === 'PONTO_X_ESTRUTURA' && c.pecaId === cond.id)).toEqual([]);
    // Sem as caixas, o antigo (centro dentro do pilar) continua valendo.
    expect(conflitosArquitetonicos(x).filter((c) => c.classe === 'PONTO_X_ESTRUTURA' && c.pecaId === cond.id)).toHaveLength(1);
  });

  it('móvel dentro da folga de manutenção (300 mm da condensadora): EQUIPAMENTO_X_COMPONENTE', () => {
    const { m, t } = sala();
    const x = applyBatch(m, [
      peca(t, 'CONDENSADORA_SPLIT', 1400, 3600, 350, { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 }),
      { type: 'AddComponente', levelId: t, tipoId: 'ARMARIO', at: point(1400, 2900) } as Command,
    ]).model;
    expect(daClasse(x, 'EQUIPAMENTO_X_COMPONENTE')).toHaveLength(1);
  });
});

describe('F14 · a iluminação pelas luminárias desenhadas', () => {
  it('sem declaração, a carga usa a soma das luminárias do ambiente (origem: desenho); declarada, vale a declarada', () => {
    const { m, t } = sala();
    const lum = (x: number, w: number): Command => ({ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(x, 2000), cotaMm: 2800, potenciaW: w }) as Command;
    const x = applyBatch(m, [lum(2000, 100), lum(4000, 60)]).model;
    const s = x.spaces[0];
    expect(luminariasDoAmbienteW(x, s.id)).toBe(160);
    expect(luminariasDoAmbienteW(m, s.id)).toBeNull();
    const ctx = { nome: 'Sala', areaPisoM2: 24, peDireitoMm: 2800, temperaturaDoEstudoC: 24, luminariasW: 160 };
    const p = premissasDoAmbiente(undefined, ctx);
    expect(p.iluminacaoW).toBe(160);
    expect(p.iluminacaoWm2).toEqual({ valor: 6.7, origem: 'DESENHO' });
    expect(premissasDoAmbiente({ ...HIPOTESES_DO_AMBIENTE_VAZIAS, iluminacaoWm2: 10 }, ctx).iluminacaoW).toBe(240);
    // A carga do pavimento lê o desenho.
    const amb = cargaTermicaDoNivel(x, hipClima, t).ambientes[0];
    expect(amb.premissas.iluminacaoW).toBe(160);
    expect(amb.premissas.iluminacaoWm2.origem).toBe('DESENHO');
  });
});

describe('F2 · a transição e o colarinho do duto', () => {
  const duto = (t: string, a: [number, number], b: [number, number], altura: number | null): Command =>
    ({ type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(...a), b: point(...b), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 300, ...(altura != null ? { alturaDutoMm: altura } : {}) }) as Command;
  const base = () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    return { m0, t: m0.levels[0].id };
  };

  it('redondo encontrando retangular é TRANSIÇÃO; o ramal redondo saindo do retangular é COLARINHO; tudo retangular segue tê', () => {
    const { m0, t } = base();
    const m = applyBatch(m0, [
      duto(t, [0, 0], [2000, 0], 250),
      duto(t, [2000, 0], [4000, 0], null),
      duto(t, [0, 3000], [2000, 3000], 250),
      duto(t, [2000, 3000], [4000, 3000], 250),
      duto(t, [2000, 3000], [2000, 4500], null),
      duto(t, [0, 6000], [2000, 6000], 250),
      duto(t, [2000, 6000], [4000, 6000], 250),
      duto(t, [2000, 6000], [2000, 7500], 250),
    ]).model;
    const tipoEm = (x: number, y: number) => conexoesDerivadas(m).conexoes.find((c) => c.no.x === x && c.no.y === y)?.tipo;
    expect(tipoEm(2000, 0)).toBe('TRANSICAO');
    expect(tipoEm(2000, 3000)).toBe('COLARINHO');
    expect(tipoEm(2000, 6000)).toBe('TE');
    const porConexao = computeQuantities(m, POLITICA_PADRAO).totais.porConexao ?? [];
    expect(porConexao.some((c) => c.tipo === 'TRANSICAO')).toBe(true);
    expect(porConexao.some((c) => c.tipo === 'COLARINHO')).toBe(true);
    expect(POLITICA_PADRAO.version).toBe('quant-1.28.0');
  });
});

describe('F1 · o raio da curva da linha em diâmetros', () => {
  it('raio = diâmetro × fator, arredondado para cima de 5 em 5 mm; o fator é premissa', () => {
    expect(HIPOTESES_DA_LINHA_PADRAO.raioDaCurvaEmDiametros).toBe(4);
    expect(raioMinimoDaCurvaMm(10)).toBe(40);
    expect(raioMinimoDaCurvaMm(6)).toBe(25);
    expect(raioMinimoDaCurvaMm(6, 5)).toBe(30);
    expect(hipotesesClimatizacaoDaColuna({ linha: { raioDaCurvaEmDiametros: 6 } }).linha.raioDaCurvaEmDiametros).toBe(6);
    expect(hipotesesClimatizacaoDaColuna({ linha: { raioDaCurvaEmDiametros: 99 } }).linha.raioDaCurvaEmDiametros).toBe(4);
  });
});
