/**
 * F12 do plano `2026-10-11-planta-recursos-video-synaps.md` — CÂMERA (kernel 0.99.0): o ponto de vista
 * no modelo, a lente em ângulo de visão, o cone da planta, o mundo do 3D e o tópico BCF em perspectiva.
 */
import { describe, expect, it } from 'vitest';
import { KernelError, applyCommand, canonicalPayload, cloneModel, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel } from '../utils/blueprintKernel';
import { cameraNoMundo3d, coneDaCamera, fovHorizontalGraus, fovVerticalGraus, topicoDaCamera } from '../utils/blueprintCamera';
import { viewpointDoTopico } from '../utils/blueprintBcf';

function base(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const comCamera = () => {
  const { m, t } = base();
  return applyCommand(m, { type: 'AddCamera', levelId: t, posicao: point(1000, 1000), alvo: point(5000, 1000) }).model;
};

describe('câmera — o kernel 0.99.0', () => {
  it('nasce com olho a 1,60 m, lente 24 mm e "Câmera 1"; sobrevive ao canônico', () => {
    const m = comCamera();
    expect(m.cameras).toHaveLength(1);
    expect(m.cameras![0]).toMatchObject({ alturaOlhoMm: 1600, focalMm: 24, nome: 'Câmera 1' });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m))).cameras![0];
    expect(volta).toMatchObject({ posicao: { x: 1000, y: 1000 }, alvo: { x: 5000, y: 1000 }, alturaOlhoMm: 1600, focalMm: 24, nome: 'Câmera 1' });
    expect(volta.uid).toBe(m.cameras![0].uid);
  });

  it('desenho SEM câmera não ganha chave no canônico', () => {
    expect(canonicalPayload(base().m)).not.toContain('cameras');
  });

  it('recusa: alvo = posição, olho fora da faixa, focal fora da faixa, nome vazio', () => {
    const { m, t } = base();
    const ruins = [
      { posicao: point(0, 0), alvo: point(0, 0) },
      { posicao: point(0, 0), alvo: point(1000, 0), alturaOlhoMm: 100 },
      { posicao: point(0, 0), alvo: point(1000, 0), focalMm: 5 },
      { posicao: point(0, 0), alvo: point(1000, 0), focalMm: 500 },
    ];
    for (const r of ruins) expect(() => applyCommand(m, { type: 'AddCamera', levelId: t, ...r }), JSON.stringify(r)).toThrow(KernelError);
    const c = comCamera();
    expect(() => applyCommand(c, { type: 'SetCameraProps', cameraId: c.cameras![0].id, nome: '   ' })).toThrow(KernelError);
  });

  it('editar, mover (TranslateEntities leva posição E alvo), apagar; apagar o pavimento leva as câmeras', () => {
    let m = comCamera();
    const id = m.cameras![0].id;
    m = applyCommand(m, { type: 'SetCameraProps', cameraId: id, focalMm: 35, alturaOlhoMm: 1200, nome: 'Sala — da varanda' }).model;
    expect(m.cameras![0]).toMatchObject({ focalMm: 35, alturaOlhoMm: 1200, nome: 'Sala — da varanda' });
    m = applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], cameraIds: [id], delta: point(500, -200) } as never).model;
    expect(m.cameras![0]).toMatchObject({ posicao: { x: 1500, y: 800 }, alvo: { x: 5500, y: 800 } });
    expect(applyCommand(m, { type: 'DeleteCamera', cameraId: id }).model.cameras).toEqual([]);
    // O kernel recusa remover o ÚNICO pavimento: põe um segundo antes.
    const doisNiveis = applyCommand(m, { type: 'AddLevel', name: 'Pav 1', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const semNivel = applyCommand(doisNiveis, { type: 'RemoveLevel', levelId: m.levels[0].id } as never).model;
    expect(semNivel.cameras ?? []).toEqual([]);
  });

  it('cloneModel copia posição e alvo a fundo', () => {
    const m = comCamera();
    const c = cloneModel(m);
    c.cameras![0].posicao.x = 9;
    expect(m.cameras![0].posicao.x).toBe(1000);
  });
});

describe('câmera — a lente, o cone e o 3D', () => {
  it('focal → ângulo: 24 mm = 73,7° na horizontal e 53,1° na vertical do 35 mm; tela 16:9 mantém o horizontal', () => {
    expect(fovHorizontalGraus(24)).toBeCloseTo(73.74, 1);
    expect(fovVerticalGraus(24)).toBeCloseTo(53.13, 1);
    expect(fovHorizontalGraus(50)).toBeCloseTo(39.6, 1);
    // Na tela 16:9, o vertical é menor e o horizontal continua o da lente.
    const v = fovVerticalGraus(24, 16 / 9);
    const hDeVolta = 2 * Math.atan(Math.tan((v * Math.PI) / 360) * (16 / 9)) * (180 / Math.PI);
    expect(hDeVolta).toBeCloseTo(fovHorizontalGraus(24), 6);
  });

  it('o cone abre o ângulo horizontal da lente, simétrico em torno da direção, até a distância do alvo', () => {
    const c = { posicao: point(0, 0), alvo: point(4000, 0), focalMm: 24 };
    const { esquerda, direita } = coneDaCamera(c);
    expect(Math.hypot(esquerda.x, esquerda.y)).toBeCloseTo(4000, 6);
    expect(esquerda.y).toBeCloseTo(-direita.y, 6);
    expect(((Math.atan2(esquerda.y, esquerda.x) - Math.atan2(direita.y, direita.x)) * 180) / Math.PI).toBeCloseTo(fovHorizontalGraus(24), 6);
  });

  it('no mundo do 3D: metros, Y = cota do piso + olho, Z = y do modelo; câmera nivelada', () => {
    const w = cameraNoMundo3d({ posicao: point(1000, 2000), alvo: point(5000, 2000), alturaOlhoMm: 1600 }, 3000);
    [1, 4.6, 2].forEach((v, i) => expect(w.posicao[i]).toBeCloseTo(v, 9));
    [5, 4.6, 2].forEach((v, i) => expect(w.alvo[i]).toBeCloseTo(v, 9));
  });

  it('BCF: a vista vira tópico com PerspectiveCamera (olho, direção, Z para cima, ângulo vertical); sem câmera, a ortogonal de sempre', () => {
    const m = comCamera();
    const t = topicoDaCamera(m.cameras![0], 0, 'g-1', 'eu', new Date('2026-10-12T12:00:00Z'));
    expect(t.titulo).toBe('Vista — Câmera 1');
    const xml = viewpointDoTopico(t).conteudo;
    expect(xml).toContain('<PerspectiveCamera>');
    expect(xml).not.toContain('<OrthogonalCamera>');
    expect(xml).toMatch(/<CameraViewPoint>\s*<X>1\.000000<\/X>\s*<Y>1\.000000<\/Y>\s*<Z>1\.600000<\/Z>/);
    expect(xml).toContain('<CameraDirection><X>1.000000</X><Y>0.000000</Y><Z>0.000000</Z></CameraDirection>');
    expect(xml).toContain('<CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector>');
    expect(xml).toContain(`<FieldOfView>${fovVerticalGraus(24).toFixed(2)}</FieldOfView>`);
    expect(xml.trim().endsWith('</VisualizationInfo>')).toBe(true);
    const { camera: _c, ...semCamera } = t;
    expect(viewpointDoTopico(semCamera).conteudo).toContain('<OrthogonalCamera>');
  });
});
