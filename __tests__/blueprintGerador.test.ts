/**
 * Gerador determinístico (19/09/2026, E6.2): o programa semente gera uma
 * planta válida (todos os ambientes fechados e nomeados, portas, janelas,
 * entrada), reprodutível (mesma semente = mesmo hash), diferente por semente,
 * zonada (social à frente, íntimo ao fundo), dentro do envelope (inclusive em
 * L), com automáticos e avaliação; N sementes ranqueadas e a frente de Pareto.
 */
import { describe, expect, it } from 'vitest';
import { point, snapshotHash } from '../utils/blueprintKernel';
import { HIPOTESES_DO_GERADOR_PADRAO, comandosDeGeometria, frenteDePareto, gerar, gerarAlternativas, ladoDaFrente, maiorRetanguloInscrito, nomesParaOModelo, prng } from '../utils/blueprintGerador';
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

/**
 * F6b (casa automática, 15/10/2026): janela em mais de um lado quando falta área, a porta de entrada na ponta da
 * fachada (no meio, partia a fachada da sala e a janela não cabia) e o peso da falta de luz natural. O apartamento
 * de 3 quartos com sala de 33 m² violava "iluminação 1/6" em todas as sementes.
 */
describe('F6b — iluminação da sala e frente em colunas', () => {
  it.each([
    [9000, 16850],
    [10500, 14500],
    [12000, 12700],
  ])('apartamento 3 quartos em %i × %i: a melhor de 8 sementes não viola regra de ambiente', (W, D) => {
    const programa = programaSemente('APTO_3Q_SUITE');
    const ret = [point(0, 0), point(W, 0), point(W, D), point(0, D)];
    const melhor = Math.min(
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => gerar({ programa, envelope: ret, direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, s, { automaticos: false }).regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO' && x.regra.escopo === 'AMBIENTE').length),
    );
    expect(melhor).toBe(0);
  });
});


/**
 * F20 (casa automática, 17/10/2026): o banheiro é FOLHA — uma porta, nunca passagem — e o da suíte só abre para ela; a
 * porta interna dos cômodos vai para a ponta do lado comum. Na busca em largura, o banheiro alcançado abria para os
 * vizinhos (o da suíte para o dormitório ao lado, o social para a varanda), e as duas portas tomavam o lugar do vaso e do
 * lavatório; a porta no meio partia os lados da suíte e o armário só cabia com 0,90 m.
 */
describe('F20 — portas: banheiro é folha; porta interna na ponta', () => {
  const ret = (W: number, D: number) => [point(0, 0), point(W, 0), point(W, D), point(0, D)];
  const programas = [programaDaCasa(PROGRAMA_CURTO_PADRAO).programa, programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, dormitorios: 2, banheiros: 2, vagas: 1 }).programa];
  type R = ReturnType<typeof gerar>;
  /** As portas no contorno do retângulo do ambiente (o meio do vão sobre um lado dele). */
  const portasDe = (r: R, a: R['ambientes'][number]) =>
    r.model.openings
      .filter((o) => o.kind === 'door')
      .map((o) => {
        const w = r.model.walls.find((x) => x.id === o.wallId)!;
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        const k = (o.offsetMm + o.widthMm / 2) / L;
        return { x: w.a.x + (w.b.x - w.a.x) * k, y: w.a.y + (w.b.y - w.a.y) * k, meia: o.widthMm / 2 };
      })
      .filter((p) => {
        const { x0, y0, x1, y1 } = a.ret;
        const naBordaX = (Math.abs(p.y - y0) < 1 || Math.abs(p.y - y1) < 1) && p.x > x0 && p.x < x1;
        const naBordaY = (Math.abs(p.x - x0) < 1 || Math.abs(p.x - x1) < 1) && p.y > y0 && p.y < y1;
        return naBordaX || naBordaY;
      });
  const casos = programas.flatMap((programa) => [[9000, 16850], [10500, 14500], [12000, 12700]].flatMap(([W, D]) => [1, 2, 3, 4].map((s) => gerar({ programa, envelope: ret(W, D), direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, s, { automaticos: false }))));

  it('todo banheiro tem UMA porta (a não ser que o aviso diga que é passagem); o da suíte abre para a suíte', () => {
    for (const r of casos) {
      for (const a of r.ambientes.filter((x) => x.item.uso === 'BANHEIRO' || x.item.uso === 'LAVABO')) {
        const passagem = r.avisos.some((x) => x.includes(`passando por ${a.nome}`));
        if (!passagem) expect(`${a.nome}: ${portasDe(r, a).length}`).toBe(`${a.nome}: 1`);
      }
      const suite = r.ambientes.find((a) => a.item.id === 'suite1');
      const banho = r.ambientes.find((a) => a.item.id === 'bsuite1');
      if (suite && banho && !r.avisos.some((x) => x.includes(`passando por ${banho.nome}`))) {
        const [p] = portasDe(r, banho);
        expect(portasDe(r, suite).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1)).toBe(true);
      }
    }
  });

  it('a porta da suíte para a circulação fica na ponta do lado comum (a até 0,30 m de um canto da suíte)', () => {
    let vistas = 0;
    for (const r of casos) {
      const suite = r.ambientes.find((a) => a.item.id === 'suite1');
      const corredor = r.ambientes.find((a) => a.zona === 'CIRCULACAO');
      if (!suite || !corredor) continue;
      const comum = portasDe(r, suite).filter((p) => portasDe(r, corredor).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1));
      for (const p of comum) {
        vistas++;
        const { x0, y0, x1, y1 } = suite.ret;
        const doCanto = Math.min(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([cx, cy]) => Math.hypot(p.x - cx, p.y - cy))) - p.meia;
        expect(doCanto).toBeLessThanOrEqual(300);
      }
    }
    expect(vistas).toBeGreaterThan(0);
  });
});

/**
 * F21 (casa automática, 17/10/2026): as bordas dos ambientes a menos de uma espessura de parede uma da outra viram uma
 * coordenada só — duas paredes desalinhadas em 5 cm, uma de cada lado de uma terceira, fechavam um "Ambiente N" de 5 cm²
 * (sem nome; luz sem interruptor, laje < 0,5 m², luz dentro do pilar).
 */
describe('F21 — nenhuma sobra de cômodo', () => {
  const ret = (W: number, D: number) => [point(0, 0), point(W, 0), point(W, D), point(0, D)];
  const programas = [
    programaDaCasa(PROGRAMA_CURTO_PADRAO).programa,
    programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, banheiros: 3 }).programa,
    programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, padrao: 'R1-A' }).programa,
  ];
  it('em 3 programas × 4 lotes × 4 sementes, todo cômodo do desenho é um ambiente nomeado (nenhum de fora do programa)', () => {
    const sobras: string[] = [];
    for (const programa of programas)
      for (const [W, D] of [[9000, 16850], [10500, 14500], [11000, 19000], [12000, 12700]])
        for (const s of [1, 2, 3, 4]) {
          const r = gerar({ programa, envelope: ret(W, D), direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, s, { automaticos: false });
          for (const sp of r.model.spaces.filter((x) => !x.name)) sobras.push(`${W}×${D} s${s}: ${sp.ring.map((p) => `${p.x},${p.y}`).join(' ')}`);
        }
    expect(sobras).toEqual([]);
  });

  it('o caso medido (R1-A no lote 14 × 28: implantação 1,5–12,5 × 3,0–20,5 m, frente para −y, semente 1): sem sobra', () => {
    const env = [point(1500, 3000), point(12500, 3000), point(12500, 20500), point(1500, 20500)];
    const r = gerar({ programa: programas[2], envelope: env, direcaoDaFrente: point(0, -1), rotacaoNorteDeg: null, latitudeGraus: -19.9 }, 1, { automaticos: false });
    expect(r.model.spaces.filter((x) => !x.name).map((x) => x.ring)).toEqual([]);
  });
});

/**
 * F23 (casa automática, 17/10/2026): a janela pedida pela norma acima do máximo estético vira várias, separadas por
 * montantes — uma só de 5 m tomava o vão inteiro entre dois apoios e o pilar intermediário não tinha onde nascer (R1-A).
 */
describe('janela acima do máximo vira folhas com montante', () => {
  // Folhas = janelas vizinhas na mesma parede, da mesma largura, separadas exatamente pelo montante.
  const folgasEntreFolhas = (m: ReturnType<typeof gerar>['model']) => {
    const porParede = new Map<string, { offsetMm: number; widthMm: number }[]>();
    for (const o of m.openings.filter((x) => x.kind === 'window')) porParede.set(o.wallId, [...(porParede.get(o.wallId) ?? []), o].sort((p, q) => p.offsetMm - q.offsetMm));
    const pares: { folga: number; largura: number }[] = [];
    for (const l of porParede.values()) for (let k = 1; k < l.length; k++) if (l[k].widthMm === l[k - 1].widthMm) pares.push({ folga: l[k].offsetMm - (l[k - 1].offsetMm + l[k - 1].widthMm), largura: l[k].widthMm });
    return pares;
  };
  const comMaximo = (maxMm: number, montanteMm?: number) =>
    gerar(entrada2Q, 1, { automaticos: false, janela: { ...HIPOTESES_DO_GERADOR_PADRAO.janela, maxMm, ...(montanteMm === undefined ? {} : { montanteMm }) } });

  it('a janela pedida acima do máximo sai em folhas de até o máximo, separadas pelo montante (padrão 0,40 m)', () => {
    const r = comMaximo(1200);
    expect(r.decisoes.join(' ')).toMatch(/\d folhas/);
    const folhas = folgasEntreFolhas(r.model).filter((p) => p.folga === 400);
    expect(folhas.length).toBeGreaterThan(0);
    for (const p of folhas) {
      expect(p.largura).toBeLessThanOrEqual(1200);
      expect(p.largura).toBeGreaterThanOrEqual(600);
    }
  });

  it('o montante é hipótese: 0,60 m separa as folhas por 0,60 m', () => {
    const r = comMaximo(1200, 600);
    expect(folgasEntreFolhas(r.model).some((p) => p.folga === 600)).toBe(true);
    expect(folgasEntreFolhas(r.model).some((p) => p.folga === 400)).toBe(false);
  });
});
