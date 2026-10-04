/**
 * CAMADAS POR DISCIPLINA (04/10/2026) — a classificação peça → camada e as
 * operações do painel (olho, meio-tom, isolar, mostrar/ocultar todas,
 * contagem) e o filtro de conflitos.
 */
import { describe, expect, it } from 'vitest';
import { emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import {
  CAMADAS,
  ESTADOS_PADRAO,
  alternarAtenuacao,
  alternarVisibilidade,
  alvoIsolado,
  classificarPecas,
  conflitoVisivel,
  contagemDoGrupo,
  contagemPorCamada,
  definirTodas,
  estadoDaPertenca,
  estadoDoGrupo,
  estadoDoOverlay,
  estadosDasChavesAntigas,
  idsPorEstado,
  isolar,
  sanearEstados,
  type Pertenca,
} from '../utils/blueprintCamadasPorDisciplina';

/** Modelo com uma peça por coleção — só os campos que a classificação lê. */
function modelo(): BlueprintModel {
  const m = emptyModel() as unknown as Record<string, unknown[]>;
  const um = (k: string, extra: Record<string, unknown> = {}) => m[k].push({ id: k, levelId: 'L1', ...extra });
  for (const k of ['walls', 'spaces', 'labels', 'roofs', 'stairs', 'guardaCorpos', 'rodapes', 'vagas', 'structures', 'boundaries', 'quadras', 'lotes', 'vias', 'areasPublicas', 'blocos', 'subRegioes', 'areasDeOperacao']) um(k);
  m.openings.push({ id: 'openings', wallId: 'walls' });
  m.componentes.push({ id: 'cama', levelId: 'L1', familia: 'MOBILIARIO' }, { id: 'condensadora', levelId: 'L1', familia: 'CLIMATIZACAO' });
  m.nucleos.push(
    { id: 'elevador', levelId: 'L1', tipo: 'ELEVADOR' },
    { id: 'shaftGeral', levelId: 'L1', tipo: 'SHAFT', disciplina: null },
    { id: 'shaftMec', levelId: 'L1', tipo: 'SHAFT', disciplina: 'MECANICA' },
  );
  m.quadros.push({ id: 'qdc', levelId: 'L1' });
  m.circuitos.push({ id: 'cLuz' }, { id: 'cTug' });
  m.terminais.push(
    { id: 'luz', levelId: 'L1', disciplina: 'ELETRICA', tipoEletrico: 'ILUMINACAO_TETO', circuitoId: 'cLuz' },
    { id: 'tug', levelId: 'L2', disciplina: 'ELETRICA', tipoEletrico: 'TUG', circuitoId: 'cTug' },
    { id: 'cp', levelId: 'L1', disciplina: 'ELETRICA', tipoEletrico: 'CAIXA_PASSAGEM' },
    { id: 'lavatorio', levelId: 'L1', disciplina: 'AGUA_FRIA' },
    { id: 'chuveiro', levelId: 'L1', disciplina: 'AGUA_QUENTE' },
    { id: 'ralo', levelId: 'L1', disciplina: 'ESGOTO' },
    { id: 'calha', levelId: 'L1', disciplina: 'PLUVIAL' },
    { id: 'hidrante', levelId: 'L1', disciplina: 'INCENDIO' },
    { id: 'difusor', levelId: 'L1', disciplina: 'MECANICA' },
  );
  m.trechos.push(
    { id: 'tronco', levelId: 'L1', disciplina: 'ELETRICA', circuitoIds: ['cLuz', 'cTug'] },
    { id: 'soLuz', levelId: 'L1', disciplina: 'ELETRICA', circuitoIds: ['cLuz'] },
    { id: 'soTug', levelId: 'L2', disciplina: 'ELETRICA', circuitoIds: ['cTug'] },
    { id: 'tuboAF', levelId: 'L1', disciplina: 'AGUA_FRIA' },
    { id: 'tuboESG', levelId: 'L2', disciplina: 'ESGOTO' },
    { id: 'tuboINC', levelId: 'L1', disciplina: 'INCENDIO' },
    { id: 'duto', levelId: 'L1', disciplina: 'MECANICA' },
  );
  // Referências — ficam sempre à vista, fora da classificação.
  m.levels.push({ id: 'L1' }, { id: 'L2' });
  m.sections.push({ id: 'corte' });
  m.eixos.push({ id: 'eixo' });
  m.anotacoes.push({ id: 'nota', levelId: 'L1' });
  return m as unknown as BlueprintModel;
}

describe('classificação peça → camada', () => {
  const c = classificarPecas(modelo());
  const casos: [string, Pertenca][] = [
    ['walls', 'ARQUITETURA'],
    ['openings', 'ARQUITETURA'],
    ['spaces', 'ARQUITETURA'],
    ['labels', 'ARQUITETURA'],
    ['roofs', 'ARQUITETURA'],
    ['stairs', 'ARQUITETURA'],
    ['guardaCorpos', 'ARQUITETURA'],
    ['rodapes', 'ARQUITETURA'],
    ['vagas', 'ARQUITETURA'],
    ['cama', 'ARQUITETURA'],
    ['elevador', 'ARQUITETURA'],
    ['shaftGeral', 'ARQUITETURA'],
    ['structures', 'ESTRUTURA'],
    ['boundaries', 'TERRENO'],
    ['quadras', 'TERRENO'],
    ['lotes', 'TERRENO'],
    ['vias', 'TERRENO'],
    ['areasPublicas', 'TERRENO'],
    ['blocos', 'TERRENO'],
    ['subRegioes', 'TERRENO'],
    ['areasDeOperacao', 'INCENDIO'],
    ['luz', 'ELETRICA_ILUMINACAO'],
    ['soLuz', 'ELETRICA_ILUMINACAO'],
    ['tug', 'ELETRICA_FORCA'],
    ['soTug', 'ELETRICA_FORCA'],
    ['cp', 'ELETRICA_COMUM'],
    ['tronco', 'ELETRICA_COMUM'],
    ['qdc', 'ELETRICA_COMUM'],
    ['lavatorio', 'AGUA_FRIA'],
    ['tuboAF', 'AGUA_FRIA'],
    ['chuveiro', 'AGUA_QUENTE'],
    ['ralo', 'ESGOTO'],
    ['tuboESG', 'ESGOTO'],
    ['calha', 'PLUVIAL'],
    ['hidrante', 'INCENDIO'],
    ['tuboINC', 'INCENDIO'],
    ['difusor', 'MECANICA'],
    ['duto', 'MECANICA'],
    ['shaftMec', 'MECANICA'],
    ['condensadora', 'MECANICA'],
  ];
  it.each(casos)('%s → %s', (id, camada) => expect(c.get(id)).toBe(camada));

  it('referências (pavimento, corte, eixo, anotação) ficam fora — sempre à vista', () => {
    for (const id of ['L1', 'L2', 'corte', 'eixo', 'nota']) expect(c.has(id)).toBe(false);
  });

  it('PORTÃO: coleção nova do modelo precisa ser classificada ou declarada referência', () => {
    // Acrescentou uma coleção desenhável ao `emptyModel`? Classifique-a em
    // `classificarPecas` ou, se for referência, inclua-a aqui com o porquê.
    // `verticesDoTerreno` não tem id (nome de um ponto da divisa — some com ela).
    const REFERENCIAS = new Set(['levels', 'sections', 'eixos', 'restricoes', 'unidades', 'grupos', 'anotacoes', 'vistasDependentes', 'etapas', 'verticesDoTerreno']);
    const vazio = emptyModel() as unknown as Record<string, unknown>;
    const colecoes = Object.keys(vazio).filter((k) => Array.isArray(vazio[k]) && !REFERENCIAS.has(k));
    for (const k of colecoes) {
      const m = { ...vazio, [k]: [{ id: `x-${k}`, levelId: 'L1', disciplina: 'AGUA_FRIA', tipo: 'SHAFT' }] } as unknown as BlueprintModel;
      expect(classificarPecas(m).has(`x-${k}`), k).toBe(true);
    }
  });
});

describe('estado de cada peça', () => {
  it('o comum elétrico segue a subcamada MAIS visível', () => {
    const e = { ...ESTADOS_PADRAO, ELETRICA_ILUMINACAO: 'OCULTA' as const, ELETRICA_FORCA: 'ATENUADA' as const };
    expect(estadoDaPertenca('ELETRICA_COMUM', e)).toBe('ATENUADA');
    expect(estadoDaPertenca('ELETRICA_COMUM', { ...e, ELETRICA_FORCA: 'OCULTA' })).toBe('OCULTA');
  });

  it('idsPorEstado separa ocultos e atenuados; tudo visível = conjuntos vazios', () => {
    const c = classificarPecas(modelo());
    expect(idsPorEstado(c, ESTADOS_PADRAO)).toEqual({ ocultos: new Set(), atenuados: new Set() });
    const { ocultos, atenuados } = idsPorEstado(c, { ...ESTADOS_PADRAO, ESGOTO: 'OCULTA', ESTRUTURA: 'ATENUADA' });
    expect([...ocultos].sort()).toEqual(['ralo', 'tuboESG']);
    expect([...atenuados]).toEqual(['structures']);
  });

  it('esconder iluminação deixa quadro, caixa e tronco (como o recorte E5.1)', () => {
    const c = classificarPecas(modelo());
    const { ocultos } = idsPorEstado(c, { ...ESTADOS_PADRAO, ELETRICA_ILUMINACAO: 'OCULTA' });
    expect([...ocultos].sort()).toEqual(['luz', 'soLuz']);
  });
});

describe('grupos e overlays', () => {
  it('grupo com subcamadas discordantes é MISTO; overlay segue a mais visível', () => {
    const e = { ...ESTADOS_PADRAO, ESGOTO: 'OCULTA' as const };
    expect(estadoDoGrupo('HIDRAULICA', e)).toBe('MISTO');
    expect(estadoDoGrupo('HIDRAULICA', ESTADOS_PADRAO)).toBe('VISIVEL');
    expect(estadoDoOverlay('HIDRAULICA', e)).toBe('VISIVEL');
    expect(estadoDoOverlay('HIDRAULICA', { ...definirTodas('OCULTA'), PLUVIAL: 'ATENUADA' })).toBe('ATENUADA');
  });
});

describe('olho e meio-tom', () => {
  it('olho do grupo: misto/visível → tudo oculto; tudo oculto → tudo visível', () => {
    const misto = { ...ESTADOS_PADRAO, ESGOTO: 'OCULTA' as const };
    const oculto = alternarVisibilidade(misto, 'HIDRAULICA');
    expect(estadoDoGrupo('HIDRAULICA', oculto)).toBe('OCULTA');
    expect(oculto.ARQUITETURA).toBe('VISIVEL');
    expect(estadoDoGrupo('HIDRAULICA', alternarVisibilidade(oculto, 'HIDRAULICA'))).toBe('VISIVEL');
  });

  it('olho da subcamada mexe só nela; atenuada + olho = oculta', () => {
    const e = alternarVisibilidade(ESTADOS_PADRAO, 'ESGOTO');
    expect(e.ESGOTO).toBe('OCULTA');
    expect(e.AGUA_FRIA).toBe('VISIVEL');
    expect(alternarVisibilidade({ ...ESTADOS_PADRAO, ESGOTO: 'ATENUADA' }, 'ESGOTO').ESGOTO).toBe('OCULTA');
  });

  it('meio-tom: liga e desliga; camada oculta volta à tela em meio-tom', () => {
    const a = alternarAtenuacao(ESTADOS_PADRAO, 'ESTRUTURA');
    expect(a.ESTRUTURA).toBe('ATENUADA');
    expect(alternarAtenuacao(a, 'ESTRUTURA').ESTRUTURA).toBe('VISIVEL');
    expect(alternarAtenuacao({ ...ESTADOS_PADRAO, ESTRUTURA: 'OCULTA' }, 'ESTRUTURA').ESTRUTURA).toBe('ATENUADA');
  });
});

describe('isolar', () => {
  it('só o alvo; com base atenuada a arquitetura fica em meio-tom', () => {
    const e = isolar('ESGOTO', { baseAtenuada: true });
    expect(CAMADAS.filter((c) => e[c] === 'VISIVEL')).toEqual(['ESGOTO']);
    expect(e.ARQUITETURA).toBe('ATENUADA');
    expect(isolar('ESGOTO', { baseAtenuada: false }).ARQUITETURA).toBe('OCULTA');
  });

  it('isolar a própria arquitetura a deixa visível', () => {
    expect(isolar('ARQUITETURA', { baseAtenuada: true }).ARQUITETURA).toBe('VISIVEL');
  });

  it('isolar um grupo mostra todas as subcamadas dele', () => {
    const e = isolar('HIDRAULICA', { baseAtenuada: false });
    expect(CAMADAS.filter((c) => e[c] === 'VISIVEL')).toEqual(['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO', 'PLUVIAL']);
  });

  it('alvoIsolado reconhece o isolamento (grupo e subcamada) e devolve null fora dele', () => {
    const op = { baseAtenuada: true };
    expect(alvoIsolado(isolar('INCENDIO', op), op)).toBe('INCENDIO');
    expect(alvoIsolado(isolar('ESGOTO', op), op)).toBe('ESGOTO');
    expect(alvoIsolado(isolar('ELETRICA', op), op)).toBe('ELETRICA');
    expect(alvoIsolado(ESTADOS_PADRAO, op)).toBeNull();
    expect(alvoIsolado({ ...ESTADOS_PADRAO, ESGOTO: 'OCULTA' }, op)).toBeNull();
  });
});

describe('contagem', () => {
  it('por pavimento; peça sem pavimento conta em todos; esquadria herda o da parede', () => {
    const m = modelo();
    const c = classificarPecas(m);
    const l1 = contagemPorCamada(m, c, ['L1']);
    expect(l1.ESGOTO).toBe(1); // ralo (o tubo é do L2)
    expect(l1.ELETRICA_FORCA).toBe(0); // tug e soTug no L2
    expect(l1.ELETRICA_COMUM).toBe(5); // cp + tronco + qdc + 2 circuitos (sem pavimento)
    expect(l1.ARQUITETURA).toBe(12);
    const tudo = contagemPorCamada(m, c, null);
    expect(tudo.ESGOTO).toBe(2);
    expect(contagemDoGrupo('ELETRICA', tudo)).toBe(9);
    expect(contagemDoGrupo('HIDRAULICA', tudo)).toBe(6);
  });
});

describe('persistência', () => {
  it('saneia lixo: chave desconhecida cai, valor inválido volta ao padrão', () => {
    expect(sanearEstados(null)).toEqual(ESTADOS_PADRAO);
    expect(sanearEstados([1, 2])).toEqual(ESTADOS_PADRAO);
    const e = sanearEstados({ ESGOTO: 'OCULTA', ESTRUTURA: 'talvez', GAS: 'OCULTA' });
    expect(e.ESGOTO).toBe('OCULTA');
    expect(e.ESTRUTURA).toBe('VISIVEL');
    expect('GAS' in e).toBe(false);
  });

  it('as três chaves antigas do Exibir viram o estado inicial', () => {
    const e = estadosDasChavesAntigas({ iluminacao: false, forca: true, incendio: false });
    expect(e.ELETRICA_ILUMINACAO).toBe('OCULTA');
    expect(e.ELETRICA_FORCA).toBe('VISIVEL');
    expect(e.INCENDIO).toBe('OCULTA');
    expect(estadosDasChavesAntigas({})).toEqual(ESTADOS_PADRAO);
  });
});

describe('conflitos à vista', () => {
  const c = classificarPecas(modelo());
  it('estrutura × esgoto: aparece com os dois à vista (atenuado conta), some com um oculto', () => {
    expect(conflitoVisivel(['tuboESG', 'structures'], c, ESTADOS_PADRAO)).toBe(true);
    expect(conflitoVisivel(['tuboESG', 'structures'], c, { ...ESTADOS_PADRAO, ESTRUTURA: 'ATENUADA' })).toBe(true);
    expect(conflitoVisivel(['tuboESG', 'structures'], c, { ...ESTADOS_PADRAO, ESGOTO: 'OCULTA' })).toBe(false);
  });
  it('lado não classificado conta como visível', () => {
    expect(conflitoVisivel(['tuboESG', 'inexistente'], c, ESTADOS_PADRAO)).toBe(true);
  });
});
