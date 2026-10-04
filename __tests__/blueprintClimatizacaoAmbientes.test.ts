/**
 * CLIMATIZAÇÃO E0.3 (04/10/2026): o declarado por ambiente (pelo uid da
 * etiqueta), o padrão por uso que preenche o que falta, e o pé-direito ÚNICO
 * da carga térmica (achado 3).
 */
import { describe, expect, it } from 'vitest';
import {
  ATIVIDADES,
  HIPOTESES_DO_AMBIENTE_VAZIAS,
  PADRAO_POR_USO,
  USOS_DO_AMBIENTE,
  ambientesDaColuna,
  hipotesesDoAmbienteDaColuna,
  peDireitoLivreMm,
  premissasDoAmbiente,
} from '../utils/blueprintClimatizacaoAmbientes';
import { HIPOTESES_CLIMATIZACAO_PADRAO, hipotesesClimatizacaoDaColuna } from '../utils/blueprintClimatizacao';
import { peDireitoUtilMm } from '../utils/blueprintAcabamentos';

const ctx = { nome: 'Sala de estar', areaPisoM2: 20, peDireitoMm: 2800, temperaturaDoEstudoC: 24 };

describe('leitura da coluna', () => {
  it('todo uso tem padrão, toda atividade do padrão existe', () => {
    for (const uso of USOS_DO_AMBIENTE) {
      expect(PADRAO_POR_USO[uso], uso).toBeTruthy();
      expect(ATIVIDADES).toContain(PADRAO_POR_USO[uso].atividade);
    }
  });

  it('declaração parcial é completada com null; tipo errado e fora da faixa caem', () => {
    const h = hipotesesDoAmbienteDaColuna({ climatizado: true, pessoas: 3.5, atividade: 'DANCA', iluminacaoWm2: 12, equipamentosW: -5, fonteSensivelW: 200 });
    expect(h).toEqual({ ...HIPOTESES_DO_AMBIENTE_VAZIAS, climatizado: true, iluminacaoWm2: 12, fonteSensivelW: 200 });
  });

  it('o mapa por uid descarta chave vazia e declaração sem nada; o leitor do estudo o carrega', () => {
    const m = ambientesDaColuna({ 'uid-a': { pessoas: 2 }, '': { pessoas: 9 }, 'uid-b': {}, 'uid-c': 'lixo' });
    expect(Object.keys(m)).toEqual(['uid-a']);
    expect(m['uid-a'].pessoas).toBe(2);
    expect(hipotesesClimatizacaoDaColuna({ ambientes: { 'uid-a': { climatizado: false } } }).ambientes).toEqual({ 'uid-a': { ...HIPOTESES_DO_AMBIENTE_VAZIAS, climatizado: false } });
    expect(HIPOTESES_CLIMATIZACAO_PADRAO.ambientes).toEqual({});
  });
});

describe('o que vale para o ambiente', () => {
  it('sem declaração: tudo vem do USO pelo nome, o setpoint do ESTUDO, e a tela precisa dizer CONFERIR', () => {
    const p = premissasDoAmbiente(undefined, ctx);
    expect(p.uso).toBe('SALA');
    expect(p.climatizado).toEqual({ valor: true, origem: 'USO' });
    expect(p.pessoas).toEqual({ valor: 4, origem: 'USO' });
    expect(p.atividade).toEqual({ valor: 'SENTADO_REPOUSO', origem: 'USO' });
    expect(p.temperaturaInternaC).toEqual({ valor: 24, origem: 'ESTUDO' });
    expect(p.iluminacaoW).toBe(100); // 5 W/m² × 20 m²
    expect(p.fonteSensivelW).toBe(0);
    expect(p.conferir).toBe(true);
  });

  it('o declarado vence o uso e o estudo, e um ambiente todo declarado não pede CONFERIR', () => {
    const p = premissasDoAmbiente(
      { climatizado: false, temperaturaInternaC: 22, pessoas: 6, atividade: 'MODERADA', iluminacaoWm2: 8, equipamentosW: 450, fonteSensivelW: 100, fonteLatenteW: 50 },
      ctx,
    );
    expect(p.climatizado).toEqual({ valor: false, origem: 'DECLARADA' });
    expect(p.temperaturaInternaC).toEqual({ valor: 22, origem: 'DECLARADA' });
    expect(p.pessoas.valor).toBe(6);
    expect(p.iluminacaoW).toBe(160);
    expect(p.equipamentosW.valor).toBe(450);
    expect(p.fonteLatenteW).toBe(50);
    expect(p.conferir).toBe(false);
  });

  it('nome sem uso reconhecido: padrão de OUTRO com origem SEM', () => {
    const p = premissasDoAmbiente(undefined, { ...ctx, nome: 'Xyz' });
    expect(p.uso).toBeNull();
    expect(p.climatizado).toEqual({ valor: false, origem: 'SEM' });
  });

  it('pé-direito ÚNICO: o livre desconta piso, rebaixo e forro — é o `peDireitoUtilMm` dos acabamentos; o volume vem dele', () => {
    const acab = { piso: [{ espessuraMm: 30, itemCode: '', descricao: 'contrapiso+porcelanato', funcao: 'ACABAMENTO' as const }], forro: { rebaixoMm: 300, camadas: [{ espessuraMm: 12, itemCode: '', descricao: 'gesso', funcao: 'ACABAMENTO' as const }] } };
    expect(peDireitoLivreMm(2800, acab)).toBe(2800 - 30 - 300 - 12);
    expect(peDireitoLivreMm(2800, acab)).toBe(peDireitoUtilMm(2800, acab));
    const p = premissasDoAmbiente(undefined, { ...ctx, acabamentos: acab });
    expect(p.peDireitoLivreMm).toBe(2458);
    expect(p.volumeM3).toBeCloseTo(20 * 2.458, 2);
    expect(premissasDoAmbiente(undefined, ctx).volumeM3).toBeCloseTo(56, 2);
  });
});
