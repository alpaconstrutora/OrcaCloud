/**
 * Leitura de valor do Mapa Regulatório (`utils/regulatoryValue.ts`).
 *
 * Os dois casos centrais deste arquivo são os que as cópias antigas erravam:
 *
 *   • `"0"` tem de virar `0`, não `null`. Recuo zero é legal e comum em zona
 *     comercial; as três cópias do Imovib terminam em `|| null` e o perdem.
 *   • `"5 a 7"` tem de virar `null`, não `5`. `parseFloat` aproveita o começo da
 *     string e devolve um número que ninguém conferiu.
 *
 * Pedido de 2026-08-22 — `docs/planos/2026-08-21-planta-inteligente-terreno.md`.
 */

import { describe, expect, it } from 'vitest';
import {
  lerMilimetros,
  lerPorcentagem,
  lerValorRegulatorio,
} from '../utils/regulatoryValue';

describe('lerValorRegulatorio', () => {
  it('lê o formato BR, com e sem casa decimal', () => {
    expect(lerValorRegulatorio('0,8')).toBe(0.8);
    expect(lerValorRegulatorio('3')).toBe(3);
    expect(lerValorRegulatorio('12,50')).toBe(12.5);
    expect(lerValorRegulatorio('3.000,5')).toBe(3000.5);
  });

  it('⚠️ "0" é ZERO, não ausência — recuo zero é legal', () => {
    // É o bug das três cópias do Imovib (`parseFloat(...) || null`), que torna
    // "não recua deste lado" indistinguível de "ninguém preencheu".
    expect(lerValorRegulatorio('0')).toBe(0);
    expect(lerValorRegulatorio('0,00')).toBe(0);
  });

  it('reconhece "não se aplica" em qualquer grafia e caixa', () => {
    // A versão anterior testava `v === 'N.A.'` exato. A planilha de Cambuí/MG
    // traz minúsculo, e outras prefeituras usam travessão.
    for (const v of ['N.A.', 'n.a.', 'N.A', 'na', 'N/A', '-', '–', '—', '_']) {
      expect(lerValorRegulatorio(v), v).toBeNull();
    }
  });

  it('vazio, nulo e indefinido são ausência', () => {
    expect(lerValorRegulatorio('')).toBeNull();
    expect(lerValorRegulatorio('   ')).toBeNull();
    expect(lerValorRegulatorio(null)).toBeNull();
    expect(lerValorRegulatorio(undefined)).toBeNull();
  });

  it('aceita o sufixo de unidade que a lei costuma escrever junto', () => {
    expect(lerValorRegulatorio('3,00 m')).toBe(3);
    expect(lerValorRegulatorio('70%')).toBe(70);
    expect(lerValorRegulatorio('120 m²')).toBe(120);
  });

  it('⚠️ recusa a string que só COMEÇA com número, em vez de aproveitar o começo', () => {
    // `parseFloat("5 a 7")` devolve 5. Um recuo "de 5 a 7 metros" virar 5 é pior
    // que virar nada: nada aparece como campo não aplicado, e o 5 entra no
    // desenho como se alguém tivesse conferido.
    expect(lerValorRegulatorio('5 a 7')).toBeNull();
    expect(lerValorRegulatorio('42 dias')).toBeNull();
    expect(lerValorRegulatorio('conforme art. 42')).toBeNull();
    expect(lerValorRegulatorio('ver anexo II')).toBeNull();
  });
});

describe('lerPorcentagem', () => {
  it('fração e porcentagem chegam ao mesmo lugar', () => {
    // O MESMO campo vem gravado das duas formas: o select da tabela oferece
    // fração ('0,8'), a planilha da prefeitura traz porcentagem (80).
    expect(lerPorcentagem('0,8')).toBe(80);
    expect(lerPorcentagem('80')).toBe(80);
    expect(lerPorcentagem('0,75')).toBe(75);
    expect(lerPorcentagem('75')).toBe(75);
  });

  it('a fronteira: 1 é fração, ou seja LOTE INTEIRO', () => {
    // "Taxa de ocupação 1,0" é como a lei escreve 100% — existe de verdade em
    // zona comercial de centro. A leitura alternativa (1%) seria absurda em
    // qualquer zona, então a fronteira cai para o lado da fração.
    expect(lerPorcentagem('1')).toBe(100);
    expect(lerPorcentagem('1,0')).toBe(100);
    expect(lerPorcentagem('100')).toBe(100);
    // E logo acima da fronteira já é porcentagem crua.
    expect(lerPorcentagem('1,5')).toBe(1.5);
  });

  it('sem valor continua sem valor', () => {
    expect(lerPorcentagem('N.A.')).toBeNull();
    expect(lerPorcentagem('')).toBeNull();
    expect(lerPorcentagem('-5')).toBeNull();
  });
});

describe('lerMilimetros', () => {
  it('metro da lei vira milímetro inteiro do kernel', () => {
    expect(lerMilimetros('3,00')).toBe(3000);
    expect(lerMilimetros('1,5')).toBe(1500);
    expect(lerMilimetros('0')).toBe(0);
    expect(lerMilimetros('0,075')).toBe(75);
  });

  it('arredonda para inteiro — o kernel não aceita fração de milímetro', () => {
    expect(lerMilimetros('1,0004')).toBe(1000);
    expect(lerMilimetros('1,0006')).toBe(1001);
  });

  it('sem valor e negativo devolvem null', () => {
    expect(lerMilimetros('N.A.')).toBeNull();
    expect(lerMilimetros('-1')).toBeNull();
  });
});
