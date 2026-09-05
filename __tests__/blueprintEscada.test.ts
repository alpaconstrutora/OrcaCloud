/**
 * ESCADA E RAMPA — a família `stairs` do kernel e `escada.ts`.
 *
 * As sete perguntas do molde de família nova, com a segunda sendo a que separa
 * esta das anteriores:
 *
 *   1. o percurso vira pegada, com a mitra do patamar;
 *   2. **o lance FECHA no piso de cima** — `espelho × degraus = desnível`, por
 *      construção e não por conferência;                        ← a que importa
 *   3. o desnível vem do pavimento de CIMA, e muda quando ele muda;
 *   4. a rampa não tem degrau, e o que a rege é a inclinação;
 *   5. o furo sai na laje CERTA — a de teto, nunca a de piso;
 *   6. planta SEM escada continua com a MESMA forma canônica;      ← a guarda
 *   7. os invariantes recusam o que produziria desenho errado calado.
 *
 * ⚠️ Todo valor esperado está CALCULADO À MÃO no comentário.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  degrausDaEscada,
  emptyModel,
  furosDaEscada,
  medirEscada,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
  type Command,
  type Escada,
} from '../utils/blueprintKernel';

const PE_DIREITO = 2800;
/** Cota do piso de cima: pé-direito + 120 mm de laje. */
const COTA_PAV1 = 2920;

/** Térreo em 0 e Pavimento 1 em 2920 — o desnível que a escada vence. */
function doisPavimentos(): { model: BlueprintModel; terreo: string; pav1: string } {
  const a = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: PE_DIREITO,
  });
  const b = applyCommand(a.model, {
    type: 'AddLevel',
    name: 'Pavimento 1',
    elevationMm: COTA_PAV1,
    defaultHeightMm: PE_DIREITO,
  });
  return { model: b.model, terreo: b.model.levels[0].id, pav1: b.model.levels[1].id };
}

/**
 * Lance reto de 4,60 m, 1,20 m de largura, vencendo os 2920 do pavimento.
 *
 * Os números, à mão:
 *   n       = round(2920 / 175) = round(16,686) = 17 espelhos
 *   espelho = 2920 / 17         = 171,7647… mm       (dentro de 160–180)
 *   piso    = 4600 / 16         = 287,5 mm           (17 espelhos → 16 pisadas)
 *   Blondel = 2 × 171,7647 + 287,5 = 631,03 mm       (dentro de 630–650)
 *
 * O percurso foi escolhido JUSTAMENTE para cair dentro das duas faixas: é a
 * escada sem aviso nenhum, e é contra ela que os avisos dos outros casos se
 * leem.
 */
function lanceReto(): { model: BlueprintModel; escada: Escada } {
  const { model, terreo } = doisPavimentos();
  const r = applyCommand(model, {
    type: 'AddEscada',
    levelId: terreo,
    pontos: [point(0, 0), point(4600, 0)],
    larguraMm: 1200,
  });
  return { model: r.model, escada: r.model.stairs[0] };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('escada · 1. o percurso vira PEGADA', () => {
  it('o lance reto engrossa para os dois lados do eixo', () => {
    // Eixo (0,0)→(4600,0), largura 1200 → meia largura 600 para cada lado.
    const { escada } = lanceReto();
    const m = medirEscada(emptyModel(), { ...escada, levelId: 'x' });
    expect(m.contorno).toEqual([
      point(0, 600),
      point(4600, 600),
      point(4600, -600),
      point(0, -600),
    ]);
  });

  it('o patamar em L sai MITRADO, e a área prova a mitra', () => {
    // Percurso (0,0)→(3000,0)→(3000,3000), largura 1000.
    //
    // A mitra a 90° tira do canto interno exatamente o que dá ao externo, então
    // a área tem de bater com "comprimento × largura" na conta simples:
    //   (3000 + 3000) × 1000 = 6.000.000 mm².
    // Com a união crua dos dois retângulos daria 5.500.000 (o canto contado uma
    // vez só) — e o desenho mostraria um degrau faltando bem onde a escada vira.
    const { model, terreo } = doisPavimentos();
    const r = applyCommand(model, {
      type: 'AddEscada',
      levelId: terreo,
      pontos: [point(0, 0), point(3000, 0), point(3000, 3000)],
      larguraMm: 1000,
    });
    const m = medirEscada(r.model, r.model.stairs[0]);

    expect(m.contorno).toEqual([
      point(0, 500),
      point(2500, 500),
      point(2500, 3000),
      point(3500, 3000),
      point(3500, -500),
      point(0, -500),
    ]);
    expect(m.areaPlantaMm2).toBe(6_000_000);
    expect(m.comprimentoMm).toBe(6000);
  });
});

describe('escada · 2. o lance FECHA no piso de cima', () => {
  it('espelho × degraus dá o desnível EXATO', () => {
    // A razão de a família existir. 2920 / 17 = 171,7647…; × 17 volta a 2920.
    //
    // `toBeCloseTo` e não `toBe` só por causa do IEEE 754: a divisão e a
    // multiplicação de volta erram na 13ª casa. O que o teste afirma é que não
    // há erro de MODELO — nenhum resto de arredondamento de milímetro.
    const { model, escada } = lanceReto();
    const m = medirEscada(model, escada);

    expect(m.desnivelMm).toBe(COTA_PAV1);
    expect(m.degraus).toBe(17);
    expect(m.espelhoMm * m.degraus).toBeCloseTo(COTA_PAV1, 6);
    expect(m.espelhoMm).toBeCloseTo(171.7647, 3);
  });

  it('o ÚLTIMO espelho tem o topo no piso de chegada, no fim do percurso', () => {
    // 17 espelhos em u = 0, 287,5, …, 16 × 287,5 = 4600 — o último exatamente
    // no fim. É o degrau que some quando a distribuição erra: com `n` linhas em
    // `n` intervalos, o último cairia em 4887,5, fora da escada.
    const { model, escada } = lanceReto();
    const degraus = degrausDaEscada(model, escada);

    expect(degraus).toHaveLength(17);
    expect(degraus[0].uMm).toBe(0);
    expect(degraus[16].uMm).toBeCloseTo(4600, 6);
    expect(degraus[16].cotaMm).toBeCloseTo(COTA_PAV1, 6);
    // A linha transversal atravessa a largura toda.
    expect(degraus[0].a).toEqual({ x: 0, y: 600 });
    expect(degraus[0].b).toEqual({ x: 0, y: -600 });
  });

  it('a pisada divide o percurso por degraus − 1', () => {
    // 17 espelhos, 16 pisadas: o topo do último espelho É o piso de cima, e não
    // uma pisada da escada.
    const { model, escada } = lanceReto();
    const m = medirEscada(model, escada);
    expect(m.pisoMm).toBe(287.5);
    expect(m.pisoMm * (m.degraus - 1)).toBeCloseTo(4600, 6);
  });

  it('dentro das faixas da norma, nenhum aviso', () => {
    const { model, escada } = lanceReto();
    expect(medirEscada(model, escada).avisos).toEqual([]);
  });

  it('percurso curto demais dispara Blondel, e NÃO recusa o desenho', () => {
    // Mesmos 17 espelhos num percurso de 1600 mm: piso = 100 mm,
    // Blondel = 343,53 + 100 = 443,5 — bem abaixo de 630.
    const { model, terreo } = doisPavimentos();
    const r = applyCommand(model, {
      type: 'AddEscada',
      levelId: terreo,
      pontos: [point(0, 0), point(1600, 0)],
      larguraMm: 1200,
    });
    const m = medirEscada(r.model, r.model.stairs[0]);

    expect(m.pisoMm).toBe(100);
    expect(m.avisos.some((a) => a.includes('Blondel'))).toBe(true);
    // O desenho existe: aviso não é recusa.
    expect(r.model.stairs).toHaveLength(1);
  });

  it('alvo de espelho absurdo dispara o aviso da NBR, e não o invariante', () => {
    // Alvo de 400 mm em 2920: n = round(7,3) = 7 → espelho 417 mm.
    const { model, terreo } = doisPavimentos();
    const r = applyCommand(model, {
      type: 'AddEscada',
      levelId: terreo,
      pontos: [point(0, 0), point(4600, 0)],
      alvoEspelhoMm: 400,
    });
    const m = medirEscada(r.model, r.model.stairs[0]);

    expect(m.degraus).toBe(7);
    expect(m.espelhoMm).toBeCloseTo(417.142, 2);
    expect(m.avisos.some((a) => a.includes('Espelho'))).toBe(true);
  });
});

describe('escada · 3. o desnível vem do pavimento de CIMA', () => {
  it('sem pavimento acima, cai no pé-direito do de partida', () => {
    // 2800 / 175 = 16 exatos — espelho de 175 mm cravado.
    const a = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: PE_DIREITO,
    });
    const r = applyCommand(a.model, {
      type: 'AddEscada',
      levelId: a.model.levels[0].id,
      pontos: [point(0, 0), point(4600, 0)],
    });
    const m = medirEscada(r.model, r.model.stairs[0]);

    expect(m.nivelDeChegada).toBeNull();
    expect(m.desnivelMm).toBe(PE_DIREITO);
    expect(m.degraus).toBe(16);
    expect(m.espelhoMm).toBe(175);
  });

  it('ACRESCENTAR um pavimento acima muda o número de degraus', () => {
    // A consequência aceita e documentada: a escada tem de CHEGAR ao piso.
    // 2800 → 16 degraus; 2920 → 17.
    const a = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: PE_DIREITO,
    });
    const comEscada = applyCommand(a.model, {
      type: 'AddEscada',
      levelId: a.model.levels[0].id,
      pontos: [point(0, 0), point(4600, 0)],
    }).model;
    expect(medirEscada(comEscada, comEscada.stairs[0]).degraus).toBe(16);

    const comPavimento = applyCommand(comEscada, {
      type: 'AddLevel',
      name: 'Pavimento 1',
      elevationMm: COTA_PAV1,
      defaultHeightMm: PE_DIREITO,
    }).model;
    const m = medirEscada(comPavimento, comPavimento.stairs[0]);

    expect(m.degraus).toBe(17);
    expect(m.nivelDeChegada?.name).toBe('Pavimento 1');
  });

  it('o pavimento de chegada é o de MENOR cota acima, não o próximo do array', () => {
    // Três pavimentos criados fora de ordem: 0, 6000, 2920. A escada do térreo
    // sobe para o de 2920, e não para o que veio antes na lista.
    const a = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: PE_DIREITO },
      { type: 'AddLevel', name: 'Cobertura', elevationMm: 6000, defaultHeightMm: PE_DIREITO },
      { type: 'AddLevel', name: 'Pavimento 1', elevationMm: COTA_PAV1, defaultHeightMm: PE_DIREITO },
    ]).model;
    const r = applyCommand(a, {
      type: 'AddEscada',
      levelId: a.levels[0].id,
      pontos: [point(0, 0), point(4600, 0)],
    });
    expect(medirEscada(r.model, r.model.stairs[0]).nivelDeChegada?.name).toBe('Pavimento 1');
  });
});

describe('escada · 4. a RAMPA', () => {
  it('não tem degrau nenhum, e o que a rege é a inclinação', () => {
    // 2920 em 40.000 mm = 7,3% — dentro dos 8,33% da NBR 9050.
    const { model, terreo } = doisPavimentos();
    const r = applyCommand(model, {
      type: 'AddEscada',
      levelId: terreo,
      tipo: 'RAMPA',
      pontos: [point(0, 0), point(40000, 0)],
      larguraMm: 1500,
    });
    const m = medirEscada(r.model, r.model.stairs[0]);

    expect(m.degraus).toBe(0);
    expect(m.espelhoMm).toBe(0);
    expect(m.pisoMm).toBe(0);
    expect(m.inclinacaoPct).toBeCloseTo(7.3, 4);
    expect(m.avisos).toEqual([]);
    expect(degrausDaEscada(r.model, r.model.stairs[0])).toEqual([]);
  });

  it('inclinação acima de 8,33% avisa', () => {
    const { model, terreo } = doisPavimentos();
    const r = applyCommand(model, {
      type: 'AddEscada',
      levelId: terreo,
      tipo: 'RAMPA',
      pontos: [point(0, 0), point(4600, 0)],
    });
    const m = medirEscada(r.model, r.model.stairs[0]);

    expect(m.inclinacaoPct).toBeCloseTo(63.478, 3);
    expect(m.avisos.some((a) => a.includes('9050'))).toBe(true);
  });

  it('alternar para RAMPA e voltar NÃO perde o alvo de espelho', () => {
    // O campo fica inerte na rampa e volta como o usuário deixou — zerar faria
    // um clique de ida e volta apagar um ajuste que ninguém mandou apagar.
    const { model, escada } = lanceReto();
    const comAlvo = applyCommand(model, {
      type: 'SetEscadaProps',
      escadaId: escada.id,
      alvoEspelhoMm: 168,
    }).model;
    const rampa = applyCommand(comAlvo, {
      type: 'SetEscadaProps',
      escadaId: escada.id,
      tipo: 'RAMPA',
    }).model;
    const devolta = applyCommand(rampa, {
      type: 'SetEscadaProps',
      escadaId: escada.id,
      tipo: 'ESCADA',
    }).model;

    expect(devolta.stairs[0].alvoEspelhoMm).toBe(168);
  });

  it('o comprimento INCLINADO é a hipotenusa, não o de planta', () => {
    // hypot(4600, 2920) = √29.686.400 = 5448,52… — é o que se percorre, e o
    // que entra no quantitativo de corrimão.
    const { model, escada } = lanceReto();
    const m = medirEscada(model, escada);
    expect(m.comprimentoMm).toBe(4600);
    expect(m.comprimentoInclinadoMm).toBeCloseTo(5448.52, 1);
  });
});

describe('escada · 5. o FURO sai na laje certa', () => {
  /** Laje de 7 × 3 m cobrindo a escada inteira, na cota pedida. */
  const laje = (levelId: string, baseMm: number): Command => ({
    type: 'AddStructural',
    levelId,
    kind: 'LAJE',
    pontos: [point(-1000, -1000), point(6000, -1000), point(6000, 2000), point(-1000, 2000)],
    alturaMm: 120,
    baseMm,
  });

  it('fura a laje de TETO e não a de piso', () => {
    // A escada vai de 0 a 2920 (absolutos). A laje de piso tem base em 0 — ela
    // não está ACIMA do piso de partida, e a escada apoia nela em vez de
    // atravessá-la. A de teto tem base em 2800, dentro do trecho subido.
    const { model, terreo } = doisPavimentos();
    const comLajes = applyBatch(model, [laje(terreo, 0), laje(terreo, 2800)]).model;
    const r = applyCommand(comLajes, {
      type: 'AddEscada',
      levelId: terreo,
      pontos: [point(0, 0), point(4600, 0)],
      larguraMm: 1200,
    });

    const furos = furosDaEscada(r.model);
    expect(furos).toHaveLength(1);
    expect(furos[0].structuralId).toBe(comLajes.structures[1].id);
    // A pegada inteira cabe na laje: o furo é a escada toda, 4600 × 1200.
    expect(furos[0].areaMm2).toBe(5_520_000);
  });

  it('laje ACIMA do piso de chegada não é furada', () => {
    // Base em 5000, e a escada para em 2920. Furar seria abrir buraco num
    // pavimento por onde a escada nem passa.
    const { model, terreo } = doisPavimentos();
    const comLaje = applyCommand(model, laje(terreo, 5000)).model;
    const r = applyCommand(comLaje, {
      type: 'AddEscada',
      levelId: terreo,
      pontos: [point(0, 0), point(4600, 0)],
    });
    expect(furosDaEscada(r.model)).toEqual([]);
  });

  it('laje que não cruza a escada em planta não é furada', () => {
    const { model, terreo } = doisPavimentos();
    const longe: Command = {
      type: 'AddStructural',
      levelId: terreo,
      kind: 'LAJE',
      pontos: [point(20000, 20000), point(23000, 20000), point(23000, 23000)],
      alturaMm: 120,
      baseMm: 2800,
    };
    const r = applyBatch(model, [
      longe,
      {
        type: 'AddEscada',
        levelId: terreo,
        pontos: [point(0, 0), point(4600, 0)],
      },
    ]);
    expect(furosDaEscada(r.model)).toEqual([]);
  });

  it('mover a escada MOVE o furo — ele não fica gravado', () => {
    const { model, terreo } = doisPavimentos();
    const comLaje = applyCommand(model, laje(terreo, 2800)).model;
    const r = applyCommand(comLaje, {
      type: 'AddEscada',
      levelId: terreo,
      pontos: [point(0, 0), point(4600, 0)],
      larguraMm: 1200,
    });
    expect(furosDaEscada(r.model)[0].areaMm2).toBe(5_520_000);

    // Encurta o lance pela metade: o furo encolhe junto, sem comando nenhum de
    // furo. É a regra de `sobreposicao.ts` — a decisão vive no modelo, o número
    // não.
    const menor = applyCommand(r.model, {
      type: 'MoveEscadaVertex',
      escadaId: r.model.stairs[0].id,
      index: 1,
      to: point(2300, 0),
    }).model;
    expect(furosDaEscada(menor)[0].areaMm2).toBe(2_760_000);
  });
});

describe('escada · 6. a guarda do acervo', () => {
  it('planta SEM escada não ganha a chave `stairs` NA GEOMETRIA', () => {
    // A trava que protege o hash de todo desenho publicado: com `stairs: []`
    // emitido sempre, o payload de TODA planta do acervo mudaria de forma.
    //
    // ⚠️ A asserção é sobre `payloadDoHash`, e NÃO sobre `canonicalPayload`. A
    // diferença entre os dois é o desenho inteiro da identidade: o sidecar
    // `identity` fica FORA do hash, e por isso pode ganhar `stairs: []` de
    // graça — o que ele de fato faz. Afirmar sobre o payload completo
    // confundiria as duas metades e travaria uma mudança que é livre por
    // construção.
    const { model, terreo } = doisPavimentos();
    const comParede = applyCommand(model, {
      type: 'AddWall',
      levelId: terreo,
      a: point(0, 0),
      b: point(3000, 0),
      thicknessMm: 150,
      heightMm: PE_DIREITO,
    }).model;

    expect(payloadDoHash(comParede)).not.toContain('stairs');
    // E o sidecar carrega, sem custo nenhum para o acervo.
    expect(canonicalPayload(comParede)).toContain('"stairs":[]');
  });

  it('com escada, a chave aparece — e o round-trip devolve a mesma coisa', () => {
    const { model, escada } = lanceReto();
    const payload = canonicalPayload(model);
    expect(payload).toContain('"stairs"');

    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(devolta.stairs).toHaveLength(1);
    expect(devolta.stairs[0].pontos).toEqual(escada.pontos);
    expect(devolta.stairs[0].larguraMm).toBe(1200);
    expect(devolta.stairs[0].alvoEspelhoMm).toBe(175);
    expect(devolta.stairs[0].tipo).toBe('ESCADA');
    expect(devolta.stairs[0].uid).toBe(escada.uid);
    expect(payloadDoHash(devolta)).toBe(payloadDoHash(model));
  });

  it('o payload NÃO carrega degraus, espelho nem piso', () => {
    // Eles são derivados do desnível. Gravados, o payload discordaria de si
    // mesmo assim que alguém mudasse a cota de um pavimento — a escada
    // afirmando 17 degraus enquanto o desenho mostra 16.
    const { model } = lanceReto();
    const payload = canonicalPayload(model);
    expect(payload).not.toContain('degraus');
    expect(payload).not.toContain('espelhoMm');
    expect(payload).not.toContain('pisoMm');
  });

  it('remover o pavimento LEVA a escada junto', () => {
    // Ao contrário do corte, que não tem pavimento: a escada parte deste piso,
    // e sem ele não parte de lugar nenhum.
    const { model, escada } = lanceReto();
    const semTerreo = applyCommand(model, {
      type: 'RemoveLevel',
      levelId: escada.levelId,
    });
    expect(semTerreo.model.stairs).toEqual([]);
    expect(semTerreo.diff.deleted).toContain(escada.id);
  });
});

describe('escada · 7. os invariantes', () => {
  const esperaCodigo = (fn: () => unknown, codigo: string) => {
    try {
      fn();
    } catch (e) {
      // A MENSAGEM é texto de tela e muda; o CÓDIGO é o contrato.
      expect((e as { code?: string }).code).toBe(codigo);
      return;
    }
    throw new Error(`esperava ${codigo}, e nada foi lançado`);
  };

  it('recusa percurso de um ponto só', () => {
    const { model, terreo } = doisPavimentos();
    esperaCodigo(
      () => applyCommand(model, { type: 'AddEscada', levelId: terreo, pontos: [point(0, 0)] }),
      'BAD_STAIR_POINTS',
    );
  });

  it('recusa percurso de comprimento zero', () => {
    const { model, terreo } = doisPavimentos();
    esperaCodigo(
      () =>
        applyCommand(model, {
          type: 'AddEscada',
          levelId: terreo,
          pontos: [point(500, 500), point(500, 500)],
        }),
      'DEGENERATE_STAIR',
    );
  });

  it('recusa largura não positiva', () => {
    const { model, terreo } = doisPavimentos();
    esperaCodigo(
      () =>
        applyCommand(model, {
          type: 'AddEscada',
          levelId: terreo,
          pontos: [point(0, 0), point(3000, 0)],
          larguraMm: 0,
        }),
      'BAD_STAIR_WIDTH',
    );
  });

  it('recusa alvo de espelho fora de escala — o erro de digitar em metro', () => {
    const { model, terreo } = doisPavimentos();
    esperaCodigo(
      () =>
        applyCommand(model, {
          type: 'AddEscada',
          levelId: terreo,
          pontos: [point(0, 0), point(3000, 0)],
          alvoEspelhoMm: 1750,
        }),
      'BAD_STAIR_RISER',
    );
  });

  it('recusa vértice que não existe no percurso', () => {
    const { model, escada } = lanceReto();
    esperaCodigo(
      () =>
        applyCommand(model, {
          type: 'MoveEscadaVertex',
          escadaId: escada.id,
          index: 5,
          to: point(0, 0),
        }),
      'BAD_STAIR_POINTS',
    );
  });

  it('recusa escada num pavimento inexistente', () => {
    const { model } = doisPavimentos();
    esperaCodigo(
      () =>
        applyCommand(model, {
          type: 'AddEscada',
          levelId: 'lvl_9999',
          pontos: [point(0, 0), point(3000, 0)],
        }),
      'LEVEL_NOT_FOUND',
    );
  });
});
