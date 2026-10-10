/**
 * INCÊNDIO E10 (01/10/2026) — o GERADOR DE PPCI de ponta a ponta num prédio
 * de 8 pavimentos: um lote, os mesmos ids na reaplicação, e o relatório com a
 * LISTA EXATA do que ainda falta (zero FALTA ou cada uma dita).
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_INCENDIO_PADRAO, type HipotesesIncendio } from '../utils/blueprintIncendioClassificacao';
import { conferirDasPremissas, conferirPlanoDoPpci, gerarPpci } from '../utils/blueprintGeradorPpci';
import { ROTULO_DO_GRUPO_DE_INCENDIO, analisesDeIncendio, verificacoesIncendio } from '../utils/blueprintIncendioExecutivo';
import { RESPONSAVEL_VAZIO } from '../utils/blueprintTopografiaExecutivo';

// Teto de tempo por ARQUIVO (padrão de __tests__/components/BlueprintEditor.test.tsx).
// Em 08/10/2026 a CI do commit 9c53b2c0 rodou ~1,6x mais lenta (até o tsc) e casos
// pesados deste arquivo passaram dos 5 s padrão; na reexecução, passaram. É contenção
// da máquina, não regressão. Subir AQUI mantém o teto curto no resto da suíte.
vi.setConfig({ testTimeout: 30_000 });

const H: HipotesesIncendio = { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' } };

/**
 * 8 pavimentos de 20 × 12 m (3 m de piso a piso): corredor de 2 m ao longo do
 * y = 0–2 m e quatro salas de 5 × 10 m, cada uma com porta para o corredor; no
 * térreo, a porta da rua no fim do corredor e a bomba de incêndio.
 */
function predio(comBomba = true): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < 8; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : `${i}º`, elevationMm: i * 3000, defaultHeightMm: 2800 }).model;
  for (const l of m.levels) {
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l.id, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
    m = applyBatch(m, [w(0, 0, 20000, 0), w(20000, 0, 20000, 12000), w(20000, 12000, 0, 12000), w(0, 12000, 0, 0), w(0, 2000, 20000, 2000), ...[5000, 10000, 15000].map((x) => w(x, 2000, x, 12000))]).model;
    const corredor = m.walls.find((x) => x.levelId === l.id && x.a.y === 2000 && x.b.y === 2000)!;
    m = applyBatch(m, [0, 1, 2, 3].map((k) => ({ type: 'AddOpening', wallId: corredor.id, kind: 'door', offsetMm: k * 5000 + 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
  }
  const t0 = m.levels[0].id;
  const fundo = m.walls.find((x) => x.levelId === t0 && x.a.x === 0 && x.b.x === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: fundo.id, kind: 'door', offsetMm: 10500, widthMm: 1200, heightMm: 2100, sillMm: 0 } as Command).model;
  if (comBomba) m = applyCommand(m, { type: 'AddTerminal', levelId: t0, disciplina: 'INCENDIO', tipo: 'Bomba', tipoHidraulico: 'BOMBA_INCENDIO', at: point(19000, 1000), cotaMm: 300 } as Command).model;
  return m;
}

describe('E10 · o gerador de PPCI de ponta a ponta (8 pavimentos)', () => {
  const original = predio();
  const plano = gerarPpci(original, H);

  it('⚠️ PRONTO QUANDO: as etapas exigidas lançam; a não exigida não roda', () => {
    const por = new Map(plano.etapas.map((e) => [e.id, e]));
    for (const id of ['EXTINTORES', 'HIDRANTES', 'REDE', 'SINALIZACAO', 'ILUMINACAO'] as const) {
      expect(por.get(id)!.situacao, id).toBe('LANCOU');
      expect(por.get(id)!.comandos, id).toBeGreaterThan(0);
    }
    expect(por.get('SPRINKLERS')!.situacao).toBe('NAO_EXIGIDA');
    const pecas = (tipo: string) => (plano.resultado.terminais ?? []).filter((t) => t.tipoHidraulico === tipo);
    // Todo pavimento ganhou extintor e hidrante; a rede chega a todos os hidrantes.
    for (const l of original.levels) {
      expect(pecas('EXTINTOR').some((t) => t.levelId === l.id), l.name).toBe(true);
      expect(pecas('HIDRANTE_SIMPLES').some((t) => t.levelId === l.id) || pecas('HIDRANTE_DUPLO').some((t) => t.levelId === l.id) || pecas('MANGOTINHO').some((t) => t.levelId === l.id), l.name).toBe(true);
    }
    expect((plano.resultado.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO').length).toBeGreaterThan(8);
  });

  it('a iluminação que ele lança deixa a rota iluminada — sem duas luminárias no mesmo ponto (o gerador pegou o arredondamento da E7.3)', () => {
    expect(plano.pendencias.some((p) => /Iluminação de emergência ao longo das rotas/.test(p.texto))).toBe(false);
    const lums = (plano.resultado.terminais ?? []).filter((t) => t.tipoHidraulico === 'LUMINARIA_EMERGENCIA');
    expect(new Set(lums.map((t) => `${t.levelId}|${t.at.x}|${t.at.y}`)).size).toBe(lums.length);
  });

  it('UM lote: reaplicado no original cria os MESMOS ids e chega ao MESMO desenho da prévia', () => {
    expect(conferirPlanoDoPpci(original, plano)).toEqual({ ok: true });
    expect(snapshotHash(applyBatch(original, plano.comandos).model)).toBe(snapshotHash(plano.resultado));
    // Desenho mudado depois da prévia: a trava recusa.
    const mexido = applyCommand(original, { type: 'AddTerminal', levelId: original.levels[3].id, disciplina: 'INCENDIO', tipo: 'Ext', tipoHidraulico: 'EXTINTOR', at: point(500, 500), cotaMm: 1600 } as Command).model;
    expect(conferirPlanoDoPpci(mexido, plano).ok).toBe(false);
  });

  it('⚠️ PRONTO QUANDO: o relatório traz a LISTA EXATA das verificações que faltam no resultado', () => {
    const r = verificacoesIncendio(plano.resultado, H, RESPONSAVEL_VAZIO, analisesDeIncendio(plano.resultado, H));
    const faltam = r.verificacoes.filter((v) => !v.atende && v.grupo !== 'RESPONSAVEL').map((v) => `${ROTULO_DO_GRUPO_DE_INCENDIO[v.grupo]} — ${v.item}: exigido ${v.exigido}; obtido ${v.obtido}.`);
    expect(plano.pendencias.filter((p) => p.grupo === 'VERIFICACAO').map((p) => p.texto)).toEqual(faltam);
    // As medidas que o gerador lança, ele deixa atendidas.
    const lancadas = r.verificacoes.filter((v) => v.grupo === 'EXIGENCIAS');
    expect(lancadas.length).toBeGreaterThan(0);
    expect(lancadas.every((v) => v.atende)).toBe(true);
  });

  it('⚠️ PRONTO QUANDO: o relatório lista cada CONFERIR ainda aberto e o que o gerador não decide', () => {
    const conferir = plano.pendencias.filter((p) => p.grupo === 'CONFERIR').map((p) => p.texto);
    // D1.2: em MG, as premissas de hidrante são conferidas contra a IT 17 — o padrão segue a IT,
    // então só sobra a pressão no esguicho (que a IT não fixa); o resto da lista continua.
    expect(conferir.some((t) => /Hidrantes simultâneos/.test(t))).toBe(false);
    expect(conferir.some((t) => /Pressão no esguicho: .*a IT 17 não a fixa/.test(t))).toBe(true);
    for (const t of conferirDasPremissas(H).filter((x) => /Sprinklers|Percurso|extintor|luminárias|sprinkler e luminária/.test(x))) expect(conferir).toContain(t);
    // D1: as exigências vêm da IT 01 do CBMMG conferida — nenhuma linha "transcrita de memória" no relatório.
    expect(conferir.some((t) => /transcrito de memória/.test(t))).toBe(false);
    // Fase B: a bomba sem curva (catálogo vazio) é o que ele não decide — dito com o ponto de projeto.
    expect(plano.pendencias.some((p) => p.grupo === 'NAO_DECIDIDO' && /curva a escolher — ponto de projeto \d+ L\/min/.test(p.texto))).toBe(true);
  });

  it('⚠️ PRONTO QUANDO (Fase B4): jockey, pressostatos, recalque e reserva lançados — só falta o que o modelo de prova não tem (o percurso, sem escada)', () => {
    const tipos = (plano.resultado.terminais ?? []).map((t) => t.tipoHidraulico);
    for (const t of ['BOMBA_JOCKEY', 'PRESSOSTATO', 'HIDRANTE_RECALQUE', 'RESERVATORIO']) expect(tipos, t).toContain(t);
    expect(plano.pendencias.filter((p) => p.grupo === 'VERIFICACAO').map((p) => p.texto)).toEqual([
      expect.stringMatching(/^Saídas e rota de fuga — NBR 9077 — Percurso de fuga de todos os ambientes/),
    ]);
  });
});

describe('E10 · o que ele não decide', () => {
  it('sem bomba: a rede não roda, e o relatório diz que a bomba é escolha do projeto', () => {
    const plano = gerarPpci(predio(false), H);
    expect(plano.etapas.find((e) => e.id === 'REDE')!.situacao).toBe('NAO_RODOU');
    expect(plano.pendencias.some((p) => p.grupo === 'NAO_DECIDIDO' && /Rede de hidrantes: .*bomba/.test(p.texto))).toBe(true);
  });

  it('sem ocupação: é premissa faltando, e nenhuma medida é lançada por palpite', () => {
    const plano = gerarPpci(predio(), { ...H, classificacao: { ...H.classificacao, divisao: null } });
    expect(plano.pendencias.some((p) => p.grupo === 'PREMISSA' && /Ocupação/.test(p.texto))).toBe(true);
    expect(plano.comandos).toEqual([]);
  });
});
