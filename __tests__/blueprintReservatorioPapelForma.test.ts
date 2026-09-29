/**
 * E4.2 — PAPEL, FORMA E PEÇAS DA CAIXA D'ÁGUA (29/09/2026, roadmap
 * hidrossanitário): o kernel guarda o papel (SUPERIOR/INFERIOR) e a forma
 * (PRISMA/CILINDRO) do reservatório; o INFERIOR não distribui; o cilindro tem
 * volume e pegada de cilindro; boia, extravasor e limpeza saem num lote.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  assertModelInvariants,
  emptyModel,
  canonicalPayload,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { origensDeAgua } from '../utils/blueprintAguaAutomatica';
import { HIPOTESES_RESERVATORIO_PADRAO, dimensionarReservacao, volumeDoReservatorioL } from '../utils/blueprintReservacao';
import { pegadaDoReservatorio2D } from '../utils/blueprintIsometrico';
import { dnDoExtravasor, planejarPecasDaCaixa, ROTULO_DA_LIMPEZA, ROTULO_DO_EXTRAVASOR } from '../utils/blueprintPecasDaCaixa';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';

function comCaixa(extra: Partial<Extract<Command, { type: 'AddTerminal' }>> = {}): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  let r = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(1000, 1000), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', ...extra }).model;
  r = applyCommand(r, { type: 'SetTerminalProps', terminalId: r.terminais![0].id, larguraMm: 1200, profundidadeMm: 1000, alturaMm: 800 }).model;
  return r;
}

describe('E4.2 — o kernel', () => {
  it('papel e forma pelo AddTerminal e pelo SetTerminalProps; null volta ao padrão', () => {
    const m = comCaixa({ papelReservatorio: 'INFERIOR', formaReservatorio: 'CILINDRO' });
    const cx = m.terminais![0];
    expect(cx).toMatchObject({ papelReservatorio: 'INFERIOR', formaReservatorio: 'CILINDRO' });
    const volta = applyCommand(m, { type: 'SetTerminalProps', terminalId: cx.id, papelReservatorio: null, formaReservatorio: null }).model.terminais![0];
    expect(volta.papelReservatorio).toBeNull();
    expect(volta.formaReservatorio).toBeNull();
  });

  it('deixar de ser reservatório leva papel e forma juntos; em outra peça a invariante recusa', () => {
    const m = comCaixa({ papelReservatorio: 'INFERIOR' });
    const outro = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, tipoHidraulico: 'TORNEIRA' }).model.terminais![0];
    expect(outro.papelReservatorio).toBeNull();
    const errado = { ...m, terminais: [{ ...m.terminais![0], tipoHidraulico: 'TORNEIRA' as const }] };
    expect(() => assertModelInvariants(errado)).toThrow(/não é reservatório/);
    const vocabulario = { ...m, terminais: [{ ...m.terminais![0], formaReservatorio: 'ESFERA' as never }] };
    expect(() => assertModelInvariants(vocabulario)).toThrow(/Forma de reservatório inválida/);
  });

  it('canônico: omitido quando ausente (desenho anterior não muda) e ida e volta quando declarado', () => {
    expect(canonicalPayload(comCaixa())).not.toMatch(/papelReservatorio|formaReservatorio/);
    const m = comCaixa({ papelReservatorio: 'INFERIOR', formaReservatorio: 'CILINDRO' });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.terminais![0]).toMatchObject({ papelReservatorio: 'INFERIOR', formaReservatorio: 'CILINDRO' });
  });
});

describe('E4.2 — o papel e a forma em uso', () => {
  it('o INFERIOR não é origem da água fria; o superior (e o sem papel) é', () => {
    expect(origensDeAgua(comCaixa())).toHaveLength(1);
    expect(origensDeAgua(comCaixa({ papelReservatorio: 'SUPERIOR' }))).toHaveLength(1);
    expect(origensDeAgua(comCaixa({ papelReservatorio: 'INFERIOR' }))).toHaveLength(0);
  });

  it('cilindro: volume pelo diâmetro (π · 0,6² · 0,8 = 905 L) e pegada redonda', () => {
    const cx = comCaixa({ formaReservatorio: 'CILINDRO' }).terminais![0];
    expect(volumeDoReservatorioL(cx)).toBe(905);
    expect(pegadaDoReservatorio2D(cx)).toEqual({ forma: 'CILINDRO', larguraMm: 1200, profundidadeMm: 1200 });
    expect(pegadaDoReservatorio2D(comCaixa().terminais![0])).toEqual({ forma: 'PRISMA', larguraMm: 1200, profundidadeMm: 1000 });
  });

  it('a reservação divide 60/40 quando o desenho tem um INFERIOR', () => {
    const m = comCaixa({ papelReservatorio: 'INFERIOR' });
    const r = dimensionarReservacao(m, { ...HIPOTESES_RESERVATORIO_PADRAO, populacaoDeclarada: 5 });
    expect(r.volumeNecessarioL).toBe(1000);
    expect(r.inferiorNecessarioL).toBeCloseTo(600);
    expect(r.superiorNecessarioL).toBeCloseTo(400);
  });
});

describe('E4.2 — boia, extravasor e limpeza', () => {
  it('extravasor um DN acima da alimentação', () => {
    expect(dnDoExtravasor(25)).toBe(32);
    expect(dnDoExtravasor(20)).toBe(25);
  });

  it('lança as três num lote, sugeridas, do lado +x da caixa; depois de lançadas, nada a lançar', () => {
    const m = comCaixa();
    const plano = planejarPecasDaCaixa(m, m.terminais![0]);
    expect(plano.resumo).toEqual(['torneira de boia', 'extravasor DN 32', 'limpeza DN 32 com registro']);
    const depois = applyBatch(m, plano.comandos).model;
    const boia = depois.terminais!.find((t) => t.tipoHidraulico === 'TORNEIRA_BOIA')!;
    expect(boia).toMatchObject({ cotaMm: 2800 + 800 - 100, sugerida: true });
    const extravasor = depois.trechos!.find((t) => t.rotulo === ROTULO_DO_EXTRAVASOR)!;
    expect(extravasor).toMatchObject({ bitolaMm: 32, cotaAMm: 3400, sugerido: true, a: { x: 1600, y: 850 }, b: { x: 2200, y: 850 } });
    const limpeza = depois.trechos!.find((t) => t.rotulo === ROTULO_DA_LIMPEZA)!;
    expect(limpeza).toMatchObject({ cotaAMm: 2800, cotaBMm: 2800 });
    expect(depois.terminais!.some((t) => t.tipoHidraulico === 'REGISTRO_GAVETA')).toBe(true);
    expect(planejarPecasDaCaixa(depois, depois.terminais![0]).comandos).toEqual([]);
  });

  it('a caixa girada 90° leva as peças para +y; e a verificação NÃO acusa a descarga livre', () => {
    const m0 = comCaixa();
    const m = applyCommand(m0, { type: 'SetTerminalProps', terminalId: m0.terminais![0].id, rotacaoGraus: 90 }).model;
    const depois = applyBatch(m, planejarPecasDaCaixa(m, m.terminais![0]).comandos).model;
    const extravasor = depois.trechos!.find((t) => t.rotulo === ROTULO_DO_EXTRAVASOR)!;
    expect(extravasor.a).toEqual({ x: 1150, y: 1600 });
    expect(extravasor.b).toEqual({ x: 1150, y: 2200 });
    expect(marcasDeVerificacao(depois).filter((x) => x.tipo === 'PONTA_ABERTA')).toEqual([]);
  });
});
