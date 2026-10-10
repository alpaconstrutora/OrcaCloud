import { describe, it, expect } from 'vitest';
import {
  calcularIndicadoresDoBairro,
  faixaDeSaturacao,
  mesesObservados,
  precoMedioDaPraca,
  validarHipotesesIndicadores,
  hipotesesIndicadoresGravadas,
  HIPOTESES_INDICADORES_PADRAO as H,
  DESCRICAO_HIPOTESES_INDICADORES,
  type DinamicaDoBairro,
} from '../utils/opuraMarketIndicadores';

/**
 * Item 3 do plano docs/planos/2026-10-10-opura-market-pendencias.md: Saturação
 * (meses de estoque pelas SAÍDAS do feed) e Score Potencial, com hipóteses.
 */
const AGORA = new Date('2026-10-10T12:00:00Z');
const haMeses = (m: number) => new Date(AGORA.getTime() - m * 30.4375 * 24 * 3600 * 1000).toISOString();
const bairro = (o: Partial<DinamicaDoBairro> = {}): DinamicaDoBairro => ({
  ativos: 30, saidas: 30, precoAtual: 5000, precoInicioJanela: 5000, inicioHistorico: haMeses(12), ...o,
});

describe('meses de estoque e faixa', () => {
  it('30 ativos, 30 saídas em 6 meses → 5 saídas/mês → 6 meses de estoque → Escassez (limite inclusivo)', () => {
    const r = calcularIndicadoresDoBairro(bairro(), 5000, H, AGORA);
    expect(r.mesesDeEstoque).toBeCloseTo(6, 6);
    expect(r.saturacao).toBe('Escassez');
  });

  it('cada faixa no lugar certo', () => {
    expect(faixaDeSaturacao(3, H)).toBe('Escassez');
    expect(faixaDeSaturacao(10, H)).toBe('Saudável');
    expect(faixaDeSaturacao(15, H)).toBe('Atenção');
    expect(faixaDeSaturacao(30, H)).toBe('Saturado');
  });

  it('o mesmo número de ativos com MENOS saídas dá mais meses de estoque (a regra antiga dava igual em todo bairro)', () => {
    const rapido = calcularIndicadoresDoBairro(bairro({ saidas: 60 }), 5000, H, AGORA);
    const lento = calcularIndicadoresDoBairro(bairro({ saidas: 6 }), 5000, H, AGORA);
    expect(rapido.mesesDeEstoque).toBeCloseTo(3, 6);
    expect(lento.mesesDeEstoque).toBeCloseTo(30, 6);
    expect(lento.saturacao).toBe('Saturado');
  });

  it('histórico mais curto que a janela divide pelos meses observados', () => {
    const r = calcularIndicadoresDoBairro(bairro({ inicioHistorico: haMeses(4), saidas: 20 }), 5000, H, AGORA);
    expect(r.mesesDeEstoque).toBeCloseTo(30 / (20 / 4), 3);
  });
});

describe('sem número quando não há base', () => {
  it('sem feed salvo', () => {
    const r = calcularIndicadoresDoBairro(bairro({ inicioHistorico: null }), 5000, H, AGORA);
    expect(r.saturacao).toBeNull();
    expect(r.score).toBeNull();
    expect(r.motivo).toMatch(/nenhum feed salvo/);
  });
  it('histórico menor que o mínimo', () => {
    expect(calcularIndicadoresDoBairro(bairro({ inicioHistorico: haMeses(1) }), 5000, H, AGORA).motivo).toMatch(/1,0 de 3 meses/);
  });
  it('nenhuma saída na janela', () => {
    expect(calcularIndicadoresDoBairro(bairro({ saidas: 0 }), 5000, H, AGORA).motivo).toMatch(/Nenhuma saída/);
  });
  it('nenhum ativo', () => {
    expect(calcularIndicadoresDoBairro(bairro({ ativos: 0 }), 5000, H, AGORA).motivo).toMatch(/Nenhum anúncio ativo/);
  });
});

describe('Score Potencial', () => {
  it('estoque zerado, preço subindo no teto e 20% abaixo da praça → 100', () => {
    const r = calcularIndicadoresDoBairro(bairro({ saidas: 6000, precoAtual: 4400, precoInicioJanela: 4000 }), 5500, H, AGORA);
    expect(r.partes.tendencia).toBe(1);
    expect(r.partes.precoRelativo).toBe(1);
    expect(r.score).toBe(100);
  });

  it('estoque no limite de Atenção, preço caindo, acima da praça → 0', () => {
    const r = calcularIndicadoresDoBairro(bairro({ saidas: 10, precoAtual: 5000, precoInicioJanela: 5500 }), 4000, H, AGORA);
    expect(r.partes.estoque).toBe(0);
    expect(r.partes.tendencia).toBe(0);
    expect(r.partes.precoRelativo).toBe(0);
    expect(r.score).toBe(0);
  });

  it('cada peso muda o que diz que muda', () => {
    const d = bairro({ precoAtual: 5500, precoInicioJanela: 5000 });   // estoque 6 m, alta 10%, acima da praça
    const base = calcularIndicadoresDoBairro(d, 5000, H, AGORA);
    const soTendencia = calcularIndicadoresDoBairro(d, 5000, { ...H, pesoEstoque: 0, pesoPrecoRelativo: 0 }, AGORA);
    expect(soTendencia.score).toBe(100);
    expect(base.score).toBe(Math.round((100 * (40 * (1 - 6 / 18) + 35 * 1 + 25 * 0)) / 100));
  });

  it('parte sem dado sai da média, não vale zero', () => {
    const r = calcularIndicadoresDoBairro(bairro({ precoInicioJanela: null }), 5000, H, AGORA);
    expect(r.partes.tendencia).toBeNull();
    expect(r.score).toBe(Math.round((100 * (40 * (1 - 6 / 18) + 25 * 0)) / 65));
  });

  it('teto de tendência e desconto máximo escalam as partes', () => {
    const d = bairro({ precoAtual: 4500, precoInicioJanela: 4285.71 });   // ~5% de alta, 10% abaixo
    const r = calcularIndicadoresDoBairro(d, 5000, H, AGORA);
    expect(r.partes.tendencia).toBeCloseTo(0.5, 2);
    expect(r.partes.precoRelativo).toBeCloseTo(0.5, 6);
  });
});

describe('praça e hipóteses', () => {
  it('média da praça é ponderada pelos ativos e ignora bairro sem preço ou sem ativo', () => {
    expect(precoMedioDaPraca([bairro({ ativos: 10, precoAtual: 4000 }), bairro({ ativos: 30, precoAtual: 6000 }), bairro({ precoAtual: null }), bairro({ ativos: 0, precoAtual: 9000 })]))
      .toBeCloseTo((10 * 4000 + 30 * 6000) / 40, 6);
    expect(precoMedioDaPraca([])).toBeNull();
  });

  it('padrões válidos, toda hipótese descrita, faixas e pesos conferidos', () => {
    expect(validarHipotesesIndicadores(H)).toEqual([]);
    expect(DESCRICAO_HIPOTESES_INDICADORES.map((d) => d.chave).sort()).toEqual(Object.keys(H).sort());
    expect(validarHipotesesIndicadores({ ...H, saudavelAte: 5 }).join(' ')).toMatch(/precisam crescer/);
    expect(validarHipotesesIndicadores({ ...H, pesoEstoque: 0, pesoTendencia: 0, pesoPrecoRelativo: 0 }).join(' ')).toMatch(/Pelo menos um peso/);
    expect(validarHipotesesIndicadores({ ...H, janelaMeses: Number.NaN }).join(' ')).toMatch(/Janela/);
  });

  it('gravadas: campo ausente ou inválido cai no padrão', () => {
    expect(hipotesesIndicadoresGravadas(null)).toEqual(H);
    const g = hipotesesIndicadoresGravadas({ janelaMeses: 12, pesoEstoque: 'x' });
    expect(g.janelaMeses).toBe(12);
    expect(g.pesoEstoque).toBe(H.pesoEstoque);
  });

  it('meses observados limitados à janela', () => {
    expect(mesesObservados(haMeses(20), 6, AGORA)).toBe(6);
    expect(mesesObservados(null, 6, AGORA)).toBe(0);
  });
});
