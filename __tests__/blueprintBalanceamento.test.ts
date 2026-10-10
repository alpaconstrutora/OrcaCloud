/**
 * BALANCEAMENTO DE FASES (E6.1 do roadmap elétrico, 29/09/2026) — sem bump.
 *
 * *"e6"*. Num quadro trifásico, os circuitos F-N e F-F são distribuídos entre
 * R, S e T por um guloso por carga + melhoria local; a prévia diz o
 * desequilíbrio antes/depois e quem muda; "Aplicar" é um lote (um Ctrl+Z).
 *
 * ─── ⚠️ O QUE UMA IMPLEMENTAÇÃO INGÊNUA ERRA ────────────────────────────────
 *
 * · o F-F ocupa DUAS fases — metade da carga em cada; sem isso ele "some" do
 *   balanceamento e o quadro parece equilibrado quando não está;
 * · o "depois" da prévia tem de ser o que o QUADRO mostra depois de aplicar
 *   (mesma carga, mesma conta) — `conferirPlanoDeBalanceamento` prova;
 * · trocar R/S/T entre si não muda o desequilíbrio: entre as trocas, fica a que
 *   mexe no MENOR número de circuitos (o eletricista refaz menos no quadro);
 * · arranjo manual já tão bom quanto o balanceado: nada é proposto.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type FaseDoCircuito, type LigacaoDoCircuito } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, preDimensionarQuadroCompleto } from '../utils/blueprintEletricaDimensionamento';
import { desequilibrioDasFases, fasesOcupadas, opcoesDeFase, rotuloDaFase, somarPorFase } from '../utils/blueprintFasesEletricas';
import { balancearFases, conferirPlanoDeBalanceamento, planoDeBalanceamento } from '../utils/blueprintBalanceamento';
import { montarUnifilar } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDoQuadroDeCargas, enquadrar, orientar } from '../utils/blueprintExport';

// Teto de tempo por ARQUIVO (padrão de __tests__/components/BlueprintEditor.test.tsx).
// Em 08/10/2026 a CI do commit 9c53b2c0 rodou ~1,6x mais lenta (até o tsc) e casos
// pesados deste arquivo passaram dos 5 s padrão; na reexecução, passaram. É contenção
// da máquina, não regressão. Subir AQUI mantém o teto curto no resto da suíte.
vi.setConfig({ testTimeout: 30_000 });

type Circ = { ligacao?: LigacaoDoCircuito; fase?: FaseDoCircuito; va: number; tensaoV?: number };

/** Quadro QDC (F-F-F 220 V, salvo dito) com um circuito por item, cada um com UM ponto da potência dada. */
function quadro(circs: Circ[], ligacaoDoQuadro: LigacaoDoCircuito = 'FFF'): { m: BlueprintModel; quadroId: string; ids: string[] } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600, ligacao: ligacaoDoQuadro, tensaoV: ligacaoDoQuadro === 'FN' ? 127 : 220 }).model;
  const quadroId = m.quadros[0].id;
  const ids: string[] = [];
  circs.forEach((c, i) => {
    const lig = c.ligacao ?? 'FN';
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: `C${i + 1}`, tensaoV: c.tensaoV ?? (lig === 'FN' ? 127 : 220), ligacao: lig, ...(c.fase ? { fase: c.fase } : {}) }).model;
    const id = m.circuitos[m.circuitos.length - 1].id;
    ids.push(id);
    if (c.va > 0) {
      m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUE', at: point(1000 * (i + 1), 75), cotaMm: 300, tipoEletrico: 'TUE', potenciaW: c.va }).model;
      m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: id }).model;
    }
  });
  return { m, quadroId, ids };
}

describe('a convenção da fase (F-N uma, F-F um par, F-F-F as três)', () => {
  it('fases ocupadas, rótulo e opções do select', () => {
    expect(fasesOcupadas('FN', 'S')).toEqual(['S']);
    expect(fasesOcupadas('FF', 'R')).toEqual(['R', 'S']);
    expect(fasesOcupadas('FF', 'S')).toEqual(['S', 'T']);
    expect(fasesOcupadas('FF', 'T')).toEqual(['T', 'R']);
    expect(fasesOcupadas('FFF', null)).toEqual(['R', 'S', 'T']);
    expect(fasesOcupadas('FN', null)).toEqual([]);
    expect(fasesOcupadas(undefined, 'T')).toEqual(['T']); // sem ligação = F-N
    expect(rotuloDaFase('FF', 'T')).toBe('T-R');
    expect(rotuloDaFase('FFF', null)).toBe('RST');
    expect(rotuloDaFase('FF', null)).toBeNull();
    expect(opcoesDeFase('FF').map((o) => o.rotulo)).toEqual(['R-S', 'S-T', 'T-R']);
    expect(opcoesDeFase('FN').map((o) => o.rotulo)).toEqual(['R', 'S', 'T']);
    expect(opcoesDeFase('FFF')).toEqual([]);
  });

  it('⚠️ soma: F-F metade em cada fase do par; sem fase fica fora e é dito; desequilíbrio (maior − menor) / maior', () => {
    const r = somarPorFase([
      { nome: 'C1', ligacao: 'FF', fase: 'T', sVA: 2000 },
      { nome: 'C2', ligacao: 'FN', fase: 'S', sVA: 500 },
      { nome: 'C3', ligacao: 'FFF', fase: null, sVA: 900 },
      { nome: 'C4', ligacao: 'FF', fase: null, sVA: 800 },
      { nome: 'C5', ligacao: 'FN', fase: null, sVA: 100 },
    ]);
    expect(r.fases).toEqual({ R: 1300, S: 800, T: 1300 });
    expect(r.semFase).toEqual(['C4 (F-F)', 'C5']);
    expect(desequilibrioDasFases(r.fases)).toBeCloseTo((500 / 1300) * 100, 9);
    expect(desequilibrioDasFases({ R: 0, S: 0, T: 0 })).toBeNull();
  });

  it('o quadro soma o F-F com fase (antes ficava fora) — e o que não tem fase continua dito', () => {
    const { m, quadroId } = quadro([{ ligacao: 'FF', fase: 'R', va: 2200 }, { va: 1000, fase: 'T' }, { ligacao: 'FF', va: 400 }]);
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.fases).toEqual({ R: 1100, S: 1100, T: 1000 });
    expect(q.naoAvaliado.join(' ')).toMatch(/sem fase\): C3 \(F-F\)/);
  });
});

describe('balancear (guloso + melhoria local + menos mudanças)', () => {
  it('⚠️ PRONTO QUANDO: 6 circuitos desiguais sem fase → desequilíbrio ≤ 10 %; o quadro recalculado mostra o mesmo "depois" (conferido)', () => {
    const { m, quadroId, ids } = quadro([{ va: 3000 }, { va: 2500 }, { va: 2000 }, { va: 1500 }, { va: 1200 }, { va: 800 }]);
    const plano = planoDeBalanceamento(m, quadroId, HIPOTESES_PADRAO);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.antesPct).toBeNull(); // ninguém tinha fase
    expect(plano.semFaseAntes).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    expect(plano.depoisPct).toBeLessThanOrEqual(10);
    expect(plano.depois.R + plano.depois.S + plano.depois.T).toBeCloseTo(11000, 6);
    expect(plano.mudancas).toHaveLength(6);
    expect(plano.mudancas.every((x) => x.de === null)).toBe(true);
    // Um lote: só SetCircuitoProps { fase }, um por circuito.
    expect(plano.comandos.every((c) => c.type === 'SetCircuitoProps' && Object.keys(c).sort().join() === 'circuitoId,fase,type')).toBe(true);
    expect(new Set(plano.comandos.map((c) => (c as { circuitoId: string }).circuitoId))).toEqual(new Set(ids));
    expect(conferirPlanoDeBalanceamento(m, plano, HIPOTESES_PADRAO)).toEqual({ ok: true });
    const q = preDimensionarQuadroCompleto(applyBatch(m, plano.comandos).model, quadroId)!;
    expect(q.desequilibrioPct).toBeCloseTo(plano.depoisPct, 9);
    expect(q.achados.some((a) => /desequilibradas/.test(a.mensagem))).toBe(false);
    expect(q.naoAvaliado.join(' ')).not.toMatch(/sem fase/);
  });

  it('⚠️ F-F ocupa duas fases: o par do F-F e os F-N se completam até ficar parelho', () => {
    // F-F 4000 VA (2000 em cada fase do par) + um F-N de 2000 na fase que sobra: 2000 em cada.
    const { m, quadroId } = quadro([{ ligacao: 'FF', va: 4000 }, { va: 2000 }]);
    const plano = planoDeBalanceamento(m, quadroId);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.depois).toEqual({ R: 2000, S: 2000, T: 2000 });
    expect(plano.depoisPct).toBe(0);
    const ff = plano.mudancas.find((x) => x.nome === 'C1')!;
    const fn = plano.mudancas.find((x) => x.nome === 'C2')!;
    expect(ff.para.split('-')).not.toContain(fn.para); // o F-N cai na fase fora do par
    expect(conferirPlanoDeBalanceamento(m, plano)).toEqual({ ok: true });
    // Três F-F iguais: um em cada par (R-S, S-T, T-R) — cada fase recebe duas metades.
    const tres = quadro([{ ligacao: 'FF', va: 3000 }, { ligacao: 'FF', va: 3000 }, { ligacao: 'FF', va: 3000 }]);
    const p3 = planoDeBalanceamento(tres.m, tres.quadroId);
    expect(p3.ok && p3.depois).toEqual({ R: 3000, S: 3000, T: 3000 });
    expect(p3.ok && new Set(p3.mudancas.map((x) => x.para))).toEqual(new Set(['R-S', 'S-T', 'T-R']));
  });

  it('F-F-F entra fixo (um terço em cada) e o balanceamento trabalha em volta dele', () => {
    const { m, quadroId } = quadro([{ ligacao: 'FFF', va: 3000 }, { va: 1000 }, { va: 1000 }, { va: 1000 }]);
    const plano = planoDeBalanceamento(m, quadroId);
    expect(plano.ok && plano.depois).toEqual({ R: 2000, S: 2000, T: 2000 });
    expect(plano.ok && plano.mudancas.map((x) => x.nome)).toEqual(['C2', 'C3', 'C4']);
  });

  it('⚠️ menos mudanças: quem já está bem fica — só o circuito sem fase ganha a que falta', () => {
    const { m, quadroId } = quadro([{ va: 1000, fase: 'T' }, { va: 1000, fase: 'R' }, { va: 1000 }]);
    const plano = planoDeBalanceamento(m, quadroId);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.mudancas).toEqual([{ circuitoId: expect.any(String), nome: 'C3', de: null, para: 'S' }]);
    expect(plano.depoisPct).toBe(0);
  });

  it('⚠️ arranjo atual já tão bom quanto o balanceado: nada proposto (não mexe no quadro à toa)', () => {
    const { m, quadroId } = quadro([{ va: 1500, fase: 'R' }, { va: 1500, fase: 'S' }, { va: 1400, fase: 'T' }]);
    const plano = planoDeBalanceamento(m, quadroId);
    expect(plano.ok).toBe(false);
    expect(!plano.ok && plano.motivo).toMatch(/nada a mudar/);
  });

  it('um circuito grande demais: o melhor arranjo ainda passa do limite, e a prévia sabe', () => {
    const { m, quadroId } = quadro([{ va: 5000 }, { va: 500 }, { va: 500 }]);
    const plano = planoDeBalanceamento(m, quadroId);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.depoisPct).toBeGreaterThan(plano.limitePct);
    expect(plano.depois).toEqual({ R: 5000, S: 500, T: 500 });
  });

  it('recusas com motivo: quadro não trifásico; nenhum circuito F-N/F-F com carga; quadro que não existe', () => {
    const mono = quadro([{ va: 1000 }], 'FN');
    const p1 = planoDeBalanceamento(mono.m, mono.quadroId);
    expect(!p1.ok && p1.motivo).toMatch(/só em quadro trifásico/);
    const vazio = quadro([{ va: 0 }, { ligacao: 'FFF', va: 3000 }]);
    const p2 = planoDeBalanceamento(vazio.m, vazio.quadroId);
    expect(!p2.ok && p2.motivo).toMatch(/Nenhum circuito F-N ou F-F com carga/);
    expect(planoDeBalanceamento(vazio.m, 'qua_inexistente')).toEqual({ ok: false, motivo: 'Quadro não encontrado' });
    expect(conferirPlanoDeBalanceamento(vazio.m, p2)).toEqual({ ok: false, motivo: (p2 as { motivo: string }).motivo });
  });

  it('circuito sem carga (reserva) fica como está; determinístico (mesma entrada, mesmo plano)', () => {
    const { m, quadroId, ids } = quadro([{ va: 2000 }, { va: 0 }, { va: 1200 }, { va: 900 }]);
    const a = planoDeBalanceamento(m, quadroId);
    const b = planoDeBalanceamento(m, quadroId);
    expect(a).toEqual(b);
    expect(a.ok && a.comandos.some((c) => (c as { circuitoId: string }).circuitoId === ids[1])).toBe(false);
  });

  it('⚠️ propriedade (200 quadros aleatórios): nunca piora quem já tinha fase; o "depois" sempre confere; a carga total se conserva', () => {
    let semente = 20260929;
    const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
    const fases: (FaseDoCircuito | undefined)[] = ['R', 'S', 'T', undefined];
    for (let k = 0; k < 200; k++) {
      const n = 2 + Math.floor(rnd() * 9);
      const circs: Circ[] = Array.from({ length: n }, () => {
        const r = rnd();
        return { ligacao: r < 0.2 ? 'FF' : r < 0.3 ? 'FFF' : 'FN', fase: fases[Math.floor(rnd() * 4)], va: 100 * Math.round(1 + rnd() * 40) };
      });
      const { m, quadroId } = quadro(circs.map((c) => (c.ligacao === 'FFF' ? { ...c, fase: undefined } : c)));
      const antes = preDimensionarQuadroCompleto(m, quadroId)!;
      const plano = planoDeBalanceamento(m, quadroId);
      if (!plano.ok) continue;
      expect(conferirPlanoDeBalanceamento(m, plano)).toEqual({ ok: true });
      const total = circs.reduce((s, c) => s + c.va, 0);
      expect(plano.depois.R + plano.depois.S + plano.depois.T).toBeCloseTo(total, 6);
      if (plano.semFaseAntes.length === 0 && antes.desequilibrioPct != null) expect(plano.depoisPct).toBeLessThan(antes.desequilibrioPct);
    }
  });

  it('balancearFases direto: só os móveis aparecem (F-F-F e sem carga não)', () => {
    const r = balancearFases([
      { circuitoId: 'a', nome: 'A', ligacao: 'FFF', fase: null, sVA: 900 },
      { circuitoId: 'b', nome: 'B', ligacao: 'FN', fase: null, sVA: 0 },
      { circuitoId: 'c', nome: 'C', ligacao: 'FN', fase: null, sVA: 300 },
    ]);
    expect([...r.keys()]).toEqual(['c']);
  });
});

describe('o par do F-F nos documentos', () => {
  it('quadro de cargas: "R-S" no F-F, "RST" no trifásico, "—" sem fase; unifilar: "S-T" sobre o ramal F-F, nada no F-F-F', () => {
    const { m } = quadro([{ ligacao: 'FF', fase: 'R', va: 2200 }, { ligacao: 'FFF', va: 3000 }, { va: 600 }, { ligacao: 'FF', fase: 'S', va: 1000 }]);
    const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
    const opcoes = { denominador: 50, papel, titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64), data: new Date('2026-09-29T12:00:00Z'), eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO };
    const d = new DesenhistaDeProva();
    desenharFolhaDoQuadroDeCargas(d, m, opcoes, enquadrar(m, 50, papel, false));
    const textos = d.textos();
    expect(textos).toContain('R-S');
    expect(textos).toContain('S-T');
    expect(textos).toContain('RST');
    const [dg] = montarUnifilar(m, HIPOTESES_PADRAO);
    expect(dg.ramais.map((r) => r.fase)).toEqual(['R-S', null, null, 'S-T']);
    expect(dg.comFases).toBe(true);
  });

  it('o lote aplicado volta com um passo: aplicar e desfazer (o modelo de antes) é o que o Ctrl+Z do editor faz com um runBatch', () => {
    const { m, quadroId } = quadro([{ va: 3000 }, { va: 2000 }, { va: 1000 }]);
    const plano = planoDeBalanceamento(m, quadroId);
    if (!plano.ok) throw new Error(plano.motivo);
    const r = applyBatch(m, plano.comandos as Command[]);
    expect(r.diff.updated.length).toBe(3);
    expect((r.model.circuitos ?? []).map((c) => c.fase).sort()).toEqual(['R', 'S', 'T']);
    expect((m.circuitos ?? []).every((c) => c.fase == null)).toBe(true); // o original não foi tocado
  });
});
