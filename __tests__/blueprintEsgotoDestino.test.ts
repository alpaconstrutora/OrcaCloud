/**
 * DESTINO DO ESGOTO (14/10/2026) — rede pública × tratamento individual como hipótese do estudo.
 * Plano: `docs/planos/2026-10-14-esgoto-destino-rede-ou-tratamento.md`.
 *
 * Antes, o lançamento SEMPRE escolhia a rede pública (criava a ligação na frente do lote), e o
 * tratamento recusava quando havia ligação — num lote sem rede, o automático não servia.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, type HipotesesDeEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { planejarEsgotoCompleto } from '../utils/blueprintEsgotoCompleto';
import { planejarColetorPredial } from '../utils/blueprintColetorPredial';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { hashDaBaseHidro, verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { casa } from './fixtures/casaEsgotoNoLote';

const TRATAMENTO: HipotesesDeEsgoto = { ...HIPOTESES_ESGOTO_PADRAO, destino: 'TRATAMENTO' };
const lancar = (m: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO, extra?: Parameters<typeof planejarEsgotoCompleto>[3]) =>
  applyBatch(m, planejarEsgotoCompleto(m, hip, null, extra).comandos).model;
const tipos = (m: BlueprintModel) => (m.terminais ?? []).map((t) => t.tipoHidraulico).filter((t) => ['CAIXA_INSPECAO', 'LIGACAO_ESGOTO', 'TANQUE_SEPTICO', 'FILTRO_ANAEROBIO', 'SUMIDOURO'].includes(t ?? '')).sort();

describe('destino do esgoto', () => {
  it('ausente = rede pública: o lançamento é o de antes (caixa + ligação)', () => {
    expect(tipos(lancar(casa()))).toEqual(['CAIXA_INSPECAO', 'LIGACAO_ESGOTO']);
  });

  it('TRATAMENTO: um lançamento põe caixa → tanque → filtro → sumidouro, e NENHUMA ligação', () => {
    const p = planejarEsgotoCompleto(casa(), TRATAMENTO);
    expect(p.destino).toBe('TRATAMENTO');
    expect(p.confirmadosDoOutroDestino).toEqual([]);
    expect(p.presumido.join(' ')).toMatch(/tratamento individual/i);
    const depois = applyBatch(casa(), p.comandos).model;
    expect(tipos(depois)).toEqual(['CAIXA_INSPECAO', 'FILTRO_ANAEROBIO', 'SUMIDOURO', 'TANQUE_SEPTICO']);
    // Sem filtro, só tanque e sumidouro.
    const semFiltro = lancar(casa(), TRATAMENTO, { tratamento: { comFiltro: false } });
    expect(tipos(semFiltro)).toEqual(['CAIXA_INSPECAO', 'SUMIDOURO', 'TANQUE_SEPTICO']);
  });

  it('TRATAMENTO depois de a rede pública ter sido lançada: a ligação e o coletor SUGERIDOS saem', () => {
    const comRede = lancar(casa());
    expect(tipos(comRede)).toContain('LIGACAO_ESGOTO');
    const depois = lancar(comRede, TRATAMENTO);
    expect(tipos(depois)).toEqual(['CAIXA_INSPECAO', 'FILTRO_ANAEROBIO', 'SUMIDOURO', 'TANQUE_SEPTICO']);
    expect((depois.trechos ?? []).some((t) => t.rotulo === 'Coletor predial')).toBe(false);
  });

  it('TRATAMENTO com ligação CONFIRMADA: não apaga sem autorização; com ela, apaga e lança o tratamento', () => {
    let m = lancar(casa());
    const lig = (m.terminais ?? []).find((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO')!;
    m = applyBatch(m, [{ type: 'SetTerminalProps', terminalId: lig.id, sugerida: false } as never]).model;
    expect((m.terminais ?? []).find((t) => t.id === lig.id)!.sugerida).toBeFalsy();

    const sem = planejarEsgotoCompleto(m, TRATAMENTO);
    expect(sem.confirmadosDoOutroDestino).toContain(lig.id);
    const semAutorizar = applyBatch(m, sem.comandos).model;
    expect(tipos(semAutorizar)).toContain('LIGACAO_ESGOTO'); // nada confirmado sumiu
    expect(tipos(semAutorizar)).not.toContain('SUMIDOURO'); // e não há dois destinos

    const autorizado = lancar(m, TRATAMENTO, { apagarConfirmadosDoOutroDestino: true });
    expect(tipos(autorizado)).toEqual(['CAIXA_INSPECAO', 'FILTRO_ANAEROBIO', 'SUMIDOURO', 'TANQUE_SEPTICO']);
  });

  it('simetria: voltar para rede pública tira o tratamento SUGERIDO e põe a ligação', () => {
    const comTratamento = lancar(casa(), TRATAMENTO);
    const depois = lancar(comTratamento);
    expect(tipos(depois)).toEqual(['CAIXA_INSPECAO', 'LIGACAO_ESGOTO']);
  });

  it('simetria: tratamento CONFIRMADO só sai com autorização', () => {
    let m = lancar(casa(), TRATAMENTO);
    const sumidouro = (m.terminais ?? []).find((t) => t.tipoHidraulico === 'SUMIDOURO')!;
    m = applyBatch(m, [{ type: 'SetTerminalProps', terminalId: sumidouro.id, sugerida: false } as never]).model;
    const sem = planejarEsgotoCompleto(m);
    expect(sem.confirmadosDoOutroDestino).toContain(sumidouro.id);
    expect(tipos(applyBatch(m, sem.comandos).model)).not.toContain('LIGACAO_ESGOTO');
    expect(tipos(lancar(m, HIPOTESES_ESGOTO_PADRAO, { apagarConfirmadosDoOutroDestino: true }))).toEqual(['CAIXA_INSPECAO', 'LIGACAO_ESGOTO']);
  });
});

describe('destino do esgoto — o estudo e a ART', () => {
  it('o hash da ART de um estudo sem o campo NÃO muda (campo ausente = rede pública)', () => {
    const m = casa();
    const antes = hashDaBaseHidro(m, HIPOTESES_HIDRO_PADRAO).base;
    const relido = hipotesesHidroDaColuna(JSON.parse(JSON.stringify(HIPOTESES_HIDRO_PADRAO)));
    expect(hashDaBaseHidro(m, relido).base).toBe(antes);
    // Escolher tratamento muda o hash; voltar para rede pública (campo ausente) devolve o mesmo.
    const comTratamento = { ...HIPOTESES_HIDRO_PADRAO, esgoto: { ...HIPOTESES_HIDRO_PADRAO.esgoto, destino: 'TRATAMENTO' as const } };
    expect(hashDaBaseHidro(m, comTratamento).base).not.toBe(antes);
    const devolta = { ...comTratamento, esgoto: { ...comTratamento.esgoto, destino: undefined } };
    expect(hashDaBaseHidro(m, devolta).base).toBe(antes);
  });

  it('o estudo relido preserva o destino e as distâncias; valor inválido cai para ausente', () => {
    const gravado = { ...HIPOTESES_HIDRO_PADRAO, esgoto: { ...HIPOTESES_HIDRO_PADRAO.esgoto, destino: 'TRATAMENTO', distanciaAteALigacaoMm: 10000, distanciaEntreCaixasMm: 20000 } };
    const relido = hipotesesHidroDaColuna(JSON.parse(JSON.stringify(gravado)));
    expect(relido.esgoto.destino).toBe('TRATAMENTO');
    expect(relido.esgoto.distanciaAteALigacaoMm).toBe(10000);
    expect(relido.esgoto.distanciaEntreCaixasMm).toBe(20000);
    const lixo = hipotesesHidroDaColuna({ esgoto: { destino: 'FOSSA', distanciaAteALigacaoMm: -5 } });
    expect(lixo.esgoto.destino).toBeUndefined();
    expect(lixo.esgoto.distanciaAteALigacaoMm).toBeUndefined();
    expect('destino' in lixo.esgoto).toBe(false);
  });

  it('as distâncias da NBR 8160 do coletor são hipóteses (ausente = 15 m / 25 m)', () => {
    const m = lancar(casa());
    const padrao = planejarColetorPredial(m, HIPOTESES_ESGOTO_PADRAO);
    const curta = planejarColetorPredial(m, { ...HIPOTESES_ESGOTO_PADRAO, distanciaAteALigacaoMm: 1000, distanciaEntreCaixasMm: 1000 });
    expect(curta.caixasIntermediarias).toBeGreaterThan(padrao.caixasIntermediarias);
  });

  it('executivo: destino tratamento ainda não lançado NÃO cobra o coletor até a rede pública', () => {
    const m = lancar(casa(), TRATAMENTO, { tratamento: { comFiltro: true } });
    const hip = { ...HIPOTESES_HIDRO_PADRAO, esgoto: TRATAMENTO };
    const v = verificacoesHidro(m, hip, { nome: 'Fulana', titulo: 'Engenheira Civil', conselho: 'CREA', registro: 'CREA-SP 1', artNumero: '123' } as never).verificacoes;
    expect(v.some((x) => /Coletor predial até a rede pública/.test(x.item))).toBe(false);
    expect(v.some((x) => x.grupo === 'NBR7229')).toBe(true);
  });
});
