/**
 * A GEORREFERÊNCIA — onde o desenho fica no mundo (07/09/2026).
 *
 * ─── POR QUE PRECISOU DE CAMPO NOVO ─────────────────────────────────────────
 *
 * Procurado em todo o sistema antes de decidir: `latitude`/`longitude` existem
 * em Market Intelligence e nas cidades do Dados Mestres, e **nada** ligado ao
 * estudo de planta nem ao terreno. Georreferenciar não era emitir o que já se
 * sabia — era passar a saber.
 *
 * ─── O ERRO QUE ESTES CASOS IMPEDEM ─────────────────────────────────────────
 *
 * Todos os defeitos possíveis aqui têm a mesma assinatura: o modelo aparece
 * LONGE do lugar, com a forma perfeita. Trocar latitude com longitude põe o
 * prédio no oceano; escrever grau decimal onde a norma quer grau/minuto/segundo
 * erra por um fator de 60; calcular UTM com o fuso errado joga o modelo
 * centenas de quilômetros para o lado. Nada disso faz a planta parecer errada.
 */
import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type Georreferencia,
} from '../utils/blueprintKernel';
import { gerarIfc, grausCompostos, grausDecimais } from '../utils/blueprintIfc';

/** Um ponto real do interior paulista — hemisfério sul, a oeste de Greenwich. */
const CAMBUI: Georreferencia = {
  latitude: -22.6136,
  longitude: -46.0578,
  elevacaoM: 745.2,
  rotacaoNorteDeg: 30,
};

const OPC = {
  titulo: 'Casa',
  revisao: 1,
  hash: 'a'.repeat(64),
  data: new Date('2026-09-07T12:00:00Z'),
};

function casa(geo?: Georreferencia | null): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const m = applyCommand(base, {
    type: 'AddWall',
    levelId: base.levels[0].id,
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 150,
    heightMm: 2800,
  }).model;
  if (geo === undefined) return m;
  return applyCommand(m, { type: 'SetGeorreferencia', georreferencia: geo }).model;
}

describe('georreferência · grau decimal ↔ grau/minuto/segundo', () => {
  it('a conversão é EXATA na ida e volta', () => {
    // Escrever o grau decimal direto no `IfcCompoundPlaneAngleMeasure` erraria
    // por um fator de 60 — e −22,61 viraria −22°61', que nem existe.
    for (const g of [-22.6136, -46.0578, 0, 45.5, -0.0001, 89.999999]) {
      expect(grausDecimais(grausCompostos(g))).toBeCloseTo(g, 9);
    }
  });

  it('TODOS os componentes carregam o sinal', () => {
    // ⚠️ É o que a norma exige, e é onde este produto vive: no hemisfério sul e
    // a oeste de Greenwich os quatro saem negativos. Um leitor que some
    // componentes de sinais mistos põe o modelo do outro lado do equador.
    const [g, m, seg, mi] = grausCompostos(-22.6136);
    expect(g).toBeLessThan(0);
    expect(m).toBeLessThanOrEqual(0);
    expect(seg).toBeLessThanOrEqual(0);
    expect(mi).toBeLessThanOrEqual(0);
    expect(g).toBe(-22);
  });

  it('grau inteiro não gera minuto nem segundo', () => {
    expect(grausCompostos(-23)).toEqual([-23, 0, 0, 0]);
  });
});

describe('georreferência · o kernel', () => {
  it('desenho SEM lugar não muda de forma canônica', () => {
    // É o que mantém o acervo inteiro válido: a chave não aparece, então o
    // payload de todo desenho que não foi georreferenciado continua o que era.
    const payload = JSON.parse(canonicalPayload(casa()));
    expect('georreferencia' in payload).toBe(false);
    expect(payload.kernel).toBe(KERNEL_VERSION);
  });

  it('a coordenada MUDA o hash — é conteúdo, não metadado', () => {
    // Mudar onde a obra fica muda o que o desenho afirma. Mesmo argumento de
    // `areaEscrituraMm2`.
    expect(snapshotHash(casa(CAMBUI))).not.toBe(snapshotHash(casa()));
  });

  it('sobrevive à ida e volta pelo payload', () => {
    const volta = modelFromCanonicalPayload(JSON.parse(canonicalPayload(casa(CAMBUI))));
    expect(volta.georreferencia).toEqual({
      latitude: -22.6136,
      longitude: -46.0578,
      elevacaoM: 745.2,
      rotacaoNorteDeg: 30,
      projetada: null,
    });
  });

  it('campo interno AUSENTE não vira `null` no payload', () => {
    // Senão dois desenhos iguais teriam formas canônicas diferentes conforme
    // por qual caminho a georreferência foi gravada — e hashes diferentes.
    const so = casa({ latitude: -22.6136, longitude: -46.0578 });
    const comNulos = casa({
      latitude: -22.6136,
      longitude: -46.0578,
      elevacaoM: null,
      rotacaoNorteDeg: null,
      projetada: null,
    });
    // ⚠️ Comparar os payloads INTEIROS não serve: `casa` constrói o modelo de
    // novo e o `uid` nasce aleatório, então a seção `identity` sempre difere.
    // O hash é a comparação certa — ele não inclui identidade — e a seção da
    // georreferência é o que a afirmação é de fato sobre.
    expect(JSON.parse(canonicalPayload(so)).georreferencia).toEqual({
      latitude: -22.6136,
      longitude: -46.0578,
    });
    expect(JSON.parse(canonicalPayload(so)).georreferencia).toEqual(
      JSON.parse(canonicalPayload(comNulos)).georreferencia,
    );
    expect(snapshotHash(so)).toBe(snapshotHash(comNulos));
  });

  it('`null` tira a georreferência', () => {
    const sem = applyCommand(casa(CAMBUI), {
      type: 'SetGeorreferencia',
      georreferencia: null,
    }).model;
    expect(sem.georreferencia).toBeNull();
    expect(snapshotHash(sem)).toBe(snapshotHash(casa()));
  });

  it('coordenada FORA DO PLANETA é recusada, não corrigida', () => {
    // O jeito comum de chegar aqui é trocar latitude com longitude: −46 de
    // latitude existe, mas 46 de longitude no lugar dela não dispara nada. A
    // faixa pega o caso em que o valor sozinho já é impossível; trocar de volta
    // por conta própria seria adivinhar.
    const ruim = (g: Partial<Georreferencia>) => () =>
      applyCommand(casa(), {
        type: 'SetGeorreferencia',
        georreferencia: { latitude: 0, longitude: 0, ...g },
      });
    expect(ruim({ latitude: 91 })).toThrow(/Latitude/);
    expect(ruim({ latitude: -90.1 })).toThrow(/Latitude/);
    expect(ruim({ longitude: 181 })).toThrow(/Longitude/);
    expect(ruim({ latitude: Number.NaN })).toThrow(/Latitude/);
  });

  it('coordenada projetada SEM o sistema é recusada', () => {
    // O pior dos casos: o número existe e ninguém sabe de que sistema é.
    expect(() =>
      applyCommand(casa(), {
        type: 'SetGeorreferencia',
        georreferencia: {
          latitude: -22.6,
          longitude: -46,
          projetada: { lesteM: 300000, norteM: 7500000, crs: '  ' },
        },
      }),
    ).toThrow(/CRS/);
  });
});

describe('georreferência · o IFC', () => {
  const linhaDe = (ifc: string, entidade: string) =>
    ifc.split('\n').find((l) => new RegExp(`= ?${entidade}\\(`).test(l));

  it('sem lugar informado, o arquivo não menciona coordenada nenhuma', () => {
    // Emitir zero seria afirmar que a obra fica no golfo da Guiné.
    const ifc = gerarIfc(casa(), OPC);
    expect(linhaDe(ifc, 'IFCMAPCONVERSION')).toBeUndefined();
    expect(linhaDe(ifc, 'IFCPROJECTEDCRS')).toBeUndefined();
    expect(linhaDe(ifc, 'IFCSITE')).toContain('.ELEMENT.,$,$,$,$,$');
  });

  it('lat/long saem no IfcSite em grau, minuto, segundo', () => {
    const ifc = gerarIfc(casa(CAMBUI), OPC);
    const site = linhaDe(ifc, 'IFCSITE')!;
    expect(site).toContain(`(${grausCompostos(-22.6136).join(',')})`);
    expect(site).toContain(`(${grausCompostos(-46.0578).join(',')})`);
    // A elevação vai em MILÍMETRO, como todo comprimento do arquivo.
    expect(site).toContain('745200.');
  });

  it('o NORTE VERDADEIRO vai no contexto geométrico', () => {
    // Sem ele, dois modelos se sobrepõem no lugar certo e apontando para
    // direções diferentes — insolação e sombra saem erradas.
    const ifc = gerarIfc(casa(CAMBUI), OPC);
    const contexto = linhaDe(ifc, 'IFCGEOMETRICREPRESENTATIONCONTEXT')!;
    expect(contexto).not.toContain(',$)');
    // 30° → (sen 30, cos 30) = (0,5 ; 0,866).
    const direcoes = ifc.split('\n').filter((l) => /= ?IFCDIRECTION\(\(0\.5/.test(l));
    expect(direcoes.length).toBeGreaterThan(0);
  });

  it('sem rotação declarada, o contexto não afirma um norte', () => {
    const ifc = gerarIfc(casa({ latitude: -22.6, longitude: -46 }), OPC);
    expect(linhaDe(ifc, 'IFCGEOMETRICREPRESENTATIONCONTEXT')).toContain(',$)');
  });

  it('IfcMapConversion SÓ sai com coordenada projetada — nunca calculada', () => {
    // ⚠️ O caso mais importante deste arquivo. Converter lat/long para UTM
    // depende do fuso, e errar o fuso põe o modelo a centenas de quilômetros do
    // lugar com a forma perfeita. Com lat/long apenas, não sai conversão.
    expect(linhaDe(gerarIfc(casa(CAMBUI), OPC), 'IFCMAPCONVERSION')).toBeUndefined();

    const comTopografo = gerarIfc(
      casa({ ...CAMBUI, projetada: { lesteM: 288123.45, norteM: 7497654.32, crs: 'EPSG:31983' } }),
      OPC,
    );
    const conv = linhaDe(comTopografo, 'IFCMAPCONVERSION')!;
    expect(conv).toContain('288123.45');
    expect(conv).toContain('7497654.32');
    // Escala 0,001: o desenho está em milímetro e o mapa, em metro. Sem isso o
    // prédio nasce mil vezes maior, no lugar certo.
    expect(conv).toContain('0.001');
    expect(linhaDe(comTopografo, 'IFCPROJECTEDCRS')).toContain("'EPSG:31983'");
  });

  it('duas exportações do mesmo modelo dão o mesmo arquivo', () => {
    const m = casa({ ...CAMBUI, projetada: { lesteM: 1, norteM: 2, crs: 'EPSG:31983' } });
    expect(gerarIfc(m, OPC)).toBe(gerarIfc(m, OPC));
  });
});
