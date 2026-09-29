/**
 * E2.3 — O ESQUEMA VERTICAL (28/09/2026, roadmap hidrossanitário): as colunas
 * (AF, AQ, TQ e a ventilação CV) de um sobrado lançado pelos planejadores, com
 * os pavimentos, a legenda das colunas e o MESMO nome na planta de cada andar.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDoEsquemaVertical, desenharPlanta, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { colunasDoModelo, desenharEsquemaVertical, linhasDaLegendaDeColunas, nomesDasColunas } from '../utils/blueprintEsquemaVertical';
import { planejarAgua } from '../utils/blueprintAguaAutomatica';
import { planejarEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { modeloDoPavimento, planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';
import { desenharConjunto } from '../services/blueprintExportService';

/** O banheiro repetido nos dois andares; caixa d'água no teto do superior; CI no térreo. */
function sobrado(doisAndares = true): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  if (doisAndares) m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const niveis = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 4500, 0], [4500, 0, 4500, 3000], [4500, 3000, 0, 3000], [0, 3000, 0, 0], [2000, 0, 2000, 3000]].map(([ax, ay, bx, by]) => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
    }) as Command);
  const ponto = (levelId: string, disciplina: 'AGUA_FRIA' | 'ESGOTO', tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command =>
    ({ type: 'AddTerminal', levelId, disciplina, tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo }) as Command;
  const banheiro = (l: string): Command[] => [
    ponto(l, 'AGUA_FRIA', 'LAVATORIO', 75, 2500, 600),
    ponto(l, 'AGUA_FRIA', 'CHUVEIRO', 1500, 2925, 2100),
    ponto(l, 'AGUA_FRIA', 'VASO_SANITARIO', 75, 800, 300),
    ponto(l, 'ESGOTO', 'VASO_SANITARIO', 600, 800, 0),
    ponto(l, 'ESGOTO', 'LAVATORIO', 600, 2500, 500),
    ponto(l, 'ESGOTO', 'CHUVEIRO', 1500, 2500, 0),
    ponto(l, 'ESGOTO', 'CAIXA_SIFONADA', 1200, 2100, 0),
  ];
  m = applyBatch(m, [
    ...niveis.flatMap(paredes),
    { type: 'AddTerminal', levelId: niveis[niveis.length - 1], disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(4500, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' } as Command,
    ...niveis.flatMap(banheiro),
    ponto(niveis[0], 'ESGOTO', 'CAIXA_INSPECAO', 6000, -1500, -700),
  ]).model;
  m = recomputeSpaces(m);
  m = applyBatch(m, planejarAgua(m, m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!).comandos).model;
  return applyBatch(m, planejarEsgoto(m).comandos).model;
}

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
