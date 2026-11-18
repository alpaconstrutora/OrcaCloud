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
});
