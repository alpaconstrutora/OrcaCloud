/**
 * PLANTAS DE LUZ E FORÇA (E5.1 do roadmap elétrico, 29/09/2026).
 *
 * A elétrica se separa em ILUMINAÇÃO (luminárias, interruptores e os
 * eletrodutos só deles) e TOMADAS E FORÇA (tomadas, TUE, equipamentos…); o
 * comum — quadro, caixa de passagem, eletroduto de circuitos dos dois tipos —
 * entra nas duas. Sem recorte, a planta é a de sempre, chamada por chamada.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { categoriaDoPonto, categoriaDoTrecho, categoriasDosCircuitos, entraNoRecorte, idsForaDaVistaEletrica } from '../utils/blueprintRecorteEletrico';
import { desenharEletrica } from '../utils/blueprintPranchaEletrica';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar, orientar } from '../utils/blueprintExport';
import { gerarDxf } from '../utils/blueprintDxf';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { TEMPLATE_DE_PRANCHA_PADRAO, planejarConjunto, templateDePranchaDaColuna } from '../utils/blueprintPranchas';
import { CONFIGURACAO_PADRAO, configuracaoDaColuna } from '../utils/blueprintTemplatesDeVista';

const TETO = 2800;

/**
 * Sala 8 × 4: C1 luz + interruptor 'a'; C2 duas TUG; C3 ar-condicionado (F-F); caixa de passagem.
 * O tronco é COMUM (C1 + C2 = 6 condutores — abaixo do limite de numeração da E2.4, para os números
 * sobre ele serem os dos circuitos); o AC tem eletroduto próprio.
 */
function casa(): { m: BlueprintModel; c1: string; c2: string; c3: string; tronco: string; soLuz: string; soTug: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
  const t = m.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: TETO });
  m = applyBatch(m, [p(0, 0, 8000, 0), p(8000, 0, 8000, 4000), p(8000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1500, ligacao: 'FN', tensaoV: 127 }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C3', tensaoV: 220, ligacao: 'FF', secaoMm2: 4, disjuntorA: 25 }).model;
  const [c1, c2, c3] = m.circuitos.map((c) => c.id);
  const ponto = (x: number, y: number, tipoEletrico: string, cotaMm: number, circuitoId: string, extra: Record<string, unknown> = {}) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico, potenciaW: 100, ...extra } as never).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  };
  ponto(4000, 2000, 'ILUMINACAO_TETO', TETO, c1, { comando: 'a' });
  ponto(1000, 75, 'INTERRUPTOR', 1100, c1, { comando: 'a' });
  ponto(2000, 75, 'TUG', 300, c2);
  ponto(6000, 75, 'TUG', 1300, c2);
  ponto(7925, 2000, 'AR_CONDICIONADO', 2200, c3);
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'CP', at: point(4000, 1000), cotaMm: TETO, tipoEletrico: 'CAIXA_PASSAGEM' } as never).model;
  const tr = (a: [number, number], ca: number, b: [number, number], cb: number, cs: string[]): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25, circuitoIds: cs });
  m = applyBatch(m, [
    tr([75, 1000], TETO, [4000, 1000], TETO, [c1, c2]),
    tr([4000, 1000], TETO, [4000, 2000], TETO, [c1]),
    tr([75, 1000], 1500, [2000, 75], 300, [c2]),
    tr([4000, 1000], TETO, [7925, 2000], TETO, [c3]),
  ]).model;
  const [tronco, soLuz, soTug] = m.trechos.map((x) => x.id);
  return { m, c1, c2, c3, tronco, soLuz, soTug };
}
const proj = { px: (x: number) => x / 50, py: (y: number) => -y / 50 };
const textos = (m: BlueprintModel, recorte?: 'ILUMINACAO' | 'FORCA') => {
  const d = new DesenhistaDeProva();
  desenharEletrica(d, m, proj, 1, recorte ? { recorte } : {});
  return { d, t: d.textos() };
};

describe('categorias', () => {
  it('ponto pelo tipo; circuito pelos pontos; eletroduto pelos circuitos (dos dois tipos = comum)', () => {
    const { m, c1, c2, c3, tronco, soLuz, soTug } = casa();
    expect(categoriaDoPonto('ILUMINACAO_TETO')).toBe('ILUMINACAO');
    expect(categoriaDoPonto('INTERRUPTOR')).toBe('ILUMINACAO');
    expect(categoriaDoPonto('TUG')).toBe('FORCA');
    expect(categoriaDoPonto('AR_CONDICIONADO')).toBe('FORCA');
    expect(categoriaDoPonto('MEDIDOR')).toBe('FORCA');
    expect(categoriaDoPonto('CAIXA_PASSAGEM')).toBe('COMUM');
    expect(categoriaDoPonto(null)).toBe('COMUM');
    const porC = categoriasDosCircuitos(m);
    expect([porC.get(c1), porC.get(c2), porC.get(c3)]).toEqual(['ILUMINACAO', 'FORCA', 'FORCA']);
    const trecho = (id: string) => m.trechos.find((x) => x.id === id)!;
    expect(categoriaDoTrecho(trecho(tronco), porC)).toBe('COMUM');
    expect(categoriaDoTrecho(trecho(soLuz), porC)).toBe('ILUMINACAO');
    expect(categoriaDoTrecho(trecho(soTug), porC)).toBe('FORCA');
    expect(categoriaDoTrecho({ circuitoIds: null }, porC)).toBe('COMUM');
    expect(entraNoRecorte('COMUM', 'ILUMINACAO')).toBe(true);
    expect(entraNoRecorte('FORCA', 'ILUMINACAO')).toBe(false);
    expect(entraNoRecorte('FORCA', null)).toBe(true);
  });
});

describe('a planta com recorte', () => {
  it('⚠️ sem recorte, `{}` e a chamada antiga dão EXATAMENTE as mesmas chamadas de desenho', () => {
    const { m } = casa();
    const a = new DesenhistaDeProva();
    desenharEletrica(a, m, proj);
    const b = new DesenhistaDeProva();
    desenharEletrica(b, m, proj, 1, {});
    expect(JSON.stringify(b.chamadas)).toBe(JSON.stringify(a.chamadas));
  });

  it('iluminação: luz e interruptor, sem tomada nem AC; força: tomadas e AC, sem luz; o QDC e a caixa nas duas; o tronco comum nas duas, só com os condutores do recorte', () => {
    const { m } = casa();
    const tudo = textos(m).t;
    const luz = textos(m, 'ILUMINACAO').t;
    const forca = textos(m, 'FORCA').t;
    expect(tudo.some((x) => x.startsWith('TUG'))).toBe(true);
    expect(luz.some((x) => x.startsWith('TUG'))).toBe(false);
    expect(luz.some((x) => x.startsWith('AC'))).toBe(false);
    expect(luz).toContain('a');
    expect(forca.some((x) => x.startsWith('TUG'))).toBe(true);
    expect(forca.some((x) => x.startsWith('AC'))).toBe(true);
    expect(forca).not.toContain('a');
    for (const t of [luz, forca]) {
      expect(t).toContain('QDC');
      expect(t.filter((x) => x === 'Ø25').length).toBeGreaterThan(0);
    }
    // Na unificada, os números de C1, C2 (tronco e ramais) e C3 (o eletroduto do AC); no recorte, os do outro tipo somem.
    const numeros = (t: string[]) => t.filter((x) => /^[123]$/.test(x));
    expect(new Set(numeros(tudo))).toEqual(new Set(['1', '2', '3']));
    expect(numeros(luz).every((x) => x === '1')).toBe(true);
    expect(numeros(forca).includes('1')).toBe(false);
    // Cada recorte desenha MENOS que a unificada.
    expect(textos(m, 'ILUMINACAO').d.chamadas.length).toBeLessThan(textos(m).d.chamadas.length);
    expect(textos(m, 'FORCA').d.chamadas.length).toBeLessThan(textos(m).d.chamadas.length);
  });

  it('a planta inteira (desenharPlanta) passa o recorte adiante', () => {
    const { m } = casa();
    const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
    const o = { denominador: 50, papel, titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64), data: new Date('2026-09-29T12:00:00Z'), eletrica: true };
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, { ...o, recorteEletrico: 'ILUMINACAO' }, enquadrar(m, 50, papel, false));
    expect(d.textos().some((x) => x.startsWith('TUG'))).toBe(false);
    expect(d.textos()).toContain('QDC');
  });
});

describe('no conjunto, no DXF e na vista', () => {
  it('conjunto: "elétrica em duas plantas" gera Iluminação e Tomadas e força por pavimento; sem a opção, a unificada; o template lê a chave', () => {
    const { m } = casa();
    const base = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, eletrica: true } };
    expect(planejarConjunto(m, base).filter((p) => p.tipo === 'ELETRICA').map((p) => p.titulo)).toEqual(['Elétrica — Térreo']);
    const sep = planejarConjunto(m, { ...base, incluir: { ...base.incluir, eletricaSeparada: true } }).filter((p) => p.tipo === 'ELETRICA');
    expect(sep.map((p) => [p.titulo, p.recorteEletrico])).toEqual([['Iluminação — Térreo', 'ILUMINACAO'], ['Tomadas e força — Térreo', 'FORCA']]);
    expect(TEMPLATE_DE_PRANCHA_PADRAO.incluir.eletricaSeparada).toBe(false);
    expect(templateDePranchaDaColuna({ incluir: { eletrica: true, eletricaSeparada: true } }).incluir.eletricaSeparada).toBe(true);
    expect(templateDePranchaDaColuna({}).incluir.eletricaSeparada).toBe(false);
  });

  it('DXF: tomada em PLANTA-ELETRICA-FORCA-TEXTO, luz em -ILUMINACAO-TEXTO, QDC na comum; as quatro camadas novas no LAYER', () => {
    const { m } = casa();
    const dxf = gerarDxf(m, { titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64), eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO });
    for (const c of ['PLANTA-ELETRICA-ILUMINACAO', 'PLANTA-ELETRICA-ILUMINACAO-TEXTO', 'PLANTA-ELETRICA-FORCA', 'PLANTA-ELETRICA-FORCA-TEXTO']) expect(dxf).toMatch(new RegExp(`LAYER[\\s\\S]*\\n${c}\\n`));
    expect(dxf).toMatch(/\n8\nPLANTA-ELETRICA-FORCA-TEXTO\n[\s\S]{0,200}?\n1\nTUG · C2\n/);
    expect(dxf).toMatch(/\n8\nPLANTA-ELETRICA-ILUMINACAO-TEXTO\n[\s\S]{0,200}?\n1\nLuz teto · C1\n/);
    expect(dxf).toMatch(/\n8\nPLANTA-ELETRICA-TEXTO\n[\s\S]{0,200}?\n1\nQDC\n/);
  });

  it('vista: desligar uma camada esconde os pontos e eletrodutos só dela; o comum e o quadro ficam; o padrão mostra as duas', () => {
    const { m, tronco, soLuz, soTug } = casa();
    expect(idsForaDaVistaEletrica(m, { iluminacao: true, forca: true }).size).toBe(0);
    const semLuz = idsForaDaVistaEletrica(m, { iluminacao: false, forca: true });
    const luzes = m.terminais.filter((t) => t.tipoEletrico === 'ILUMINACAO_TETO' || t.tipoEletrico === 'INTERRUPTOR').map((t) => t.id);
    expect([...semLuz].sort()).toEqual([...luzes, soLuz].sort());
    const semForca = idsForaDaVistaEletrica(m, { iluminacao: true, forca: false });
    expect(semForca.has(soTug)).toBe(true);
    expect(semForca.has(tronco)).toBe(false);
    expect(semForca.has(m.quadros[0].id)).toBe(false);
    expect([...semForca].some((id) => m.terminais.find((t) => t.id === id)?.tipoEletrico === 'CAIXA_PASSAGEM')).toBe(false);
    expect(CONFIGURACAO_PADRAO.planta.eletricaIluminacao).toBe(true);
    expect(CONFIGURACAO_PADRAO.planta.eletricaForca).toBe(true);
    expect(configuracaoDaColuna({ planta: { eletricaForca: false } }).planta).toMatchObject({ eletricaIluminacao: true, eletricaForca: false });
  });
});
