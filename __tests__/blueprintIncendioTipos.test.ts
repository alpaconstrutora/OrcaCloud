/**
 * INCÊNDIO E1.1 (30/09/2026, kernel 0.79.0): a disciplina `INCENDIO`, os dez
 * pontos da rede de combate e o fator K / posição do sprinkler. Molde:
 * `blueprintPontoHidraulicoTipos.test.ts` (a taxonomia geral já cobre ficha,
 * grupo e inventário de todo tipo — aqui o que é próprio do incêndio).
 */
import { describe, expect, it } from 'vitest';
import {
  DISCIPLINAS,
  DISCIPLINAS_DO_PONTO_HIDRAULICO,
  applyBatch,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  conexoesDerivadas,
  payloadDoHash,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  POLITICA_PADRAO,
  computeQuantities,
  type BlueprintModel,
  type Command,
  type TipoDePontoHidraulico,
} from '../utils/blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from '../utils/blueprintHidraulica';
import { COR_DA_DISCIPLINA, ROTULO_DA_DISCIPLINA } from '../utils/blueprintRede';
import { gerarIfc } from '../utils/blueprintIfc';

const TIPOS_DE_INCENDIO: TipoDePontoHidraulico[] = [
  'HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'HIDRANTE_RECALQUE', 'SPRINKLER',
  'VGA', 'CHAVE_FLUXO', 'BOMBA_INCENDIO', 'BOMBA_JOCKEY', 'PRESSOSTATO',
];

function base(): { m: BlueprintModel; l: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}
const ponto = (levelId: string, tipoHidraulico: TipoDePontoHidraulico, x: number, y: number, cotaMm: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId, disciplina: 'INCENDIO', tipo: tipoHidraulico, at: point(x, y), cotaMm, tipoHidraulico, ...extra }) as Command;

describe('incêndio E1.1 · a disciplina e os tipos', () => {
  it('INCENDIO é disciplina, com cor própria (não o vermelho da água quente) e rótulo', () => {
    expect(DISCIPLINAS).toContain('INCENDIO');
    expect(COR_DA_DISCIPLINA.INCENDIO).not.toBe(COR_DA_DISCIPLINA.AGUA_QUENTE);
    expect(ROTULO_DA_DISCIPLINA.INCENDIO).toBe('Incêndio');
  });

  it('os dez tipos existem só na rede de incêndio, com ficha no grupo de incêndio', () => {
    for (const t of TIPOS_DE_INCENDIO) {
      expect(DISCIPLINAS_DO_PONTO_HIDRAULICO[t]).toEqual(['INCENDIO']);
      expect(FICHA_DO_PONTO_HIDRAULICO[t].grupo).toMatch(/^Incêndio — /);
      expect(FICHA_DO_PONTO_HIDRAULICO[t].cotaMm.INCENDIO).toBeTypeOf('number');
    }
    // Gaveta, retenção e conexões forçadas servem também à rede de incêndio.
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.REGISTRO_GAVETA).toContain('INCENDIO');
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.VALVULA_RETENCAO).toContain('INCENDIO');
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.CONEXAO_TE).toContain('INCENDIO');
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.REGISTRO_PRESSAO).not.toContain('INCENDIO');
  });

  it('⚠️ a invariante recusa hidrante na água fria', () => {
    const { m, l } = base();
    expect(() =>
      applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'AGUA_FRIA', tipo: 'H', at: point(0, 0), cotaMm: 1300, tipoHidraulico: 'HIDRANTE_SIMPLES' } as Command),
    ).toThrow();
  });
});

describe('incêndio E1.1 · fator K e posição do sprinkler', () => {
  it('sprinkler sem K declarado: o payload não ganha as chaves (a ficha dá K 80)', () => {
    const { m, l } = base();
    const mm = applyCommand(m, ponto(l, 'SPRINKLER', 1000, 1000, 2700)).model;
    const chaves = Object.keys(JSON.parse(payloadDoHash(mm)).terminais[0]);
    expect(chaves).not.toContain('fatorK');
    expect(chaves).not.toContain('posicaoSprinkler');
    expect(FICHA_DO_PONTO_HIDRAULICO.SPRINKLER.fatorK).toBe(80);
  });

  it('K e posição declarados sobrevivem ao ida e volta do canônico', () => {
    const { m, l } = base();
    const mm = applyCommand(m, ponto(l, 'SPRINKLER', 1000, 1000, 2700, { fatorK: 115, posicaoSprinkler: 'EM_PE' })).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(mm)));
    expect(volta.terminais![0]).toMatchObject({ fatorK: 115, posicaoSprinkler: 'EM_PE' });
  });

  it('K no hidrante é ignorado ao criar; trocar o sprinkler de tipo leva K e posição juntos', () => {
    const { m, l } = base();
    const h = applyCommand(m, ponto(l, 'HIDRANTE_SIMPLES', 0, 0, 1300, { fatorK: 115 })).model;
    expect(h.terminais![0].fatorK ?? null).toBeNull();
    const s = applyCommand(m, ponto(l, 'SPRINKLER', 0, 0, 2700, { fatorK: 115, posicaoSprinkler: 'LATERAL' })).model;
    const trocado = applyCommand(s, { type: 'SetTerminalProps', terminalId: s.terminais![0].id, tipoHidraulico: 'VGA' } as Command).model;
    expect(trocado.terminais![0].fatorK ?? null).toBeNull();
    expect(trocado.terminais![0].posicaoSprinkler ?? null).toBeNull();
    assertModelInvariants(trocado);
  });

  it('⚠️ a invariante recusa K fracionário, K zero e posição inventada', () => {
    const { m, l } = base();
    const s = applyCommand(m, ponto(l, 'SPRINKLER', 0, 0, 2700)).model;
    const quebrado = (patch: Record<string, unknown>) => {
      const c = structuredClone(s);
      Object.assign(c.terminais![0], patch);
      return () => assertModelInvariants(c);
    };
    expect(quebrado({ fatorK: 80.5 })).toThrow(/Fator K/);
    expect(quebrado({ fatorK: 0 })).toThrow(/Fator K/);
    expect(quebrado({ posicaoSprinkler: 'DE_LADO' })).toThrow(/Posição/);
  });
});

/** Coluna + ramal de incêndio com um hidrante e um sprinkler — a rede mínima. */
function redeDeIncendio(): BlueprintModel {
  const { m, l } = base();
  return applyBatch(m, [
    { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(0, 0), b: point(4000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65 } as Command,
    { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(4000, 0), b: point(4000, 0), cotaAMm: 2600, cotaBMm: 1300, bitolaMm: 65 } as Command,
    ponto(l, 'HIDRANTE_SIMPLES', 4000, 0, 1300, { rotulo: 'H-1' }),
    ponto(l, 'SPRINKLER', 0, 0, 2600),
  ]).model;
}

describe('incêndio E1.1 · a rede', () => {
  it('as conexões derivadas valem para a rede de incêndio: o joelho da descida e nenhuma ponta aberta', () => {
    const c = conexoesDerivadas(redeDeIncendio());
    expect(c.conexoes.filter((x) => x.disciplina === 'INCENDIO').map((x) => x.tipo)).toEqual(['JOELHO_90']);
    expect(c.pontasAbertas).toEqual([]);
  });

  it('o quantitativo conta tubo de incêndio e as peças pela classificação', () => {
    const q = computeQuantities(redeDeIncendio(), POLITICA_PADRAO);
    const texto = JSON.stringify(q);
    expect(texto).toContain('INCENDIO');
    expect(texto).toContain('SPRINKLER');
    expect(texto).toContain('HIDRANTE_SIMPLES');
  });
});

describe('incêndio E1.1 · IFC', () => {
  it('⚠️ as entidades de incêndio saem no arquivo e o web-ifc as lê nos campos certos', async () => {
    const step = gerarIfc(redeDeIncendio(), { titulo: 'incêndio', revisao: 1, hash: 'r'.repeat(64), data: new Date('2026-09-30T12:00:00Z') });
    expect(step).toContain("IFCFIRESUPPRESSIONTERMINAL");
    expect(step).toContain('.FIREHYDRANT.');
    expect(step).toContain('.SPRINKLER.');
    expect(step).toContain('.FIREPROTECTION.');

    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const id = (api.OpenModel as (d: Uint8Array) => number)(new TextEncoder().encode(step));
    const ler = (tipo: number) => {
      const ids = (api.GetLineIDsWithType as (m: number, t: number) => { size(): number; get(i: number): number })(id, tipo);
      return Array.from({ length: ids.size() }, (_, i) => (api.GetLine as (m: number, e: number) => Record<string, unknown>)(id, ids.get(i)));
    };
    const terminais = ler(tipos.IFCFIRESUPPRESSIONTERMINAL);
    expect(terminais).toHaveLength(2);
    const predef = terminais.map((t) => String((t.PredefinedType as { value?: string })?.value)).sort();
    expect(predef).toEqual(['FIREHYDRANT', 'SPRINKLER']);
    // Se a contagem de atributos estivesse errada, a classificação cairia em outro campo.
    const objectTypes = terminais.map((t) => (t.ObjectType as { value?: string })?.value).sort();
    expect(objectTypes).toEqual(['HIDRANTE_SIMPLES', 'SPRINKLER']);
    const sistemas = ler(tipos.IFCDISTRIBUTIONSYSTEM).map((x) => String((x.PredefinedType as { value?: string })?.value));
    expect(sistemas).toContain('FIREPROTECTION');
  });
});
