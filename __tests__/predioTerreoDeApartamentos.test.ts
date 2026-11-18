/**
 * PE4a + PE5a do prédio pelo Empreendimento (plano docs/planos/2026-11-18-predio-pelo-empreendimento.md; decisão de 18/11
 * "Técnico na garagem"): o TÉRREO DE APARTAMENTOS. No Garden, a Torre A tem no andar 0 dois apartamentos (002, Tipo 4,
 * frente; 004, Tipo 1, lateral) e a área comum. O andar 0 nasce como cópia do tipo e, no fim, é desvinculado sem os
 * apartamentos que a ficha não tem — o espaço deles vira hall de entrada (com a porta para a rua) e área comum. Medição,
 * casa de bombas e reservatório inferior vão para a garagem mais alta; o desvio do esgoto corre no forro dela.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import { applyBatch, emptyModel, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDoAjuste } from '../utils/blueprintAjusteAoEmpreendimento';
import { estruturasDoEmpreendimento, type TorreParaEstrutura } from '../utils/blueprintEstruturaDaTorre';
import { blocosDasTorresNoLote, papelDosAndares } from '../utils/predioAutomatico/andaresDoEmpreendimento';
import { HIPOTESES_DO_PRODUTO_PADRAO, produtoVazio } from '../utils/blueprintProduto';
import { planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { fazerChave } from '../utils/blueprintGrafoDeRede';
import { ROTULO_DO_DESVIO } from '../utils/predioAutomatico/esgoto';
import { SALA_HALL, SALA_MEDICAO, SALA_MEDICAO_E_BOMBAS } from '../utils/predioAutomatico/terreoECobertura';
import type { Boundary } from '../utils/blueprintKernel';

const GARDEN = JSON.parse(readFileSync(new URL('./fixtures/empreendimentoGarden.json', import.meta.url), 'utf8')) as {
  torres: TorreParaEstrutura[];
  pavimentos: Record<string, EmpreendimentoFloor[]>;
  teste01: { divisas: Boundary[] };
};
const estruturas = () => estruturasDoEmpreendimento(GARDEN.torres, new Map(Object.entries(GARDEN.pavimentos)));

/** A Torre A do Garden no lote da Teste 01, com a garagem dela (o "Construir o prédio pelo Empreendimento" da PE3). */
function torreA() {
  const es = estruturas();
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const r = blocosDasTorresNoLote(GARDEN.teste01.divisas, es, [], null, HIPOTESES_DO_PRODUTO_PADRAO);
  const a = r.blocos.find((b) => b.nome === 'Torre A')!;
  m = applyBatch(m, [
    ...GARDEN.teste01.divisas.map((d): Command => ({ type: 'AddBoundary', levelId: t, a: d.a, b: d.b, kind: 'TERRENO', papel: d.papel }) as Command),
    { type: 'AddBloco', levelId: t, nome: a.nome, pontos: a.pontos, pavimentos: a.pavimentos } as Command,
  ]).model;
  m = applyBatch(m, comandosDoAjuste(m, es.filter((e) => e.nome === 'Torre A')).comandos).model;
  const b = m.blocos!.find((x) => x.nome === 'Torre A')!;
  const torre = es.find((e) => e.nome === 'Torre A')!;
  return planejarPredioDoPedido({
    original: m,
    entrada: { blocoId: b.id, produto: produtoVazio(), doBloco: null, rotacaoNorteDeg: null, doEmpreendimento: { torreId: torre.torreId, andares: papelDosAndares(torre).andares } },
    hip: { climatizacao: false },
  });
}

describe('PE4a + PE5a — o térreo de apartamentos (Garden, Torre A)', { timeout: 300_000 }, () => {
  let cache: ReturnType<typeof torreA> | null = null;
  const plano = () => (cache ??= torreA());
  const nivel = (m: BlueprintModel, re: RegExp) => m.levels.find((l) => re.test(l.name))!;

  it('o andar 0 tem os 2 apartamentos da ficha (e não é mais cópia) e o hall com a porta para a rua — sem medição nem bombas', () => {
    const m = plano().resultado;
    const zero = nivel(m, /1º pav \(térreo\)/);
    expect(zero.tipoDeId).toBeUndefined();
    const estar = (levelId: string) => m.labels.filter((l) => l.levelId === levelId && /Sala de estar/i.test(l.name)).length;
    const tipo = m.levels.find((l) => l.id === plano().tipoLevelId)!;
    expect(estar(tipo.id)).toBe(4);
    expect(estar(zero.id)).toBe(2);
    const nomes = m.spaces.filter((s) => s.levelId === zero.id).map((s) => s.name ?? '');
    expect(nomes).toContain(SALA_HALL);
    expect(nomes.some((n) => n === SALA_MEDICAO || n === SALA_MEDICAO_E_BOMBAS)).toBe(false);
    const portasDaFrente = m.openings.filter((o) => o.kind === 'door' && m.walls.find((w) => w.id === o.wallId)?.levelId === zero.id && o.widthMm >= 1200);
    expect(portasDaFrente.length).toBeGreaterThanOrEqual(1);
    // O resumo conta os 2 apartamentos do andar 0 (12 dos 3 andares + 2) e o andar 0 com a porta.
    expect(plano().resumo.unidades).toBe(14);
    expect(plano().resumo.terreo?.acesso).toBe(true);
    expect(plano().resumo.terreo?.salas).toContain(SALA_HALL);
  });

  it('a medição (o QGBT), a casa de bombas e o desvio do esgoto ficam na garagem mais alta', () => {
    const m = plano().resultado;
    const garagens = m.levels.filter((l) => /Garagem/.test(l.name)).sort((x, y) => y.elevationMm - x.elevationMm);
    const topo = garagens[0];
    expect(topo).toBeDefined();
    expect((m.quadros ?? []).find((q) => q.tipo === 'QGBT')?.levelId).toBe(topo.id);
    expect(m.trechos.filter((t) => t.rotulo === ROTULO_DO_DESVIO).every((t) => t.levelId === topo.id)).toBe(true);
    expect(m.trechos.some((t) => t.rotulo === ROTULO_DO_DESVIO)).toBe(true);
  });

  it('toda louça de todo andar — as do andar 0 também — chega à ligação na rede pública', () => {
    const m = plano().resultado;
    const chave = fazerChave(m.levels);
    const pai = new Map<string, string>();
    const raiz = (a: string): string => (pai.get(a) === a ? a : raiz(pai.get(a)!));
    const une = (a: string, b: string) => {
      for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
      pai.set(raiz(a), raiz(b));
    };
    for (const t of m.trechos.filter((t) => t.disciplina === 'ESGOTO')) une(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    const lig = m.terminais.find((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO')!;
    const kLig = raiz(chave(lig.levelId, lig.at.x, lig.at.y, lig.cotaMm));
    const zero = nivel(m, /1º pav \(térreo\)/);
    const fontes = m.terminais.filter((t) => t.disciplina === 'ESGOTO' && !['CAIXA_INSPECAO', 'LIGACAO_ESGOTO'].includes(t.tipoHidraulico ?? '') && !/Garagem/.test(m.levels.find((l) => l.id === t.levelId)?.name ?? ''));
    expect(fontes.some((f) => f.levelId === zero.id)).toBe(true);
    const fora = fontes.filter((f) => {
      const k = chave(f.levelId, f.at.x, f.at.y, f.cotaMm);
      return !pai.has(k) || raiz(k) !== kLig;
    });
    expect(fora.map((f) => `${f.tipoHidraulico}@${m.levels.find((l) => l.id === f.levelId)!.name}`)).toEqual([]);
  });
});
