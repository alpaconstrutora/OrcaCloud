/**
 * PE7 do prédio pelo Empreendimento (plano docs/planos/2026-11-18-predio-pelo-empreendimento.md): AS DUAS TORRES NO MESMO
 * ESTUDO. No Garden, a Torre A (do 0, garagem −1/−2) e a Torre B (do −2, garagem −3/−4) são coladas no lote da Teste 01.
 * A Torre B é gerada depois da A, sobre o desenho já com ela. Decisões do usuário de 18/11: "Rampa pela garagem da A" e
 * "Entrada na A, quadro geral na B".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import { aplicarLote, applyBatch, contornoDaVaga, emptyModel, pegadaEmPlanta, snapshotHash, type Command } from '../utils/blueprintKernel';
import { comandosDoAjuste } from '../utils/blueprintAjusteAoEmpreendimento';
import { estruturasDoEmpreendimento, type TorreParaEstrutura } from '../utils/blueprintEstruturaDaTorre';
import { blocosDasTorresNoLote, papelDosAndares } from '../utils/predioAutomatico/andaresDoEmpreendimento';
import { HIPOTESES_DO_PRODUTO_PADRAO, produtoVazio } from '../utils/blueprintProduto';
import { planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { fazerChave } from '../utils/blueprintGrafoDeRede';
import { relatorioDoLote } from '../utils/predioAutomatico/relatorioDoLote';
import { ROTULO_DO_ALIMENTADOR } from '../utils/blueprintAlimentador';
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
    // As conferências não citam pavimentos da A (a rampa pela garagem dela, PE7d, cita de propósito).
    expect(b.pendencias.filter((x) => /Torre A ·/.test(x.texto) && !/pela garagem da Torre A|garagem da Torre A —/.test(x.texto)).map((x) => x.texto.slice(0, 160))).toEqual([]);
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

  it('PE7b (esgoto): uma ligação de esgoto no lote — o coletor da Torre B vai à ligação da A, e toda louça da B chega nela', () => {
    const { b } = plano();
    const m = b.resultado;
    const ligs = m.terminais.filter((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO');
    expect(ligs).toHaveLength(1);
    const chave = fazerChave(m.levels);
    const pai = new Map<string, string>();
    const raiz = (x: string): string => (pai.get(x) === x ? x : raiz(pai.get(x)!));
    const une = (x: string, y: string) => {
      for (const k of [x, y]) if (!pai.has(k)) pai.set(k, k);
      pai.set(raiz(x), raiz(y));
    };
    for (const t of m.trechos.filter((t) => t.disciplina === 'ESGOTO')) une(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    const kLig = raiz(chave(ligs[0].levelId, ligs[0].at.x, ligs[0].at.y, ligs[0].cotaMm));
    const daB = new Set(m.levels.filter((l) => l.name.startsWith('Torre B ·') && !/Garagem/.test(l.name)).map((l) => l.id));
    const fontes = m.terminais.filter((t) => daB.has(t.levelId) && t.disciplina === 'ESGOTO' && !['CAIXA_INSPECAO', 'LIGACAO_ESGOTO', 'POCO_DE_RECALQUE'].includes(t.tipoHidraulico ?? ''));
    expect(fontes.length).toBeGreaterThan(0);
    const fora = fontes.filter((f) => {
      const k = chave(f.levelId, f.at.x, f.at.y, f.cotaMm);
      return !pai.has(k) || raiz(k) !== kLig;
    });
    expect(fora.length).toBe(0);
    expect(b.pendencias.some((x) => /^Esgoto: o coletor desta torre vai à ligação da Torre A/.test(x.texto))).toBe(true);
    // PE8c: sob a Torre A, o coletor da B corre SUSPENSO no forro do 1º subsolo dela (desenhado nesse pavimento, por fora
    // dos pilares) — e não no lote, atravessando a garagem.
    const subsolo1A = m.levels.find((l) => /^Torre A · Garagem · 1º subsolo/.test(l.name))!;
    const coletorB = m.trechos.filter((t) => t.disciplina === 'ESGOTO' && t.levelId === subsolo1A.id && b.criados.includes(t.id));
    expect(coletorB.length).toBeGreaterThan(0);
    const pilares = m.structures.filter((x) => x.kind === 'PILAR' && x.levelId === subsolo1A.id);
    const dentro = (p: { x: number; y: number }, P: readonly { x: number; y: number }[]) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i].y > p.y) !== (P[j].y > p.y) && p.x < ((P[j].x - P[i].x) * (p.y - P[i].y)) / (P[j].y - P[i].y) + P[i].x) c = !c;
      return c;
    };
    const meio = (t: (typeof coletorB)[number]) => ({ x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 });
    expect(coletorB.filter((t) => pilares.some((pl) => dentro(meio(t), pegadaEmPlanta(pl)))).length).toBe(0);
    expect(b.pendencias.some((x) => /^Esgoto: o coletor desta torre .*suspenso no forro do 1º subsolo da Torre A/.test(x.texto))).toBe(true);
    // PE10 (decisão "Conferir o pé-direito livre"): a altura livre sob o coletor suspenso, conferida contra 2,30 m (presumido).
    const livre = b.pendencias.find((x) => /^Garagem da Torre A: altura livre sob o coletor de esgoto desta torre/.test(x.texto));
    expect(livre).toBeDefined();
    const menor = Math.min(...coletorB.map((t) => Math.min(t.cotaAMm, t.cotaBMm) - t.bitolaMm / 2));
    if (menor < 2300) {
      expect(livre!.grupo).toBe('VERIFICACAO');
      expect((livre!.locais ?? []).length).toBeGreaterThan(0);
    } else expect(livre!.grupo).toBe('CONFERIR');
  });

  it('PE7b (água): uma entrada de água no lote — um cavalete só (o da Torre A), e o alimentador da Torre B parte dele', () => {
    const { a, b } = plano();
    const m = b.resultado;
    const cavaletes = m.terminais.filter((t) => t.tipoHidraulico === 'HIDROMETRO' && t.disciplina === 'AGUA_FRIA' && !t.unidadeId);
    expect(cavaletes).toHaveLength(1);
    const daA = a.resultado.terminais.find((t) => t.tipoHidraulico === 'HIDROMETRO' && t.disciplina === 'AGUA_FRIA' && !t.unidadeId)!;
    expect(cavaletes[0].id).toBe(daA.id);
    const daB = new Set(m.levels.filter((l) => l.name.startsWith('Torre B ·')).map((l) => l.id));
    const alimentadorDaB = m.trechos.filter((t) => t.rotulo === ROTULO_DO_ALIMENTADOR && (daB.has(t.levelId) || b.criados.includes(t.id)));
    expect(alimentadorDaB.length).toBeGreaterThan(0);
    expect(alimentadorDaB.some((t) => (t.a.x === daA.at.x && t.a.y === daA.at.y) || (t.b.x === daA.at.x && t.b.y === daA.at.y))).toBe(true);
    // Pela CHAVE da rede (a revisão: o mesmo x, y, mas pavimentos e cotas diferentes — a ponta ficava aberta).
    const ch = fazerChave(m.levels);
    const kCav = ch(daA.levelId, daA.at.x, daA.at.y, daA.cotaMm);
    expect(alimentadorDaB.some((t) => ch(t.levelId, t.a.x, t.a.y, t.cotaAMm) === kCav || ch(t.levelId, t.b.x, t.b.y, t.cotaBMm) === kCav)).toBe(true);
  });

  it('PE7d (decisão "Rampa pela garagem da A"): o carro chega ao −3 da Torre B pela garagem da A — a rampa sobe do −3 da B ao −2 da A, e nenhuma vaga da A fica nela', () => {
    const { b } = plano();
    const m = b.resultado;
    const nivel = (id: string | null | undefined) => m.levels.find((l) => l.id === id);
    const tresB = m.levels.find((l) => /Torre B · Garagem/.test(l.name) && l.elevationMm === -9000)!;
    const doisA = m.levels.find((l) => /Torre A · Garagem/.test(l.name) && l.elevationMm === -6000)!;
    const rampas = m.stairs.filter((e) => e.levelId === tresB.id && e.veicular);
    // A que subia do −3 para dentro do tipo saiu; a que fica vai ao −2 da A.
    expect(rampas.filter((e) => e.desdeCotaMm !== undefined)).toEqual([]);
    const pelaA = rampas.filter((e) => e.ateLevelId === doisA.id);
    expect(pelaA).toHaveLength(1);
    const A = m.blocos!.find((x) => x.nome === 'Torre A')!.pontos;
    const alto = pelaA[0].pontos[pelaA[0].pontos.length - 1];
    const dentro = (p: { x: number; y: number }, P: readonly { x: number; y: number }[]) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i].y > p.y) !== (P[j].y > p.y) && p.x < ((P[j].x - P[i].x) * (p.y - P[i].y)) / (P[j].y - P[i].y) + P[i].x) c = !c;
      return c;
    };
    expect(dentro(alto, A)).toBe(true);
    const [p0, p1] = [pelaA[0].pontos[0], alto];
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const u = { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L };
    const naRampa = (c: { x: number; y: number }) => {
      const s = (c.x - p0.x) * u.x + (c.y - p0.y) * u.y;
      const t = Math.abs((c.x - p0.x) * -u.y + (c.y - p0.y) * u.x);
      return s > -500 && s < L + 5500 && t < pelaA[0].larguraMm / 2 + 200;
    };
    expect((m.vagas ?? []).filter((v) => v.levelId === doisA.id && contornoDaVaga(v).some((c) => naRampa(c))).length).toBe(0);
    expect(nivel(pelaA[0].ateLevelId)?.name).toMatch(/Torre A · Garagem/);
    // PE9: a garagem da B não lança a rampa que subia para os apartamentos — as vagas do −3 saem sem ela (eram 0 no −3, 7 no
    // todo, com a rampa antiga no meio).
    expect((m.vagas ?? []).filter((v) => v.levelId === tresB.id).length).toBeGreaterThan(0);
    // PE8b: o vão na contenção do −3 da B, onde a rampa cruza a parede comum — da largura da rampa.
    const cruza = m.walls.filter((w) => w.levelId === tresB.id && m.openings.some((o) => o.wallId === w.id && o.widthMm >= pelaA[0].larguraMm));
    expect(cruza.length).toBeGreaterThanOrEqual(1);
    expect(b.pendencias.some((x) => /pela garagem da Torre A/.test(x.texto))).toBe(true);
  });

  it('PE10 (decisão "Saída de emergência da garagem B pela A"): a garagem da B não tem escada sem saída — a rota do −3 e do −4 chega à escada do núcleo (que sobe ao 0, na rua) dentro do limite', () => {
    const { b } = plano();
    const m = b.resultado;
    const daB = new Set(m.levels.filter((l) => /Torre B · Garagem/.test(l.name)).map((l) => l.id));
    expect(daB.size).toBe(2);
    // Nenhuma escada de emergência que pare sob os apartamentos (a pendência da PE6) — a garagem não precisou de nenhuma.
    expect(m.stairs.filter((e) => daB.has(e.levelId) && !e.veicular && /emergência/i.test(e.rotulo ?? ''))).toEqual([]);
    expect(b.pendencias.some((x) => /ao teto do subsolo mais alto/.test(x.texto))).toBe(false);
    // A escada do núcleo desce aos dois subsolos da B e a rota de fuga deles não passa do limite.
    expect(m.stairs.filter((e) => daB.has(e.levelId) && !e.veicular && !/emergência/i.test(e.rotulo ?? '')).length).toBe(2);
    expect(b.pendencias.some((x) => x.grupo === 'VERIFICACAO' && /^Rota de fuga/.test(x.texto) && /Garagem/.test(x.texto))).toBe(false);
  });

  it('PE7b (pluvial): o pluvial da Torre B chega ao chão do 0 dela e vai à ligação pluvial da A — uma no lote', () => {
    const { b } = plano();
    const m = b.resultado;
    expect(b.pendencias.some((x) => /sem o térreo do prédio, a descida dos condutores/.test(x.texto))).toBe(false);
    expect(m.terminais.filter((t) => t.tipoHidraulico === 'LIGACAO_PLUVIAL')).toHaveLength(1);
    // A queda do coletor da B até a ligação única (a revisão no app: chegava mais fundo e subia até a da A).
    const pend = b.pendencias.find((x) => /^Pluvial: o coletor desta torre vai à ligação da Torre A/.test(x.texto));
    expect(pend?.grupo).toBe('CONFERIR');
    expect(b.pendencias.some((x) => /^Pluvial: a saída na frente do lote/.test(x.texto))).toBe(false);
    const zeroB = m.levels.find((l) => l.name.startsWith('Torre B ·') && l.elevationMm === 0)!;
    expect(m.terminais.filter((t) => t.levelId === zeroB.id && t.tipoHidraulico === 'CAIXA_AREIA').length).toBeGreaterThan(0);
  });

  it('PE10 (decisão "Pluvial da B só acima do 0"): os condutores da B descem da cobertura ao 0 sem passar pelo tipo — nada no −2 e no −1 — e todo ralo chega à ligação', () => {
    const { b } = plano();
    const m = b.resultado;
    const abaixo = new Set(m.levels.filter((l) => l.name.startsWith('Torre B ·') && !/Garagem/.test(l.name) && l.elevationMm < 0).map((l) => l.id));
    expect(abaixo.size).toBe(2);
    const tipoB = m.levels.find((l) => l.id === b.tipoLevelId)!;
    expect(m.trechos.filter((t) => t.disciplina === 'PLUVIAL' && (abaixo.has(t.levelId) || t.levelId === tipoB.id))).toEqual([]);
    expect(b.pendencias.some((x) => /trecho deles nos andares de baixo/.test(x.texto))).toBe(false);
    const chave = fazerChave(m.levels);
    const pai = new Map<string, string>();
    const raiz = (x: string): string => (pai.get(x) === x ? x : raiz(pai.get(x)!));
    const une = (x: string, y: string) => {
      for (const k of [x, y]) if (!pai.has(k)) pai.set(k, k);
      pai.set(raiz(x), raiz(y));
    };
    for (const t of m.trechos.filter((t) => t.disciplina === 'PLUVIAL')) une(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    const lig = m.terminais.find((t) => t.tipoHidraulico === 'LIGACAO_PLUVIAL')!;
    const kLig = raiz(chave(lig.levelId, lig.at.x, lig.at.y, lig.cotaMm));
    const cobB = m.levels.find((l) => /^Torre B · cobertura/.test(l.name))!;
    const ralos = m.terminais.filter((t) => t.tipoHidraulico === 'RALO_PLUVIAL' && t.levelId === cobB.id);
    expect(ralos.length).toBeGreaterThan(0);
    expect(ralos.filter((r) => { const k = chave(r.levelId, r.at.x, r.at.y, r.cotaMm); return !pai.has(k) || raiz(k) !== kLig; }).length).toBe(0);
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
    // A da entrada própria (que saiu) não fica no relatório contradizendo a entrada única.
    expect(b.pendencias.some((x) => /^Entrada de energia \(QGBT\):/.test(x.texto))).toBe(false);
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

  // ── PE8d (decisão do usuário de 19/11: "Relatório do lote — numa tela do lote"): calculado do DESENHO (vale depois do
  // Lançar, quando a prévia já se foi), uma seção por torre e as entradas do lote.
  it('PE8d: o relatório do lote — as duas torres (unidades, quadro geral, conflitos) e uma entrada de cada rede no lote', () => {
    const { b } = plano();
    const t0 = performance.now();
    const r = relatorioDoLote(b.resultado);
    const ms = performance.now() - t0;
    expect(r.torres.map((t) => t.nome)).toEqual(['Torre A', 'Torre B']);
    expect(r.torres.map((t) => t.unidades)).toEqual([14, 24]);
    expect(r.torres.find((t) => t.nome === 'Torre B')!.quadroGeral?.alimentadoDe).toBe('Torre A');
    expect(r.torres.find((t) => t.nome === 'Torre B')!.quadroGeral?.demandaKva).toBeGreaterThan(50);
    expect(r.torres.find((t) => t.nome === 'Torre A')!.quadroGeral?.alimentadoDe).toBeNull();
    expect(r.entradas).toEqual({ esgoto: 1, pluvial: 1, agua: 1, energia: 1 });
    expect(r.demandaDoLoteKva).toBeGreaterThan(300);
    expect(r.janelasNaParedeComum).toBe(0);
    expect(r.avisos).toEqual([]);
    expect(ms).toBeLessThan(30000);
  });
});

