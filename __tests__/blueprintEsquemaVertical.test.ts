/**
 * E2.3 — O ESQUEMA VERTICAL (28/09/2026, roadmap hidrossanitário): as colunas
 * (AF, AQ, TQ e a ventilação CV) de um sobrado lançado pelos planejadores, com
 * os pavimentos, a legenda das colunas e o MESMO nome na planta de cada andar.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, point } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharElevacao, desenharFolhaDoEsquemaVertical, desenharPlanta, enquadrar, enquadrarElevacao, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { isometricosDoModelo } from '../utils/blueprintIsometricoPrancha';
import { projetarCorte } from '../utils/blueprintCorte';
import { COR_DA_DISCIPLINA } from '../utils/blueprintRede';
import { colunasDoModelo, desenharEsquemaVertical, linhasDaLegendaDeColunas, nomesDasColunas } from '../utils/blueprintEsquemaVertical';
import { sobrado } from './fixtures/sobradoHidro';
import { modeloDoPavimento, planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';
import { desenharConjunto } from '../services/blueprintExportService';

const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({
  denominador: 50, papel, titulo: 'Sobrado', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-09-28T12:00:00Z'), ...extra,
});

describe('E2.3 — quais são as colunas', () => {
  it('sobrado: colunas de água atravessando os dois andares e UM tubo de queda com ventilação; descida a ponto não vira coluna', () => {
    const m = sobrado();
    const colunas = colunasDoModelo(m);
    const af = colunas.filter((c) => c.sigla === 'AF');
    const tq = colunas.filter((c) => c.sigla === 'TQ');
    expect(af.length).toBeGreaterThan(0);
    expect(af.map((c) => c.nome)).toEqual(af.map((_, i) => `AF-${i + 1}`));
    for (const c of af) expect(c.niveis).toHaveLength(2);
    expect(tq).toHaveLength(1);
    expect(tq[0]).toMatchObject({ nome: 'TQ-1', nomeDaVentilacao: 'CV-1' });
    expect(tq[0].niveis).toHaveLength(2);
    // Nenhuma "coluna" na posição do chuveiro, do lavatório ou da caixa sifonada.
    const pontos = (m.terminais ?? []).filter((t) => t.tipoHidraulico && t.tipoHidraulico !== 'VASO_SANITARIO' && t.tipoHidraulico !== 'RESERVATORIO');
    for (const c of colunas) expect(pontos.some((p) => Math.hypot(p.at.x - c.x, p.at.y - c.y) < 1)).toBe(false);
    // Determinístico.
    expect(colunasDoModelo(sobrado())).toEqual(colunas);
  });

  it('legenda: uma linha por coluna, e a da ventilação logo depois do TQ', () => {
    const m = sobrado();
    const linhas = linhasDaLegendaDeColunas(m, colunasDoModelo(m));
    expect(linhas.some((l) => /^AF-1 — Água fria · ø[\d/]+ mm · Térreo → Superior$/.test(l))).toBe(true);
    const i = linhas.findIndex((l) => l.startsWith('TQ-1 — Tubo de queda'));
    expect(linhas[i + 1]).toMatch(/^CV-1 — Coluna de ventilação do TQ-1 · ø\d+ mm/);
  });
});

describe('E2.3 — no papel', () => {
  it('o esquema: pavimentos com cota, nome de cada coluna, legenda; só as redes pedidas', () => {
    const m = sobrado();
    const d = new DesenhistaDeProva();
    const n = desenharEsquemaVertical(d, m, ['AGUA', 'ESGOTO'], 10, 10, 380, 240);
    expect(n).toBe(colunasDoModelo(m).length);
    const textos = d.textos();
    for (const t of ['Térreo', 'Superior', 'Cobertura', '+0,00', '+2,90', '+5,70', 'AF-1', 'TQ-1', 'CV-1', 'LEGENDA DAS COLUNAS']) expect(textos).toContain(t);
    const soEsgoto = new DesenhistaDeProva();
    expect(desenharEsquemaVertical(soEsgoto, m, ['ESGOTO'], 10, 10, 380, 240)).toBe(1);
    expect(soEsgoto.textos()).not.toContain('AF-1');
  });

  it('a planta do superior diz o MESMO nome do esquema (numerado no desenho inteiro)', () => {
    const m = sobrado();
    const sup = modeloDoPavimento(m, m.levels[1].id);
    const d = new DesenhistaDeProva();
    desenharPlanta(d, sup, opcoes({ hidrossanitaria: 'ESGOTO', nomesDasColunas: nomesDasColunas(m) }), enquadrar(sup, 50, papel, false));
    expect(d.textos().some((t) => /^TQ-1 · CV-1 ø\d+$/.test(t))).toBe(true);
    // Sem "TQ" e "Ventilação" soltos um em cima do outro, como era antes.
    expect(d.textos().some((t) => /^Ventilação/.test(t))).toBe(false);
  });
});

describe('E2.3 — no conjunto', () => {
  it('a folha do esquema entra depois da legenda quando há coluna; térreo sem TQ e só esgoto = sem esquema', () => {
    const m = sobrado();
    const t = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, hidraulica: true, sanitaria: true } };
    const plano = planejarConjunto(m, t);
    expect(plano.map((p) => p.tipo).slice(-2)).toEqual(['DETALHES_HIDRO', 'ESQUEMA_HIDRO']);
    const terrea = sobrado(false);
    const soEsgoto = { ...t, incluir: { ...t.incluir, hidraulica: false } };
    expect(planejarConjunto(terrea, soEsgoto).some((p) => p.tipo === 'ESQUEMA_HIDRO')).toBe(false);
    // E a folha sai desenhada, com o título e as colunas.
    const folhas: DesenhistaDeProva[] = [];
    desenharConjunto(m, opcoes(), t, () => {
      const f = new DesenhistaDeProva();
      folhas.push(f);
      return f;
    });
    const ultima = folhas[folhas.length - 1].textos();
    expect(ultima).toContain('ESQUEMA VERTICAL HIDROSSANITÁRIO');
    expect(ultima).toContain('TQ-1');
  });

  it('a folha avulsa do esquema tem carimbo', () => {
    const m = sobrado();
    const d = new DesenhistaDeProva();
    desenharFolhaDoEsquemaVertical(d, m, opcoes({ denominador: 0 }), enquadrar(m, 50, papel, false), ['AGUA', 'ESGOTO']);
    expect(d.textos()).toContain('Sobrado');
  });
});

describe('E2.4 — cotas e indicações', () => {
  it('isométrico do sobrado: todo nó está na ponta de um tubo desenhado (o do andar de cima não fica solto no ar)', () => {
    for (const iso of isometricosDoModelo(sobrado())) {
      const pts = iso.segmentos.flatMap((s) => [s.a, s.b]);
      for (const n of iso.nos) expect(pts.some((p) => Math.hypot(p.x - n.p.x, p.y - n.p.y) < 1 && Math.abs(p.z - n.p.z) < 1)).toBe(true);
    }
  });

  it('o CORTE leva a rede só quando pedido: atrás do plano em linha, cortada na cor da disciplina', () => {
    const m = applyCommand(sobrado(), { type: 'AddCorte', a: point(-800, 1500), b: point(7000, 1500) }).model;
    const proj = projetarCorte(m, { corte: m.sections[0] });
    const enq = enquadrarElevacao(proj, 50, papel);
    const agua = COR_DA_DISCIPLINA.AGUA_FRIA;
    const tracosDeAgua = (d: DesenhistaDeProva) => d.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === agua).length;
    const sem = new DesenhistaDeProva();
    desenharElevacao(sem, proj, opcoes(), enq);
    const com = new DesenhistaDeProva();
    desenharElevacao(com, proj, opcoes({ instalacoesNoCorte: true }), enq);
    expect(tracosDeAgua(sem)).toBe(0);
    expect(tracosDeAgua(com)).toBeGreaterThan(0);
    // O conjunto com hidrossanitário liga sozinho.
    const t = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, elevacoes: false, ampliacoes: false, tabelas: false, cortes: true, hidraulica: true } };
    const folhas: DesenhistaDeProva[] = [];
    const r = desenharConjunto(m, opcoes(), t, () => {
      const f = new DesenhistaDeProva();
      folhas.push(f);
      return f;
    });
    const iCorte = r.pranchas.findIndex((p) => p.tipo === 'CORTE');
    expect(tracosDeAgua(folhas[iCorte])).toBeGreaterThan(0);
  });
});
