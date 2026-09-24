/**
 * ITEM DE CATÁLOGO PELA MEDIDA (24/09/2026, P2.53).
 *
 * As descrições deste arquivo são REAIS, tiradas do `sinapi_items` do banco —
 * é a variedade delas que define a regra:
 *
 *     KIT PORTA PRONTA DE MADEIRA… DE 800 X 2100 MM…        (milímetro, com sufixo)
 *     KIT DE PORTA DE MADEIRA…, 80X210CM, ESPESSURA…        (centímetro colado)
 *     PORTA SALA LIMPA 90X210 CM COM VISOR…                 (centímetro com espaço)
 *     PROTECAO … PARA PORTA DE POCO DE ELEVADOR, VAO DE *120 X 240* CM
 *
 * ⚠️ O risco desta fase é sugerir com confiança um item errado. Por isso o que
 * se trava aqui é o NÃO: o que não casa não entra, o que não é do tipo não
 * entra, e número de norma não vira medida.
 */
import { describe, expect, it } from 'vitest';
import { medidasNaDescricao, sugerirItens, TOLERANCIA_DO_ITEM_MM } from '../utils/blueprintItemPorMedida';

describe('medida na descrição do item', () => {
  it('lê milímetro, centímetro colado, centímetro com espaço e o formato *L X A*', () => {
    expect(medidasNaDescricao('KIT PORTA PRONTA DE MADEIRA, FOLHA MEDIA (NBR 15930) DE 800 X 2100 MM')).toContainEqual({
      larguraMm: 800,
      alturaMm: 2100,
    });
    expect(medidasNaDescricao('KIT DE PORTA DE MADEIRA PARA PINTURA, SEMI-OCA, PADRÃO POPULAR, 80X210CM')).toContainEqual({
      larguraMm: 800,
      alturaMm: 2100,
    });
    expect(medidasNaDescricao('PORTA SALA LIMPA 90X210 CM COM VISOR')).toContainEqual({ larguraMm: 900, alturaMm: 2100 });
    expect(medidasNaDescricao('PROTECAO COMPLETA PARA PORTA DE POCO DE ELEVADOR, VAO DE *120 X 240* CM')).toContainEqual({
      larguraMm: 1200,
      alturaMm: 2400,
    });
  });

  it('sem sufixo, a ordem de grandeza decide — e o decimal só pode ser metro', () => {
    // 80×210 não é milímetro: não existe esquadria de 8 cm.
    expect(medidasNaDescricao('JANELA 80X210')).toContainEqual({ larguraMm: 800, alturaMm: 2100 });
    // 800×2100 sem sufixo é milímetro.
    expect(medidasNaDescricao('JANELA 800X2100')).toContainEqual({ larguraMm: 800, alturaMm: 2100 });
    // 0,80 × 2,10 é metro.
    expect(medidasNaDescricao('JANELA DE 0,80 X 2,10')).toContainEqual({ larguraMm: 800, alturaMm: 2100 });
  });

  it('⚠️ número que não é medida de esquadria não vira medida', () => {
    // Fora da faixa possível (< 200 mm ou > 10 m) — pega espessura e código.
    expect(medidasNaDescricao('PARAFUSO 3 X 40 MM')).toEqual([]);
    expect(medidasNaDescricao('CHAPA 1200 X 30000 MM')).toEqual([]);
    // "NBR 15930" não tem o separador `x`, então nem entra no padrão.
    expect(medidasNaDescricao('KIT PORTA (NBR 15930) COM MARCO')).toEqual([]);
  });
});

describe('sugerir item para a esquadria', () => {
  const CATALOGO = [
    { code: '39496', description: 'KIT PORTA PRONTA DE MADEIRA, FOLHA MEDIA (NBR 15930) DE 800 X 2100 MM, NUCLEO SEMI-SOLIDO' },
    { code: '91314', description: 'KIT DE PORTA DE MADEIRA PARA PINTURA, SEMI-OCA (LEVE OU MÉDIA), PADRÃO POPULAR, 80X210CM' },
    { code: '45486', description: 'PORTA SALA LIMPA 90X210 CM COM VISOR, NUCLEO EM POLIISOCIANURATO' },
    { code: '94570', description: 'JANELA DE ALUMINIO DE CORRER, 100X120 CM, COM VIDRO' },
    { code: '00001', description: 'ARGAMASSA COLANTE AC-II' },
  ];

  it('acha os itens da medida certa, do mais próximo ao mais distante', () => {
    const s = sugerirItens({ larguraMm: 800, alturaMm: 2100 }, 'door', CATALOGO);
    expect(s.map((x) => x.item.code)).toEqual(['39496', '91314']);
    expect(s[0].desvioMm).toBe(0);
  });

  it('⚠️ porta não casa com item de janela, nem o contrário', () => {
    // Uma janela 80×210 não deve trazer os kits de PORTA dessa medida.
    expect(sugerirItens({ larguraMm: 800, alturaMm: 2100 }, 'window', CATALOGO)).toEqual([]);
    // E a janela de 100×120 aparece para janela, não para porta.
    expect(sugerirItens({ larguraMm: 1000, alturaMm: 1200 }, 'window', CATALOGO).map((x) => x.item.code)).toEqual(['94570']);
    expect(sugerirItens({ larguraMm: 1000, alturaMm: 1200 }, 'door', CATALOGO)).toEqual([]);
  });

  it('a porta de CORRER aceita o item de porta comum — o SINAPI raramente separa', () => {
    expect(sugerirItens({ larguraMm: 800, alturaMm: 2100 }, 'sliding', CATALOGO).length).toBeGreaterThan(0);
  });

  it('fora da tolerância não sugere nada — melhor nenhum item do que o errado', () => {
    // 85×210: 5 cm de diferença, acima dos 2 cm de tolerância.
    expect(sugerirItens({ larguraMm: 850, alturaMm: 2100 }, 'door', CATALOGO)).toEqual([]);
    // Dentro da tolerância, casa com desvio.
    const perto = sugerirItens({ larguraMm: 815, alturaMm: 2100 }, 'door', CATALOGO);
    expect(perto.map((x) => x.item.code)).toEqual(['39496', '91314']);
    expect(perto[0].desvioMm).toBe(15);
    expect(TOLERANCIA_DO_ITEM_MM).toBe(20);
  });

  it('item que não é esquadria nunca entra', () => {
    const s = sugerirItens({ larguraMm: 800, alturaMm: 2100 }, 'door', CATALOGO);
    expect(s.some((x) => x.item.code === '00001')).toBe(false);
  });
});
