/**
 * NUVEM DE REVISÃO (21/09/2026, backlog P2 — P2.15, kernel 0.50.0): anotação
 * `NUVEM` com `revisao {numero, data}`; contorno recortado; tabela de revisões
 * do carimbo; canônico ida e volta; invariantes.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, canonicalPayload, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, polygonArea } from '../utils/blueprintKernel';
import { contornoDaNuvem, dataDaRevisaoBr, distanciaAAnotacao, posicaoDaEtiquetaDaNuvem, proximaRevisao, resumirAnotacoes, revisoesDoModelo } from '../utils/blueprintAnotacoes';

function base() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  return { m, lvl: m.levels[0].id };
}
const quadrado = [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)];

describe('nuvem de revisão (P2.15)', () => {
  it('contorno recortado por fora do polígono, etiqueta no topo, distância pelo polígono', () => {
    const c = contornoDaNuvem(quadrado, 250);
    expect(c.length).toBeGreaterThan(40);
    // Toda meia-lua fica FORA do quadrado: nenhum ponto do contorno cai estritamente dentro.
    // Nenhum ponto do contorno cai estritamente dentro do quadrado.
    for (const p of c) expect(p.x > 1 && p.x < 3999 && p.y > 1 && p.y < 2999).toBe(false);
    // ...e a área do contorno é maior que a do polígono (as meias-luas somam).
    expect(Math.abs(polygonArea(c))).toBeGreaterThan(4000 * 3000);
    const e = posicaoDaEtiquetaDaNuvem(quadrado, 250);
    expect(e.y).toBeGreaterThan(3000);
    // Sentido horário dá o mesmo resultado (as meias-luas continuam para fora).
    const horario = contornoDaNuvem([...quadrado].reverse(), 250);
    expect(Math.abs(polygonArea(horario))).toBeCloseTo(Math.abs(polygonArea(c)), -3);
    expect(dataDaRevisaoBr('2026-09-21')).toBe('21/09/2026');
  });

  it('AddAnotacao NUVEM exige revisão; canônico vai e volta; tabela de revisões; próxima revisão; invariantes', () => {
    const { m, lvl } = base();
    expect(proximaRevisao(m)).toBe(1);
    expect(() => applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: lvl }, tipo: 'NUVEM', pontos: quadrado })).toThrow(/BAD_ANNOTATION|revisão/);
    let r = applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: lvl }, tipo: 'NUVEM', pontos: quadrado, texto: 'Porta da sala deslocada', revisao: { numero: 1, data: '2026-09-21' } }).model;
    r = applyCommand(r, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: lvl }, tipo: 'NUVEM', pontos: quadrado.map((p) => point(p.x + 6000, p.y)), texto: 'Janela ampliada', revisao: { numero: 1, data: '2026-09-22' } }).model;
    r = applyCommand(r, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: lvl }, tipo: 'NUVEM', pontos: quadrado.map((p) => point(p.x, p.y + 6000)), revisao: { numero: 2, data: '2026-10-01' } }).model;
    r = applyCommand(r, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: lvl }, tipo: 'TEXTO', pontos: [point(100, 100)], texto: 'nota' }).model;
    expect(r.anotacoes.filter((a) => a.tipo === 'NUVEM')).toHaveLength(3);
    expect(r.anotacoes.find((a) => a.tipo === 'TEXTO')!.revisao).toBeUndefined();
    expect(resumirAnotacoes(r).porTipo.NUVEM).toBe(3);
    expect(revisoesDoModelo(r)).toEqual([
      { numero: 1, data: '2026-09-22', descricoes: ['Porta da sala deslocada', 'Janela ampliada'], nuvens: 2 },
      { numero: 2, data: '2026-10-01', descricoes: [], nuvens: 1 },
    ]);
    expect(proximaRevisao(r)).toBe(3);
    expect(distanciaAAnotacao(r.anotacoes[0], point(2000, 1500))).toBe(0);

    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.52.0');
    const payload = parseCanonicalPayload(canonicalPayload(r));
    expect(payload.anotacoes!.filter((a) => a.revisao)).toHaveLength(3);
    expect(payload.anotacoes!.some((a) => a.tipo === 'TEXTO' && 'revisao' in a)).toBe(false);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));

    // Editar a revisão: número e data.
    const ed = applyCommand(r, { type: 'SetAnotacaoProps', anotacaoId: r.anotacoes[2].id, revisao: { numero: 3, data: '2026-10-05' } }).model;
    expect(ed.anotacoes[2].revisao).toEqual({ numero: 3, data: '2026-10-05' });
    // Invariantes: data fora do formato e número < 1.
    expect(() => applyCommand(r, { type: 'SetAnotacaoProps', anotacaoId: r.anotacoes[0].id, revisao: { numero: 0, data: '2026-10-05' } })).toThrow(/revisão/);
    expect(() => applyCommand(r, { type: 'SetAnotacaoProps', anotacaoId: r.anotacoes[0].id, revisao: { numero: 1, data: '05/10/2026' } })).toThrow(/revisão/);
    // Revisão numa anotação que não é nuvem: recusada.
    expect(() => applyCommand(r, { type: 'SetAnotacaoProps', anotacaoId: r.anotacoes.find((a) => a.tipo === 'TEXTO')!.id, revisao: { numero: 1, data: '2026-10-05' } })).toThrow(/revisão/);
  });
});

describe('nuvem de revisão na prancha (P2.15)', () => {
  it('PDF: contorno recortado, "Δn" e descrição; o carimbo ganha a tabela de revisões; DXF leva a polilinha e o texto', async () => {
    const { DesenhistaDeProva, desenharPlanta, enquadrar, PAPEIS } = await import('../utils/blueprintExport');
    const { gerarDxf } = await import('../utils/blueprintDxf');
    const { m, lvl } = base();
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall' as const, levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
    let com = (await import('../utils/blueprintKernel')).applyBatch(m, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
    com = applyCommand(com, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: lvl }, tipo: 'NUVEM', pontos: [point(500, 500), point(2000, 500), point(2000, 1500), point(500, 1500)], texto: 'Porta deslocada', revisao: { numero: 2, data: '2026-09-21' } }).model;
    const A3 = PAPEIS[1];
    const opcoes = { denominador: 100, papel: A3, titulo: 'T', revisao: 1, hash: 'h', aviso: '', cotas: false } as unknown as Parameters<typeof desenharPlanta>[2];
    const d = new DesenhistaDeProva();
    desenharPlanta(d, com, opcoes, enquadrar(com, 100, A3, false));
    const textos = d.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2] as string);
    expect(textos).toContain('2'); // o número no triângulo
    expect(textos).toContain('Porta deslocada');
    expect(textos.some((t) => t.startsWith('Rev.'))).toBe(true);
    expect(textos.some((t) => t.includes('Δ2') && t.includes('21/09/2026') && t.includes('Porta deslocada'))).toBe(true);
    // Muitas linhas curtas: o contorno recortado (bem mais segmentos que o retângulo).
    expect(d.chamadas.filter((c) => c.tipo === 'linha').length).toBeGreaterThan(60);
    const dxf = gerarDxf(com, { titulo: 'T', revisao: 1, hash: 'h' });
    expect(dxf).toMatch(/Δ2 Porta deslocada/);
    // Sem nuvem, o carimbo não tem tabela.
    const d2 = new DesenhistaDeProva();
    desenharPlanta(d2, m, opcoes, enquadrar(m, 100, A3, false));
    expect(d2.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2] as string).some((t) => t.startsWith('Rev.'))).toBe(false);
  });
});
