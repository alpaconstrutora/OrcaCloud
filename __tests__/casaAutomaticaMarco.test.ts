/**
 * O MARCO DAS CASAS DE REFERÊNCIA (etapa D1 da fase "itens 6 a 11" da casa automática, 11/11/2026 — plano
 * docs/planos/2026-11-11-casa-automatica-itens-6-a-11.md). A etapa D divide o motor (`blueprintCasaAutomatica.ts`, 3.674
 * linhas, quase tudo numa função) em arquivos por etapa SEM mudar nada no que ele gera. O motor é determinístico: as 8 casas
 * da sonda das fases anteriores (lotes, programas e padrões diferentes, térrea e sobrado) saem iguais byte a byte — o hash
 * do modelo da prévia, os ids criados e as pendências (com os locais). O fixture é gravado UMA vez, do `main` antes da
 * divisão (`GRAVAR_MARCO=1`), e não se regrava durante a etapa D: se a divisão mudar uma casa, este teste é quem diz.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, sha256, snapshotHash, stableStringify, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { planejarCasa, type EntradaDaCasa } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO, type PadraoDaCasa } from '../utils/blueprintPrograma';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { modelosDoCatalogo } from '../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { MATERIAIS_SEMENTE } from '../utils/blueprintMateriais';

const FIXTURE = new URL('./fixtures/casaAutomaticaMarco.json', import.meta.url);
const GRAVAR = process.env.GRAVAR_MARCO === '1';

/** largura,profundidade,dormitórios,suítes,banheiros,vagas,padrão,pavimentos — os casos da sonda (c:/tmp/f22/roda.sh). */
const CASOS = [
  '12000,30000,3,1,2,2,R1-N,1',
  '15000,25000,3,1,2,2,R1-N,1',
  '10000,30000,2,1,2,1,R1-N,1',
  '15000,30000,4,1,3,2,R1-N,1',
  '15000,30000,3,1,2,2,R1-B,1',
  '14000,28000,3,1,2,2,R1-A,1',
  '12000,30000,3,1,2,2,R1-N,2',
  '10000,30000,4,1,3,2,R1-N,1',
];

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';
function lote(w: number, d: number): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const dd = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
  return applyBatch(base, [dd(point(0, 0), point(w, 0), 'FRENTE'), dd(point(w, 0), point(w, d), 'LATERAL_DIREITA'), dd(point(w, d), point(0, d), 'FUNDOS'), dd(point(0, d), point(0, 0), 'LATERAL_ESQUERDA')]).model;
}
const RECUOS: Recuos = { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
const ZONA: ZonaDaMassa = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 };
const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const materiais = MATERIAIS_SEMENTE.map((m, i) => ({ ...m, id: `m${i}`, organizationId: 'o', active: true, createdAt: '', updatedAt: '' }));

/** O que o marco guarda de uma casa: hashes do que o motor gera e as contagens (para o erro dizer o que mudou). */
function marcoDaCasa(caso: string) {
  const [w, d, dorm, suites, banh, vagas, padrao, pav] = caso.split(',');
  const m = lote(Number(w), Number(d));
  const e = {
    levelId: m.levels[0].id,
    ctx: { terreno: medirTerreno(m.boundaries), limites: m.boundaries, recuosBase: RECUOS, zona: ZONA },
    curto: { ...PROGRAMA_CURTO_PADRAO, dormitorios: Number(dorm), suites: Number(suites), banheiros: Number(banh), vagas: Number(vagas), padrao: padrao as PadraoDaCasa, garagemCoberta: true },
    rotacaoNorteDeg: null,
    latitudeGraus: -19.9,
    hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
    modelosDeClimatizacao: modelos,
    climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
    cargaDaClimatizacao: { materiais, cidadeDoContexto: null },
  } as EntradaDaCasa;
  const p = planejarCasa(m, e, { pavimentos: Number(pav) as 1 | 2 });
  return {
    resultado: snapshotHash(p.resultado),
    criados: sha256(p.criados.join(',')),
    pendencias: sha256(stableStringify(p.pendencias)),
    etapas: sha256(stableStringify(p.etapas)),
    comandos: p.comandos.length,
    nCriados: p.criados.length,
    nPendencias: p.pendencias.length,
  };
}

describe('marco das casas de referência (etapa D)', () => {
  const gravado: Record<string, ReturnType<typeof marcoDaCasa>> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
  for (const caso of CASOS) {
    it(
      caso,
      () => {
        const agora = marcoDaCasa(caso);
        if (GRAVAR) {
          const atual = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
          writeFileSync(FIXTURE, JSON.stringify({ ...atual, [caso]: agora }, null, 2) + '\n');
          return;
        }
        expect(gravado[caso], `sem marco gravado para ${caso} — grave com GRAVAR_MARCO=1 a partir do main`).toBeDefined();
        expect(agora).toEqual(gravado[caso]);
      },
      300_000,
    );
  }
});
