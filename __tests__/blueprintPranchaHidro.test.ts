/**
 * E2.1 — A PRANCHA HIDROSSANITÁRIA (28/09/2026, roadmap hidrossanitário).
 *
 * Planta de ÁGUA e planta de ESGOTO por pavimento que TEM a rede, e uma folha
 * "Legenda e detalhes hidrossanitários" com o que existe no desenho.
 *
 * ⚠️ E a planta arquitetônica continua a mesma: sem `hidrossanitaria`, nenhum
 * traço nem texto de instalação entra.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDeDetalhesHidro, desenharPlanta, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { itensDaLegendaHidro, temRedeNoPavimento } from '../utils/blueprintPranchaHidro';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO, TEMPLATES_DE_PRANCHA_DE_FABRICA } from '../utils/blueprintPranchas';
import { desenharConjunto, ehPlantaDaPrancha } from '../services/blueprintExportService';
import { gerarDxf } from '../utils/blueprintDxf';

/** Térreo 6 × 4 com água fria/quente e esgoto (ramal + TQ + CI); superior só com paredes. */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 6000, 0], [6000, 0, 6000, 4000], [6000, 4000, 0, 4000], [0, 4000, 0, 0]].map(([ax, ay, bx, by]) => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
    }));
  m = applyBatch(m, [
    ...paredes(t),
    ...paredes(s),
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(500, 75), b: point(3500, 75), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(3500, 75), b: point(5500, 75), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_QUENTE', a: point(500, 3925), b: point(3500, 3925), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 22 },
    { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(1000, 2000), b: point(5000, 2000), cotaAMm: -150, cotaBMm: -230, bitolaMm: 100 },
    { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(1000, 2000), b: point(1000, 2000), cotaAMm: 2800, cotaBMm: -150, bitolaMm: 100, rotulo: 'TQ1' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: point(5000, 2000), cotaMm: -600, tipoHidraulico: 'CAIXA_INSPECAO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lav', at: point(5500, 75), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
  ]).model;
  return m;
}

const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({
  denominador: 50,
  papel,
  titulo: 'Casa',
  revisao: 1,
  hash: 'h'.repeat(64),
  data: new Date('2026-09-28T12:00:00Z'),
  ...extra,
});
const sem = (inc: Record<string, boolean>) => ({ ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, ...inc } });

describe('E2.1 — a planta hidrossanitária no papel', () => {
  it('⚠️ SEM `hidrossanitaria`, nada da instalação entra — a planta de sempre', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes(), enquadrar(m, 50, papel, false));
    expect(d.textos().join(' | ')).not.toMatch(/ø\d|TQ1|CI\b/);
  });

  it('ÁGUA: o ø no tubo, a sigla do ponto; nada do esgoto', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes({ hidrossanitaria: 'AGUA' }), enquadrar(m, 50, papel, false));
    const textos = d.textos().join(' | ');
    expect(textos).toMatch(/ø25/);
    expect(textos).toMatch(/ø22/);
    // E2.4: a altura do tubo de água.
    expect(textos).toMatch(/ø25 mm · h 2,20/);
    expect(textos).not.toMatch(/ø100|TQ1/);
  });

  it('ESGOTO: tubo ø100 BIFILAR a 1:50 (2 mm no papel), o caimento i %, a prumada com o nome e a caixa', () => {
    const m = casa();
    const antes = new DesenhistaDeProva();
    desenharPlanta(antes, m, opcoes(), enquadrar(m, 50, papel, false));
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes({ hidrossanitaria: 'ESGOTO' }), enquadrar(m, 50, papel, false));
    const textos = d.textos().join(' | ');
    expect(textos).toMatch(/ø100 mm · i 2 %/);
    expect(textos).toMatch(/TQ-1 ø100/); // E2.3: o nome da coluna do desenho
    expect(textos).toMatch(/CI/);
    expect(textos).not.toMatch(/ø25/);
    // E2.4: a tampa e o fundo da caixa, relativos ao piso.
    expect(d.textos().some((t) => /^CT [+−]\d,\d\d · CF −\d,\d\d$/.test(t))).toBe(true);
    // Bifilar = o miolo é um polígono a mais que a arquitetura.
    const poligonos = (x: DesenhistaDeProva) => x.chamadas.filter((c) => c.tipo === 'poligono').length;
    expect(poligonos(d)).toBeGreaterThan(poligonos(antes));
    // A CI é um retângulo (caixa + tampa).
    const retangulos = (x: DesenhistaDeProva) => x.chamadas.filter((c) => c.tipo === 'retangulo').length;
    expect(retangulos(d) - retangulos(antes)).toBeGreaterThanOrEqual(2);
  });
});

describe('E2.1 — a legenda', () => {
  it('só o que existe: condutos por rede × material × DN, conexões e peças, em ordem estável', () => {
    const itens = itensDaLegendaHidro(casa());
    const condutos = itens.filter((i) => i.grupo === 'Condutos').map((i) => i.texto);
    expect(condutos).toHaveLength(3);
    expect(condutos[0]).toMatch(/ø25 mm$/);
    expect(condutos[1]).toMatch(/ø22 mm$/);
    expect(condutos[2]).toMatch(/ø100 mm$/);
    expect(itens.filter((i) => i.grupo === 'Conexões').length).toBeGreaterThan(0);
    const pecas = itens.filter((i) => i.grupo === 'Pontos e peças').map((i) => i.texto).join(' | ');
    expect(pecas).toMatch(/CI/);
    expect(itensDaLegendaHidro(casa())).toEqual(itens);
  });

  it('a folha de detalhes desenha a legenda e o carimbo', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharFolhaDeDetalhesHidro(d, m, opcoes({ denominador: 0 }), enquadrar(m, 50, papel, false));
    const textos = d.textos();
    expect(textos).toContain('LEGENDA E DETALHES HIDROSSANITÁRIOS');
    expect(textos.some((t) => /ø100 mm/.test(t))).toBe(true);
    expect(textos.some((t) => /Casa/.test(t))).toBe(true);
  });
});

describe('E2.1 — o conjunto de pranchas', () => {
  it('uma prancha por pavimento QUE TEM a rede, mais UMA folha de legenda; desligado = nenhuma', () => {
    const m = casa();
    const [t, s] = m.levels.map((l) => l.id);
    expect(temRedeNoPavimento(m, t, 'AGUA')).toBe(true);
    expect(temRedeNoPavimento(m, s, 'AGUA')).toBe(false);
    const plano = planejarConjunto(m, sem({ hidraulica: true, sanitaria: true }));
    // E2.3: o TQ1 é coluna — o esquema vertical entra no fim.
    expect(plano.map((p) => p.tipo)).toEqual(['HIDRAULICA', 'SANITARIA', 'DETALHES_HIDRO', 'ESQUEMA_HIDRO']);
    expect(plano.map((p) => p.levelId)).toEqual([t, t, undefined, undefined]);
    expect(planejarConjunto(m, sem({})).some((p) => ['HIDRAULICA', 'SANITARIA', 'DETALHES_HIDRO', 'ESQUEMA_HIDRO'].includes(p.tipo))).toBe(false);
    // Sem rede nenhuma: nem a folha de legenda.
    const vazio = { ...m, trechos: [], terminais: [] };
    expect(planejarConjunto(vazio, sem({ hidraulica: true, sanitaria: true }))).toEqual([]);
    // O template padrão não liga; o executivo de fábrica liga.
    expect(TEMPLATE_DE_PRANCHA_PADRAO.incluir.hidraulica).toBe(false);
    expect(TEMPLATES_DE_PRANCHA_DE_FABRICA.find((x) => x.id === 'fab:a0-50-exec')!.template.incluir).toMatchObject({ hidraulica: true, sanitaria: true });
  });

  it('desenharConjunto: nenhuma folha em branco (o `default: break` não engole os tipos novos)', () => {
    const m = casa();
    const folhas: DesenhistaDeProva[] = [];
    const r = desenharConjunto(m, opcoes(), sem({ hidraulica: true, sanitaria: true }), () => {
      const f = new DesenhistaDeProva();
      folhas.push(f);
      return f;
    });
    expect(r.folhas).toHaveLength(4);
    expect(folhas[0].textos().join(' | ')).toMatch(/ø25/);
    expect(folhas[1].textos().join(' | ')).toMatch(/ø100/);
    expect(folhas[2].textos()).toContain('LEGENDA E DETALHES HIDROSSANITÁRIOS');
    expect(folhas[3].textos()).toContain('ESQUEMA VERTICAL HIDROSSANITÁRIO');
  });
});

describe('E2.1 — o DXF e a exportação avulsa', () => {
  it('DXF: sem `redes`, nenhuma entidade nas camadas hidrossanitárias; com elas, o tubo em mm REAIS e o ø no texto', () => {
    const m = casa();
    const entidadesEm = (dxf: string, camada: string) => dxf.split('\n').filter((l, i, ls) => l === camada && ls[i - 1] === '8').length;
    const sem = gerarDxf(m, { titulo: 'Casa', revisao: 1, hash: 'h' });
    expect(entidadesEm(sem, 'PLANTA-ESGOTO')).toBe(0);
    const com = gerarDxf(m, { titulo: 'Casa', revisao: 1, hash: 'h', redes: ['AGUA', 'ESGOTO'] });
    expect(entidadesEm(com, 'PLANTA-ESGOTO')).toBeGreaterThan(0);
    expect(entidadesEm(com, 'PLANTA-AGUA')).toBeGreaterThan(0);
    expect(entidadesEm(com, 'PLANTA-ESGOTO-TEXTO')).toBeGreaterThan(0);
    expect(com).toContain('ø100 mm · i 2 %');
    // O tubo de esgoto (y = 2000) sai em mm reais, no mesmo Y das paredes: as bordas do bifilar a 50 mm do eixo (ø100).
    expect(com).toContain('\n20\n1950.0000\n');
    expect(com).toContain('\n20\n2050.0000\n');
  });

  it('as plantas hidrossanitárias são PLANTA (sem projeção de elevação)', () => {
    expect(ehPlantaDaPrancha('hidraulica')).toBe(true);
    expect(ehPlantaDaPrancha('sanitaria')).toBe(true);
    expect(ehPlantaDaPrancha('frente')).toBe(false);
  });
});
