/**
 * A TAXONOMIA HIDRÁULICA (18/09/2026: *"Hidráulica (MEP) estão faltando
 * componentes como: conexões, caixa d'água, ralo etc."*).
 *
 * O molde é `blueprintPontoEletricoTipos.test.ts`: a lista fechada, a ficha
 * que cobre todo tipo, o payload que só ganha a chave quando declarada, as
 * invariantes, e o inventário que resolve toda chave que emite — a prova de
 * "família nova desenha mas não alcança".
 */
import { describe, expect, it } from 'vitest';
import {
  DISCIPLINAS_DO_PONTO_HIDRAULICO,
  TIPOS_DE_PONTO_HIDRAULICO,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
  type DisciplinaDeRede,
  type TipoDePontoHidraulico,
} from '../utils/blueprintKernel';
import {
  FICHA_DO_PONTO_HIDRAULICO,
  GRUPO_DO_PONTO_HIDRAULICO,
  GRUPO_HIDRAULICO_A_CLASSIFICAR,
  ROTULO_DO_PONTO_HIDRAULICO,
  SIGLA_DO_PONTO_HIDRAULICO,
  cotaUsualDoPontoHidraulico,
  ehPontoDeConsumo,
  ehSobreOTrecho,
  projetarNoTrecho,
  tiposHidraulicosDa,
} from '../utils/blueprintHidraulica';
import { linhasDeComponentesPorNivel } from '../utils/blueprintComponentes';
import { fichaDoComponente } from '../components/blueprint/MenuComponentes';
import { POLITICA_PADRAO, computeQuantities } from '../utils/blueprintKernel';

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
}

function comPonto(disciplina: DisciplinaDeRede, tipoHidraulico?: TipoDePontoHidraulico, extra: Record<string, unknown> = {}): BlueprintModel {
  const m = base();
  return applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina,
    tipo: 'Ponto',
    at: point(1000, 1000),
    cotaMm: 600,
    ...(tipoHidraulico ? { tipoHidraulico } : {}),
    ...extra,
  } as never).model;
}

describe('taxonomia hidráulica · a lista e a ficha', () => {
  it('os cinco grupos do pedido existem: consumo, reservação, esgoto, registros e conexões', () => {
    const grupos = new Set(Object.values(GRUPO_DO_PONTO_HIDRAULICO));
    expect([...grupos].sort()).toEqual(
      [
        'Hidráulica — conexões',
        'Hidráulica — esgoto',
        'Hidráulica — pontos de consumo',
        'Hidráulica — registros e válvulas',
        'Hidráulica — reservação',
      ].sort(),
    );
    for (const t of ['CHUVEIRO', 'VASO_SANITARIO', 'RESERVATORIO', 'RALO_SIFONADO', 'CAIXA_INSPECAO', 'REGISTRO_GAVETA', 'CONEXAO_TE'] as const) {
      expect(TIPOS_DE_PONTO_HIDRAULICO).toContain(t);
    }
  });

  it('⚠️ todo tipo tem ficha completa — rótulo, sigla, grupo, disciplinas e cota em cada disciplina admitida', () => {
    for (const t of TIPOS_DE_PONTO_HIDRAULICO) {
      const f = FICHA_DO_PONTO_HIDRAULICO[t];
      expect(ROTULO_DO_PONTO_HIDRAULICO[t], t).toBeTruthy();
      expect(SIGLA_DO_PONTO_HIDRAULICO[t], t).toBeTruthy();
      expect(f.grupo, t).toMatch(/^Hidráulica — /);
      const admitidas = DISCIPLINAS_DO_PONTO_HIDRAULICO[t];
      expect(admitidas.length, t).toBeGreaterThan(0);
      expect(admitidas, t).not.toContain('ELETRICA');
      for (const d of admitidas) expect(cotaUsualDoPontoHidraulico(t, d), `${t} em ${d}`).not.toBeNull();
      // Consumo tem peso; quem contribui ao esgoto tem UHC.
      if (ehPontoDeConsumo(t)) expect(f.pesoNbr5626, t).toBeGreaterThan(0);
      if (admitidas.includes('ESGOTO') && ehPontoDeConsumo(t)) expect(f.uhcNbr8160, t).toBeGreaterThan(0);
    }
    // Os pesos da NBR 5626 que o dimensionamento vai usar.
    expect(FICHA_DO_PONTO_HIDRAULICO.LAVATORIO.pesoNbr5626).toBe(0.3);
    expect(FICHA_DO_PONTO_HIDRAULICO.CHUVEIRO.pesoNbr5626).toBe(0.4);
    expect(FICHA_DO_PONTO_HIDRAULICO.MAQUINA_LAVAR.pesoNbr5626).toBe(1.0);
    expect(FICHA_DO_PONTO_HIDRAULICO.VASO_SANITARIO.uhcNbr8160).toBe(6);
    expect(FICHA_DO_PONTO_HIDRAULICO.RESERVATORIO.volumeL).toBe(1000);
  });

  it('a disciplina filtra os tipos: vaso não existe em água quente; chuveiro existe nas três', () => {
    expect(tiposHidraulicosDa('AGUA_QUENTE')).not.toContain('VASO_SANITARIO');
    expect(tiposHidraulicosDa('AGUA_FRIA')).toContain('VASO_SANITARIO');
    for (const d of ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'] as const) expect(tiposHidraulicosDa(d)).toContain('CHUVEIRO');
    expect(tiposHidraulicosDa('ESGOTO')).not.toContain('RESERVATORIO');
  });
});

describe('taxonomia hidráulica · o kernel', () => {
  it('⚠️ ponto sem classificação NÃO ganha as chaves no payload — o acervo não muda de hash', () => {
    const payload = JSON.parse(payloadDoHash(comPonto('AGUA_FRIA')));
    expect(Object.keys(payload.terminais[0])).not.toContain('tipoHidraulico');
    expect(Object.keys(payload.terminais[0])).not.toContain('volumeL');
  });

  it('classificação e volume sobrevivem ao ida e volta', () => {
    const m = comPonto('AGUA_FRIA', 'RESERVATORIO', { volumeL: 1000 });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.terminais[0].tipoHidraulico).toBe('RESERVATORIO');
    expect(volta.terminais[0].volumeL).toBe(1000);
  });

  it('volume só entra no reservatório: no chuveiro é ignorado ao criar, e trocar o tipo apaga', () => {
    const chuveiro = comPonto('AGUA_FRIA', 'CHUVEIRO', { volumeL: 500 });
    expect(chuveiro.terminais[0].volumeL).toBeUndefined();
    const caixa = comPonto('AGUA_FRIA', 'RESERVATORIO', { volumeL: 500 });
    const virouTorneira = applyCommand(caixa, { type: 'SetTerminalProps', terminalId: caixa.terminais[0].id, tipoHidraulico: 'TORNEIRA' }).model;
    expect(virouTorneira.terminais[0].tipoHidraulico).toBe('TORNEIRA');
    expect(virouTorneira.terminais[0].volumeL).toBeNull();
  });

  it('⚠️ a invariante recusa tipo em ELETRICA, valor inventado, disciplina não admitida e volume fora do reservatório', () => {
    const m = comPonto('AGUA_FRIA', 'CHUVEIRO');
    const codigo = (modelo: unknown) => {
      try {
        assertModelInvariants(modelo as never);
        return null;
      } catch (e) {
        return (e as { code?: string }).code ?? 'erro';
      }
    };
    expect(codigo({ ...m, terminais: [{ ...m.terminais[0], disciplina: 'ELETRICA' }] })).toBe('BAD_POINT_KIND');
    expect(codigo({ ...m, terminais: [{ ...m.terminais[0], tipoHidraulico: 'BIDE' }] })).toBe('BAD_POINT_KIND');
    expect(codigo({ ...m, terminais: [{ ...m.terminais[0], disciplina: 'AGUA_QUENTE', tipoHidraulico: 'VASO_SANITARIO' }] })).toBe('BAD_POINT_KIND');
    expect(codigo({ ...m, terminais: [{ ...m.terminais[0], volumeL: 500 }] })).toBe('BAD_VOLUME');
    expect(codigo({ ...m, terminais: [{ ...m.terminais[0], tipoHidraulico: 'RESERVATORIO', volumeL: 0 }] })).toBe('BAD_VOLUME');
    expect(codigo({ ...m, terminais: [{ ...m.terminais[0], tipoHidraulico: 'RESERVATORIO', volumeL: 1000 }] })).toBeNull();
  });

  it('o quantitativo conta por CLASSIFICAÇÃO: dois chuveiros com textos diferentes são uma família', () => {
    let m = comPonto('AGUA_FRIA', 'CHUVEIRO');
    m = applyCommand(m, {
      type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'AGUA_FRIA', tipo: 'chuveiro da suíte',
      at: point(3000, 1000), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO',
    }).model;
    const q = computeQuantities(m, POLITICA_PADRAO);
    expect(q.totais.porTerminal).toHaveLength(1);
    expect(q.totais.porTerminal[0]).toMatchObject({ disciplina: 'AGUA_FRIA', classificacao: 'CHUVEIRO', quantidade: 2 });
  });
});

describe('taxonomia hidráulica · o inventário', () => {
  const linhas = (m: BlueprintModel) => linhasDeComponentesPorNivel(m).flatMap((b) => b.linhas);

  it('⚠️ todo ponto tipado, em toda disciplina admitida, cai no grupo da ficha — e a chave tem ficha', () => {
    for (const t of TIPOS_DE_PONTO_HIDRAULICO) {
      for (const d of DISCIPLINAS_DO_PONTO_HIDRAULICO[t]) {
        const linha = linhas(comPonto(d, t))[0];
        expect(linha.chave, `${t} em ${d}`).toBe(`PONTO_${d}_${t}`);
        expect(fichaDoComponente(linha.chave)?.grupo, `${t} em ${d}`).toBe(GRUPO_DO_PONTO_HIDRAULICO[t]);
      }
    }
  });

  it('o ponto SEM classificação tem grupo próprio — "a classificar" é estado visível', () => {
    const linha = linhas(comPonto('ESGOTO'))[0];
    expect(linha.chave).toBe('PONTO_ESGOTO');
    expect(fichaDoComponente(linha.chave)?.grupo).toBe(GRUPO_HIDRAULICO_A_CLASSIFICAR);
  });

  it('a sigla nomeia a linha, e a caixa d\'água diz o volume', () => {
    const linha = linhas(comPonto('AGUA_FRIA', 'RESERVATORIO', { volumeL: 1000 }))[0];
    expect(linha.rotulo).toBe('CX 1');
    expect(linha.detalhe).toContain('1000 L');
  });
});

describe('peça sobre o trecho · projetarNoTrecho', () => {
  function comTrecho(cotaA = 2200, cotaB = 2200, disciplina: DisciplinaDeRede = 'AGUA_FRIA') {
    const m = base();
    return applyCommand(m, {
      type: 'AddTrecho', levelId: m.levels[0].id, disciplina, a: point(0, 0), b: point(4000, 0), cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm: 25,
    }).model;
  }

  it('projeta no eixo, dentro da tolerância, e interpola a cota do caimento', () => {
    const m = comTrecho(0, -80, 'ESGOTO');
    const r = projetarNoTrecho(point(1000, 60), m.trechos!, 'ESGOTO', m.levels[0].id);
    expect(r?.ponto).toEqual({ x: 1000, y: 0 });
    expect(r?.cotaMm).toBe(-20); // 25 % do caminho, 80 mm de queda
  });

  it('ignora trecho de outra disciplina e devolve null longe de qualquer trecho', () => {
    const m = comTrecho();
    expect(projetarNoTrecho(point(1000, 60), m.trechos!, 'ESGOTO', m.levels[0].id)).toBeNull();
    expect(projetarNoTrecho(point(1000, 400), m.trechos!, 'AGUA_FRIA', m.levels[0].id)).toBeNull();
    expect(projetarNoTrecho(point(1000, 100), m.trechos!, 'AGUA_FRIA', m.levels[0].id)?.trecho.id).toBe(m.trechos![0].id);
  });

  it('as peças sobre o trecho são registros, válvulas, hidrômetro e conexões — não os aparelhos', () => {
    expect(ehSobreOTrecho('REGISTRO_GAVETA')).toBe(true);
    expect(ehSobreOTrecho('HIDROMETRO')).toBe(true);
    expect(ehSobreOTrecho('CONEXAO_TE')).toBe(true);
    expect(ehSobreOTrecho('CHUVEIRO')).toBe(false);
    expect(ehSobreOTrecho('RESERVATORIO')).toBe(false);
  });
});
