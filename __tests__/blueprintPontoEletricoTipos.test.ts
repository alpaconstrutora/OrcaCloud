/**
 * A TAXONOMIA do ponto elétrico (09/09/2026).
 *
 * ─── O PEDIDO, LITERAL ──────────────────────────────────────────────────────
 *
 * "Os pontos elétricos se dividem em 3 grupos:
 *   1. Pontos de Iluminação (Luz): Teto; Parede (Arandelas); Piso/Jardim
 *   2. Pontos de Tomada: TUG (Tomadas de Uso Geral); TUE (Uso Específico)
 *   3. Especiais/Dados: telefone, antena de TV, rede de computadores, USB"
 *
 * ⚠️ É campo FECHADO, e não texto livre. `tipo` continua sendo o texto do
 * projetista ("TUG cozinha"); isto é a CLASSIFICAÇÃO, e dela saem os grupos, as
 * somas por família e a entidade IFC. Com texto livre, "TUG", "tug" e "Tomada
 * de uso geral" seriam três famílias — e a contagem sairia plausível e errada.
 */
import { describe, expect, it } from 'vitest';
import {
  TIPOS_DE_PONTO_ELETRICO,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import {
  COTA_USUAL_DO_PONTO_ELETRICO,
  GRUPO_DO_PONTO_ELETRICO,
  ROTULO_DO_PONTO_ELETRICO,
  SIGLA_DO_PONTO_ELETRICO,
} from '../utils/blueprintRede';
import { linhasDeComponentesPorNivel } from '../utils/blueprintComponentes';
import { fichaDoComponente } from '../components/blueprint/MenuComponentes';

function comPonto(tipoEletrico?: string): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  return applyCommand(base, {
    type: 'AddTerminal',
    levelId: base.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: 'Tomada',
    at: point(1000, 1000),
    cotaMm: 300,
    ...(tipoEletrico ? { tipoEletrico } : {}),
  } as never).model;
}

describe('taxonomia · os três grupos', () => {
  it('⚠️ os nove tipos do pedido existem — e o décimo, da NBR 5410 9.5.2.3', () => {
    // O PONTO DE LIGAÇÃO DIRETA (10/09/2026, fatia 3): chuveiro e aquecedor
    // de água se ligam SEM tomada de corrente. Não é um 11º grupo — mora com
    // as tomadas, porque é ponto de força e é ali que quem liga um chuveiro
    // procura —, mas é tipo próprio, porque a conferência da norma precisa
    // distinguir "aquecedor em TUE" (falta) de "aquecedor em ligação direta".
    expect([...TIPOS_DE_PONTO_ELETRICO]).toEqual([
      'ILUMINACAO_TETO',
      'ILUMINACAO_PAREDE',
      'ILUMINACAO_PISO',
      'TUG',
      'TUE',
      'DADOS_TELEFONE',
      'DADOS_TV',
      'DADOS_REDE',
      'DADOS_USB',
      'LIGACAO_DIRETA',
    ]);
  });

  it('cada tipo cai num dos TRÊS grupos, e os três são os do pedido', () => {
    const grupos = new Set(TIPOS_DE_PONTO_ELETRICO.map((t) => GRUPO_DO_PONTO_ELETRICO[t]));
    expect([...grupos].sort()).toEqual([
      'Elétrica — especiais e dados',
      'Elétrica — iluminação',
      'Elétrica — tomadas',
    ]);
  });

  it('⚠️ todo tipo tem rótulo, sigla e cota usual — nenhuma tabela fica para trás', () => {
    // Acrescentar um tipo e esquecer uma tabela produziria `undefined` na tela,
    // que é o jeito silencioso de quebrar isto.
    for (const t of TIPOS_DE_PONTO_ELETRICO) {
      expect(ROTULO_DO_PONTO_ELETRICO[t], t).toBeTruthy();
      expect(SIGLA_DO_PONTO_ELETRICO[t], t).toBeTruthy();
      expect(COTA_USUAL_DO_PONTO_ELETRICO[t], t).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('taxonomia · o kernel', () => {
  it('⚠️ ponto sem classificação NÃO ganha a chave no payload', () => {
    // Todo ponto anterior a esta data está sem classificação: se a chave
    // entrasse, o hash do acervo inteiro mudaria.
    const payload = JSON.parse(payloadDoHash(comPonto()));
    expect(Object.keys(payload.terminais[0])).not.toContain('tipoEletrico');
  });

  it('a classificação sobrevive ao ida e volta', () => {
    const m = comPonto('TUG');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.terminais[0].tipoEletrico).toBe('TUG');
  });

  it('`null` volta a "a classificar", e ausente não mexe', () => {
    const m = comPonto('TUE');
    const id = m.terminais[0].id;
    const sóOTipo = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, tipo: 'X' }).model;
    expect(sóOTipo.terminais[0].tipoEletrico).toBe('TUE');
    const limpo = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: id,
      tipoEletrico: null,
    }).model;
    expect(limpo.terminais[0].tipoEletrico).toBeNull();
  });

  it('⚠️ a invariante recusa tipo inventado e tipo em disciplina errada', () => {
    const m = comPonto();
    const inventado = { ...m, terminais: [{ ...m.terminais[0], tipoEletrico: 'TOMADA' }] };
    expect(() => assertModelInvariants(inventado as never)).toThrow();

    // Um ralo com "TUG" seria um dado impossível que ninguém veria.
    const disciplinaErrada = {
      ...m,
      terminais: [{ ...m.terminais[0], disciplina: 'ESGOTO', tipoEletrico: 'TUG' }],
    };
    try {
      assertModelInvariants(disciplinaErrada as never);
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('BAD_POINT_KIND');
    }
  });
});

describe('taxonomia · o inventário', () => {
  const linhas = (m: BlueprintModel) => linhasDeComponentesPorNivel(m).flatMap((b) => b.linhas);

  it('⚠️ o ponto classificado cai no GRUPO do seu tipo', () => {
    for (const t of TIPOS_DE_PONTO_ELETRICO) {
      const m = comPonto(t);
      const linha = linhas(m)[0];
      expect(fichaDoComponente(linha.chave)?.grupo, t).toBe(GRUPO_DO_PONTO_ELETRICO[t]);
    }
  });

  it('⚠️ o ponto SEM classificação tem grupo próprio — não some nem vira tomada', () => {
    // Filá-lo em "tomadas" afirmaria uma decisão que ninguém tomou; deixá-lo
    // sem ficha o poria na lista sem grupo, que é o defeito de hoje mais cedo.
    const linha = linhas(comPonto())[0];
    expect(fichaDoComponente(linha.chave)?.grupo).toBe('Elétrica — a classificar');
  });

  it('a sigla nomeia a linha quando não há rótulo do projetista', () => {
    const linha = linhas(comPonto('DADOS_REDE'))[0];
    expect(linha.rotulo).toBe('Rede 1');
  });
});
