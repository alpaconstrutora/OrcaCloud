/**
 * As três convenções que faltavam da prancha elétrica (09/09/2026).
 *
 * Vindas de um print de projeto real, com o pedido "implemente tudo":
 *
 *   1. o número dentro do círculo da luminária — a POTÊNCIA;
 *   2. o `#2,5` ao lado do traço — a SEÇÃO do condutor, e os traços cruzando a
 *      linha que dizem quantos fios passam;
 *   3. as letras "a", "b", "c" — o COMANDO que liga interruptor e ponto de luz.
 *
 * ⚠️ Duas exigiram campo novo no kernel; a primeira não: `potenciaW` já existia
 * e só não estava sendo desenhada.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';

/** Um desenho com quadro, circuito, um trecho e uma luminária. */
function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, {
    type: 'AddQuadro',
    levelId,
    nome: 'QDC',
    at: point(0, 0),
    cotaMm: 1600,
  }).model;
  m = applyCommand(m, {
    type: 'AddCircuito',
    quadroId: m.quadros[0].id,
    nome: 'C1',
    secaoMm2: 2.5,
  }).model;
  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Luminária',
    at: point(3000, 0),
    cotaMm: 2800,
    tipoEletrico: 'ILUMINACAO_TETO',
  }).model;
  return applyCommand(m, {
    type: 'AddTrecho',
    levelId,
    disciplina: 'ELETRICA',
    a: point(0, 0),
    b: point(3000, 0),
    cotaAMm: 2800,
    cotaBMm: 2800,
    bitolaMm: 25,
  }).model;
}

describe('prancha · o circuito e os condutores do TRECHO', () => {
  it('⚠️ a SEÇÃO não é campo do trecho — ela é a do circuito', () => {
    // Um número próprio no trecho poderia divergir do quadro de cargas, e a
    // prancha diria 2,5 num traço que a tabela soma como 4.
    const m = cena();
    const comCircuito = applyCommand(m, {
      type: 'SetTrechoProps',
      trechoId: m.trechos[0].id,
      circuitoId: m.circuitos[0].id,
    }).model;
    expect(comCircuito.trechos[0].circuitoId).toBe(m.circuitos[0].id);
    expect(m.circuitos[0].secaoMm2).toBe(2.5);
    // E o trecho NÃO ganhou um campo de seção.
    expect('secaoMm2' in comCircuito.trechos[0]).toBe(false);
  });

  it('os CONDUTORES são declarados, e inteiros positivos', () => {
    const m = cena();
    const id = m.trechos[0].id;
    expect(applyCommand(m, { type: 'SetTrechoProps', trechoId: id, condutores: 3 }).model
      .trechos[0].condutores).toBe(3);
    // ⚠️ Zero é eletroduto vazio: não alimenta nada e ainda assim sairia
    // desenhado como se alimentasse.
    expect(() =>
      applyCommand(m, { type: 'SetTrechoProps', trechoId: id, condutores: 0 }),
    ).toThrow();
  });

  it('⚠️ trecho de outra disciplina NÃO pode ter circuito', () => {
    const m = cena();
    const agua = applyCommand(m, {
      type: 'AddTrecho',
      levelId: m.levels[0].id,
      disciplina: 'AGUA_FRIA',
      a: point(0, 500),
      b: point(1000, 500),
      cotaAMm: 0,
      cotaBMm: 0,
      bitolaMm: 25,
    }).model;
    const sujo = {
      ...agua,
      trechos: agua.trechos.map((t, i) =>
        i === 1 ? { ...t, circuitoId: agua.circuitos[0].id } : t,
      ),
    };
    try {
      assertModelInvariants(sujo);
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('BAD_RUN_CIRCUIT');
    }
  });

  it('⚠️ a leitura do canônico traz o circuito do trecho — a ORDEM importa', () => {
    // Os trechos eram lidos ANTES dos circuitos. Aqui a armadilha é pior que um
    // TDZ: não estoura — a lista vazia devolveria todo trecho SEM circuito,
    // calado, e o desenho voltaria sem as seções.
    const m = cena();
    const ligado = applyCommand(m, {
      type: 'SetTrechoProps',
      trechoId: m.trechos[0].id,
      circuitoId: m.circuitos[0].id,
      condutores: 3,
    }).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(ligado)));
    expect(volta.trechos[0].circuitoId).toBe(volta.circuitos[0].id);
    expect(volta.trechos[0].condutores).toBe(3);
  });
});

describe('prancha · a LETRA do comando', () => {
  it('sobrevive ao ida e volta', () => {
    const m = cena();
    const comLetra = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      comando: 'a',
    }).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(comLetra)));
    expect(volta.terminais[0].comando).toBe('a');
  });

  it('⚠️ é uma LETRA, não um texto — o espaço no desenho é de um caractere', () => {
    const m = cena();
    const sujo = {
      ...m,
      terminais: [{ ...m.terminais[0], comando: 'interruptor da sala' }],
    };
    try {
      assertModelInvariants(sujo);
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('BAD_COMMAND');
    }
  });

  it('a mesma letra em dois pontos é o normal — é assim que se comanda', () => {
    // Interruptor "a" e luminária "a" são o par. Um vínculo tipado obrigaria a
    // criar e apagar relações para o que se escreve com uma letra.
    const m = cena();
    const outro = applyCommand(m, {
      type: 'AddTerminal',
      levelId: m.levels[0].id,
      disciplina: 'ELETRICA',
      tipo: 'Interruptor',
      at: point(500, 500),
      cotaMm: 1100,
      comando: 'a',
    } as never).model;
    const comLetra = applyCommand(outro, {
      type: 'SetTerminalProps',
      terminalId: outro.terminais[0].id,
      comando: 'a',
    }).model;
    expect(comLetra.terminais.filter((t) => t.comando === 'a')).toHaveLength(2);
    expect(() => assertModelInvariants(comLetra)).not.toThrow();
  });
});

describe('prancha · nada disso muda o hash de quem não usa', () => {
  it('⚠️ os três campos SOMEM do payload quando ausentes', () => {
    const payload = JSON.parse(payloadDoHash(cena()));
    for (const chave of ['circuito', 'condutores']) {
      expect(Object.keys(payload.trechos[0]), chave).not.toContain(chave);
    }
    expect(Object.keys(payload.terminais[0])).not.toContain('comando');
  });
});
