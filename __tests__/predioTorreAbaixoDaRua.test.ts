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
  }, { permitirTorreAbaixoDaRua: true });
}


describe('PE6a — a torre que começa abaixo da rua (Garden, Torre B)', { timeout: 300_000 }, () => {
  let cache: ReturnType<typeof torreB> | null = null;
  const plano = () => (cache ??= torreB());

  it('o −2 é o pavimento tipo; o −1, o 0, o 1, o 2 e o 3 são cópias dele; a garagem no −3 e no −4', () => {
    const m = plano().resultado;
    const tipo = m.levels.find((l) => l.id === plano().tipoLevelId)!;
    expect(tipo.elevationMm).toBe(-6000);
    const copias = m.levels.filter((l) => l.tipoDeId === tipo.id).map((l) => l.elevationMm).sort((a, b) => a - b);
    expect(copias).toEqual([-3000, 0, 3000, 6000, 9000]);
    // Nenhum pavimento próprio da torre no 0 (o "térreo" de condomínio): só o lote e a cópia.
    expect(m.levels.filter((l) => /Torre B/.test(l.name) && l.elevationMm === 0 && l.tipoDeId === undefined)).toEqual([]);
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
});

