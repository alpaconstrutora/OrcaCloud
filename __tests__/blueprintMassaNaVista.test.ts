import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { baseDoCorte, projetarCorte } from '../utils/blueprintCorte';
import { projetarElevacao } from '../utils/blueprintElevation';
import { comMassa, massaNaVista, nomeDoBlocoAVista, rotulosDosPavimentos, unidadesNaVista, type FatiaDoPiso, type PisosDaMassa } from '../utils/blueprintMassaNaVista';
import { DesenhistaDeProva, desenharElevacao, enquadrarElevacao, PAPEIS, type OpcoesExportacao } from '../utils/blueprintExport';
import { CAMADAS, gerarDxf } from '../utils/blueprintDxf';

const ret = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/**
 * O Garden na Planta 26/10/2026: Torre A (y 6–32 m) e Torre B (y 32–58 m), 13,5 m de largura, 4 pavimentos de 3 m;
 * a garagem da Torre A embaixo, 2 pavimentos (−6 a 0).
 */
function garden(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const lv = m.levels[0].id;
  const bloco = (nome: string, pontos: { x: number; y: number }[], cotaBaseMm: number, pavimentos: number, uso: string): Command =>
    ({ type: 'AddBloco', levelId: lv, nome, pontos, cotaBaseMm, pavimentos, peDireitoMm: 3000, uso }) as Command;
  return applyBatch(m, [
    bloco('Torre A · Garagem', ret(2281, 6342, 15781, 32342), -6000, 2, 'GARAGEM'),
    bloco('Torre A', ret(2281, 6342, 15781, 32342), 0, 4, 'RESIDENCIAL'),
    bloco('Torre B', ret(2281, 32342, 15781, 58342), 0, 4, 'RESIDENCIAL'),
  ]).model;
}

describe('massaNaVista', () => {
  // O corte do print: uma linha vertical em x = 9 m, de baixo para cima, olhando para a esquerda (−x).
  const corte = { id: 'c', rotulo: 'A', a: { x: 9000, y: -2000 }, b: { x: 9000, y: 66000 }, olharPara: 'ESQUERDA' as const, levelId: '' };

  it('⚠️ PRONTO QUANDO: o corte que atravessa as torres mostra os blocos CORTADOS, com as linhas dos pavimentos', () => {
    const m = garden();
    const base = baseDoCorte(corte as never);
    const r = massaNaVista(m, base, corte.a);
    expect(r.map((b) => [b.nome, b.cortado])).toEqual([
      ['Torre A · Garagem', true],
      ['Torre A', true],
      ['Torre B', true],
    ]);
    const torreA = r.find((b) => b.nome === 'Torre A')!;
    expect([torreA.vMin, torreA.vMax]).toEqual([0, 12000]);
    expect(torreA.pisos).toEqual([3000, 6000, 9000]);
    expect(Math.abs(torreA.uMax - torreA.uMin)).toBe(26000);
    expect(r.find((b) => b.nome === 'Torre A · Garagem')!.enterrado).toBe(true);
  });

  it('o corte que passa ao lado: o bloco atrás sai em vista; o da frente não sai', () => {
    const m = garden();
    // A linha em x = 20 m (fora do lote), olhando para −x: as torres ficam ATRÁS do plano.
    const atras = { ...corte, a: { x: 20000, y: -2000 }, b: { x: 20000, y: 66000 } };
    const r = massaNaVista(m, baseDoCorte(atras as never), atras.a);
    expect(r).toHaveLength(3);
    expect(r.every((b) => !b.cortado)).toBe(true);
    // Olhando para +x a partir de x = 20 m, as torres ficam na FRENTE do plano.
    const frente = { ...atras, olharPara: 'DIREITA' as const };
    expect(massaNaVista(m, baseDoCorte(frente as never), frente.a)).toEqual([]);
  });

  it('na fachada (sem linha de corte), todo bloco sai em vista', () => {
    const m = garden();
    const r = massaNaVista(m, baseDoCorte(corte as never), null);
    expect(r).toHaveLength(3);
    expect(r.every((b) => !b.cortado)).toBe(true);
  });

  it('só os níveis da vista', () => {
    const m = garden();
    expect(massaNaVista(m, baseDoCorte(corte as never), corte.a, ['outro-nivel'])).toEqual([]);
  });
});

describe('a projeção com a massa: tela, prancha e DXF (29/10/2026)', () => {
  const corte = { id: 'c', uid: 'c', rotulo: 'A', a: { x: 9000, y: -2000 }, b: { x: 9000, y: 66000 }, olharPara: 'ESQUERDA' as const };
  const OPCOES: OpcoesExportacao = { denominador: 200, papel: PAPEIS[0], titulo: 'Estudo', revisao: 1, hash: 'h' };

  it('a caixa do corte só com blocos é a deles: 52 m ao longo, da garagem (−6 m) ao topo (+12 m)', () => {
    const m = garden();
    const proj = comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a);
    expect(proj.massa).toHaveLength(3);
    expect(proj.bbox.uMax - proj.bbox.uMin).toBe(52000);
    expect([proj.bbox.vMin, proj.bbox.vMax]).toEqual([-6000, 12000]);
  });

  it('⚠️ PRONTO QUANDO: a prancha do corte só com massa NÃO é recusada como vazia e escreve o nome dos blocos', () => {
    const m = garden();
    const proj = comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a);
    const enq = enquadrarElevacao(proj, 200, PAPEIS[0]);
    expect(enq.vazio).toBe(false);
    const d = new DesenhistaDeProva();
    desenharElevacao(d, proj, OPCOES, enq);
    const textos = d.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2]);
    expect(textos).toEqual(expect.arrayContaining(['Torre A', 'Torre B', 'Torre A · Garagem']));
    // Sem a massa, a mesma projeção era vazia.
    expect(enquadrarElevacao(projetarCorte(m, { corte: corte as never }), 200, PAPEIS[0]).vazio).toBe(true);
  });

  it('a fachada com a massa também sai na prancha', () => {
    const m = garden();
    const proj = comMassa(m, projetarElevacao(m, { direcao: 'FRENTE' }), null);
    expect(proj.massa!.length).toBeGreaterThan(0);
    expect(enquadrarElevacao(proj, 200, PAPEIS[0]).vazio).toBe(false);
  });

  it('o DXF leva os blocos na camada própria', () => {
    const m = garden();
    const proj = comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a);
    const dxf = gerarDxf(m, { titulo: 'T', revisao: 1, hash: 'h', elevacoes: [proj] });
    expect(dxf).toContain(CAMADAS.ELEV_MASSA);
  });
});

describe('unidadesNaVista (09/11/2026)', () => {
  // A Torre A em 4 unidades por pavimento: 2 fileiras (x 2,3–9 e 9–15,8 m) × 2 ao longo (y 6–19 e 19–32 m).
  const fatias: FatiaDoPiso[] = [
    { nome: '101', posicao: 'FRENTE', anel: ret(2281, 6342, 9031, 19342) },
    { nome: '102', posicao: 'FRENTE', anel: ret(9031, 6342, 15781, 19342) },
    { nome: '103', posicao: 'FUNDOS', anel: ret(2281, 19342, 9031, 32342) },
    { nome: '104', posicao: 'FUNDOS', anel: ret(9031, 19342, 15781, 32342) },
  ];
  const soTorreA = (blocoId: string, k: number) => (k === 1 && blocoId === 'A' ? fatias : null);

  it('no corte, as unidades que o plano atravessa no pavimento, cada uma no seu trecho', () => {
    const m = garden();
    const idA = m.blocos!.find((b) => b.nome === 'Torre A')!.id;
    // O plano em x = 6 m atravessa a fileira de 101 e 103.
    const corte = { id: 'c', rotulo: 'A', a: { x: 6000, y: -2000 }, b: { x: 6000, y: 66000 }, olharPara: 'ESQUERDA' as const };
    const base = baseDoCorte(corte as never);
    const blocos = massaNaVista(m, base, corte.a).filter((b) => b.blocoId === idA);
    const r = unidadesNaVista(blocos, base, corte.a, (id, k) => soTorreA(id === idA ? 'A' : id, k));
    expect(r.map((u) => [u.nome, u.posicao, Math.round(u.uMax - u.uMin), u.vMin, u.vMax, u.cortada])).toEqual([
      ['101', 'FRENTE', 13000, 0, 3000, true],
      ['103', 'FUNDOS', 13000, 0, 3000, true],
    ]);
  });

  it('na fachada, a unidade da frente cobre a de trás', () => {
    const m = garden();
    const idA = m.blocos!.find((b) => b.nome === 'Torre A')!.id;
    // Olhando de x grande para x pequeno (o plano à direita das torres, olhando para −x): a fileira de 102/104 (x 9–15,8)
    // está mais perto e cobre 101/103.
    const lado = { id: 'c', rotulo: 'L', a: { x: 20000, y: -2000 }, b: { x: 20000, y: 66000 }, olharPara: 'ESQUERDA' as const };
    const base = baseDoCorte(lado as never);
    const blocos = massaNaVista(m, base, null).filter((b) => b.blocoId === idA);
    const r = unidadesNaVista(blocos, base, null, (id, k) => soTorreA(id === idA ? 'A' : id, k));
    expect(r.map((u) => u.nome).sort()).toEqual(['102', '104']);
    expect(r.every((u) => !u.cortada)).toBe(true);
  });

  it('pavimento sem unidades não sai', () => {
    const m = garden();
    const corte = { id: 'c', rotulo: 'A', a: { x: 6000, y: -2000 }, b: { x: 6000, y: 66000 }, olharPara: 'ESQUERDA' as const };
    const base = baseDoCorte(corte as never);
    expect(unidadesNaVista(massaNaVista(m, base, corte.a), base, corte.a, () => null)).toEqual([]);
  });
});

describe('unidades e pavimentos na prancha e no DXF (09/11/2026)', () => {
  const corte = { id: 'c', uid: 'c', rotulo: 'A', a: { x: 6000, y: -2000 }, b: { x: 6000, y: 66000 }, olharPara: 'ESQUERDA' as const };
  const OPCOES = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ denominador: 100, papel: PAPEIS[2] ?? PAPEIS[0], titulo: 'Estudo', revisao: 1, hash: 'h', ...extra });
  const unidadesDaTorreA: FatiaDoPiso[] = [
    { nome: '101', posicao: 'FRENTE', anel: ret(2281, 6342, 9031, 19342) },
    { nome: '102', posicao: 'FRENTE', anel: ret(9031, 6342, 15781, 19342) },
    { nome: '103', posicao: 'FUNDOS', anel: ret(2281, 19342, 9031, 32342) },
    { nome: '104', posicao: 'FUNDOS', anel: ret(9031, 19342, 15781, 32342) },
  ];
  const comPisos = () => {
    const m = garden();
    const idA = m.blocos!.find((b) => b.nome === 'Torre A')!.id;
    const pisos: PisosDaMassa = new Map([[idA, ['Térreo', 'Pavimento 1', 'Pavimento 2', 'Pavimento 3'].map((nome, i) => ({ nome, elevacaoMm: i * 3000, unidades: i === 1 ? unidadesDaTorreA : [] }))]]);
    return { m, pisos, proj: comMassa(m, projetarCorte(m, { corte: corte as never }), corte.a, undefined, pisos) };
  };

  it('a projeção com os pavimentos leva as unidades e os nomes dos pavimentos', () => {
    const { proj } = comPisos();
    expect(proj.unidadesDaMassa!.map((u) => u.nome)).toEqual(['101', '103']);
    const torreA = proj.massa!.find((b) => b.nome === 'Torre A')!;
    expect(torreA.rotulosDosPisos!.map((r) => r.nome)).toEqual(['Térreo', 'Pavimento 1', 'Pavimento 2', 'Pavimento 3']);
  });

  it('os pavimentos ao lado: por fora no começo e no fim do conjunto, um rótulo por pavimento', () => {
    const { proj } = comPisos();
    const r = rotulosDosPavimentos(proj.massa!);
    const daTorreA = r.filter((x) => x.texto.startsWith('Térreo') || x.texto.startsWith('Pavimento'));
    expect(daTorreA.map((x) => x.texto)).toEqual(['Térreo +0,00', 'Pavimento 1 +3,00', 'Pavimento 2 +6,00', 'Pavimento 3 +9,00']);
    expect(new Set(r.map((x) => x.lado))).toEqual(new Set(['INICIO', 'FIM']));
    // A Torre B não tem cadastro: "Nº pav" e a cota do desenho.
    expect(r.some((x) => x.texto === '1º pav +0,00')).toBe(true);
  });

  it('⚠️ PRONTO QUANDO: a prancha escreve as unidades (com a posição) e os pavimentos — e cada liga/desliga tira o seu', () => {
    const { proj } = comPisos();
    const textos = (o: OpcoesExportacao) => {
      const d = new DesenhistaDeProva();
      desenharElevacao(d, proj, o, enquadrarElevacao(proj, o.denominador, o.papel));
      return d.chamadas.filter((c) => c.tipo === 'texto').map((c) => String(c.args[2]));
    };
    const tudo = textos(OPCOES());
    expect(tudo).toEqual(expect.arrayContaining(['Torre A', '101 · Frente', '103 · Fundos', 'Pavimento 1 +3,00']));
    const nada = textos(OPCOES({ exibirNaMassa: { blocos: false, unidades: false, posicao: false, pavimentos: false } }));
    expect(nada.some((t) => t === 'Torre A' || t.startsWith('101') || t.startsWith('Pavimento'))).toBe(false);
    const semPosicao = textos(OPCOES({ exibirNaMassa: { blocos: true, unidades: true, posicao: false, pavimentos: true } }));
    expect(semPosicao).toContain('101');
    expect(semPosicao).not.toContain('101 · Frente');
  });

  it('o DXF escreve as unidades e os pavimentos na camada da massa — e desliga com o Exibir', () => {
    const { m, proj } = comPisos();
    const tudo = gerarDxf(m, { titulo: 'T', revisao: 1, hash: 'h', elevacoes: [proj] });
    expect(tudo).toContain('101 · Frente');
    expect(tudo).toContain('Pavimento 1 +3,00');
    expect(tudo).toContain('Torre A');
    const nada = gerarDxf(m, { titulo: 'T', revisao: 1, hash: 'h', elevacoes: [proj], exibirNaMassa: { blocos: false, unidades: false, posicao: false, pavimentos: false } });
    expect(nada).not.toContain('101 · Frente');
    expect(nada).not.toContain('Pavimento 1 +3,00');
  });
});

describe('só o que está na frente (10/11/2026)', () => {
  // "na vista de frente e fundos a identificação das unidades está sobreposta. mostrar apenas a que está na frente".
  // A fachada da FRENTE do Garden: olhando para +y, a Torre A (y 6–32 m) fica na frente da Torre B (y 32–58 m), no
  // mesmo trecho de u.
  const frente = { id: 'f', rotulo: 'F', a: { x: -10000, y: -5000 }, b: { x: 30000, y: -5000 }, olharPara: 'ESQUERDA' as const };
  const fatias = (prefixo: string, y0: number, y1: number): FatiaDoPiso[] => [
    { nome: `${prefixo}01`, posicao: 'FRENTE', anel: ret(2281, y0, 9031, (y0 + y1) / 2) },
    { nome: `${prefixo}02`, posicao: 'FRENTE', anel: ret(9031, y0, 15781, (y0 + y1) / 2) },
    { nome: `${prefixo}03`, posicao: 'FUNDOS', anel: ret(2281, (y0 + y1) / 2, 9031, y1) },
    { nome: `${prefixo}04`, posicao: 'FUNDOS', anel: ret(9031, (y0 + y1) / 2, 15781, y1) },
  ];
  const montar = () => {
    const m = garden();
    const id = (nome: string) => m.blocos!.find((b) => b.nome === nome)!.id;
    const pisos: PisosDaMassa = new Map([
      [id('Torre A'), [0, 1, 2, 3].map((i) => ({ nome: `A${i}`, elevacaoMm: i * 3000, unidades: fatias(`A${i}`, 6342, 32342) }))],
      [id('Torre B'), [0, 1, 2, 3].map((i) => ({ nome: `B${i}`, elevacaoMm: i * 3000, unidades: fatias(`B${i}`, 32342, 58342) }))],
    ]);
    const base = baseDoCorte(frente as never);
    const massa = massaNaVista(m, base, null);
    return { m, pisos, base, massa };
  };

  it('⚠️ PRONTO QUANDO: as unidades da Torre B (atrás da A) não saem; só as da frente da A', () => {
    const { pisos, base, massa } = montar();
    const r = unidadesNaVista(massa, base, null, (id, k) => pisos.get(id)?.[k - 1]?.unidades);
    expect(r.some((u) => u.nome.startsWith('B'))).toBe(false);
    expect(r.filter((u) => u.indice === 2).map((u) => u.nome).sort()).toEqual(['A101', 'A102']);
  });

  it('o nome e os pavimentos do bloco de trás não saem; os da frente, sim', () => {
    const { pisos, m, base } = montar();
    const massa = massaNaVista(m, base, null).map((b) => ({ ...b, rotulosDosPisos: pisos.get(b.blocoId)?.map((p) => ({ nome: p.nome, elevacaoMm: p.elevacaoMm })) }));
    const visiveis = massa.filter((b) => nomeDoBlocoAVista(massa, b)).map((b) => b.nome).sort();
    expect(visiveis).toContain('Torre A');
    expect(visiveis).not.toContain('Torre B');
    const textos = rotulosDosPavimentos(massa).map((x) => x.texto);
    expect(textos.some((t) => t.startsWith('A1'))).toBe(true);
    expect(textos.some((t) => t.startsWith('B1'))).toBe(false);
  });
});
