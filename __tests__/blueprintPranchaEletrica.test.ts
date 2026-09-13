/**
 * F8 — A PRANCHA ELÉTRICA no papel e no DXF (13/09/2026).
 *
 * A exportação não desenhava NENHUM símbolo elétrico. Agora, com a prancha
 * "Elétrica": símbolos e rótulos por cima da planta; legenda e quadro de
 * cargas numa folha própria; camadas PLANTA-ELETRICA(-TEXTO) no DXF.
 *
 * ⚠️ E a planta arquitetônica continua a mesma: sem `eletrica`, nenhum texto
 * nem traço elétrico entra — é o que mantém os PDFs de sempre byte a byte.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  DesenhistaDeProva,
  PAPEIS,
  desenharFolhaDoQuadroDeCargas,
  desenharPlanta,
  enquadrar,
  orientar,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { familiasPresentes, linhasDaLegenda, linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { gerarDxf } from '../utils/blueprintDxf';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';

/** Sala 6 × 4 com QDC, C1 (tomadas) e um eletroduto no piso; uma luz com interruptor. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, alimentadorM: 8 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
  const c1 = m.circuitos[0].id;
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR', potenciaW: number | null, cotaMm: number, comando: string | null = null) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico, potenciaW: potenciaW ?? undefined, comando }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId: c1 }).model;
  };
  ponto(2000, 75, 'TUG', 600, 300);
  ponto(4000, 75, 'TUG', 600, 1300);
  ponto(3000, 2000, 'ILUMINACAO_TETO', 160, 2800, 'a');
  ponto(1000, 75, 'INTERRUPTOR', null, 1100, 'a');
  m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(2000, 75), cotaAMm: 0, cotaBMm: 0, bitolaMm: 25 }).model;
  m = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos[0].id, circuitoId: c1, condutores: 3 }).model;
  return m;
}

const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({
  denominador: 50,
  papel,
  titulo: 'Casa',
  revisao: 1,
  hash: 'p'.repeat(64),
  data: new Date('2026-09-13T12:00:00Z'),
  ...extra,
});

describe('a planta elétrica no papel', () => {
  it('⚠️ SEM `eletrica`, nenhum símbolo nem rótulo elétrico entra — a planta de sempre', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes(), enquadrar(m, 50, papel, false));
    const textos = d.textos().join(' | ');
    expect(textos).not.toMatch(/TUG|QDC|Ø25|VA/);
  });

  it('com `eletrica`: QDC, "TUG · C1", "Luz teto · C1", a letra do comando, "Ø25 #2,5" e a potência', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    const antes = new DesenhistaDeProva();
    desenharPlanta(antes, m, opcoes(), enquadrar(m, 50, papel, false));
    desenharPlanta(d, m, opcoes({ eletrica: true }), enquadrar(m, 50, papel, false));
    const textos = d.textos();
    expect(textos).toContain('QDC');
    expect(textos.filter((t) => t === 'TUG · C1')).toHaveLength(2);
    expect(textos).toContain('Luz teto · C1');
    expect(textos).toContain('a');
    expect(textos).toContain('Ø25 #2,5');
    expect(textos.filter((t) => t === '600 VA')).toHaveLength(2);
    // Mais traços que a arquitetônica: os símbolos existem de fato, não só o texto.
    expect(d.chamadas.length).toBeGreaterThan(antes.chamadas.length + 20);
  });

  it('a tomada MÉDIA ganha meio preenchimento a mais que a BAIXA (um polígono preto a mais)', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes({ eletrica: true }), enquadrar(m, 50, papel, false));
    const pretos = d.chamadas.filter((c) => c.tipo === 'poligono' && c.args[1] === '#000000');
    // Uma tomada média (1.300) → um polígono cheio; a baixa (300) → nenhum.
    expect(pretos).toHaveLength(1);
  });

  it('a folha do quadro de cargas traz título, o quadro, o circuito com IB e as hipóteses; a legenda só lista o que existe', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharFolhaDoQuadroDeCargas(d, m, opcoes({ eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO }), enquadrar(m, 50, papel, false));
    const textos = d.textos().join('\n');
    expect(textos).toMatch(/QUADRO DE CARGAS E PRÉ-DIMENSIONAMENTO/);
    expect(textos).toMatch(/QDC — FN 127 V/);
    expect(textos).toMatch(/^C1$/m);
    expect(textos).toMatch(/2,5 \/ 2,5/); // seção declarada / mínima
    expect(textos).toMatch(/HIPÓTESES/);
    expect(textos).toMatch(/método B1/);
    const legenda = linhasDaLegenda(m).join('\n');
    expect(legenda).toMatch(/TUG \/ TUE/);
    expect(legenda).toMatch(/LUZ TETO/);
    expect(legenda).toMatch(/INTERRUPTOR/);
    expect(legenda).toMatch(/ELETRODUTO NO PISO/);
    expect(legenda).not.toMatch(/LIGAÇÃO DIRETA/); // não há no desenho
    expect(familiasPresentes(m).has('ELETRODUTO_PISO')).toBe(true);
  });
});

describe('a elétrica no DXF', () => {
  const o = { titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64) };

  it('⚠️ sem `eletrica` as camadas existem mas ficam vazias; com, entram símbolos e textos', () => {
    const m = casa();
    const sem = gerarDxf(m, o);
    expect(sem).not.toMatch(/TEXT\s+8\s+PLANTA-ELETRICA-TEXTO/);
    const com = gerarDxf(m, { ...o, eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO });
    expect(com).toMatch(/LAYER[\s\S]*PLANTA-ELETRICA/);
    expect(com).toMatch(/8\s+PLANTA-ELETRICA-TEXTO[\s\S]*?TUG · C1/);
    expect(com).toMatch(/QUADRO DE CARGAS E PRE-DIMENSIONAMENTO/);
    expect(com.length).toBeGreaterThan(sem.length + 2000);
  });

  it('as linhas do quadro de cargas em texto trazem o circuito e as hipóteses', () => {
    const L = linhasDoQuadroDeCargas(casa(), HIPOTESES_PADRAO);
    expect(L[0]).toMatch(/QUADRO DE CARGAS/);
    // 3 pontos de CARGA (o interruptor não conta), 600 + 600 + 160 = 1.360 VA, IB 10,7 A.
    expect(L.some((l) => /^C1 \| FN 127 \| 3 \| 1360 \| 10,7 \| 2,5 \/ 2,5 \| 16 \/ 16/.test(l)), L.join('\n')).toBe(true);
    expect(L.some((l) => /^Hipoteses: cobre\/PVC, metodo B1/.test(l))).toBe(true);
  });
});
