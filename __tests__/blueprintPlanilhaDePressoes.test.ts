/**
 * INCÊNDIO E8.2 (01/10/2026): a planilha de pressões (trechos na ordem do
 * caminho crítico, peças abertas), o caminho crítico destacado na planta, a
 * folha com a curva da bomba e a aba do XLSX.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDePressoesDeIncendio, desenharPlanta, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { abaDaPlanilhaDePressoes, calculoDoEstudo, caminhoCritico, planilhaDePressoes } from '../utils/blueprintPlanilhaDePressoes';
import { HIPOTESES_INCENDIO_PADRAO as H } from '../utils/blueprintIncendioClassificacao';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';
import { COR_DO_CAMINHO_CRITICO } from '../utils/blueprintPranchaIncendio';

const CURVA = [{ vazaoLmin: 0, alturaMm: 70000 }, { vazaoLmin: 600, alturaMm: 55000 }, { vazaoLmin: 1200, alturaMm: 30000 }];

/** O galpão da E2: bomba (com curva) → coluna → 25 m → hidrante a 30 m; um hidrante a 5 m no caminho. */
function galpao(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
  return applyBatch(m, [
    p('BOMBA_INCENDIO', 0, 300, { curvaBomba: CURVA }),
    t(0, 300, 0, 2600), t(0, 2600, 5000, 2600), t(5000, 2600, 30000, 2600), t(5000, 2600, 5000, 1300), t(30000, 2600, 30000, 1300),
    p('HIDRANTE_SIMPLES', 5000, 1300), p('HIDRANTE_SIMPLES', 30000, 1300),
  ]).model;
}
const papel = orientar(PAPEIS.find((x) => x.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ denominador: 100, papel, titulo: 'Galpão', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-01T12:00:00Z'), ...extra });

describe('E8.2 · a planilha e o caminho crítico', () => {
  it('⚠️ PRONTO QUANDO: o caminho crítico vai da bomba ao hidrante do fundo e bate com o solver (a peça de menor folga)', () => {
    const m = galpao();
    const { calculo } = calculoDoEstudo(m, H);
    const c = caminhoCritico(m, calculo);
    const fundo = m.terminais!.find((t) => t.at.x === 30000)!;
    expect(c.pecaId).toBe(fundo.id);
    // coluna → 0–5 m → 5–30 m → descida até o hidrante: 4 trechos, nessa ordem.
    const porId = new Map(m.trechos!.map((t) => [t.id, t]));
    expect(c.trechos.map((id) => [porId.get(id)!.a.x, porId.get(id)!.b.x])).toEqual([
      [0, 0],
      [0, 5000],
      [5000, 30000],
      [30000, 30000],
    ]);
  });

  it('a planilha: o caminho crítico primeiro (marcado com *), a pressão cai ao longo dele, as peças com o exigido', () => {
    const m = galpao();
    const p = planilhaDePressoes(m, calculoDoEstudo(m, H).calculo);
    expect(p.motivo).toBeNull();
    expect(p.resumo[0]).toBe('Governa a bomba: hidrantes');
    expect(p.trechos.slice(0, 4).every((l) => l[0].startsWith('*'))).toBe(true);
    expect(p.trechos[4][0].startsWith('*')).toBe(false);
    // P fim de cada trecho do caminho é a P início do seguinte (mesmo nó).
    for (let i = 0; i < 3; i++) expect(p.trechos[i][11]).toBe(p.trechos[i + 1][10]);
    expect(p.pecas).toHaveLength(2);
    expect(p.pecas.every((l) => l[4] === '>= 300 L/min' && l[5] === 'atende')).toBe(true);
    const aba = abaDaPlanilhaDePressoes(p);
    expect(aba.nome).toBe('Incêndio — pressões');
    expect(aba.linhas.some((l) => l[0] === 'Trecho')).toBe(true);
  });

  it('sem fonte: a planilha diz por quê', () => {
    const m = galpao();
    const semBomba = { ...m, terminais: m.terminais!.filter((t) => t.tipoHidraulico !== 'BOMBA_INCENDIO') };
    expect(planilhaDePressoes(semBomba, calculoDoEstudo(semBomba, H).calculo).motivo).toMatch(/sem bomba/);
  });
});

describe('E8.2 · no papel', () => {
  it('a folha traz a planilha, as peças e a curva da bomba com o projeto e a operação', () => {
    const m = galpao();
    const d = new DesenhistaDeProva();
    desenharFolhaDePressoesDeIncendio(d, m, opcoes({ hipotesesDeIncendio: H }), enquadrar(m, 100, papel, false));
    const t = d.textos().join(' | ');
    expect(t).toMatch(/PLANILHA DE PRESSÕES — INCÊNDIO/);
    expect(t).toMatch(/Altura manométrica: [\d,]+ mca/);
    expect(t).toMatch(/PEÇAS ABERTAS NO CÁLCULO/);
    expect(t).toMatch(/CURVA DA BOMBA × CURVA DO SISTEMA/);
    expect(t).toMatch(/Projeto: \d+ L\/min a [\d,]+ m/);
    expect(t).toMatch(/Operação: \d+ L\/min a [\d,]+ m/);
    const sem = new DesenhistaDeProva();
    desenharFolhaDePressoesDeIncendio(sem, m, opcoes(), enquadrar(m, 100, papel, false));
    expect(sem.textos().join(' | ')).toMatch(/Premissas de incêndio do estudo não informadas/);
  });

  it('a planta destaca o caminho crítico em vermelho; sem ele, nada vermelho', () => {
    const m = galpao();
    const caminho = caminhoCritico(m, calculoDoEstudo(m, H).calculo).trechos;
    const com = new DesenhistaDeProva();
    desenharPlanta(com, m, opcoes({ incendio: 'HIDRANTES', caminhoCriticoDeIncendio: caminho }), enquadrar(m, 100, papel, false));
    const vermelhas = com.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === COR_DO_CAMINHO_CRITICO);
    expect(vermelhas.length).toBe(caminho.length - 2); // as duas verticais (coluna e descida) não têm comprimento em planta
    const sem = new DesenhistaDeProva();
    desenharPlanta(sem, m, opcoes({ incendio: 'HIDRANTES' }), enquadrar(m, 100, papel, false));
    expect(sem.chamadas.some((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === COR_DO_CAMINHO_CRITICO)).toBe(false);
  });

  it('o conjunto ganha a folha de pressões quando há rede de incêndio', () => {
    const t = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, incendio: true } };
    // E8.3: a de detalhes vem depois dela.
    expect(planejarConjunto(galpao(), t).map((p) => p.tipo).slice(-3)).toEqual(['LEGENDA_INCENDIO', 'PRESSOES_INCENDIO', 'DETALHES_INCENDIO']);
  });
});
