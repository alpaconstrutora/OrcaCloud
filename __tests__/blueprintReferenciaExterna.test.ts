/**
 * E10.4b do roadmap de climatização (08/10/2026): o IFC EXTERNO como referência
 * no 3D. A prova que importa é a do lugar: o IFC exportado pela própria Planta,
 * lido pelo `carregarIfc` (o web-ifc de verdade) e posto pela
 * `matrizDaReferencia`, tem de cair EM CIMA do desenho — senão quem coordena vê
 * o estrutural deslocado e "acha" conflito que não existe (ou não vê o que existe).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { aplicarMatriz, chaveDasReferencias, lerReferencias, matrizDaReferencia, referenciaNova } from '../utils/blueprintReferenciaExterna';

const OPC = { titulo: 'Referência', revisao: 1, hash: 'r'.repeat(64), data: new Date('2026-10-08T12:00:00Z') };

/** Duas paredes em L a partir da origem: uma em +x (4 m), outra em +y (3 m). */
function emL(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  return applyBatch(m, [
    { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 } as Command,
    { type: 'AddWall', levelId: t, a: point(0, 0), b: point(0, 3000), thicknessMm: 150, heightMm: 2800 } as Command,
  ]).model;
}

async function caixaDaReferencia(model: BlueprintModel, ref: Parameters<typeof matrizDaReferencia>[0]) {
  const { carregarIfc, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
  usarCaminhoDoWasm('');
  const bytes = new TextEncoder().encode(gerarIfc(model, OPC));
  const carregado = await carregarIfc(bytes.buffer as ArrayBuffer, THREE);
  carregado.grupo.applyMatrix4(new THREE.Matrix4().fromArray(matrizDaReferencia(ref)));
  carregado.grupo.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(carregado.grupo);
  carregado.liberar();
  return caixa;
}

const PARADO = { deslocamentoXMm: 0, deslocamentoYMm: 0, cotaMm: 0, rotacaoDeg: 0 };

describe('E10.4b · a matriz da referência (sem THREE)', () => {
  it('o y do IFC (−Z no web-ifc) volta a +Z, que é onde o viewer põe o y da planta', () => {
    // Um ponto do IFC em (x=1, y=2, z=0.5) chega do web-ifc como (1, 0.5, −2).
    expect(aplicarMatriz(matrizDaReferencia(PARADO), [1, 0.5, -2])).toEqual([1, 0.5, 2]);
  });
  it('giro anti-horário de 90°: o x da planta vira y (+Z); deslocamento e cota saem de mm para m', () => {
    const p = aplicarMatriz(matrizDaReferencia({ deslocamentoXMm: 10000, deslocamentoYMm: -2000, cotaMm: 3000, rotacaoDeg: 90 }), [1, 0, 0]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(3, 9);
    expect(p[2]).toBeCloseTo(-1, 9);
  });
});

describe('E10.4b · o IFC da Planta cai em cima da Planta', () => {
  it('sem deslocamento: a caixa do IFC lido é a das duas paredes no mundo do viewer (y da planta em +Z)', async () => {
    const c = await caixaDaReferencia(emL(), PARADO);
    expect(c.min.x).toBeCloseTo(-0.075, 2);
    expect(c.max.x).toBeCloseTo(4, 1);
    expect(c.min.z).toBeCloseTo(-0.075, 2);
    expect(c.max.z).toBeCloseTo(3, 1);
    expect(c.min.y).toBeCloseTo(0, 2);
    expect(c.max.y).toBeCloseTo(2.8, 2);
  });

  it('deslocada 10 m em x e girada 90°: a parede de 4 m passa a correr em +Z, a partir de x = 10', async () => {
    const c = await caixaDaReferencia(emL(), { deslocamentoXMm: 10000, deslocamentoYMm: 0, cotaMm: 0, rotacaoDeg: 90 });
    // A parede de +x (4 m) vira +Z; a de +y (3 m) vira −X.
    expect(c.max.z).toBeCloseTo(4, 1);
    expect(c.min.x).toBeCloseTo(7, 1);
    expect(c.max.x).toBeCloseTo(10.075, 2);
  });
});

describe('E10.4b · a referência mora fora do modelo', () => {
  it('não entra no hash: o modelo e a referência não se tocam', () => {
    const m = emL();
    const antes = snapshotHash(m);
    const refs = [referenciaNova({ id: 'df_1', nome: 'Estrutural', storagePath: 'org/proj/estrutural.ifc' })];
    expect(refs[0]).toMatchObject({ visivel: true, opacidade: 0.6 });
    expect(snapshotHash(m)).toBe(antes);
    expect(chaveDasReferencias('std_9')).toBe('blueprint:referenciasExternas:std_9');
  });

  it('a leitura do navegador não confia no guardado: sem arquivo some, repetido some, número estragado volta ao padrão', () => {
    const lidas = lerReferencias([
      { arquivoId: 'a', storagePath: 'p/a.ifc', nome: 'A', visivel: false, deslocamentoXMm: 12.4, opacidade: 7 },
      { arquivoId: 'a', storagePath: 'p/a.ifc' },
      { storagePath: 'p/sem-id.ifc' },
      { arquivoId: 'b', storagePath: 'p/b.ifc', rotacaoDeg: 'x', opacidade: 0 },
      null,
    ]);
    expect(lidas.map((r) => r.arquivoId)).toEqual(['a', 'b']);
    expect(lidas[0]).toMatchObject({ visivel: false, deslocamentoXMm: 12, opacidade: 1 });
    expect(lidas[1]).toMatchObject({ nome: 'Modelo IFC', visivel: true, rotacaoDeg: 0, opacidade: 0.05 });
    expect(lerReferencias('lixo')).toEqual([]);
  });
});
