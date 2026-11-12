/**
 * Etapa C da fase "itens 6 a 11" da casa automática (11/11/2026): as pendências que nascem de elementos (rede, conflito,
 * legislação, circuito, shaft) levam os LOCAIS — pavimento, ids e ponto —, e todo local aponta para o desenho da prévia.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { planejarCasa, type EntradaDaCasa } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';
import { PREMISSAS_DA_CASA_PADRAO, hipotesesDasPremissas } from '../utils/blueprintPremissasDaCasa';
import { centroDoElemento } from '../utils/blueprintLocalDaPendencia';

// A casa inteira: ~1–2 s nesta máquina; a CI, disputando CPU, mais.
vi.setConfig({ testTimeout: 120_000 });

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';

/** Lote 12 × 30 m, frente ao sul (ou ao norte), girado de `graus` em torno da origem. */
function lote(graus = 0, frenteAoNorte = false): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const c = Math.cos((graus * Math.PI) / 180);
  const s = Math.sin((graus * Math.PI) / 180);
  const g = (x: number, y: number): Point => (graus === 0 ? point(x, y) : point(Math.round(x * c - y * s), Math.round(x * s + y * c)));
  const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
  const [sul, norte]: Papel[] = frenteAoNorte ? ['FUNDOS', 'FRENTE'] : ['FRENTE', 'FUNDOS'];
  const [leste, oeste]: Papel[] = frenteAoNorte ? ['LATERAL_ESQUERDA', 'LATERAL_DIREITA'] : ['LATERAL_DIREITA', 'LATERAL_ESQUERDA'];
  return applyBatch(base, [d(g(0, 0), g(12000, 0), sul), d(g(12000, 0), g(12000, 30000), leste), d(g(12000, 30000), g(0, 30000), norte), d(g(0, 30000), g(0, 0), oeste)]).model;
}

const RECUOS: Recuos = { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
const ZONA: ZonaDaMassa = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 };

function entrada(m: BlueprintModel, mudanca: Partial<EntradaDaCasa> = {}): EntradaDaCasa {
  return {
    levelId: m.levels[0].id,
    ctx: { terreno: medirTerreno(m.boundaries), limites: m.boundaries, recuosBase: RECUOS, zona: ZONA },
    curto: PROGRAMA_CURTO_PADRAO,
    rotacaoNorteDeg: null,
    latitudeGraus: -19.9,
    ...mudanca,
  };
}


describe('locais das pendências da casa', () => {
  it('a casa 12×30 do teste: pendência de rede ou conflito com local; todo local no desenho da prévia; texto sem local segue texto', () => {
    const m0 = lote();
    const plano = planejarCasa(m0, entrada(m0), hipotesesDasPremissas(PREMISSAS_DA_CASA_PADRAO));
    const comLocal = plano.pendencias.filter((p) => p.locais?.length);
    expect(comLocal.length).toBeGreaterThan(0);
    const niveis = new Set(plano.resultado.levels.map((l) => l.id));
    for (const p of comLocal) {
      for (const l of p.locais!) {
        expect(niveis.has(l.levelId), `${p.texto}: pavimento ${l.levelId}`).toBe(true);
        expect(l.ids.length, p.texto).toBeGreaterThan(0);
        expect(l.ponto, p.texto).not.toBeNull();
        // Ao menos um dos ids existe no desenho da prévia (é o que o editor seleciona depois de lançar).
        expect(l.ids.some((id) => centroDoElemento(plano.resultado, id)), `${p.texto}: ids ${l.ids.join(',')}`).toBe(true);
      }
    }
    // As de premissa (sem elemento) continuam só texto — menos a do forro, que nomeia os cômodos.
    expect(plano.pendencias.filter((p) => p.grupo === 'PREMISSA' && !/^Forro:/.test(p.texto)).every((p) => !p.locais)).toBe(true);
  });

  // 12/11/2026 (plano 2026-11-12-casa-automatica-pendencias.md, P1): os tipos que passaram a ter local — o elemento é
  // garantido pela origem (o ambiente do mobiliário, do forro e da relação; o trecho e o cômodo da prumada; a borda do muro).
  const EXIGE_LOCAL = /^(Mobiliário: |Prumada pelo meio do cômodo: |Forro: pé-direito livre abaixo|Programa: .+ × .+ — |Terraplenagem: muro de arrimo)/;
  for (const pav of [1, 2] as const) {
    it(`P1 (${pav === 1 ? 'térrea' : 'sobrado'} 12×30): mobiliário, prumada, forro, relação e muro de arrimo levam local quando aparecem`, () => {
      const m0 = lote();
      const plano = planejarCasa(m0, entrada(m0), { ...hipotesesDasPremissas(PREMISSAS_DA_CASA_PADRAO), pavimentos: pav });
      const exigidas = plano.pendencias.filter((p) => EXIGE_LOCAL.test(p.texto));
      for (const p of exigidas) expect(p.locais?.length ?? 0, p.texto).toBeGreaterThan(0);
    });
  }
});
