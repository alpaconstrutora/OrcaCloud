/**
 * IMPORTAR A ELÉTRICA DO IFC (E7.2 do roadmap elétrico, 29/09/2026).
 *
 * *PRONTO QUANDO: importar o próprio IFC exportado devolve os mesmos pontos.*
 * O arquivo é o NOSSO (`gerarIfc`), lido pelo web-ifc do visualizador
 * (`ifcViewerService`), e a posição sai dos VÉRTICES da malha — o web-ifc põe
 * a translação da matriz no centro da geometria, não na origem declarada
 * (medido: a tomada de placement a 250 mm saiu a 300, o centro da caixa).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { comandosDaEletrica, tipoDoPontoIfc, traduzirEletrica } from '../utils/ifcParaKernel';
import { novoUid } from '../utils/blueprintKernel';

/** Dois pavimentos; no de cima, uma tomada, uma luz de teto, um interruptor paralelo, uma caixa e um eletroduto em L. */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 }).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  const ponto = (levelId: string, x: number, y: number, cota: number, tipoEletrico: string, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm: cota, tipoEletrico, ...extra }) as Command;
  m = applyBatch(m, [
    ponto(t1, 2000, 75, 300, 'TUG'),
    ponto(t1, 3000, 2000, 2800, 'ILUMINACAO_TETO'),
    ponto(t1, 1000, 75, 1100, 'INTERRUPTOR', { interruptor: 'PARALELO' }),
    ponto(t0, 4000, 1000, 2800, 'CAIXA_PASSAGEM'),
    ponto(t0, 500, 500, 300, 'TUE'),
    { type: 'AddTrecho', levelId: t1, disciplina: 'ELETRICA', a: point(1000, 500), b: point(4000, 2500), cotaAMm: 300, cotaBMm: 2800, bitolaMm: 25 } as Command,
    { type: 'AddTrecho', levelId: t0, disciplina: 'ELETRICA', a: point(0, 0), b: point(5000, 0), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 32 } as Command,
  ]).model;
  return m;
}

async function lerDeVolta(m: BlueprintModel) {
  const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
  usarCaminhoDoWasm('');
  const api = await obterApi();
  const { lerEletricaParametrica } = await import('../services/ifcParametricoService');
  const id = api.OpenModel(new TextEncoder().encode(gerarIfc(m, { titulo: 'x', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-09-29T12:00:00Z') })));
  try {
    return await lerEletricaParametrica(id);
  } finally {
    api.CloseModel(id);
  }
}

describe('importar a elétrica do IFC', () => {
  it('⚠️ PRONTO QUANDO: o próprio IFC exportado devolve os MESMOS pontos — posição, cota, tipo e variante do interruptor', async () => {
    const m = casa();
    const leitura = await lerDeVolta(m);
    const r = traduzirEletrica(leitura);
    expect(r.recusas).toEqual([]);
    expect(r.pontos).toHaveLength(m.terminais!.length);
    const elevacao = new Map(m.levels.map((l) => [l.id, l.elevationMm]));
    for (const t of m.terminais!) {
      const p = r.pontos.find((x) => x.at.x === t.at.x && x.at.y === t.at.y);
      expect(p, `${t.tipoEletrico} em ${t.at.x},${t.at.y}`).toBeTruthy();
      expect(p!.cotaAbsMm).toBe((elevacao.get(t.levelId) ?? 0) + t.cotaMm);
      expect(p!.tipoEletrico).toBe(t.tipoEletrico);
      expect(p!.interruptor).toBe(t.interruptor ?? null);
    }
  });

  it('⚠️ e os mesmos eletrodutos — o "L" (sobe e corre) volta como UM trecho, com as duas pontas, as duas cotas e a bitola', async () => {
    const m = casa();
    const r = traduzirEletrica(await lerDeVolta(m));
    expect(r.eletrodutos).toHaveLength(2);
    const elevacao = new Map(m.levels.map((l) => [l.id, l.elevationMm]));
    for (const t of m.trechos!) {
      const e = r.eletrodutos.find((x) => x.a.x === t.a.x && x.a.y === t.a.y)!;
      expect(e, `${t.a.x},${t.a.y}`).toBeTruthy();
      expect(e.b).toEqual(t.b);
      expect(e.cotaAAbsMm).toBe((elevacao.get(t.levelId) ?? 0) + t.cotaAMm);
      expect(e.cotaBAbsMm).toBe((elevacao.get(t.levelId) ?? 0) + t.cotaBMm);
      expect(e.bitolaMm).toBe(t.bitolaMm);
    }
  });

  it('cada peça vem com o pavimento do arquivo (para casar com o do desenho)', async () => {
    const leitura = await lerDeVolta(casa());
    const pavimentos = new Set([...leitura.pontos, ...leitura.eletrodutos].map((x) => x.pavimento));
    expect(pavimentos.size).toBe(2);
    expect([...pavimentos].every((p) => typeof p === 'number')).toBe(true);
  });

  it('o tipo pela classe e pelo PredefinedType quando o arquivo é de outro programa (sem ObjectType nosso)', () => {
    expect(tipoDoPontoIfc('IFCOUTLET', 'POWEROUTLET', null)).toEqual({ tipo: 'TUG', interruptor: null });
    expect(tipoDoPontoIfc('IFCOUTLET', 'DATAOUTLET', null)?.tipo).toBe('DADOS_REDE');
    expect(tipoDoPontoIfc('IFCOUTLET', 'TELEPHONEOUTLET', 'Tomada tel.')?.tipo).toBe('DADOS_TELEFONE');
    expect(tipoDoPontoIfc('IFCLIGHTFIXTURE', 'NOTDEFINED', 'Plafon')?.tipo).toBe('ILUMINACAO_TETO');
    expect(tipoDoPontoIfc('IFCSWITCHINGDEVICE', 'TOGGLESWITCH', null)).toEqual({ tipo: 'INTERRUPTOR', interruptor: null });
    expect(tipoDoPontoIfc('IFCJUNCTIONBOX', 'POWER', null)?.tipo).toBe('CAIXA_PASSAGEM');
    expect(tipoDoPontoIfc('IFCFLOWMETER', 'ENERGYMETER', null)?.tipo).toBe('MEDIDOR');
    expect(tipoDoPontoIfc('IFCFLOWMETER', 'GASMETER', null)).toBeNull();
    // O nosso ObjectType vence (TUE não existe no enum), e a variante do interruptor vem junto.
    expect(tipoDoPontoIfc('IFCOUTLET', 'POWEROUTLET', 'TUE')?.tipo).toBe('TUE');
    expect(tipoDoPontoIfc('IFCSWITCHINGDEVICE', 'TOGGLESWITCH', 'INTERRUPTOR:INTERMEDIARIO')).toEqual({ tipo: 'INTERRUPTOR', interruptor: 'INTERMEDIARIO' });
  });

  it('recusas com motivo: ponto sem equivalente, ponto sem geometria, eletroduto que não se encadeia', () => {
    const r = traduzirEletrica({
      pontos: [
        { expressID: 1, classe: 'IFCFLOWMETER', nome: 'gás', globalId: 'g', objectType: null, predefinido: 'GASMETER', centro: { X: 0, Y: 0, Z: 0 }, pavimento: 1 },
        { expressID: 2, classe: 'IFCOUTLET', nome: 't', globalId: 'g2', objectType: null, predefinido: 'POWEROUTLET', centro: null, pavimento: 1 },
      ],
      eletrodutos: [
        { expressID: 3, nome: 'e', globalId: 'g3', segmentos: [{ de: { X: 0, Y: 0, Z: 0 }, para: { X: 1, Y: 0, Z: 0 } }, { de: { X: 2, Y: 0, Z: 0 }, para: { X: 3, Y: 0, Z: 0 } }], diametroM: 0.025, pavimento: 1 },
      ],
      recusas: [],
    });
    expect(r.pontos).toEqual([]);
    expect(r.eletrodutos).toEqual([]);
    expect(r.recusas.map((x) => x.motivo)).toEqual([
      'IFCFLOWMETER .GASMETER. não tem equivalente entre os pontos elétricos',
      'o ponto não tem geometria para dizer onde está',
      'os sólidos do eletroduto não formam um caminho contínuo',
    ]);
  });

  it('⚠️ o CICLO INTEIRO: exportar → ler → traduzir → comandos → aplicar num desenho novo devolve os pontos e eletrodutos GRAVADOS iguais', async () => {
    const m = casa();
    const leitura = await lerDeVolta(m);
    const r = traduzirEletrica(leitura);
    // O desenho de destino: os mesmos pavimentos (casados pela ordem de cota, como a tela sugere).
    let destino = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    destino = applyCommand(destino, { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const pavimentosDoArquivo = [...new Set([...r.pontos, ...r.eletrodutos].map((x) => x.pavimento as number))].sort((x, y) => x - y);
    const casar = new Map(pavimentosDoArquivo.map((p, i) => [p, destino.levels[i]]));
    const cmds = comandosDaEletrica(r.pontos, r.eletrodutos, (p) => {
      const l = casar.get(p);
      return l ? { levelId: l.id, elevationMm: l.elevationMm } : null;
    });
    const importado = applyBatch(destino, cmds).model;
    const chaveT = (x: { levelId: string; at: { x: number; y: number }; cotaMm: number; tipoEletrico?: string | null; interruptor?: string | null }, niveis: BlueprintModel['levels']) =>
      `${niveis.find((l) => l.id === x.levelId)?.name}|${x.at.x},${x.at.y}|${x.cotaMm}|${x.tipoEletrico}|${x.interruptor ?? ''}`;
    expect(importado.terminais!.map((x) => chaveT(x, importado.levels)).sort()).toEqual(m.terminais!.map((x) => chaveT(x, m.levels)).sort());
    const chaveE = (x: { levelId: string; a: { x: number; y: number }; b: { x: number; y: number }; cotaAMm: number; cotaBMm: number; bitolaMm: number }, niveis: BlueprintModel['levels']) =>
      `${niveis.find((l) => l.id === x.levelId)?.name}|${x.a.x},${x.a.y}→${x.b.x},${x.b.y}|${x.cotaAMm}→${x.cotaBMm}|Ø${x.bitolaMm}`;
    expect(importado.trechos!.map((x) => chaveE(x, importado.levels)).sort()).toEqual(m.trechos!.map((x) => chaveE(x, m.levels)).sort());
  });

  it('pavimento CRIADO no mesmo lote: AddTerminal e AddTrecho aceitam o levelUid (como parede e peça)', () => {
    const uid = novoUid();
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const cmds: Command[] = [
      { type: 'AddLevel', name: 'Pavimento +3,00', elevationMm: 3000, defaultHeightMm: 2800, uid } as Command,
      ...comandosDaEletrica(
        [{ expressID: 1, nome: 'TUG', pavimento: 7, at: { x: 100, y: 200 }, cotaAbsMm: 3300, tipoEletrico: 'TUG', interruptor: null }],
        [{ expressID: 2, nome: 'e', pavimento: 7, a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, cotaAAbsMm: 5800, cotaBAbsMm: 5800, bitolaMm: 25 }],
        () => ({ levelId: '', levelUid: uid, elevationMm: 3000 }),
        10,
        -20,
      ),
    ];
    const m = applyBatch(base, cmds).model;
    const novo = m.levels.find((l) => l.uid === uid)!;
    expect(m.terminais![0]).toMatchObject({ levelId: novo.id, at: { x: 110, y: 180 }, cotaMm: 300, tipoEletrico: 'TUG' });
    expect(m.trechos![0]).toMatchObject({ levelId: novo.id, cotaAMm: 2800, cotaBMm: 2800, a: { x: 10, y: -20 } });
    // Pavimento descartado (sem destino): fica de fora.
    expect(comandosDaEletrica([{ expressID: 1, nome: 'x', pavimento: 9, at: { x: 0, y: 0 }, cotaAbsMm: 0, tipoEletrico: 'TUG', interruptor: null }], [], () => null)).toEqual([]);
  });
});
