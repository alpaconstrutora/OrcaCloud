/**
 * PE7 do prédio pelo Empreendimento (plano docs/planos/2026-11-18-predio-pelo-empreendimento.md): AS DUAS TORRES NO MESMO
 * ESTUDO. No Garden, a Torre A (do 0, garagem −1/−2) e a Torre B (do −2, garagem −3/−4) são coladas no lote da Teste 01.
 * A Torre B é gerada depois da A, sobre o desenho já com ela. Decisões do usuário de 18/11: "Rampa pela garagem da A" e
 * "Entrada na A, quadro geral na B".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import { aplicarLote, applyBatch, emptyModel, snapshotHash, type Command } from '../utils/blueprintKernel';
import { comandosDoAjuste } from '../utils/blueprintAjusteAoEmpreendimento';
import { estruturasDoEmpreendimento, type TorreParaEstrutura } from '../utils/blueprintEstruturaDaTorre';
import { blocosDasTorresNoLote, papelDosAndares } from '../utils/predioAutomatico/andaresDoEmpreendimento';
import { HIPOTESES_DO_PRODUTO_PADRAO, produtoVazio } from '../utils/blueprintProduto';
import { planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { fazerChave } from '../utils/blueprintGrafoDeRede';
import { uidDaCobertura } from '../utils/predioAutomatico/terreoECobertura';
import { SALA_HALL } from '../utils/predioAutomatico/terreoECobertura';
import { unidadesDoPredio } from '../utils/blueprintUnidadesDoPredio';
import { produtoDoEmpreendimento } from '../utils/blueprintProdutoDoEmpreendimento';
import { ladoDaMassa } from '../services/sync/massaAdapter';
import { buildPlan } from '../services/sync/planner';
import type { Empreendimento, EmpreendimentoTower, EmpreendimentoUnit } from '../types/empreendimento';
import type { Boundary } from '../utils/blueprintKernel';

const GARDEN = JSON.parse(readFileSync(new URL('./fixtures/empreendimentoGarden.json', import.meta.url), 'utf8')) as {
  torres: TorreParaEstrutura[];
  pavimentos: Record<string, EmpreendimentoFloor[]>;
  teste01: { divisas: Boundary[] };
  empreendimento: { distanciasEntreTorres: { distancia_m: number; torre_a: string; torre_b: string }[] };
};
const estruturas = () => estruturasDoEmpreendimento(GARDEN.torres, new Map(Object.entries(GARDEN.pavimentos)));

/** A Torre B do Garden no lote da Teste 01, com a garagem dela (o "Construir o prédio pelo Empreendimento" da PE3). */

/** O lote com as duas torres (coladas, como a ficha) e as garagens, a Torre A gerada e lançada; depois a Torre B sobre ela. */
function duasTorres() {
  const es = estruturas();
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const dist = GARDEN.empreendimento.distanciasEntreTorres.map((d) => ({ torreA: d.torre_a, torreB: d.torre_b, mm: Math.round(d.distancia_m * 1000) }));
  const r = blocosDasTorresNoLote(GARDEN.teste01.divisas, es, dist, null, HIPOTESES_DO_PRODUTO_PADRAO);
  m = applyBatch(m, [
    ...GARDEN.teste01.divisas.map((d): Command => ({ type: 'AddBoundary', levelId: t, a: d.a, b: d.b, kind: 'TERRENO', papel: d.papel }) as Command),
    ...r.blocos.map((a) => ({ type: 'AddBloco', levelId: t, nome: a.nome, pontos: a.pontos, pavimentos: a.pavimentos }) as Command),
  ]).model;
  m = applyBatch(m, comandosDoAjuste(m, es).comandos).model;
  const gerar = (model: typeof m, nome: string) => {
    const b = model.blocos!.find((x) => x.nome === nome)!;
    const torre = es.find((e) => e.nome === nome)!;
    return planejarPredioDoPedido({ original: model, entrada: { blocoId: b.id, produto: produtoVazio(), doBloco: null, rotacaoNorteDeg: null, doEmpreendimento: { torreId: torre.torreId, andares: papelDosAndares(torre).andares } }, hip: { climatizacao: false } });
  };
  const a = gerar(m, 'Torre A');
  const b = gerar(a.resultado, 'Torre B');
  return { a, b };
}

describe('PE7 — as duas torres no mesmo estudo (Garden)', { timeout: 600_000 }, () => {
  let cache: ReturnType<typeof duasTorres> | null = null;
  const plano = () => (cache ??= duasTorres());

  it('PE7a: a segunda torre confere só os pavimentos dela — os equipamentos de incêndio lançam, a pressão e a rota não acusam a Torre A', () => {
    const { b } = plano();
    expect(b.resumo.unidades).toBe(24);
    expect(b.etapas.find((e) => e.id === 'EQUIPAMENTOS_DE_INCENDIO')?.situacao).not.toBe('NAO_RODOU');
    expect(b.pendencias.filter((x) => /fora da rede do reservatório superior/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(b.pendencias.filter((x) => /sem caminho até a saída/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(b.pendencias.filter((x) => /Torre A ·/.test(x.texto)).map((x) => x.texto.slice(0, 160))).toEqual([]);
    expect(b.resumo.eletrica?.unidadesMedidas).toBe(24);
  });

  it('PE7c: nenhuma janela na parede comum — nem na Torre A, nem na Torre B (a fachada que encosta na outra torre é cega)', () => {
    const { b } = plano();
    const m = b.resultado;
    const dSeg = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => {
      const L2 = (r.x - q.x) ** 2 + (r.y - q.y) ** 2;
      const t = L2 ? Math.max(0, Math.min(1, ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / L2)) : 0;
      return Math.hypot(p.x - (q.x + (r.x - q.x) * t), p.y - (q.y + (r.y - q.y) * t));
    };
    for (const [minha, outra] of [['Torre A', 'Torre B'], ['Torre B', 'Torre A']]) {
      const P = m.blocos!.find((x) => x.nome === outra)!.pontos;
      const niveis = new Set(m.levels.filter((l) => l.name.startsWith(`${minha} ·`) && !/Garagem|cobertura/.test(l.name)).map((l) => l.id));
      const naComum = m.walls.filter((w) => niveis.has(w.levelId) && P.some((q, i) => dSeg({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, q, P[(i + 1) % P.length]) < 400));
      expect(naComum.length).toBeGreaterThan(0);
      expect(m.openings.filter((o) => o.kind !== 'door' && naComum.some((w) => w.id === o.wallId)).length).toBe(0);
    }
    expect(b.pendencias.some((x) => /Parede comum com a Torre A/.test(x.texto))).toBe(true);
  });

  it('PE7b (energia, decisão "Entrada na A, quadro geral na B"): uma entrada de serviço no lote — a da Torre A; o QGBT da B é alimentado do QGBT da A', () => {
    const { a, b } = plano();
    const m = b.resultado;
    const qgbtA = (a.resultado.quadros ?? []).find((q) => q.tipo === 'QGBT')!;
    expect(m.terminais.filter((t) => t.tipoEletrico === 'ENTRADA_SERVICO')).toHaveLength(1);
    const qgbts = (m.quadros ?? []).filter((q) => q.tipo === 'QGBT');
    expect(qgbts).toHaveLength(2);
    const qgbtB = qgbts.find((q) => q.id !== qgbtA.id)!;
    expect(qgbtB.quadroPaiId).toBe(qgbtA.id);
    expect(b.pendencias.some((x) => /entrada de energia da Torre A/.test(x.texto) && /kVA/.test(x.texto))).toBe(true);
  });

  it('PE7a: o resultado no desenho inteiro (a vista + o que ficou de fora) é o mesmo de reaplicar os comandos — hash igual', () => {
    const es = estruturas();
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const r = blocosDasTorresNoLote(GARDEN.teste01.divisas, es, [], null, HIPOTESES_DO_PRODUTO_PADRAO);
    const bl = r.blocos.find((x) => x.nome === 'Torre B')!;
    m = applyBatch(m, [
      ...GARDEN.teste01.divisas.map((d): Command => ({ type: 'AddBoundary', levelId: t, a: d.a, b: d.b, kind: 'TERRENO', papel: d.papel }) as Command),
      { type: 'AddBloco', levelId: t, nome: bl.nome, pontos: bl.pontos, pavimentos: bl.pavimentos } as Command,
      // Outra torre (só o bloco e a cobertura dela, com uma parede): fica de fora da vista e volta no resultado.
      { type: 'AddBloco', levelId: t, nome: 'Vizinho', pontos: [{ x: -60000, y: 0 }, { x: -45000, y: 0 }, { x: -45000, y: 15000 }, { x: -60000, y: 15000 }], pavimentos: 4 } as Command,
    ]).model;
    m = applyBatch(m, [{ type: 'AddLevel', name: 'Vizinho', elevationMm: 20000, defaultHeightMm: 3000, uid: uidDaCobertura(m.blocos!.find((x) => x.nome === 'Vizinho')!) } as Command]).model;
    m = applyBatch(m, [{ type: 'AddWall', levelId: m.levels.find((l) => l.name === 'Vizinho')!.id, a: { x: -50000, y: 0 }, b: { x: -45000, y: 0 }, thicknessMm: 150, heightMm: 3000 } as Command]).model;
    m = applyBatch(m, comandosDoAjuste(m, es.filter((e) => e.nome === 'Torre B')).comandos).model;
    const b = m.blocos!.find((x) => x.nome === 'Torre B')!;
    const torre = es.find((e) => e.nome === 'Torre B')!;
    const p = planejarPredioDoPedido({ original: m, entrada: { blocoId: b.id, produto: produtoVazio(), doBloco: null, rotacaoNorteDeg: null, doEmpreendimento: { torreId: torre.torreId, andares: papelDosAndares(torre).andares } }, hip: { climatizacao: false } });
    expect(p.resultado.levels.some((l) => l.name === 'Vizinho')).toBe(true);
    expect(p.resultado.walls.some((w) => w.levelId === m.levels.find((l) => l.name === 'Vizinho')!.id)).toBe(true);
    expect(p.hashDoResultado).toBe(snapshotHash(aplicarLote(m, p.comandos).model));
  });
});

