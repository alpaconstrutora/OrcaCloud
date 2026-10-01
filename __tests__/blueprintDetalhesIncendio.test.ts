/**
 * INCÊNDIO E8.3 (01/10/2026): o esquema vertical com a coluna de incêndio
 * (CI-n), o isométrico da rede inteira, os detalhes típicos (abrigo, VGA,
 * casa de bombas), as peças de incêndio no corte e a folha de detalhes.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharElevacao, desenharFolhaDeDetalhesDeIncendio, enquadrar, enquadrarElevacao, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { colunasDoModelo, desenharEsquemaVertical, linhasDaLegendaDeColunas } from '../utils/blueprintEsquemaVertical';
import { SPRINKLERS_ROTULADOS_NO_ISOMETRICO, detalhesDoModelo, isometricoDeIncendio } from '../utils/blueprintDetalhesIncendio';
import { isometricosDoModelo } from '../utils/blueprintIsometricoPrancha';
import { projetarCorte } from '../utils/blueprintCorte';
import { COR_DA_DISCIPLINA } from '../utils/blueprintRede';
import { HIPOTESES_INCENDIO_PADRAO as H } from '../utils/blueprintIncendioClassificacao';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';

const papel = orientar(PAPEIS.find((x) => x.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ denominador: 100, papel, titulo: 'Prédio', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-01T12:00:00Z'), ...extra });

/**
 * Dois pavimentos: casa de bombas no térreo (principal, jockey, pressostato, VGA), a coluna em (0,0)
 * atravessando os dois andares e, em cada andar, um ramal até um hidrante a 5 m — no térreo pela
 * DESCIDA (ramal no alto, vertical até o hidrante), que é ramal e não coluna.
 */
function predio(extra: (t: string, s: string) => Command[] = () => []): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 }).model;
  const [t, s] = [m.levels[0].id, m.levels[1].id];
  const tr = (l: string, ax: number, ay: number, ca: number, bx: number, by: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const p = (l: string, tipo: string, x: number, y: number, cota: number): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo }) as Command;
  return applyBatch(m, [
    p(t, 'BOMBA_INCENDIO', -2000, 0, 300),
    p(t, 'BOMBA_JOCKEY', -2000, 1000, 300),
    p(t, 'PRESSOSTATO', -1000, 0, 300),
    p(t, 'VGA', -500, 0, 300),
    tr(t, -2000, 0, 300, 0, 0, 300),
    tr(t, 0, 0, 300, 0, 0, 2800),
    tr(t, 0, 0, 2600, 5000, 0, 2600),
    tr(t, 5000, 0, 2600, 5000, 0, 1300),
    p(t, 'HIDRANTE_SIMPLES', 5000, 0, 1300),
    tr(s, 0, 0, 0, 0, 0, 1300),
    tr(s, 0, 0, 1300, 5000, 0, 1300),
    p(s, 'HIDRANTE_SIMPLES', 5000, 0, 1300),
    ...extra(t, s),
  ]).model;
}

describe('E8.3 · o esquema vertical com a coluna de incêndio', () => {
  it('⚠️ PRONTO QUANDO: a coluna sai como CI-1 atravessando os dois andares; a descida ao hidrante não vira coluna', () => {
    const m = predio();
    const ci = colunasDoModelo(m).filter((c) => c.disciplina === 'INCENDIO');
    expect(ci.map((c) => c.nome)).toEqual(['CI-1']);
    expect(ci[0]).toMatchObject({ sigla: 'CI', x: 0, y: 0 });
    expect(ci[0].niveis).toEqual(m.levels.map((l) => l.id));
    expect(linhasDaLegendaDeColunas(m, ci)).toEqual(['CI-1 — Coluna de incêndio · ø65 mm · Térreo → 1º']);
  });

  it('o recalque que sai da BOMBA e não chega ao teto é coluna (a bomba é origem, não ponto de consumo) — o harness pegou', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
    const l = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'BOMBA_INCENDIO', at: point(0, 0), cotaMm: 300, tipoHidraulico: 'BOMBA_INCENDIO' } as Command,
      { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(0, 0), b: point(0, 0), cotaAMm: 300, cotaBMm: 2600, bitolaMm: 65 } as Command,
      { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(0, 0), b: point(5000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65 } as Command,
    ]).model;
    const ci = colunasDoModelo(m).filter((c) => c.disciplina === 'INCENDIO');
    expect(ci).toHaveLength(1);
    expect(ci[0].segmentos[0]).toMatchObject({ zA: 300, zB: 2600 });
  });

  it('o esquema de incêndio desenha só a CI; o hidrossanitário não a leva', () => {
    const m = predio();
    const d = new DesenhistaDeProva();
    expect(desenharEsquemaVertical(d, m, ['INCENDIO'], 10, 10, 380, 240)).toBe(1);
    expect(d.textos()).toContain('CI-1');
    expect(d.chamadas.some((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === COR_DA_DISCIPLINA.INCENDIO)).toBe(true);
    expect(desenharEsquemaVertical(new DesenhistaDeProva(), m, ['AGUA', 'ESGOTO'], 10, 10, 380, 240)).toBe(0);
  });
});

describe('E8.3 · o isométrico da rede inteira', () => {
  it('todos os trechos dos dois andares, na cota ABSOLUTA, e as peças da rede com o número do desenho', () => {
    const m = predio();
    const iso = isometricoDeIncendio(m)!;
    expect(iso.rede).toBe('INCENDIO');
    expect(iso.segmentos).toHaveLength(m.trechos!.length);
    const h2 = iso.pontos.find((p) => p.p.z === 3000 + 1300);
    expect(h2?.sigla).toMatch(/^H-\d$/);
    expect(iso.pontos.map((p) => p.sigla).filter((s) => /^H-/.test(s)).sort()).toEqual(['H-1', 'H-2']);
    // O isométrico do hidro (por ambiente molhado) continua sem incêndio.
    expect(isometricosDoModelo(m).some((i) => i.rede === 'INCENDIO')).toBe(false);
    // Sem tubo de incêndio, nada.
    expect(isometricoDeIncendio({ ...m, trechos: [] })).toBeNull();
  });

  it('muitos sprinklers: saem sem rótulo e o título diz', () => {
    const n = SPRINKLERS_ROTULADOS_NO_ISOMETRICO + 1;
    const m = predio((_, s) => Array.from({ length: n }, (_, i) => ({ type: 'AddTerminal', levelId: s, disciplina: 'INCENDIO', tipo: 'SPRINKLER', at: point(1000 + i * 100, 2000), cotaMm: 2700, tipoHidraulico: 'SPRINKLER' }) as Command));
    const iso = isometricoDeIncendio(m)!;
    expect(iso.pontos.some((p) => p.sigla.startsWith('SPK'))).toBe(false);
    expect(iso.titulo).toMatch(new RegExp(`${n} sprinklers sem rótulo`));
  });
});

describe('E8.3 · detalhes típicos e a folha', () => {
  it('os detalhes saem do que o desenho tem', () => {
    expect(detalhesDoModelo(predio())).toEqual(['ABRIGO', 'VGA', 'CASA_DE_BOMBAS']);
    const m = predio();
    const soHidrante = { ...m, terminais: m.terminais!.filter((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES') };
    expect(detalhesDoModelo(soHidrante)).toEqual(['ABRIGO']);
  });

  it('⚠️ PRONTO QUANDO: a folha traz o isométrico, a CI-1 e os três detalhes com as medidas da ficha e a mangueira das premissas', () => {
    const m = predio();
    const d = new DesenhistaDeProva();
    desenharFolhaDeDetalhesDeIncendio(d, m, opcoes({ denominador: 0, hipotesesDeIncendio: H }), enquadrar(m, 100, papel, false));
    const t = d.textos().join(' | ');
    expect(t).toMatch(/INCÊNDIO — ISOMÉTRICO, ESQUEMA VERTICAL E DETALHES/);
    expect(t).toMatch(/Incêndio — rede completa/);
    expect(t).toMatch(/CI-1 — Coluna de incêndio/);
    expect(t).toMatch(/Abrigo 90 × 60 × 17 cm/);
    expect(t).toMatch(/Válvula angular DN 65 a 1,30 m do piso/);
    expect(t).toMatch(new RegExp(`Mangueira ø${H.hidraulica.diametroMangueiraHidranteMm} mm · ${H.hidraulica.comprimentoMangueiraHidranteM} m`));
    expect(t).toMatch(/VGA DN 65 \(1 no desenho\)/);
    expect(t).toMatch(/Bomba principal \(BI\): 1/);
    expect(t).toMatch(/Bomba jockey \(BJ\): 1/);
    expect(t).toMatch(/Pressostatos \(PS\): 1/);
    // Sem VGA, sem o detalhe dela.
    const semVga = { ...m, terminais: m.terminais!.filter((x) => x.tipoHidraulico !== 'VGA') };
    const d2 = new DesenhistaDeProva();
    desenharFolhaDeDetalhesDeIncendio(d2, semVga, opcoes({ denominador: 0 }), enquadrar(semVga, 100, papel, false));
    expect(d2.textos().join(' | ')).not.toMatch(/VGA DN/);
  });

  it('o conjunto ganha a folha de detalhes depois da de pressões', () => {
    const t = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, incendio: true } };
    expect(planejarConjunto(predio(), t).map((p) => p.tipo).slice(-3)).toEqual(['LEGENDA_INCENDIO', 'PRESSOES_INCENDIO', 'DETALHES_INCENDIO']);
  });
});

describe('E8.3 · as peças de incêndio no corte', () => {
  it('o corte à frente da rede leva hidrante e bombas atrás do plano; a prancha desenha o abrigo com a sigla', () => {
    const m = applyCommand(predio(), { type: 'AddCorte', a: point(-4000, -1500), b: point(7000, -1500) }).model;
    const proj = projetarCorte(m, { corte: m.sections[0] });
    const tipos = (proj.pecasDeIncendio ?? []).map((p) => p.tipo);
    expect(tipos.filter((x) => x === 'HIDRANTE_SIMPLES')).toHaveLength(2);
    expect(tipos).toContain('BOMBA_INCENDIO');
    const h2 = proj.pecasDeIncendio!.find((p) => p.tipo === 'HIDRANTE_SIMPLES' && p.v === 4300);
    expect(h2).toMatchObject({ larguraMm: 900, alturaMm: 600 });
    const enq = enquadrarElevacao(proj, 50, papel);
    const com = new DesenhistaDeProva();
    desenharElevacao(com, proj, opcoes({ instalacoesNoCorte: true }), enq);
    expect(com.textos().filter((x) => x === 'H')).toHaveLength(2);
    expect(com.chamadas.filter((c) => c.tipo === 'retangulo' && (c.args[4] as { cor: string }).cor === COR_DA_DISCIPLINA.INCENDIO).length).toBeGreaterThanOrEqual(2);
    const sem = new DesenhistaDeProva();
    desenharElevacao(sem, proj, opcoes(), enq);
    expect(sem.textos()).not.toContain('H');
  });
});
