/**
 * IA da planta (19/09/2026, E6.4), parte pura: o intérprete local entende os
 * pedidos comuns e emite o mesmo esquema da IA; `aplicarMudancas` valida e
 * aplica (recusando o que não dá) no programa, no gerador e nos pesos; o
 * delta dos indicadores e das áreas; "explicar solução" determinístico; a
 * resposta externa é saneada.
 */
import { describe, expect, it } from 'vitest';
import { aplicarMudancas, deltaDeAreas, deltaDeIndicadores, explicarSolucao, interpretarPedidoLocal, itemPorAlvo, mudancasDaResposta } from '../utils/blueprintIa';
import { HIPOTESES_DA_AVALIACAO_PADRAO, avaliar } from '../utils/blueprintAvaliacao';
import { HIPOTESES_DO_GERADOR_PADRAO, gerar } from '../utils/blueprintGerador';
import { emptyModel } from '../utils/blueprintKernel';
import { programaSemente } from '../utils/blueprintPrograma';

describe('IA da planta — intérprete local e mudanças', () => {
  it('entende "suíte +2 m²", "aumente a sala em 3 m²", "3 dormitórios", "sem varanda", "corredor de 1,20", "peso da insolação 8", "sem automáticos" — e aplica com validação', () => {
    const p = programaSemente('APTO_3Q_SUITE');
    const m = interpretarPedidoLocal('Suíte +2 m², aumente a sala em 3 m², quero 3 dormitórios, sem varanda, corredor de 1,20 m, peso da insolação 8 e sem automáticos', p)!;
    expect(m).not.toBeNull();
    expect(m.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'ajustar_area', deltaM2: 2 }),
        expect.objectContaining({ op: 'ajustar_area', deltaM2: 3 }),
        expect.objectContaining({ op: 'definir_quantidade', quantidade: 3 }),
        expect.objectContaining({ op: 'remover' }),
      ]),
    );
    expect(m.gerador).toMatchObject({ larguraCorredorMm: 1200, automaticos: false });
    expect(m.pesos).toEqual({ insolacao: 8 });
    expect(m.entendimento).toMatch(/^Entendi \(intérprete local\): /);
    const r = aplicarMudancas(m, p, HIPOTESES_DO_GERADOR_PADRAO, HIPOTESES_DA_AVALIACAO_PADRAO);
    const suite = r.programa.itens.find((i) => i.uso === 'SUITE')!;
    const sala = r.programa.itens.find((i) => i.uso === 'SALA')!;
    expect(suite.areaIdealM2).toBe(17); // 15 + 2
    expect(sala.areaIdealM2).toBe(27); // 24 + 3
    expect(r.programa.itens.find((i) => i.uso === 'DORMITORIO')!.quantidade).toBe(3);
    expect(r.programa.itens.some((i) => i.uso === 'VARANDA')).toBe(false);
    expect(r.gerador.larguraCorredorMm).toBe(1200);
    expect(r.gerador.automaticos).toBe(false);
    expect(r.avaliacao.pesos.insolacao).toBe(8);
    expect(r.recusadas).toEqual([]);
    expect(r.aplicadas.length).toBeGreaterThanOrEqual(6);
    // Pedido incompreensível → null; alvo inexistente → recusado; fora da faixa → recusado.
    expect(interpretarPedidoLocal('bom dia', p)).toBeNull();
    const ruim = aplicarMudancas({ entendimento: '', itens: [{ op: 'ajustar_area', alvo: 'piscina', deltaM2: 5 }], gerador: { sementes: 99 }, pesos: { custo: 40 } }, p, HIPOTESES_DO_GERADOR_PADRAO, HIPOTESES_DA_AVALIACAO_PADRAO);
    expect(ruim.aplicadas).toEqual([]);
    expect(ruim.recusadas).toEqual([expect.stringMatching(/não achei "piscina"/), expect.stringMatching(/sementes 99/), expect.stringMatching(/peso de custo/)]);
    // "mais um escritório" adiciona item novo; "2 banheiros" define quantidade do existente (o primeiro banheiro).
    const mais = interpretarPedidoLocal('mais um escritório e 2 banheiros', p)!;
    expect(mais.itens).toEqual(expect.arrayContaining([expect.objectContaining({ op: 'adicionar', uso: 'ESCRITORIO' }), expect.objectContaining({ op: 'definir_quantidade', quantidade: 2 })]));
    expect(itemPorAlvo(p, 'banheiro da suite')!.nome).toBe('Banheiro da suíte');
    expect(itemPorAlvo(p, 'DORMITORIO')!.uso).toBe('DORMITORIO');
  });

  it('delta de indicadores e de áreas entre duas gerações; explicar solução; resposta externa saneada', () => {
    const entrada = { programa: programaSemente('APTO_2Q'), envelope: null, direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -23.5 };
    const antes = gerar(entrada, 1, { automaticos: false, iteracoes: 60 });
    const m = interpretarPedidoLocal('sala +6 m²', entrada.programa)!;
    const depoisPrograma = aplicarMudancas(m, entrada.programa, HIPOTESES_DO_GERADOR_PADRAO, HIPOTESES_DA_AVALIACAO_PADRAO).programa;
    const depois = gerar({ ...entrada, programa: depoisPrograma }, 1, { automaticos: false, iteracoes: 60 });
    const d = deltaDeIndicadores(antes.avaliacao, depois.avaliacao);
    expect(d.linhas).toHaveLength(18);
    expect(d.texto).toMatch(/^nota \d+ → \d+ \([+-]?\d+\)/);
    const areas = deltaDeAreas(antes.ambientes, depois.ambientes);
    expect(areas).toMatch(/Sala de estar\/jantar [+-]\d+,\d\d m²|áreas iguais/);
    // Sem "antes": lista as áreas; nota sem seta.
    expect(deltaDeIndicadores(null, depois.avaliacao).texto).toMatch(/^nota \d+$/);
    expect(deltaDeAreas(null, depois.ambientes)).toMatch(/Sala de estar\/jantar \d+,\d\d m²/);
    // Explicar: nota, decisões numeradas, o que pesa, próximos passos.
    const txt = explicarSolucao(depois.decisoes, depois.avaliacao, depois.avisos);
    expect(txt).toMatch(/^Nota geral \d+/);
    expect(txt).toMatch(/Como a planta foi decidida:\n1\. /);
    expect(txt).toMatch(/O que pesa para baixo:/);
    // Modelo vazio: explica sem decisões.
    expect(explicarSolucao([], avaliar({ model: emptyModel() }))).toMatch(/^Nota geral —/);
    // Saneamento da resposta externa.
    expect(mudancasDaResposta(null)).toBeNull();
    expect(mudancasDaResposta({ itens: [{ op: 'remover', alvo: 'x' }, 'lixo', { semOp: true }], pesos: { custo: 3 } })).toEqual({ entendimento: 'Mudanças propostas pela IA.', itens: [{ op: 'remover', alvo: 'x' }], pesos: { custo: 3 } });
  });
});
