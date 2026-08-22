/**
 * A zona do Mapa Regulatório traduzida para o editor (`utils/blueprintZonaUrbanistica.ts`).
 *
 * O caso central é o do campo ILEGÍVEL: a lei escreve "N.A." ou "conforme art.
 * 42" e isso NÃO pode virar zero calado. Um recuo zero inventado desenha um
 * envelope maior que o permitido, e nada na tela diz que o número não foi
 * conferido — é o mesmo estrago que `envelopeConstrutivo` já evita ao não
 * recuar divisa sem papel.
 *
 * Pedido de 2026-08-22 — `docs/planos/2026-08-21-planta-inteligente-terreno.md`.
 */

import { describe, expect, it } from 'vitest';
import type { EmpreendimentoRegulatoryZone } from '../types/empreendimento';
import {
  lerZona,
  recuosDaZona,
  rotuloDaZona,
  zonaDerivou,
  type CampoDaZona,
} from '../utils/blueprintZonaUrbanistica';

function zona(campos: Partial<EmpreendimentoRegulatoryZone>): EmpreendimentoRegulatoryZone {
  return {
    id: 'z1',
    empreendimento_id: 'e1',
    organization_id: 'o1',
    created_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:00:00Z',
    ...campos,
  } as EmpreendimentoRegulatoryZone;
}

const ZR2 = zona({
  zona: 'ZR-2',
  macroarea: 'Zona Residencial 2',
  recuo_frente: '5,00',
  recuo_fundos: '3,00',
  recuo_lateral_direita: '1,50',
  recuo_lateral_esquerda: '1,50',
  taxa_ocupacao_maxima: '0,8',
  taxa_permeabilidade_minima: '20',
  ca_maximo: '3',
  gabarito_altura_maxima: '18',
  gabarito_pavimentos: '6',
  lei_referencia: 'Lei 1.234/2019',
});

describe('lerZona', () => {
  it('traduz a zona inteira nas unidades do editor', () => {
    const { valores, naoAplicados } = lerZona(ZR2);

    // Recuo em MILÍMETRO — a unidade do kernel.
    expect(valores.recuoMm).toEqual({
      FRENTE: 5000,
      FUNDOS: 3000,
      LATERAL_DIREITA: 1500,
      LATERAL_ESQUERDA: 1500,
    });
    // Taxa em PORCENTAGEM, venha ela como fração ('0,8') ou já em % ('20').
    expect(valores.taxaOcupacaoMax).toBe(80);
    expect(valores.taxaPermeabilidadeMin).toBe(20);
    // C.A. é número puro, não taxa.
    expect(valores.coeficienteMax).toBe(3);
    expect(valores.gabaritoAlturaMaxM).toBe(18);
    expect(valores.gabaritoPavimentos).toBe(6);

    expect(naoAplicados).toEqual([]);
  });

  it('⚠️ C.A. de 1,0 continua 1,0 — não vira 100 como uma taxa viraria', () => {
    // O mesmo texto '1' significa coisas diferentes em campos diferentes:
    // taxa de ocupação 1 é lote inteiro (100%), C.A. 1 é uma vez a área do lote.
    const { valores } = lerZona(zona({ ca_maximo: '1', taxa_ocupacao_maxima: '1' }));
    expect(valores.coeficienteMax).toBe(1);
    expect(valores.taxaOcupacaoMax).toBe(100);
  });

  it('campo ILEGÍVEL não vira zero — sai null e é NOMEADO', () => {
    const { valores, naoAplicados } = lerZona(
      zona({
        recuo_frente: '5,00',
        recuo_fundos: 'N.A.',
        recuo_lateral_direita: 'conforme art. 42',
        ca_maximo: '5 a 7',
      }),
    );

    expect(valores.recuoMm.FRENTE).toBe(5000);
    expect(valores.recuoMm.FUNDOS).toBeNull();
    expect(valores.recuoMm.LATERAL_DIREITA).toBeNull();
    expect(valores.coeficienteMax).toBeNull();

    const campos = naoAplicados.map((n) => n.campo);
    expect(campos).toContain('recuo_fundos');
    expect(campos).toContain('recuo_lateral_direita');
    expect(campos).toContain('coeficiente_max');
    // O texto original vai junto, para o aviso poder mostrá-lo entre aspas.
    expect(naoAplicados.find((n) => n.campo === 'recuo_fundos')?.textoOriginal).toBe('N.A.');
  });

  it('campo VAZIO não entra na lista de não aplicados', () => {
    // Não informado ≠ informado de forma ilegível. Listar os vazios afogaria o
    // aviso: uma zona recém-criada tem 21 campos em branco.
    const { valores, naoAplicados } = lerZona(zona({ recuo_frente: '5,00' }));
    expect(valores.recuoMm.FUNDOS).toBeNull();
    expect(naoAplicados).toEqual([]);
  });

  it('recuo zero é ZERO, e não conta como não aplicado', () => {
    const { valores, naoAplicados } = lerZona(zona({ recuo_frente: '0' }));
    expect(valores.recuoMm.FRENTE).toBe(0);
    expect(naoAplicados).toEqual([]);
  });
});

describe('recuosDaZona', () => {
  it('papel sem valor na lei fica em zero, que é "não recua"', () => {
    const { valores } = lerZona(zona({ recuo_frente: '5,00', recuo_fundos: 'N.A.' }));
    expect(recuosDaZona(valores)).toEqual({
      FRENTE: 5000,
      FUNDOS: 0,
      LATERAL_DIREITA: 0,
      LATERAL_ESQUERDA: 0,
    });
  });
});

describe('rotuloDaZona', () => {
  it('junta zona e macroárea, e nunca devolve vazio', () => {
    expect(rotuloDaZona(ZR2)).toBe('ZR-2 · Zona Residencial 2');
    expect(rotuloDaZona(zona({ zona: 'ZR-2' }))).toBe('ZR-2');
    expect(rotuloDaZona(zona({}))).toBe('Zona sem nome');
  });
});

describe('zonaDerivou', () => {
  const todosDaZona = Object.fromEntries(
    (
      [
        'recuo_frente',
        'recuo_fundos',
        'recuo_lateral_direita',
        'recuo_lateral_esquerda',
        'taxa_ocupacao_max',
        'coeficiente_max',
        'gabarito_altura_max',
        'gabarito_pavimentos',
        'taxa_permeabilidade_min',
      ] as CampoDaZona[]
    ).map((c) => [c, 'ZONA' as const]),
  ) as Record<CampoDaZona, 'ZONA' | 'MANUAL'>;

  it('zona intacta não derivou', () => {
    const { valores } = lerZona(ZR2);
    expect(zonaDerivou(valores, todosDaZona, ZR2)).toBe(false);
  });

  it('zona editada depois de aplicada acusa deriva', () => {
    const { valores } = lerZona(ZR2);
    const mudada = zona({ ...ZR2, recuo_frente: '6,00' });
    expect(zonaDerivou(valores, todosDaZona, mudada)).toBe(true);
  });

  it('⚠️ zona com campo ILEGÍVEL não acusa deriva logo após ser aplicada', () => {
    // O que foi aplicado passou por `recuosDaZona` — "N.A." virou 0. Comparar
    // contra o `null` cru da releitura faria o aviso "a zona mudou" nascer aceso
    // no instante seguinte a aplicar, sem nada ter mudado.
    const comNA = zona({ ...ZR2, recuo_fundos: 'N.A.' });
    const { valores } = lerZona(comNA);
    const aplicado = { ...valores, recuoMm: recuosDaZona(valores) };

    expect(zonaDerivou(aplicado, todosDaZona, comNA)).toBe(false);
  });

  it('⚠️ campo AJUSTADO À MÃO não conta como deriva', () => {
    // Um número que o usuário corrigiu diverge da lei por definição. Acusá-lo
    // faria o aviso ficar permanentemente aceso e ensinaria a ignorá-lo.
    const { valores } = lerZona(ZR2);
    const ajustado = { ...valores, recuoMm: { ...valores.recuoMm, FRENTE: 7000 } };
    const origem = { ...todosDaZona, recuo_frente: 'MANUAL' as const };

    expect(zonaDerivou(ajustado, origem, ZR2)).toBe(false);
    // Mas outro campo que continua da zona ainda é vigiado.
    expect(zonaDerivou(ajustado, origem, zona({ ...ZR2, recuo_fundos: '4,00' }))).toBe(true);
  });
});
