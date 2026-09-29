/**
 * E5.2 — O FLUXO DO ESGOTO EM QUALQUER TRECHO (29/09/2026): contrafluxo,
 * declividade abaixo da mínima, DN que diminui a jusante e trecho que não chega
 * à caixa de inspeção — no desenho (marcas) e na conferência da emissão. O
 * sentido não se grava: é o da árvore até a CI.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { esgotoTrechoATrecho, trechosDeEsgotoSemDestino } from '../utils/blueprintEsgotoAutomatico';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { sobrado } from './fixtures/sobradoHidro';

const m0 = sobrado(true, { cotaDaCaixaMm: 4500 });
const fluxo = (m: BlueprintModel) => marcasDeVerificacao(m).filter((x) => ['CONTRAFLUXO', 'DECLIVIDADE_BAIXA', 'DN_DIMINUI', 'SEM_DESTINO'].includes(x.tipo));
const conferencia = (m: BlueprintModel) => {
  const r = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, { nome: 'Ana', titulo: 'Eng', conselho: 'CREA', registro: '1', artNumero: '2', artData: '2026-09-29' });
  return (item: string) => r.verificacoes.find((v) => v.item === item)!;
};

describe('E5.2 — o lançamento automático', () => {
  it('sai sem nenhuma marca de fluxo e com a conferência de fluxo atendida', () => {
    expect(fluxo(m0)).toEqual([]);
    const c = conferencia(m0);
    expect(c('Sentido do fluxo').atende).toBe(true);
    expect(c('DN não diminui a jusante').atende).toBe(true);
    expect(c('Todo trecho chega à caixa de inspeção').atende).toBe(true);
  });
});

describe('E5.2 — o que ela acusa', () => {
  /** À mão: o tanque (cota 0) desce a −300 e corre 2 m até a CI, cuja chegada é `cotaNaCI`. */
  const aMao = (cotaNaCI: number): BlueprintModel => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'TQ', at: point(0, 0), cotaMm: 0, tipoHidraulico: 'TANQUE' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: point(2000, 0), cotaMm: cotaNaCI, tipoHidraulico: 'CAIXA_INSPECAO' },
      { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(0, 0), b: point(0, 0), cotaAMm: 0, cotaBMm: -300, bitolaMm: 40 },
      { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(0, 0), b: point(2000, 0), cotaAMm: -300, cotaBMm: cotaNaCI, bitolaMm: 100 },
    ] as Command[]).model;
    return m;
  };

  it('CONTRAFLUXO: o trecho desenhado SOBE até a caixa (−0,30 → −0,10)', () => {
    const m = aMao(-100);
    const h = m.trechos![1];
    expect(esgotoTrechoATrecho(m).find((c) => c.trechoId === h.id)!.contrafluxo).toBe(true);
    expect(fluxo(m)).toEqual([expect.objectContaining({ tipo: 'CONTRAFLUXO', alvoId: h.id, severidade: 'ERRO', texto: 'contrafluxo — sobe até a caixa' })]);
    expect(conferencia(m)('Sentido do fluxo')).toMatchObject({ atende: false, obtido: '1 trecho(s) em contrafluxo' });
  });

  it('DECLIVIDADE BAIXA: o trecho desenhado quase plano (1 mm em 2 m)', () => {
    const m = aMao(-301);
    const marca = fluxo(m).find((x) => x.alvoId === m.trechos![1].id)!;
    expect(marca.tipo).toBe('DECLIVIDADE_BAIXA');
    expect(marca.texto).toBe('i 0,1 % < 1 %');
    // Descendo 20 mm (1 %) atende.
    expect(fluxo(aMao(-320))).toEqual([]);
  });

  it('SEM DESTINO: um trecho de esgoto solto não chega a nenhuma CI (e a ventilação não conta)', () => {
    const t = m0.levels[0].id;
    const solto = applyCommand(m0, { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(3000, 2500), b: point(4000, 2500), cotaAMm: -150, cotaBMm: -170, bitolaMm: 50 }).model;
    const id = solto.trechos![solto.trechos!.length - 1].id;
    expect(trechosDeEsgotoSemDestino(solto)).toEqual([id]);
    expect(trechosDeEsgotoSemDestino(m0)).toEqual([]);
    expect(conferencia(solto)('Todo trecho chega à caixa de inspeção')).toMatchObject({ atende: false, obtido: '1 sem destino' });
  });
});
