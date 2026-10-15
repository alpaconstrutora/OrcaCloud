/**
 * Gerador determinístico (19/09/2026, E6.2): o programa semente gera uma
 * planta válida (todos os ambientes fechados e nomeados, portas, janelas,
 * entrada), reprodutível (mesma semente = mesmo hash), diferente por semente,
 * zonada (social à frente, íntimo ao fundo), dentro do envelope (inclusive em
 * L), com automáticos e avaliação; N sementes ranqueadas e a frente de Pareto.
 */
import { describe, expect, it } from 'vitest';
import { point, snapshotHash } from '../utils/blueprintKernel';
import { comandosDeGeometria, frenteDePareto, gerar, gerarAlternativas, ladoDaFrente, maiorRetanguloInscrito, nomesParaOModelo, prng } from '../utils/blueprintGerador';
import { PROGRAMA_CURTO_PADRAO, programaDaCasa, programaSemente } from '../utils/blueprintPrograma';
import { applyBatch, applyCommand, emptyModel } from '../utils/blueprintKernel';

const entrada2Q = { programa: programaSemente('APTO_2Q'), envelope: null, direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -23.5 };

describe('gerador determinístico', () => {
  it('PRNG semeado e maior retângulo inscrito (retângulo e L)', () => {
    const a = prng(7);
    const b = prng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(prng(7)()).not.toBe(prng(8)());
    expect(maiorRetanguloInscrito([point(0, 0), point(10000, 0), point(10000, 8000), point(0, 8000)])).toEqual({ x0: 0, y0: 0, x1: 10000, y1: 8000 });
    // L: 10 × 10 sem o canto 5 × 5 superior direito → o maior retângulo tem 50 m² (10 × 5 ou 5 × 10).
    const L = maiorRetanguloInscrito([point(0, 0), point(10000, 0), point(10000, 5000), point(5000, 5000), point(5000, 10000), point(0, 10000)])!;
    expect(((L.x1 - L.x0) * (L.y1 - L.y0)) / 1e6).toBeCloseTo(50, 0);
    expect(ladoDaFrente(null)).toBe('S');
    expect(ladoDaFrente(point(0, 1))).toBe('N');
    expect(ladoDaFrente({ x: 1, y: 0.2 })).toBe('L');
  });

  it('programa 2Q num retângulo 10 × 12: todos os ambientes fechados e nomeados, zonas certas, portas, janelas e entrada; reprodutível; sementes diferem', () => {
    const r = gerar(entrada2Q, 1, { automaticos: false });
    const m = r.model;
    // Um pavimento, 8 ambientes pedidos (sala, cozinha, serviço, 2 dorm., banheiro, circulação, varanda) → 8 fechados e nomeados.
    expect(m.levels).toHaveLength(1);
    expect(r.ambientes).toHaveLength(8);
    expect(r.avisos.filter((a) => /não fechou/.test(a))).toEqual([]);
    const nomes = m.spaces.map((s) => s.name).sort();
    expect(nomes).toEqual(['Área de serviço', 'Banheiro social', 'Circulação', 'Cozinha', 'Dormitório 1', 'Dormitório 2', 'Sala de estar/jantar', 'Varanda'].sort());
    // Zonas: social/serviço à frente (sul, y menor), íntimo ao fundo (y maior).
    const ret = r.retangulo;
    const sala = r.ambientes.find((a) => a.item.uso === 'SALA')!;
    const intimos = r.ambientes.filter((a) => a.zona === 'INTIMO');
    expect(sala.ret.y0).toBe(ret.y0);
    expect(intimos.some((a) => a.ret.y1 === ret.y1)).toBe(true);
    expect(intimos.every((a) => a.ret.y0 > ret.y0)).toBe(true);
    expect(r.frente).toBe('S');
    // Corredor com a largura da hipótese, de lado a lado.
    const circ = r.ambientes.find((a) => a.zona === 'CIRCULACAO')!;
    expect(circ.ret.y1 - circ.ret.y0).toBe(1000);
    expect(circ.ret.x1 - circ.ret.x0).toBe(10000);
    // Tudo na malha de 50 mm e dentro do retângulo.
    for (const a of r.ambientes) {
      for (const v of [a.ret.x0, a.ret.y0, a.ret.x1, a.ret.y1]) expect(v % 50).toBe(0);
      expect(a.ret.x0).toBeGreaterThanOrEqual(ret.x0);
      expect(a.ret.x1).toBeLessThanOrEqual(ret.x1);
    }
    // Portas: cada ambiente (fora a circulação) tem porta; entrada de 0,90 na frente.
    const portas = m.openings.filter((o) => o.kind === 'door');
    expect(portas.length).toBeGreaterThanOrEqual(7);
    expect(portas.some((o) => o.widthMm === 900)).toBe(true);
    expect(r.avisos.filter((a) => /sem acesso/.test(a))).toEqual([]);
    // Janelas: sala e dormitórios exigem iluminação → têm janela; banheiro tem basculante.
    const janelas = m.openings.filter((o) => o.kind === 'window');
    expect(janelas.length).toBeGreaterThanOrEqual(3);
    // Basculante do banheiro (peitoril 1,60 m, 0,60 m de altura). F3b (15/10/2026): a largura cobre 1/8 do
    // piso (regra semente) — o 0,60 × 0,60 fixo dava 0,36 m² para um banheiro de 4 m² (pede 0,50).
    expect(janelas.some((o) => o.sillMm === 1600 && o.heightMm === 600 && o.widthMm >= 600)).toBe(true);
    // Avaliação e resumo.
    expect(r.avaliacao.notaGeral).not.toBeNull();
    expect(r.resumo.areaConstruidaM2).toBeCloseTo(10.2 * 12.2, 1);
    expect(r.resumo.areaUtilM2).toBeGreaterThan(90);
    expect(r.resumo.objetivoFinal).toBeLessThanOrEqual(r.resumo.objetivoInicial);
    expect(r.decisoes.some((d) => /Recozimento simulado: 300 iterações com a semente 1/.test(d))).toBe(true);
    expect(r.decisoes.some((d) => /Entrada de 0,90 m pela frente/.test(d))).toBe(true);
    // Reprodutível: mesma semente, mesmo hash; outra semente, outra planta.
    expect(snapshotHash(gerar(entrada2Q, 1, { automaticos: false }).model)).toBe(snapshotHash(m));
    const r2 = gerar(entrada2Q, 2, { automaticos: false });
    expect(r2.decisoes.some((d) => /semente 2/.test(d))).toBe(true);
    expect(gerarAlternativas(entrada2Q, { sementes: 3, iteracoes: 60, automaticos: false }).map((x) => x.semente)).toHaveLength(3);
  });

  it('automáticos, frente ao norte com envelope em L, ranking e Pareto, e a geometria remapeada para outro pavimento', () => {
    // Envelope em L (10 × 10 sem o canto 5 × 5 NE), frente ao norte.
    const L = [point(0, 0), point(10000, 0), point(10000, 5000), point(5000, 5000), point(5000, 10000), point(0, 10000)];
    const r = gerar({ ...entrada2Q, envelope: L, direcaoDaFrente: point(0, 1) }, 3, { iteracoes: 80 });
    expect(r.frente).toBe('N');
    // F11 (12/10/2026): o L é decomposto (principal + anexo) e usado INTEIRO — antes, só o maior retângulo.
    expect(r.decisoes[0]).toMatch(/^Contorno ortogonal de 75,00 m² em 2 retângulo\(s\).*100,00 % da área do contorno/);
    // Frente ao norte: a sala encosta no lado de cima do retângulo.
    const sala = r.ambientes.find((a) => a.item.uso === 'SALA')!;
    expect(sala.ret.y1).toBe(r.retangulo.y1);
    // Automáticos: pilares, luz/tomadas, pontos hidráulicos entraram.
    expect((r.model.structures ?? []).some((s) => s.kind === 'PILAR')).toBe(true);
    expect((r.model.terminais ?? []).some((t) => t.disciplina === 'ELETRICA')).toBe(true);
    expect((r.model.terminais ?? []).some((t) => t.tipoHidraulico)).toBe(true);
    expect(r.decisoes.some((d) => /^Automáticos: pilares: \d+/.test(d))).toBe(true);
    // Pequeno para o programa: avisa quem cai abaixo da área mínima.
    // F11: com o L INTEIRO (75 m², não 50) o 2Q cabe — o aviso some; um envelope pequeno de verdade ainda avisa.
    expect(r.avisos.some((a) => /abaixo da área mínima/.test(a))).toBe(false);
    const pequeno = gerar({ ...entrada2Q, envelope: [point(0, 0), point(6000, 0), point(6000, 5000), point(0, 5000)] }, 1, { automaticos: false, iteracoes: 30 });
    expect(pequeno.avisos.some((a) => /abaixo da área mínima/.test(a))).toBe(true);
    // Ranking e Pareto.
    const lista = gerarAlternativas(entrada2Q, { sementes: 3, iteracoes: 60, automaticos: false });
    for (let i = 1; i < lista.length; i++) expect(lista[i - 1].avaliacao.notaGeral! >= lista[i].avaliacao.notaGeral!).toBe(true);
    const pareto = frenteDePareto(lista);
    expect(pareto.size).toBeGreaterThanOrEqual(1);
    expect(pareto.has(lista[0].semente)).toBe(true); // a de maior nota nunca é dominada
    // Remapeamento: paredes + aberturas num lote só (por wallUid) noutro modelo; os nomes vêm depois.
    let alvo = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Pav. 2', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const lvl = alvo.levels[0].id;
    const geo = comandosDeGeometria(lista[0], lvl);
    expect(geo.every((c) => c.type === 'AddWall' || c.type === 'AddOpening')).toBe(true);
    alvo = applyBatch(alvo, geo).model;
    expect(alvo.walls.length).toBe(lista[0].model.walls.length);
    expect(alvo.openings.length).toBe(lista[0].model.openings.length);
    const nomes = nomesParaOModelo(lista[0], alvo, lvl);
    expect(nomes).toHaveLength(8);
    alvo = applyBatch(alvo, nomes).model;
    expect(alvo.spaces.map((s) => s.name).sort()).toEqual(lista[0].model.spaces.map((s) => s.name).sort());
  });
});

/**
 * F3b (casa automática, 15/10/2026): o fundo deixou de ser UMA linha (banheiro de 0,80 × 5,75 m num lote de
 * 9 m — ≥ 5 regras de ambiente violadas em todas as sementes). Colunas com mínimo no eixo, banheiro da suíte
 * empilhado atrás (ou ao lado, se a faixa é rasa), transbordo para a frente, janela pela norma.
 */
describe('F3b — mínimos dos ambientes', () => {
  const programa3Q = programaDaCasa(PROGRAMA_CURTO_PADRAO).programa;
  const ret = (W: number, D: number) => [point(0, 0), point(W, 0), point(W, D), point(0, D)];
  const violadas = (r: ReturnType<typeof gerar>) => r.regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO' && x.regra.escopo === 'AMBIENTE');
  const encostam = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
    ((a.x1 === b.x0 || b.x1 === a.x0) && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 700) || ((a.y1 === b.y0 || b.y1 === a.y0) && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= 700);

  it.each([
    [9000, 16850],
    [10500, 14500],
    [12000, 12700],
  ])('3 quartos em %i × %i: a melhor de 8 sementes não viola regra de ambiente (antes: 5 em todas)', (W, D) => {
    const rs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => gerar({ programa: programa3Q, envelope: ret(W, D), direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, s, { automaticos: false }));
    expect(Math.min(...rs.map((r) => violadas(r).length))).toBe(0);
    // e nenhuma regra de banheiro (largura livre 1,20 m, área 2,5 m²) violada em semente NENHUMA — medido pela regra,
    // que desconta a parede de verdade (1,35 m de eixo entre paredes internas de 15 cm são 1,20 m livres)
    for (const r of rs) expect(violadas(r).filter((x) => /^Banheiro:/.test(x.regra.nome))).toEqual([]);
  });

  it('faixa funda: o banheiro da suíte EMPILHA atrás dela; faixa rasa: vira coluna AO LADO — encostado nos dois casos', () => {
    const fundo = gerar({ programa: programa3Q, envelope: ret(9000, 16850), direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, 1, { automaticos: false });
    const raso = gerar({ programa: programa3Q, envelope: ret(12000, 12700), direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, 1, { automaticos: false });
    for (const r of [fundo, raso]) {
      const suite = r.ambientes.find((a) => a.item.id === 'suite1')!;
      const banho = r.ambientes.find((a) => a.item.id === 'bsuite1')!;
      expect(encostam(suite.ret, banho.ret)).toBe(true);
    }
    const s = fundo.ambientes.find((a) => a.item.id === 'suite1')!.ret;
    const b = fundo.ambientes.find((a) => a.item.id === 'bsuite1')!.ret;
    expect([b.x0, b.x1]).toEqual([s.x0, s.x1]); // mesma coluna, um atrás do outro
  });

  it('a sala nunca fica SEM janela (a porta de entrada na mesma fachada); alguma semente cumpre 1/6', () => {
    const rs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => gerar({ programa: programa3Q, envelope: ret(10500, 14500), direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, s, { automaticos: false }));
    const daSala = (r: ReturnType<typeof gerar>) => r.regras.find((x) => x.regraId === 'sem-iluminacao-habitavel' && /Sala/.test(x.alvoRotulo))!;
    // antes da correção, janela pela norma que não cabia ao lado da porta era DESCARTADA: area_janelas = 0
    for (const r of rs) expect(daSala(r).valores).not.toMatch(/area_janelas = 0 /);
    expect(rs.some((r) => daSala(r).estado === 'CONFORME')).toBe(true);
  });
});
