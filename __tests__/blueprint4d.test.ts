/**
 * O 4D — em que pé está cada peça, numa data.
 *
 * ─── O QUE ESTES CASOS PROTEGEM ─────────────────────────────────────────────
 *
 * O 4D é a funcionalidade mais fácil de fazer parecer pronta e estar errada:
 * uma cena colorida convence antes de alguém conferir a data de uma peça. Os
 * riscos, todos com caso próprio:
 *
 *   1. pintar de CONCLUÍDA uma peça cuja tarefa nem tem data;
 *   2. pintar pela tarefa mais avançada quando a peça tem várias;
 *   3. tratar previsão como execução;
 *   4. atribuir a uma peça uma linha que não é de elemento (total, camada,
 *      esquadria) — o mesmo erro que o custo por elemento já evita.
 */
import { describe, expect, it } from 'vitest';
import {
  COR_DO_STATUS,
  situacaoPorElemento,
  statusNaData,
  type TarefaDoCronograma,
} from '../utils/blueprint4d';

const UID = '9f1fda2c-0991-4b5f-913f-4c9c399e3b64';
const tarefa = (over: Partial<TarefaDoCronograma> = {}): TarefaDoCronograma => ({
  id: `bp:std_1:map_1:${UID}`,
  startDate: '2026-03-10',
  endDate: '2026-03-20',
  ...over,
});

describe('4d · status de uma tarefa numa data', () => {
  it('antes do início, não iniciada', () => {
    expect(statusNaData(tarefa(), '2026-03-09')).toBe('NAO_INICIADA');
  });

  it('no dia do início já conta como em andamento', () => {
    expect(statusNaData(tarefa(), '2026-03-10')).toBe('EM_ANDAMENTO');
  });

  it('no último dia AINDA está em andamento — o dia de término é dia de obra', () => {
    expect(statusNaData(tarefa(), '2026-03-20')).toBe('EM_ANDAMENTO');
  });

  it('depois do fim, concluída', () => {
    expect(statusNaData(tarefa(), '2026-03-21')).toBe('CONCLUIDA');
  });

  it('SEM data de início não vira concluída — ausência não é conclusão', () => {
    // O erro que este caso impede: comparar contra string vazia faria toda
    // tarefa sem data aparecer verde, porque qualquer data é "maior" que ''.
    expect(statusNaData(tarefa({ startDate: undefined }), '2030-01-01')).toBe('NAO_INICIADA');
  });

  it('com início e SEM fim, fica em andamento para sempre — não se conclui sozinha', () => {
    expect(statusNaData(tarefa({ endDate: undefined }), '2099-01-01')).toBe('EM_ANDAMENTO');
  });

  it('data com hora junto não confunde a comparação', () => {
    expect(statusNaData(tarefa({ startDate: '2026-03-10T00:00:00Z' }), '2026-03-10')).toBe(
      'EM_ANDAMENTO',
    );
  });
});

describe('4d · a situação de cada elemento', () => {
  it('atravessa a cadeia: a tarefa acha o elemento pelo uid dentro do id', () => {
    const m = situacaoPorElemento([tarefa()], '2026-03-15');
    expect(m.get(UID)?.status).toBe('EM_ANDAMENTO');
  });

  it('VALE A MENOS AVANÇADA quando a peça tem duas tarefas', () => {
    // Alvenaria pronta, reboco nem começou: a parede NÃO está pronta. Pintar
    // pela mais avançada seria a leitura otimista que faz o 3D mentir.
    const m = situacaoPorElemento(
      [
        tarefa({ id: `bp:s:alvenaria:${UID}`, startDate: '2026-01-01', endDate: '2026-01-10' }),
        tarefa({ id: `bp:s:reboco:${UID}`, startDate: '2026-06-01', endDate: '2026-06-10' }),
      ],
      '2026-03-15',
    );
    expect(m.get(UID)?.status).toBe('NAO_INICIADA');
  });

  it('linha que NÃO é de elemento não pinta peça nenhuma', () => {
    const m = situacaoPorElemento(
      [
        tarefa({ id: 'bp:std_1:map_1:total' }),
        tarefa({ id: 'bp:std_1:camada:87251:ESTRUTURAL' }),
        tarefa({ id: 'bp:std_1:esquadria:door|800' }),
        tarefa({ id: 'digitada-a-mao' }),
      ],
      '2026-03-15',
    );
    expect(m.size).toBe(0);
  });

  it('PREVISÃO NÃO É EXECUÇÃO: sem percentual informado, realConhecido é false', () => {
    const m = situacaoPorElemento([tarefa()], '2026-03-15');
    expect(m.get(UID)?.realConhecido).toBe(false);
  });

  it('com percentual informado, realConhecido é true', () => {
    const m = situacaoPorElemento([tarefa({ manualRealPct: 40 })], '2026-03-15');
    expect(m.get(UID)?.realConhecido).toBe(true);
  });

  it('percentual ZERO conta como informado — zero é medição, não ausência', () => {
    const m = situacaoPorElemento([tarefa({ manualRealPct: 0 })], '2026-03-15');
    expect(m.get(UID)?.realConhecido).toBe(true);
  });

  it('uma tarefa sem execução informada derruba o conjunto', () => {
    const m = situacaoPorElemento(
      [
        tarefa({ id: `bp:s:a:${UID}`, manualRealPct: 100 }),
        tarefa({ id: `bp:s:b:${UID}` }),
      ],
      '2026-03-15',
    );
    expect(m.get(UID)?.realConhecido).toBe(false);
  });

  it('as três cores são distintas — senão o 3D não comunica nada', () => {
    const cores = Object.values(COR_DO_STATUS);
    expect(new Set(cores).size).toBe(cores.length);
  });
});
