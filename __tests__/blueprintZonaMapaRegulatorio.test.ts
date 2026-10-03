/**
 * Zona do Mapa Regulatório na Planta Inteligente — o que faltava (03/10/2026, plano
 * `2026-10-03-zona-mapa-regulatorio-na-planta.md`): notas de rodapé coladas nos valores ("3²", "N.A.¹"), CA mínimo e
 * área mínima da unidade lidos e conferidos, os campos que a Planta pede chegando da zona, e a importação de planilha
 * que reconhece o próprio modelo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { conferirTipologias, lerZona, recuosDaZona, zonaDerivou, type ZonaRegulatoria } from '../utils/blueprintZonaUrbanistica';
import { suggestMapping } from '../services/regulatoryMapExcelImport';
import { ZONE_COLUMNS } from '../components/RegulatoryZoneTable';

/** Valores REAIS do catálogo de produção (175 zonas): os formatos que aparecem lá. */
const ZONA_DO_CATALOGO: ZonaRegulatoria = {
  id: 'z1',
  zona: 'ZM 2',
  macroarea: 'Qualificação Urbana',
  ca_minimo: '0,25',
  ca_basico: '2²',
  ca_maximo: '3²',
  taxa_ocupacao_maxima: '0,8',
  taxa_permeabilidade_minima: 'N.A.¹',
  recuo_frente: '1,5',
  lei_referencia: 'LEI COMPLEMENTAR Nº 12, DE 2020',
  documento_fonte: 'Plano Diretor',
};

describe('a zona do catálogo, com notas de rodapé', () => {
  it('"3²" e "2²" viram 3 e 2 (com a nota 2 registrada); "N.A.¹" é não se aplica; CA mínimo lido', () => {
    const { valores, naoAplicados, notas } = lerZona(ZONA_DO_CATALOGO);
    expect([valores.coeficienteMax, valores.coeficienteBasico, valores.coeficienteMin, valores.taxaOcupacaoMax, valores.recuoMm.FRENTE]).toEqual([3, 2, 0.25, 80, 1500]);
    expect(valores.taxaPermeabilidadeMin).toBeNull();
    expect(notas).toEqual([
      { campo: 'taxa_permeabilidade_min', nota: '1' },
      { campo: 'coeficiente_max', nota: '2' },
      { campo: 'coeficiente_basico', nota: '2' },
    ]);
    // "N.A." continua nomeado (é o desenho do aviso: não informado ≠ não se aplica) — com o texto original.
    expect(naoAplicados).toEqual([{ campo: 'taxa_permeabilidade_min', textoOriginal: 'N.A.¹' }]);
  });

  it('os campos que a Planta pedia à mão chegam da zona; a área mínima da unidade também', () => {
    const { valores, naoAplicados } = lerZona({
      id: 'z2',
      testada_minima: '10',
      area_minima_lote: '250',
      insolacao_minima: '2 h',
      afastamento_progressivo: 'acima de 6 m: (H − 6)/10',
      recuo_frente_escalonado: '5 m a partir do 3º pavimento',
      area_minima_unidade: '45 m²',
    });
    expect(valores.testadaMinimaMm).toBe(10000);
    expect(valores.areaMinimaDoLoteM2).toBe(250);
    expect(valores.insolacaoMinimaH).toBe(2);
    expect(valores.afastamentoProgressivo?.aPartirDeM).toBe(6);
    expect(valores.recuoFrenteEscalonado).toEqual({ recuoMm: 5000, aPartirDoPavimento: 3 });
    expect(valores.areaMinimaUnidadeM2).toBe(45);
    expect(naoAplicados).toEqual([]);
  });

  it('a zona mudar o CA mínimo ou a área mínima da unidade é deriva', () => {
    const v = lerZona(ZONA_DO_CATALOGO).valores;
    const aplicados = { ...v, recuoMm: recuosDaZona(v) };
    expect(zonaDerivou(aplicados, {}, ZONA_DO_CATALOGO)).toBe(false);
    expect(zonaDerivou(aplicados, {}, { ...ZONA_DO_CATALOGO, ca_minimo: '0,5' })).toBe(true);
    expect(zonaDerivou(aplicados, {}, { ...ZONA_DO_CATALOGO, area_minima_unidade: '40' })).toBe(true);
    expect(zonaDerivou(aplicados, { coeficiente_min: 'MANUAL' }, { ...ZONA_DO_CATALOGO, ca_minimo: '0,5' })).toBe(false);
  });
});

describe('as conferências', () => {
  it('tipologias contra a área mínima da unidade: nomeia as que ficam abaixo', () => {
    const t = [{ nome: '1 dorm.', areaPrivativaM2: 38 }, { nome: '2 dorm.', areaPrivativaM2: 58 }];
    expect(conferirTipologias(t, { areaMinimaUnidadeM2: 45 })).toEqual([{ campo: 'area_minima_unidade', ok: false, texto: 'Unidade mínima 45,00 m²: 1 dorm. (38,00 m²) abaixo do mínimo.' }]);
    expect(conferirTipologias(t, { areaMinimaUnidadeM2: 30 })[0].ok).toBe(true);
    expect(conferirTipologias(t, { areaMinimaUnidadeM2: null })).toEqual([]);
  });

  it('a massa abaixo do CA mínimo é avisada (subutilização); acima, não', () => {
    let m: BlueprintModel = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
    m = applyBatch(m, [
      d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA'),
      { type: 'AddBloco', levelId: t, nome: 'Casa', pontos: [point(5000, 5000), point(15000, 5000), point(15000, 15000), point(5000, 15000)], pavimentos: 2 },
    ]).model;
    const medir = (coeficienteMin: number) => medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: { ...ZONA_DA_MASSA_VAZIA, coeficienteMin } });
    // Lote 1.200 m², 200 m² computáveis: CA 0,17. Mínimo 0,25 → faltam 100 m².
    expect(medir(0.25).avisos.join(' ')).toMatch(/Abaixo do CA mínimo 0,25: faltam 100,00 m² computáveis/);
    expect(medir(0.1).avisos.join(' ')).not.toMatch(/CA mínimo/);
  });
});

describe('a importação de planilha', () => {
  it('o MODELO baixado se mapeia sozinho: cada rótulo da tabela vira o seu campo', () => {
    const rotulos = ZONE_COLUMNS.map((c) => c.label);
    expect(suggestMapping(rotulos)).toEqual(ZONE_COLUMNS.map((c) => c.key));
  });

  it('cabeçalhos de prefeitura: lote × unidade, recuo escalonado × recuo de frente, os campos novos', () => {
    expect(suggestMapping(['Área mínima do lote', 'Área mínima', 'Recuo de frente escalonado', 'Recuo de frente', 'Testada mínima', 'Insolação', 'Afastamento lateral progressivo'])).toEqual([
      'area_minima_lote',
      'area_minima_unidade',
      'recuo_frente_escalonado',
      'recuo_frente',
      'testada_minima',
      'insolacao_minima',
      'afastamento_progressivo',
    ]);
  });
});
