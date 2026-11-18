/**
 * PE6a do prédio pelo Empreendimento (plano docs/planos/2026-11-18-predio-pelo-empreendimento.md; decisão de 18/11 "A
 * torre começa no −2"): a TORRE QUE COMEÇA ABAIXO DA RUA. No Garden, a Torre B tem apartamentos do −2 ao 3 (6 andares de
 * 4) e a garagem no −3 e no −4. O −2 é o pavimento tipo e os outros 5 andares são cópias dele — o 0 também; o técnico do
 * condomínio (medição, bombas, reservatório inferior) vai para a garagem mais alta, o −3.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import { applyBatch, emptyModel, type Command } from '../utils/blueprintKernel';
import { comandosDoAjuste } from '../utils/blueprintAjusteAoEmpreendimento';
import { estruturasDoEmpreendimento, type TorreParaEstrutura } from '../utils/blueprintEstruturaDaTorre';
import { blocosDasTorresNoLote, papelDosAndares } from '../utils/predioAutomatico/andaresDoEmpreendimento';
import { HIPOTESES_DO_PRODUTO_PADRAO, produtoVazio } from '../utils/blueprintProduto';
import { planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { fazerChave } from '../utils/blueprintGrafoDeRede';
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
};
const estruturas = () => estruturasDoEmpreendimento(GARDEN.torres, new Map(Object.entries(GARDEN.pavimentos)));

/** A Torre B do Garden no lote da Teste 01, com a garagem dela (o "Construir o prédio pelo Empreendimento" da PE3). */
function torreB() {
  const es = estruturas();
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const r = blocosDasTorresNoLote(GARDEN.teste01.divisas, es, [], null, HIPOTESES_DO_PRODUTO_PADRAO);
  const a = r.blocos.find((b) => b.nome === 'Torre B')!;
  m = applyBatch(m, [
    ...GARDEN.teste01.divisas.map((d): Command => ({ type: 'AddBoundary', levelId: t, a: d.a, b: d.b, kind: 'TERRENO', papel: d.papel }) as Command),
    { type: 'AddBloco', levelId: t, nome: a.nome, pontos: a.pontos, pavimentos: a.pavimentos } as Command,
  ]).model;
  m = applyBatch(m, comandosDoAjuste(m, es.filter((e) => e.nome === 'Torre B')).comandos).model;
  const b = m.blocos!.find((x) => x.nome === 'Torre B')!;
  const torre = es.find((e) => e.nome === 'Torre B')!;
  return planejarPredioDoPedido({
    original: m,
    entrada: { blocoId: b.id, produto: produtoVazio(), doBloco: null, rotacaoNorteDeg: null, doEmpreendimento: { torreId: torre.torreId, andares: papelDosAndares(torre).andares } },
    hip: { climatizacao: false },
  });
}


describe('PE6a — a torre que começa abaixo da rua (Garden, Torre B)', { timeout: 300_000 }, () => {
  let cache: ReturnType<typeof torreB> | null = null;
  const plano = () => (cache ??= torreB());

  it('o −2 é o pavimento tipo; o −1, o 1, o 2 e o 3 são cópias dele (o 0 nasce cópia e é desvinculado — PE6c); a garagem no −3 e no −4', () => {
    const m = plano().resultado;
    const tipo = m.levels.find((l) => l.id === plano().tipoLevelId)!;
    expect(tipo.elevationMm).toBe(-6000);
    const copias = m.levels.filter((l) => l.tipoDeId === tipo.id).map((l) => l.elevationMm).sort((a, b) => a - b);
    // PE6c (decisão de 18/11 "Desvincular o 0"): o 0 nasce cópia e é desvinculado no fim, para a porta da rua.
    expect(copias).toEqual([-3000, 3000, 6000, 9000]);
    expect(m.levels.filter((l) => /Torre B/.test(l.name) && l.elevationMm === 0)).toHaveLength(1);
    const garagens = m.levels.filter((l) => /Garagem/.test(l.name)).sort((a, b) => b.elevationMm - a.elevationMm);
    expect(garagens.map((l) => l.elevationMm)).toEqual([-9000, -12000]);
    expect(garagens[0].name).toMatch(/3º subsolo/);
  });

  it('24 apartamentos, todos atendidos e medidos; o QGBT e a medição na sala técnica do −3', () => {
    const p = plano();
    expect(p.resumo.unidades).toBe(24);
    expect(p.resumo.eletrica?.unidadesAtendidas).toBe(24);
    expect(p.resumo.eletrica?.unidadesMedidas).toBe(24);
    expect(p.resumo.eletrica?.medidores).toBe(25);
    const m = p.resultado;
    const qgbt = (m.quadros ?? []).find((q) => q.tipo === 'QGBT')!;
    expect(m.levels.find((l) => l.id === qgbt.levelId)?.elevationMm).toBe(-9000);
    expect(p.pendencias.some((x) => /sala técnica do 3º subsolo/.test(x.texto))).toBe(true);
    expect(p.pendencias.some((x) => /^Andar 0: os apartamentos/.test(x.texto))).toBe(false);
  });

  // ── PE6b: o esgoto abaixo da rede pública ──────────────────────────────────────────────────────────────────────────
  it('PE6b: o esgoto chega à rede pela caixa coletora com 2 bombas no −3 e o recalque até a caixa na cota da rua', () => {
    const p = plano();
    const m = p.resultado;
    const elev = (id: string) => m.levels.find((l) => l.id === id)?.elevationMm;
    const pocos = m.terminais.filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'POCO_DE_RECALQUE' && /esgoto/i.test(t.rotulo ?? ''));
    expect(pocos).toHaveLength(1);
    expect(elev(pocos[0].levelId)).toBe(-9000);
    const lig = m.terminais.find((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO')!;
    expect(elev(lig.levelId)).toBe(0);
    const chave = fazerChave(m.levels);
    const pai = new Map<string, string>();
    const raiz = (a: string): string => (pai.get(a) === a ? a : raiz(pai.get(a)!));
    const une = (a: string, b: string) => {
      for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
      pai.set(raiz(a), raiz(b));
    };
    for (const t of m.trechos.filter((t) => t.disciplina === 'ESGOTO')) une(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    const kLig = raiz(chave(lig.levelId, lig.at.x, lig.at.y, lig.cotaMm));
    const kPoco = chave(pocos[0].levelId, pocos[0].at.x, pocos[0].at.y, pocos[0].cotaMm);
    expect(pai.has(kPoco) && raiz(kPoco) === kLig).toBe(true);
    const fontes = m.terminais.filter((t) => t.disciplina === 'ESGOTO' && !['CAIXA_INSPECAO', 'LIGACAO_ESGOTO', 'POCO_DE_RECALQUE', 'CAIXA_SEPARADORA', 'RALO_SECO', 'RALO_LINEAR'].includes(t.tipoHidraulico ?? '') && !/Garagem/.test(m.levels.find((l) => l.id === t.levelId)?.name ?? ''));
    expect(fontes.length).toBeGreaterThan(0);
    const fora = fontes.filter((f) => {
      const k = chave(f.levelId, f.at.x, f.at.y, f.cotaMm);
      return !pai.has(k) || raiz(k) !== kLig;
    });
    expect(fora.map((f) => `${f.tipoHidraulico}@${m.levels.find((l) => l.id === f.levelId)!.name}`)).toEqual([]);
    // As 2 bombas num circuito do quadro da garagem do −3 (o de serviço).
    const bombas = m.terminais.filter((t) => t.tipoEletrico === 'MOTOR_BOMBA' && /esgoto/i.test(t.rotulo ?? ''));
    expect(bombas).toHaveLength(2);
    for (const b of bombas) {
      const c = (m.circuitos ?? []).find((x) => x.id === b.circuitoId);
      expect(c).toBeDefined();
      expect(elev((m.quadros ?? []).find((q) => q.id === c!.quadroId)!.levelId)).toBe(-9000);
    }
    expect(p.resumo.esgoto?.coletor?.porGravidade).toBe(true);
    expect(p.pendencias.some((x) => /estação elevatória/.test(x.texto))).toBe(false);
    expect(p.pendencias.some((x) => /caixa coletora/.test(x.texto))).toBe(true);
  });

  // ── PE6c: o 0 desvinculado, com a porta para a rua, e a rota de fuga do −2 e do −1 até ela ────────────────────────────
  it('PE6c: o 0 desvinculado tem os 4 apartamentos da ficha (unidades do kernel), o hall com a porta para a rua — e todo andar tem rota até a saída', () => {
    const p = plano();
    const m = p.resultado;
    const zero = m.levels.find((l) => /Torre B/.test(l.name) && l.elevationMm === 0)!;
    expect(zero.tipoDeId).toBeUndefined();
    expect(m.labels.filter((l) => l.levelId === zero.id && /Sala de estar/i.test(l.name))).toHaveLength(4);
    const novas = ['TR05', 'TR06', 'TR07', 'TR08'].map((n) => (m.unidades ?? []).find((u) => u.numero === n));
    expect(novas.every(Boolean)).toBe(true);
    const doTipo = new Set((m.unidades ?? []).filter((u) => !/^TR0[5-8]$/.test(u.numero)).map((u) => u.id));
    expect((m.quadros ?? []).filter((q) => q.levelId === zero.id && q.unidadeId && doTipo.has(q.unidadeId))).toEqual([]);
    expect(m.terminais.filter((t) => (t.levelId === zero.id || t.unidadeLevelId === zero.id) && t.unidadeId && doTipo.has(t.unidadeId))).toEqual([]);
    expect(p.resumo.unidades).toBe(24);
    expect(p.resumo.eletrica?.unidadesMedidas).toBe(24);
    expect(p.resumo.eletrica?.medidores).toBe(25);
    expect(p.resumo.agua?.unidadesMedidas).toBe(24);
    expect(m.spaces.filter((s) => s.levelId === zero.id).map((s) => s.name)).toContain(SALA_HALL);
    expect(m.openings.filter((o) => o.kind === 'door' && o.widthMm >= 1200 && m.walls.find((w) => w.id === o.wallId)?.levelId === zero.id).length).toBeGreaterThanOrEqual(1);
    expect(p.resumo.terreo?.acesso).toBe(true);
    expect(p.pendencias.some((x) => /sem caminho até a saída/.test(x.texto))).toBe(false);
    expect(p.pendencias.some((x) => x.grupo === 'CONFERIR' && /desvinculada para a entrada/.test(x.texto) && /não chega mais ao 0/.test(x.texto))).toBe(true);
    expect(p.pendencias.some((x) => /a entrada pela rua \(o hall e a porta\) fica para o projetista/.test(x.texto))).toBe(false);
  });

  // ── PE6d: os nomes da ficha e o envio ao Empreendimento ────────────────────────────────────────────────────────────
  it('PE6d: os 24 apartamentos saem com os nomes da ficha (SS205… no −2, SS105… no −1, TR05… no 0, 105…305) e o envio adota todos — nenhuma unidade nova', () => {
    const m = plano().resultado;
    type TorreDaFicha = { id: string; name: string; units?: { name: string; floor: number }[] };
    const torres = GARDEN.torres as unknown as TorreDaFicha[];
    const torreB = torres.find((t) => t.name === 'Torre B')!;
    const daFicha = (torreB.units ?? []).filter((u) => u.floor >= -2).map((u) => u.name).sort();
    expect(daFicha).toHaveLength(24);
    expect(unidadesDoPredio(m).unidades.map((u) => u.numero).sort()).toEqual(daFicha);
    const produto = produtoDoEmpreendimento(GARDEN.torres as never, produtoVazio()).produto!;
    const EMP = { id: 'f3c21233', organization_id: 'spe', name: '011 - Garden Cambuhy', blueprint_study_id: 'estudo' } as unknown as Empreendimento;
    const lado = ladoDaMassa(EMP, m, produto, null);
    const alvo = {
      towers: torres.map((x) => ({ id: x.id, name: x.name, empreendimento_id: 'f3c21233', blueprint_bloco_uid: null }) as unknown as EmpreendimentoTower),
      units: torres.flatMap((x) => (x.units ?? []).map((u) => ({ ...u, tower_id: x.id, blueprint_unidade_chave: null, blueprint_massa_chave: null }) as unknown as EmpreendimentoUnit)),
      commonAreas: [],
    };
    const envio = buildPlan(lado, alvo);
    expect(envio.towerCreates).toEqual([]);
    expect(envio.unitCreates).toEqual([]);
    const adotadas = envio.adoptions.filter((x) => x.entity === 'unit').map((x) => alvo.units.find((u) => u.id === x.existingId)!.name).sort();
    expect(adotadas).toEqual(daFicha);
    // A revisão (achado 1): a torre tem 6 pavimentos de apartamento (não os 4 acima do solo) e a área comum é rateada.
    const tB = lado.towers.find((t) => t.matchName === 'Torre B')!;
    expect(tB.fields.floors_count).toBe(6);
    expect(tB.units.every((u) => Number(u.fields.common_area) > 0)).toBe(true);
    // (achado 2): os do 0 desvinculado (unidades do kernel, uid aleatório) com a chave ESTÁVEL — pelo andar e pelo nome.
    const doZero = tB.units.filter((u) => /^TR0[5-8]$/.test(String(u.fields.name)));
    expect(doZero).toHaveLength(4);
    expect(doZero.every((u) => !/:unidade:/.test(u.sourceId))).toBe(true);
  });
});

