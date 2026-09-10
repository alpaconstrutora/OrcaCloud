/**
 * A CONFERÊNCIA NBR 5410 — fatia 3 (10/09/2026).
 *
 * *"Analise estes itens da norma nbr 5410"* → *"Aceito o painel"*.
 *
 * Cada regra é medida nas DUAS direções: dispara no desenho que fere a norma
 * e fica calada no desenho que atende. E o que não dá para avaliar (sem
 * tensão, sem tipo, sem potência) sai em `naoAvaliado`, nunca em silêncio.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type TipoDeAmbiente,
  type TipoDePontoEletrico,
} from '../utils/blueprintKernel';
import { conferirNbr5410, ehAquecedorDeAgua, minimoDePotencia } from '../utils/blueprintNbr5410';

/** Duas salas de 4 × 4 lado a lado (eixo), paredes de 150. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });
  return applyBatch(base, [
    p(0, 0, 8000, 0),
    p(8000, 0, 8000, 4000),
    p(8000, 4000, 0, 4000),
    p(0, 4000, 0, 0),
    p(4000, 0, 4000, 4000),
  ]).model;
}

const classificar = (m: BlueprintModel, idx: number, name: string, tipoDeAmbiente: TipoDeAmbiente) =>
  applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[idx].id, name, tipoDeAmbiente }).model;

const quadro = (m: BlueprintModel) =>
  applyCommand(m, { type: 'AddQuadro', levelId: m.levels[0].id, nome: 'QDC', at: point(100, 100), cotaMm: 1600 })
    .model;

const circuito = (m: BlueprintModel, nome: string, tensaoV: number | null = 127) => {
  const c = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome }).model;
  const id = c.circuitos[c.circuitos.length - 1].id;
  return { m: applyCommand(c, { type: 'SetCircuitoProps', circuitoId: id, tensaoV }).model, id };
};

const ponto = (
  m: BlueprintModel,
  x: number,
  y: number,
  tipoEletrico: TipoDePontoEletrico | null,
  extras: { potenciaW?: number | null; circuitoId?: string | null; tipo?: string; cotaMm?: number } = {},
) => {
  const criado = applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: extras.tipo ?? tipoEletrico ?? 'Ponto',
    at: point(x, y),
    cotaMm: extras.cotaMm ?? 300,
    tipoEletrico,
  }).model;
  const id = criado.terminais[criado.terminais.length - 1].id;
  return applyCommand(criado, {
    type: 'SetTerminalProps',
    terminalId: id,
    potenciaW: extras.potenciaW ?? null,
    circuitoId: extras.circuitoId ?? null,
  }).model;
};

const regra = (m: BlueprintModel, codigo: string) =>
  conferirNbr5410(m).regras.find((r) => r.codigo === codigo)!;

// Sala esquerda: x ∈ (0, 4000); direita: x ∈ (4000, 8000).
const ESQ = { x: 2000, y: 75 };
const DIR = { x: 6000, y: 75 };

describe('9.5.2.2.1 · mínimo por ambiente', () => {
  it('ambiente sem tipo vai para "não avaliado", não para falta nem para atende', () => {
    const r = regra(casa(), '9.5.2.2.1');
    expect(r.achados).toEqual([]);
    expect(r.avaliados).toBe(0);
    expect(r.naoAvaliado.join(' ')).toMatch(/2 ambientes sem tipo/);
  });

  it('sala classificada e vazia: FALTA com o mínimo e a regra', () => {
    const m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    const r = regra(m, '9.5.2.2.1');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].nivel).toBe('FALTA');
    expect(r.achados[0].mensagem).toMatch(/^Sala: mín\. 4/); // 15,4 m ÷ 5 → 4
  });

  it('atendida: cala', () => {
    let m = classificar(casa(), 0, 'Varanda', 'VARANDA');
    m = ponto(m, ESQ.x, ESQ.y, 'TUG');
    expect(regra(m, '9.5.2.2.1').achados).toEqual([]);
  });
});

describe('9.5.2.2.2 · potência mínima', () => {
  it('a viabilidade: as k maiores ≥ 600, as demais ≥ 100', () => {
    expect(minimoDePotencia('COZINHA_SERVICO', [600, 600, 600, 100], false).falhas).toBe(0);
    // Qual tomada leva 600 é escolha do projetista: [100, 600, 600, 600] passa.
    expect(minimoDePotencia('COZINHA_SERVICO', [100, 600, 600, 600], false).falhas).toBe(0);
    expect(minimoDePotencia('COZINHA_SERVICO', [600, 600, 100, 100], false).falhas).toBe(1);
    // Com o conjunto molhado acima de 6 tomadas, k cai para 2.
    expect(minimoDePotencia('COZINHA_SERVICO', [600, 600, 100, 100], true).falhas).toBe(0);
    expect(minimoDePotencia('SALA_DORMITORIO', [100, 100, 60], false).falhas).toBe(1);
  });

  it('⚠️ cozinha com uma tomada de 100 VA: FALTA; sem potência: AVISO, não falta', () => {
    let m = classificar(casa(), 0, 'Cozinha', 'COZINHA_SERVICO');
    m = ponto(m, 1000, 75, 'TUG', { potenciaW: 100 });
    m = ponto(m, 2000, 75, 'TUG'); // sem potência
    const r = regra(m, '9.5.2.2.2');
    expect(r.achados.map((a) => a.nivel).sort()).toEqual(['AVISO', 'FALTA']);
    expect(r.achados.find((a) => a.nivel === 'FALTA')!.mensagem).toMatch(/1 tomada abaixo do mínimo/);
  });

  it('atendida: cala', () => {
    let m = classificar(casa(), 0, 'Quarto', 'SALA_DORMITORIO');
    m = ponto(m, 1000, 75, 'TUG', { potenciaW: 100 });
    expect(regra(m, '9.5.2.2.2').achados).toEqual([]);
  });
});

describe('9.5.2.3 · aquecedor de água sem tomada', () => {
  it('reconhece pelo texto: chuveiro, aquecedor, boiler, ducha, torneira elétrica', () => {
    const t = (tipo: string, rotulo: string | null = null) =>
      ({ tipo, rotulo }) as Parameters<typeof ehAquecedorDeAgua>[0];
    expect(ehAquecedorDeAgua(t('Chuveiro'))).toBe(true);
    expect(ehAquecedorDeAgua(t('TUE', 'aquecedor de passagem'))).toBe(true);
    expect(ehAquecedorDeAgua(t('TUE', 'Torneira elétrica'))).toBe(true);
    expect(ehAquecedorDeAgua(t('TUE', 'micro-ondas'))).toBe(false);
  });

  it('⚠️ chuveiro em TUE é FALTA, com a ação de converter; em ligação direta, cala', () => {
    const errado = ponto(casa(), ESQ.x, ESQ.y, 'TUE', { tipo: 'Chuveiro' });
    const r = regra(errado, '9.5.2.3');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].nivel).toBe('FALTA');
    expect(r.achados[0].acao).toEqual({
      tipo: 'CONVERTER_LIGACAO_DIRETA',
      terminalIds: [errado.terminais[0].id],
    });

    const certo = ponto(casa(), ESQ.x, ESQ.y, 'LIGACAO_DIRETA', { tipo: 'Chuveiro' });
    expect(regra(certo, '9.5.2.3').achados).toEqual([]);
  });

  it('converter é SetTerminalProps — posição, potência e circuito ficam', () => {
    let m = quadro(casa());
    const { m: m2, id: c1 } = circuito(m, 'C1', 220);
    m = ponto(m2, ESQ.x, ESQ.y, 'TUE', { tipo: 'Chuveiro', potenciaW: 5500, circuitoId: c1 });
    const t = m.terminais[0];
    const depois = applyCommand(m, { type: 'SetTerminalProps', terminalId: t.id, tipoEletrico: 'LIGACAO_DIRETA' })
      .model;
    expect(depois.terminais[0]).toMatchObject({ at: t.at, potenciaW: 5500, circuitoId: c1, tipoEletrico: 'LIGACAO_DIRETA' });
    expect(regra(depois, '9.5.2.3').achados).toEqual([]);
  });
});

describe('9.5.3.1 · > 10 A em circuito independente', () => {
  it('⚠️ chuveiro de 5.500 VA em 220 V (25 A) dividindo circuito com uma TUG: FALTA', () => {
    let m = quadro(casa());
    const { m: m2, id: c1 } = circuito(m, 'C1', 220);
    m = ponto(m2, ESQ.x, ESQ.y, 'LIGACAO_DIRETA', { tipo: 'Chuveiro', potenciaW: 5500, circuitoId: c1 });
    m = ponto(m, 3000, 75, 'TUG', { potenciaW: 100, circuitoId: c1 });
    const r = regra(m, '9.5.3.1');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].mensagem).toMatch(/25,0 A/);
    expect(r.achados[0].ids).toHaveLength(2);
  });

  it('sozinho no circuito: cala. Sem tensão: não avaliado, dito', () => {
    let m = quadro(casa());
    const { m: m2, id: c1 } = circuito(m, 'C1', 220);
    m = ponto(m2, ESQ.x, ESQ.y, 'LIGACAO_DIRETA', { tipo: 'Chuveiro', potenciaW: 5500, circuitoId: c1 });
    expect(regra(m, '9.5.3.1').achados).toEqual([]);
    expect(regra(m, '9.5.3.1').avaliados).toBe(1);

    const { m: m3, id: c2 } = circuito(m, 'C2', null);
    const semTensao = ponto(m3, 3000, 75, 'TUE', { tipo: 'Forno', potenciaW: 3000, circuitoId: c2 });
    const r = regra(semTensao, '9.5.3.1');
    expect(r.naoAvaliado.join(' ')).toMatch(/Forno/);
  });

  it('⚠️ 10 A exatos NÃO é "superior a 10 A"', () => {
    let m = quadro(casa());
    const { m: m2, id: c1 } = circuito(m, 'C1', 127);
    m = ponto(m2, ESQ.x, ESQ.y, 'TUE', { tipo: 'Micro-ondas', potenciaW: 1270, circuitoId: c1 });
    m = ponto(m, 3000, 75, 'TUG', { potenciaW: 100, circuitoId: c1 });
    expect(regra(m, '9.5.3.1').achados).toEqual([]);
  });
});

describe('9.5.3.2 · cozinha em circuito exclusivo', () => {
  it('⚠️ circuito com TUG da cozinha E luz da sala: FALTA', () => {
    let m = classificar(casa(), 0, 'Cozinha', 'COZINHA_SERVICO');
    m = classificar(m, 1, 'Sala', 'SALA_DORMITORIO');
    m = quadro(m);
    const { m: m2, id: c1 } = circuito(m, 'C1');
    m = ponto(m2, ESQ.x, ESQ.y, 'TUG', { circuitoId: c1 });
    m = ponto(m, DIR.x, 2000, 'ILUMINACAO_TETO', { circuitoId: c1, cotaMm: 2800 });
    const r = regra(m, '9.5.3.2');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].mensagem).toMatch(/C1 alimenta tomadas de cozinha\/serviço E 1 outro ponto/);
  });

  it('só tomadas de cozinha/serviço no circuito — de DUAS cozinhas, até: cala', () => {
    let m = classificar(casa(), 0, 'Cozinha', 'COZINHA_SERVICO');
    m = classificar(m, 1, 'Área de serviço', 'COZINHA_SERVICO');
    m = quadro(m);
    const { m: m2, id: c1 } = circuito(m, 'C1');
    m = ponto(m2, ESQ.x, ESQ.y, 'TUG', { circuitoId: c1 });
    m = ponto(m, DIR.x, DIR.y, 'TUG', { circuitoId: c1 });
    expect(regra(m, '9.5.3.2').achados).toEqual([]);
  });
});

describe('9.5.3.3 · circuito comum', () => {
  function comum(opcoes: { tensao?: number | null; potencias?: number[]; luzesFora?: boolean; tomadasFora?: boolean }) {
    let m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    m = classificar(m, 1, 'Quarto', 'SALA_DORMITORIO');
    m = quadro(m);
    const { m: m2, id: c1 } = circuito(m, 'C1', opcoes.tensao === undefined ? 127 : opcoes.tensao);
    const { m: m3, id: c2 } = circuito(m2, 'C2', 127);
    m = m3;
    const [pLuz = 100, pTom = 100] = opcoes.potencias ?? [];
    // C1 é comum: uma luz e uma tomada da sala.
    m = ponto(m, 1000, 2000, 'ILUMINACAO_TETO', { circuitoId: c1, potenciaW: pLuz, cotaMm: 2800 });
    m = ponto(m, 2000, 75, 'TUG', { circuitoId: c1, potenciaW: pTom });
    // Fora dele, no quarto, quando pedido: outra luz / outra tomada em C2.
    if (opcoes.luzesFora) m = ponto(m, 6000, 2000, 'ILUMINACAO_TETO', { circuitoId: c2, potenciaW: 100, cotaMm: 2800 });
    if (opcoes.tomadasFora) m = ponto(m, 6000, 75, 'TUG', { circuitoId: c2, potenciaW: 100 });
    return m;
  }

  it('⚠️ IB > 16 A: FALTA (2.200 VA em 127 V = 17,3 A)', () => {
    const m = comum({ potencias: [1100, 1100], luzesFora: true, tomadasFora: true });
    const r = regra(m, '9.5.3.3');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].mensagem).toMatch(/17,3 A > 16 A/);
  });

  it('⚠️ toda a iluminação num só circuito comum: FALTA; com outra luz fora, cala', () => {
    const tudoJunto = regra(comum({ tomadasFora: true }), '9.5.3.3');
    expect(tudoJunto.achados.map((a) => a.mensagem).join(' ')).toMatch(/TODA a iluminação/);
    expect(regra(comum({ luzesFora: true, tomadasFora: true }), '9.5.3.3').achados).toEqual([]);
  });

  it('⚠️ todas as tomadas num só circuito comum: FALTA', () => {
    const r = regra(comum({ luzesFora: true }), '9.5.3.3');
    expect(r.achados.map((a) => a.mensagem).join(' ')).toMatch(/TODAS as tomadas/);
  });

  it('sem tensão a corrente não se calcula — dito em "não avaliado", sem falta inventada', () => {
    const r = regra(comum({ tensao: null, luzesFora: true, tomadasFora: true }), '9.5.3.3');
    expect(r.achados).toEqual([]);
    expect(r.naoAvaliado.join(' ')).toMatch(/C1: sem tensão/);
  });
});

describe('o conjunto', () => {
  it('oito regras, sempre na mesma ordem; faltas e avisos somados', () => {
    let m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    m = ponto(m, ESQ.x, ESQ.y, 'TUE', { tipo: 'Chuveiro' });
    const c = conferirNbr5410(m);
    expect(c.regras.map((r) => r.codigo)).toEqual([
      '9.5.2.1',
      '9.5.2.2.1',
      '9.5.2.2.2',
      '9.5.2.3',
      '9.5.3.1',
      '9.5.3.2',
      '9.5.3.3',
      'SUGERIDAS',
    ]);
    // Sala vazia de TUG (falta) + chuveiro em TUE (falta) + TUE sem potência (aviso)
    // + as DUAS salas sem luz de teto nem interruptor (9.5.2.1, uma falta cada).
    expect(c.faltas).toBe(4);
    expect(c.avisos).toBe(1);
  });

  it('as sugeridas aparecem como AVISO, com os ids', () => {
    const m = applyCommand(casa(), {
      type: 'AddTerminal',
      levelId: casa().levels[0].id,
      disciplina: 'ELETRICA',
      tipo: 'TUG',
      at: point(1000, 75),
      cotaMm: 300,
      tipoEletrico: 'TUG',
      sugerida: true,
    }).model;
    const r = regra(m, 'SUGERIDAS');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].ids).toEqual([m.terminais[0].id]);
  });
});
