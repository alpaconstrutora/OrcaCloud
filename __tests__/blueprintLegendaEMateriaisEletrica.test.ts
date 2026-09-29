/**
 * LEGENDA DESENHADA E LISTA DE MATERIAIS (E5.2 do roadmap elétrico, 29/09/2026).
 *
 * A legenda traz o SÍMBOLO de verdade (a mesma função da planta), só das
 * famílias presentes — e, numa planta com recorte, só das daquele recorte. Na
 * folha da planta ela vai para a faixa livre; sem espaço, uma nota remete à
 * folha do quadro de cargas, que sempre a traz. A lista de materiais é o
 * quantitativo elétrico no formato de compra: total, por quadro, por pavimento.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { alturaDaLegendaEletrica, desenharLegendaEletrica, itensDaLegendaEletrica } from '../utils/blueprintPranchaEletrica';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDaListaDeMateriaisEletrica, desenharFolhaDoQuadroDeCargas, desenharPlanta, enquadrar, orientar } from '../utils/blueprintExport';
import { desenharListaDeMateriaisEletrica, materiaisEletricos } from '../utils/blueprintListaDeMateriaisEletrica';
import { TEMPLATE_DE_PRANCHA_PADRAO, planejarConjunto } from '../utils/blueprintPranchas';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';

const TETO = 2800;
/** Sala 6 × 4 com QDC; C1 luz + interruptor; C2 duas TUG (baixa e média); eletroduto no teto e um no piso; DR e DPS. */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
  const t = m.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: TETO });
  m = applyBatch(m, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, icnKa: 6 }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'SetQuadroProps', quadroId: q, dps: { classe: 'II', upKv: 1.5, inKa: 20, disjuntorDesconexaoA: 20 } }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10, curva: 'C' }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16, curva: 'C' }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  m = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 25, idnMa: 30, polos: 2, circuitoIds: [c2] }).model;
  const ponto = (x: number, y: number, tipoEletrico: string, cotaMm: number, circuitoId: string, extra: Record<string, unknown> = {}) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico, potenciaW: 100, ...extra } as never).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  };
  ponto(3000, 2000, 'ILUMINACAO_TETO', TETO, c1, { comando: 'a' });
  ponto(1000, 75, 'INTERRUPTOR', 1100, c1, { comando: 'a', interruptor: 'UMA_SECAO' });
  ponto(2000, 75, 'TUG', 300, c2);
  ponto(4000, 75, 'TUG', 1300, c2);
  m = applyBatch(m, [
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(3000, 2000), cotaAMm: TETO, cotaBMm: TETO, bitolaMm: 25, circuitoIds: [c1] },
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(2000, 75), cotaAMm: 0, cotaBMm: 0, bitolaMm: 20, circuitoIds: [c2] },
  ]).model;
  return m;
}
const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = { denominador: 50, papel, titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64), data: new Date('2026-09-29T12:00:00Z'), eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO };

describe('legenda desenhada', () => {
  it('só as famílias presentes, na ordem da prancha; com recorte, só as do recorte (o comum nas duas)', () => {
    const m = casa();
    expect(itensDaLegendaEletrica(m).map((i) => i.rotulo)).toEqual([
      'Quadro de distribuição',
      'Luminária de teto',
      'Interruptor (letra = comando)',
      'Tomada — baixa · média · alta',
      'Eletroduto · fase · neutro · retorno · terra',
      'Eletroduto no piso',
    ]);
    expect(itensDaLegendaEletrica(m, 'ILUMINACAO').map((i) => i.familia)).toEqual(['QUADRO', 'ILUMINACAO_TETO', 'INTERRUPTOR', 'ELETRODUTO', 'ELETRODUTO_PISO']);
    expect(itensDaLegendaEletrica(m, 'FORCA').map((i) => i.familia)).toEqual(['QUADRO', 'TUG', 'ELETRODUTO', 'ELETRODUTO_PISO']);
    expect(itensDaLegendaEletrica(emptyModel())).toEqual([]);
    expect(alturaDaLegendaEletrica(emptyModel())).toBe(0);
  });

  it('desenha o SÍMBOLO (não só o texto): moldura, título, um símbolo por item — a tomada em três alturas', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    const h = desenharLegendaEletrica(d, m, 10, 10);
    expect(h).toBe(alturaDaLegendaEletrica(m));
    expect(d.textos()).toEqual(['LEGENDA', ...itensDaLegendaEletrica(m).map((i) => i.rotulo)]);
    expect(d.chamadas.filter((c) => c.tipo === 'retangulo').length).toBeGreaterThanOrEqual(2); // moldura + quadro
    const pretos = d.chamadas.filter((c) => c.tipo === 'poligono' && c.args[1] === '#000000');
    expect(pretos).toHaveLength(2); // tomada média (meio) + alta (cheia)
    const recorte = new DesenhistaDeProva();
    desenharLegendaEletrica(recorte, m, 10, 10, 74, 'FORCA');
    expect(recorte.textos()[0]).toBe('LEGENDA — TOMADAS E FORÇA');
  });

  it('na folha da planta: à direita do desenho quando cabe; sem espaço, a nota remete ao quadro de cargas; a folha do quadro de cargas traz os símbolos e as convenções', () => {
    const m = casa();
    const enq = enquadrar(m, 50, papel, false);
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes, enq);
    expect(d.textos()).toContain('LEGENDA');
    expect(d.textos()).toContain('Quadro de distribuição');
    const legenda = d.chamadas.find((c) => c.tipo === 'texto' && c.args[2] === 'LEGENDA')!;
    expect(legenda.args[0] as number).toBeGreaterThan(enq.offsetXMm + enq.desenhoLarguraMm);
    // Com a planta ocupando a folha (1:25 num A4), não cabe: a nota.
    const a4 = orientar(PAPEIS.find((p) => p.id === 'A4') ?? PAPEIS[0], true);
    const apertado = enquadrar(m, 25, a4, false);
    const d2 = new DesenhistaDeProva();
    desenharPlanta(d2, m, { ...opcoes, papel: a4, denominador: 25 }, apertado);
    expect(d2.textos()).not.toContain('LEGENDA');
    expect(d2.textos()).toContain('Legenda: ver a folha do quadro de cargas.');
    // Sem `eletrica`, nada de legenda.
    const arq = new DesenhistaDeProva();
    desenharPlanta(arq, m, { ...opcoes, eletrica: false }, enq);
    expect(arq.textos()).not.toContain('LEGENDA');
    const qc = new DesenhistaDeProva();
    desenharFolhaDoQuadroDeCargas(qc, m, opcoes, enq);
    expect(qc.textos()).toContain('LEGENDA');
    expect(qc.textos()).toContain('Tomada — baixa · média · alta');
    expect(qc.textos()).toContain('CONVENÇÕES');
    expect(qc.textos().some((t) => t.startsWith('TUG / TUE — tomada'))).toBe(true);
  });
});

describe('lista de materiais', () => {
  it('totais por grupo (condutores por tipo e seção, eletrodutos por Ø, pontos, quadro, disjuntores com curva/Icn, DR, DPS); por quadro; por pavimento', () => {
    const m = casa();
    const r = materiaisEletricos(m);
    const itens = r.totais.map((l) => `${l.grupo}|${l.item}|${l.unidade}`);
    expect(itens).toEqual(expect.arrayContaining([
      'Eletrodutos|Eletroduto Ø20|m',
      'Eletrodutos|Eletroduto Ø25|m',
      'Pontos e caixas|TUG — tomada de uso geral|un',
      'Quadros|Quadro de distribuição|un',
      'Proteção|Disjuntor 10 A curva C · 6 kA|un',
      'Proteção|Disjuntor 16 A curva C · 6 kA|un',
      'Proteção|DR 25 A / 30 mA 2P|un',
      'Proteção|DPS classe II 20 kA Up 1,5 kV|un',
    ]));
    expect(itens.some((i) => i.startsWith('Condutores|Condutor fase 1,5 mm²|m'))).toBe(true);
    expect(r.totais.find((l) => l.item === 'TUG — tomada de uso geral')!.quantidade).toBe(2);
    expect(r.porQuadro.map((q) => q.nome)).toEqual(['QDC']);
    expect(r.porQuadro[0].linhas.find((l) => l.item === 'Circuitos')!.quantidade).toBe(2);
    expect(r.porQuadro[0].linhas.some((l) => l.item.startsWith('DPS classe II'))).toBe(true);
    expect(r.porPavimento).toEqual([expect.objectContaining({ nome: 'Térreo', pontos: 4 })]);
    expect(materiaisEletricos(emptyModel()).totais).toEqual([]);
  });

  it('a folha: título, seções TOTAL / QUADRO / POR PAVIMENTO, uma linha por item com quantidade e unidade; sem elétrica, o aviso', () => {
    const m = casa();
    const enq = enquadrar(m, 50, papel, false);
    const d = new DesenhistaDeProva();
    desenharFolhaDaListaDeMateriaisEletrica(d, m, opcoes, enq);
    const t = d.textos();
    for (const x of ['LISTA DE MATERIAIS — ELÉTRICA', 'TOTAL DO DESENHO', 'QUADRO QDC', 'POR PAVIMENTO', 'Condutores', 'Proteção', 'Disjuntor 10 A curva C · 6 kA', 'Térreo — pontos']) expect(t, x).toContain(x);
    expect(t).toContain('m');
    expect(t).toContain('un');
    const vazio = new DesenhistaDeProva();
    expect(desenharListaDeMateriaisEletrica(vazio, emptyModel(), 0, 0, 200, 200)).toBe(0);
    expect(vazio.textos()).toContain('Sem instalação elétrica no desenho.');
  });

  it('no conjunto, a folha fecha o bloco elétrico', () => {
    const m = casa();
    const t = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, eletrica: true } };
    const plano = planejarConjunto(m, t);
    expect(plano.map((p) => p.tipo)).toEqual(['ELETRICA', 'QUADRO_DE_CARGAS', 'UNIFILAR', 'MATERIAIS_ELETRICA']);
    expect(plano[3].titulo).toBe('Lista de materiais — elétrica');
  });
});
