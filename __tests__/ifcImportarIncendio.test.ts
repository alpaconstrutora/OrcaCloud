/**
 * INCÊNDIO E9.3 (01/10/2026): o IFC de incêndio — exportar com as classes e o
 * Pset de incêndio, a placa como IfcSign no IFC4X3, e IMPORTAR de volta pelo
 * web-ifc (molde da elétrica E7.2): a ida e volta preserva tipo, posição e
 * cota; a água não entra como incêndio, e a luminária de emergência não entra
 * duas vezes (a elétrica deixa de ler o que está no sistema de incêndio).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { COBERTURA_IFC, gerarIfc, type OpcoesIfc } from '../utils/blueprintIfc';
import { comandosDoIncendio, tipoDoPontoDeIncendioIfc, traduzirEletrica, traduzirIncendio } from '../utils/ifcParaKernel';
import { eDeIncendio } from '../services/ifcParametricoService';

const PECAS = ['HIDRANTE_SIMPLES', 'MANGOTINHO', 'HIDRANTE_RECALQUE', 'SPRINKLER', 'BOMBA_INCENDIO', 'EXTINTOR', 'PLACA', 'LUMINARIA_EMERGENCIA', 'DETECTOR_FUMACA', 'DETECTOR_TEMPERATURA', 'ACIONADOR_MANUAL', 'AVISADOR', 'CENTRAL_ALARME'];

/** Dois pavimentos: no de cima, uma peça de cada tipo de incêndio e um tubo; no térreo, água (torneira e tubo) e uma luz comum. */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 }).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  const inc = (tipo: string, i: number, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTerminal', levelId: t1, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(1000 + i * 1500, 3000), cotaMm: 1300, ...extra }) as Command;
  return applyBatch(m, [
    ...PECAS.map((p, i) => inc(p, i, p === 'SPRINKLER' ? { fatorK: 80, posicaoSprinkler: 'PENDENTE', cotaMm: 2700 } : p === 'EXTINTOR' ? { agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4 } : p === 'PLACA' ? { codigoPlaca: 'S12' } : {})),
    { type: 'AddTrecho', levelId: t1, disciplina: 'INCENDIO', a: point(0, 1000), b: point(8000, 1000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65 } as Command,
    { type: 'AddTerminal', levelId: t0, disciplina: 'AGUA_FRIA', tipo: 'Torneira', tipoHidraulico: 'TORNEIRA', at: point(500, 500), cotaMm: 1100 } as Command,
    { type: 'AddTrecho', levelId: t0, disciplina: 'AGUA_FRIA', a: point(0, 500), b: point(3000, 500), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 } as Command,
    { type: 'AddTerminal', levelId: t0, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(2000, 2000), cotaMm: 2800 } as Command,
  ]).model;
}
const opcoes = (extra: Partial<OpcoesIfc> = {}): OpcoesIfc => ({ titulo: 'x', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-10-01T12:00:00Z'), ...extra });

async function lerDeVolta(m: BlueprintModel, extra: Partial<OpcoesIfc> = {}) {
  const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
  usarCaminhoDoWasm('');
  const api = await obterApi();
  const { lerIncendioParametrico, lerEletricaParametrica } = await import('../services/ifcParametricoService');
  const id = api.OpenModel(new TextEncoder().encode(gerarIfc(m, opcoes(extra))));
  try {
    return { incendio: await lerIncendioParametrico(id), eletrica: await lerEletricaParametrica(id) };
  } finally {
    api.CloseModel(id);
  }
}

describe('E9.3 · importar o incêndio do IFC', () => {
  it('⚠️ PRONTO QUANDO: o próprio IFC devolve as MESMAS peças de incêndio — tipo, posição e cota — e o tubo', async () => {
    const m = predio();
    const { incendio, eletrica } = await lerDeVolta(m);
    const r = traduzirIncendio(incendio);
    expect(r.recusas).toEqual([]);
    const fogo = m.terminais!.filter((t) => t.disciplina === 'INCENDIO');
    expect(r.pontos).toHaveLength(fogo.length);
    for (const t of fogo) {
      const p = r.pontos.find((x) => x.at.x === t.at.x && x.at.y === t.at.y);
      expect(p, t.tipoHidraulico!).toBeTruthy();
      expect(p!.tipoHidraulico).toBe(t.tipoHidraulico);
      expect(p!.cotaAbsMm).toBe(3000 + t.cotaMm);
    }
    // Só o tubo de incêndio (o de água fica de fora), com a bitola medida.
    expect(r.tubos).toHaveLength(1);
    // ⚠️ O eixo sai do centróide da malha poligonal do cilindro: 1 mm de ruído (como no eletroduto).
    const t = r.tubos[0];
    expect(t).toMatchObject({ cotaAAbsMm: 5600, cotaBAbsMm: 5600, bitolaMm: 65 });
    for (const [q, alvo] of [[t.a, { x: 0, y: 1000 }], [t.b, { x: 8000, y: 1000 }]] as const) expect(Math.hypot(q.x - alvo.x, q.y - alvo.y)).toBeLessThanOrEqual(1);
    // A elétrica não lê a luminária de emergência (está no sistema de incêndio): só a luz comum.
    expect(traduzirEletrica(eletrica).pontos.map((p) => p.tipoEletrico)).toEqual(['ILUMINACAO_TETO']);
  });

  it('os comandos põem as peças e o tubo na disciplina INCENDIO, com a cota relativa ao pavimento', async () => {
    const m = predio();
    const r = traduzirIncendio((await lerDeVolta(m)).incendio);
    let alvo = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const destino = () => ({ levelId: alvo.levels[0].id, elevationMm: 3000 });
    alvo = applyBatch(alvo, comandosDoIncendio(r.pontos, r.tubos, destino)).model;
    expect(alvo.terminais!.every((t) => t.disciplina === 'INCENDIO')).toBe(true);
    expect(alvo.terminais!.map((t) => t.tipoHidraulico).sort()).toEqual([...PECAS].sort());
    expect(alvo.terminais!.find((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES')!.cotaMm).toBe(1300);
    expect(alvo.trechos!.map((t) => [t.disciplina, t.cotaAMm, t.bitolaMm])).toEqual([['INCENDIO', 2600, 65]]);
  });

  it('IFC4X3: a placa sai IfcSign .PICTORAL., o web-ifc lê, e ela volta como PLACA', async () => {
    const m = predio();
    expect(gerarIfc(m, opcoes({ esquema: 'IFC4X3' }))).toMatch(/IFCSIGN\([^)]*'PLACA'[^;]*\.PICTORAL\.\)/);
    expect(gerarIfc(m, opcoes())).not.toMatch(/IFCSIGN\(/);
    const r = traduzirIncendio((await lerDeVolta(m, { esquema: 'IFC4X3' })).incendio);
    expect(r.recusas).toEqual([]);
    expect(r.pontos.filter((p) => p.tipoHidraulico === 'PLACA')).toHaveLength(1);
  });

  it('de outro programa (sem o nosso ObjectType): pela classe e pelo enum; o .USERDEFINED. sem tipo é recusado, não adivinhado', () => {
    expect(tipoDoPontoDeIncendioIfc('IFCFIRESUPPRESSIONTERMINAL', '.FIREHYDRANT.', null)).toBe('HIDRANTE_SIMPLES');
    expect(tipoDoPontoDeIncendioIfc('IFCFIRESUPPRESSIONTERMINAL', 'SPRINKLER', 'Sprinkler K80')).toBe('SPRINKLER');
    expect(tipoDoPontoDeIncendioIfc('IFCALARM', 'MANUALPULLBOX', null)).toBe('ACIONADOR_MANUAL');
    expect(tipoDoPontoDeIncendioIfc('IFCSENSOR', 'SMOKESENSOR', null)).toBe('DETECTOR_FUMACA');
    expect(tipoDoPontoDeIncendioIfc('IFCFIRESUPPRESSIONTERMINAL', 'USERDEFINED', 'Qualquer')).toBeNull();
    // Bomba, válvula e sensor de pressão FORA do sistema de incêndio são da água.
    expect(eDeIncendio('IFCPUMP', 'USERDEFINED', false)).toBe(false);
    expect(eDeIncendio('IFCSENSOR', 'PRESSURESENSOR', false)).toBe(false);
    expect(eDeIncendio('IFCSENSOR', 'SMOKESENSOR', false)).toBe(true);
    expect(eDeIncendio('IFCLIGHTFIXTURE', 'USERDEFINED', false)).toBe(false);
  });
});

describe('E9.3 · o Pset de incêndio e a cobertura', () => {
  it('_Declarado do que a peça declara, _Derivado da numeração, _Calculada só com o cálculo', () => {
    const m = predio();
    const sem = gerarIfc(m, opcoes());
    expect(sem).toMatch(/'Pset_OpuraIncendio'/);
    expect(sem).toMatch(/'FatorK_Declarado',\$,IFCREAL\(80\.0*\)/);
    expect(sem).toMatch(/'AgenteExtintor_Declarado',\$,IFCLABEL\('PQS_ABC'\)/);
    expect(sem).toMatch(/'CodigoPlaca_Declarado',\$,IFCLABEL\('S12'\)/);
    expect(sem).toMatch(/'Numero_Derivado',\$,IFCLABEL\('H-1'\)/);
    expect(sem).not.toMatch(/_Calculada'/);
    const hid = m.terminais!.find((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES')!;
    const com = gerarIfc(m, opcoes({ resultadosDeIncendio: new Map([[hid.id, { vazaoLmin: 301.24, pressaoNoBicoKpa: 412.5, atende: true }]]) }));
    expect(com).toMatch(/'VazaoLmin_Calculada',\$,IFCREAL\(301\.20*\)/);
    expect(com).toMatch(/'Atende_Calculada',\$,IFCBOOLEAN\(\.T\.\)/);
  });

  it('a cobertura não diz mais "NÃO CONTÉM os preventivos" (achado 5) — diz o que o arquivo contém', () => {
    const t = COBERTURA_IFC.join(' ');
    expect(t).not.toMatch(/NÃO CONTÉM os preventivos/);
    expect(t).toMatch(/IfcSign \.PICTORAL\. no IFC4X3/);
    expect(t).toMatch(/Pset_OpuraIncendio/);
  });
});
