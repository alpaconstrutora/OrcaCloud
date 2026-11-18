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
import { unidadesDoPredio } from '../utils/blueprintUnidadesDoPredio';
import { produtoDoEmpreendimento } from '../utils/blueprintProdutoDoEmpreendimento';
import { ladoDaMassa } from '../services/sync/massaAdapter';
import { buildPlan } from '../services/sync/planner';
import type { Empreendimento, EmpreendimentoTower, EmpreendimentoUnit } from '../types/empreendimento';

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

  it('PE4b: o 002 e o 004 são unidades do kernel — com o QD, o hidrômetro e o medidor deles; a elétrica e a água medem 14', () => {
    const p = plano();
    const m = p.resultado;
    const zero = nivel(m, /1º pav \(térreo\)/);
    const novas = ['002', '004'].map((n) => (m.unidades ?? []).find((u) => u.numero === n));
    expect(novas.every(Boolean)).toBe(true);
    for (const u of novas as NonNullable<(typeof novas)[number]>[]) {
      expect(u.etiquetaUids.length).toBeGreaterThan(0);
      expect(m.labels.filter((l) => u.etiquetaUids.includes(l.uid)).every((l) => l.levelId === zero.id)).toBe(true);
      expect((m.quadros ?? []).filter((q) => q.levelId === zero.id && q.unidadeId === u.id)).toHaveLength(1);
      expect(m.terminais.filter((t) => t.tipoHidraulico === 'HIDROMETRO' && t.unidadeId === u.id)).toHaveLength(1);
      expect(m.terminais.filter((t) => t.tipoEletrico === 'MEDIDOR' && t.unidadeId === u.id)).toHaveLength(1);
    }
    // Nada do andar 0 aponta mais para uma unidade do tipo (o 102 da cópia contaria duas vezes).
    const doTipo = new Set((m.unidades ?? []).filter((u) => !['002', '004'].includes(u.numero)).map((u) => u.id));
    expect((m.quadros ?? []).filter((q) => q.levelId === zero.id && q.unidadeId && doTipo.has(q.unidadeId))).toEqual([]);
    expect(m.terminais.filter((t) => t.levelId === zero.id && t.unidadeId && doTipo.has(t.unidadeId))).toEqual([]);
    expect(p.resumo.eletrica?.unidadesAtendidas).toBe(14);
    expect(p.resumo.eletrica?.unidadesMedidas).toBe(14);
    expect(p.resumo.eletrica?.medidores).toBe(15);
    expect(p.resumo.agua?.unidadesMedidas).toBe(14);
    const numeros = unidadesDoPredio(m).unidades.map((u) => u.numero);
    expect(numeros.filter((n) => ['002', '004'].includes(n))).toHaveLength(2);
    expect(numeros).toHaveLength(14);
  });

  it('PE4b: o pluvial desce ao chão do andar 0 — cada ralo da cobertura chega à ligação na frente, pelas caixas de areia', () => {
    const p = plano();
    const m = p.resultado;
    const zero = nivel(m, /1º pav \(térreo\)/);
    expect(p.pendencias.some((x) => /sem o térreo do prédio/.test(x.texto))).toBe(false);
    expect(m.terminais.filter((t) => t.levelId === zero.id && t.tipoHidraulico === 'CAIXA_AREIA')).toHaveLength(p.resumo.pluvial!.condutores);
    const lig = m.terminais.find((t) => t.tipoHidraulico === 'LIGACAO_PLUVIAL');
    expect(lig?.levelId).toBe(zero.id);
    const chave = fazerChave(m.levels);
    const pai = new Map<string, string>();
    const raiz = (a: string): string => (pai.get(a) === a ? a : raiz(pai.get(a)!));
    const une = (a: string, b: string) => {
      for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
      pai.set(raiz(a), raiz(b));
    };
    for (const t of m.trechos.filter((t) => t.disciplina === 'PLUVIAL')) une(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    const kLig = raiz(chave(lig!.levelId, lig!.at.x, lig!.at.y, lig!.cotaMm));
    const ralos = m.terminais.filter((t) => t.tipoHidraulico === 'RALO_PLUVIAL');
    expect(ralos.length).toBe(p.resumo.pluvial!.condutores);
    const fora = ralos.filter((r) => {
      const k = chave(r.levelId, r.at.x, r.at.y, r.cotaMm);
      return !pai.has(k) || raiz(k) !== kLig;
    });
    expect(fora.map((r) => `${r.at.x},${r.at.y}`)).toEqual([]);
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

  it('PE6d: o envio ao Empreendimento leva também o 002 e o 004 do andar 0 — adota os 14 da ficha, nenhuma unidade nova', () => {
    const m = plano().resultado;
    type TorreDaFicha = { id: string; name: string; units?: { name: string; floor: number }[] };
    const torres = GARDEN.torres as unknown as TorreDaFicha[];
    const produto = produtoDoEmpreendimento(GARDEN.torres as never, produtoVazio()).produto!;
    const EMP = { id: 'f3c21233', organization_id: 'spe', name: '011 - Garden Cambuhy', blueprint_study_id: 'estudo' } as unknown as Empreendimento;
    const alvo = {
      towers: torres.map((x) => ({ id: x.id, name: x.name, empreendimento_id: 'f3c21233', blueprint_bloco_uid: null }) as unknown as EmpreendimentoTower),
      units: torres.flatMap((x) => (x.units ?? []).map((u) => ({ ...u, tower_id: x.id, blueprint_unidade_chave: null, blueprint_massa_chave: null }) as unknown as EmpreendimentoUnit)),
      commonAreas: [],
    };
    const lado = ladoDaMassa(EMP, m, produto, null);
    const doZero = lado.towers.flatMap((t) => t.units).filter((u) => ['002', '004'].includes(String(u.fields.name)));
    expect(doZero).toHaveLength(2);
    expect(doZero.every((u) => !/:unidade:/.test(u.sourceId))).toBe(true);
    const envio = buildPlan(lado, alvo);
    expect(envio.unitCreates).toEqual([]);
    const adotadas = envio.adoptions.filter((x) => x.entity === 'unit').map((x) => alvo.units.find((u) => u.id === x.existingId)!.name).sort();
    expect(adotadas).toEqual(['002', '004', '101', '102', '103', '104', '201', '202', '203', '204', '301', '302', '303', '304']);
  });
});

