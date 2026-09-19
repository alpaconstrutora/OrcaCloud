/**
 * Conferência do programa (19/09/2026, E4.3): casamento item ↔ ambiente pelo
 * uso do nome (nome próprio primeiro), quantidade, área/largura/pé-direito,
 * iluminação/ventilação/fachada, relações (obrigatória, proibida, desejável),
 * circulação %, percurso até a saída, fora do programa e as linhas para a tela
 * de legislação.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conferirPrograma, FONTE_DO_PROGRAMA, linhasParaLegislacao } from '../utils/blueprintConferenciaDoPrograma';
import { adicionarItem, definirRelacao, novoItem, programaVazio, type Programa } from '../utils/blueprintPrograma';

/** A mesma casa da E4.2: Sala 4 × 6, Cozinha 4 × 3, Dormitório 4 × 3; entrada na sala; janela no dormitório. */
function casa(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const coz = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y <= 3000))!;
  const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
  const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala de estar' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'NameSpace', spaceId: dorm.id, name: 'Dorm. casal' },
    { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
  ]).model;
  return { m, t };
}

function programaDaCasa(): { p: Programa; ids: Record<string, string> } {
  let p = programaVazio('Teste');
  const sala = novoItem('SALA');
  const coz = novoItem('COZINHA');
  const dormCasal = novoItem('DORMITORIO', 'Dormitório casal');
  const dormSolteiro = novoItem('DORMITORIO', 'Dormitório solteiro');
  const banho = novoItem('BANHEIRO');
  p = [sala, coz, dormCasal, dormSolteiro, banho].reduce((acc, i) => adicionarItem(acc, i), p);
  p = definirRelacao(p, sala.id, coz.id, 10, 'OBRIGATORIA'); // porta direta: há
  p = definirRelacao(p, coz.id, dormCasal.id, 0, 'PROIBIDA'); // dividem parede: viola
  p = definirRelacao(p, sala.id, dormCasal.id, 8); // porta direta: ok
  p = definirRelacao(p, coz.id, banho.id, 5); // banheiro não existe: não avaliada
  p.percursoMaxM = 7;
  return { p, ids: { sala: sala.id, coz: coz.id, dormCasal: dormCasal.id, dormSolteiro: dormSolteiro.id, banho: banho.id } };
}

describe('conferência do programa', () => {
  it('casa pelo uso do nome (nome próprio primeiro), acusa quantidade, áreas, largura, iluminação/fachada e percurso', () => {
    const { m } = casa();
    const { p, ids } = programaDaCasa();
    const c = conferirPrograma(m, p);
    const de = (id: string) => c.itens.find((i) => i.item.id === id)!;
    // "Dorm. casal" casa com "Dormitório casal" (nome), não com o solteiro (que fica faltando).
    expect(de(ids.dormCasal).casados.map((x) => x.rotulo)).toEqual(['Dorm. casal']);
    expect(de(ids.dormSolteiro)).toMatchObject({ casados: [], faltam: 1, estado: 'VIOLADA' });
    expect(de(ids.banho)).toMatchObject({ faltam: 1, estado: 'VIOLADA' });
    expect(de(ids.sala).estado).toBe('CONFORME');
    // Sala 4 × 6 de eixo → útil 3,85 × 5,85 = 22,52 m²: mín 12 ok, ideal 18 ok, máx 35 ok, largura 3,85 ≥ 2,70; SEM janela: iluminação viola, ventilação ok pela porta para fora; fachada ok.
    const sala = de(ids.sala).casados[0];
    expect(sala.areaUtilM2).toBeCloseTo(22.52, 2);
    const v = (chave: string) => sala.verificacoes.find((x) => x.chave === chave)!;
    expect(v('AREA_MIN').estado).toBe('CONFORME');
    expect(v('AREA_IDEAL').estado).toBe('CONFORME');
    expect(v('LARGURA')).toMatchObject({ estado: 'CONFORME', valor: '3,85 m' });
    expect(v('PE_DIREITO')).toMatchObject({ estado: 'CONFORME', valor: '2,80 m' });
    expect(v('ILUMINACAO')).toMatchObject({ estado: 'VIOLADA', valor: '0 janela(s) na fachada' });
    expect(v('VENTILACAO')).toMatchObject({ estado: 'CONFORME', valor: '0 janela(s), 1 porta(s) para fora' });
    expect(v('FACHADA').estado).toBe('CONFORME');
    expect(v('PERCURSO')).toMatchObject({ estado: 'CONFORME' }); // 3,05 m ≤ 7
    // Dormitório: útil 3,85 × 2,85 = 10,97 → mín 9 ok, ideal 11 viola (aviso); janela: iluminação ok; percurso 7,05 > 7 viola.
    const dorm = de(ids.dormCasal).casados[0];
    const vd = (chave: string) => dorm.verificacoes.find((x) => x.chave === chave)!;
    expect(dorm.areaUtilM2).toBeCloseTo(10.97, 2);
    expect(vd('AREA_MIN').estado).toBe('CONFORME');
    expect(vd('AREA_IDEAL')).toMatchObject({ estado: 'VIOLADA', severidade: 'AVISO' });
    expect(vd('ILUMINACAO').estado).toBe('CONFORME');
    expect(vd('PERCURSO')).toMatchObject({ estado: 'VIOLADA', valor: '7,05 m por 2 porta(s)' });
    // Cozinha: exige ventilação e não tem janela nem porta para fora → viola; não exige fachada.
    const coz = de(ids.coz).casados[0];
    expect(coz.verificacoes.find((x) => x.chave === 'VENTILACAO')!.estado).toBe('VIOLADA');
    expect(coz.verificacoes.some((x) => x.chave === 'FACHADA')).toBe(false);
    expect(c.foraDoPrograma).toEqual([]);
    expect(c.circulacao).toMatchObject({ pct: 0, maxPct: 15, estado: 'CONFORME' });
  });

  it('relações: obrigatória com porta direta, proibida que divide parede, desejável ≥ 7 vizinha, não avaliada sem ambiente; fora do programa; linhas para a legislação', () => {
    const { m } = casa();
    const { p, ids } = programaDaCasa();
    const c = conferirPrograma(m, p);
    const rel = (a: string, b: string) => c.relacoes.find((r) => (r.relacao.a === a && r.relacao.b === b) || (r.relacao.a === b && r.relacao.b === a))!;
    expect(rel(ids.sala, ids.coz)).toMatchObject({ estado: 'CONFORME', valor: 'porta direta', severidade: 'ERRO' });
    expect(rel(ids.coz, ids.dormCasal)).toMatchObject({ estado: 'VIOLADA', valor: 'dividem parede!', severidade: 'ERRO' });
    expect(rel(ids.sala, ids.dormCasal)).toMatchObject({ estado: 'CONFORME', valor: 'porta direta', severidade: 'AVISO' });
    expect(rel(ids.coz, ids.banho)).toMatchObject({ estado: 'NAO_AVALIADA', motivo: 'Banheiro sem ambiente casado no desenho' });
    // Peso 5 entre cozinha e dormitório sem porta direta: 2 portas de distância → conforme (≤ 2).
    const p2 = definirRelacao({ ...p, relacoes: [] }, ids.coz, ids.dormCasal, 5);
    expect(conferirPrograma(m, p2).relacoes[0]).toMatchObject({ estado: 'CONFORME', valor: 'dividem parede', severidade: 'INFO' });
    // Um ambiente que ninguém pediu: renomeia a cozinha para "Escritório" → fora do programa e a cozinha passa a faltar.
    const cozId = m.spaces.find((s) => s.name === 'Cozinha')!.id;
    const m2 = applyCommand(m, { type: 'NameSpace', spaceId: cozId, name: 'Escritório' }).model;
    const c2 = conferirPrograma(m2, p);
    expect(c2.foraDoPrograma.map((f) => [f.rotulo, f.uso])).toEqual([['Escritório', 'Escritório']]);
    expect(c2.itens.find((i) => i.item.id === ids.coz)!.faltam).toBe(1);
    expect(rel(ids.sala, ids.coz)).toBeDefined();
    expect(c2.relacoes.find((r) => r.relacao.a === ids.sala && r.relacao.b === ids.coz)!.estado).toBe('NAO_AVALIADA');
    // Linhas para a tela: fonte única, quantidade por item, verificações por ambiente, relações, circulação e "fora do programa".
    const linhas = linhasParaLegislacao(c2, p);
    expect(linhas.every((l) => l.regra.fonte === FONTE_DO_PROGRAMA)).toBe(true);
    expect(linhas.filter((l) => l.regraId.startsWith('prog-qtd-'))).toHaveLength(5);
    expect(linhas.find((l) => l.regraId === `prog-qtd-${ids.coz}`)).toMatchObject({ estado: 'VIOLADA', valores: 'encontrados = 0 · pedidos = 1 · faltam 1' });
    expect(linhas.find((l) => l.regraId === `prog-iluminacao-${ids.sala}`)).toMatchObject({ estado: 'VIOLADA', alvoRotulo: 'Sala de estar' });
    expect(linhas.find((l) => l.regraId === 'prog-circulacao')).toMatchObject({ estado: 'CONFORME', valores: 'circulacao = 0,0 % · máximo = 15 %' });
    expect(linhas.filter((l) => l.regraId === 'prog-fora')).toHaveLength(1);
    expect(linhas.find((l) => l.regraId === 'prog-fora')).toMatchObject({ regra: { severidade: 'INFO' }, alvoRotulo: 'Escritório', valores: 'uso lido: Escritório' });
    // Resumo conta o que é erro, aviso e não avaliado.
    expect(c2.resumo.faltas).toBeGreaterThan(0);
    expect(c2.resumo.naoAvaliados).toBeGreaterThan(0);
    // Programa vazio: nenhuma linha.
    expect(linhasParaLegislacao(conferirPrograma(m, programaVazio()), programaVazio())).toEqual([]);
  });
});
