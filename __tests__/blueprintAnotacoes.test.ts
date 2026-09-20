/**
 * Anotações (19/09/2026, E8.1): comandos e invariantes (kernel 0.45.0), vista
 * por pavimento/corte/elevação com o corte levando as suas ao ser apagado,
 * canônico ida e volta por índice de vista, geometria pura (seta, hachura,
 * cota angular derivada, distância para seleção) e as saídas PDF e DXF.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  rotuloCurto,
  snapshotHash,
  type Anotacao,
  type Command,
} from '../utils/blueprintKernel';
import { anotacoesDaVista, cotaAngularDesenhada, distanciaAAnotacao, linhasDaHachura, pontaDaSeta, resumirAnotacoes, tracejadoMm } from '../utils/blueprintAnotacoes';
import { DesenhistaDeProva, desenharAnotacoes, desenharPlanta, enquadrar, PAPEIS } from '../utils/blueprintExport';
import { gerarDxf } from '../utils/blueprintDxf';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddCorte', a: point(-500, 1500), b: point(4500, 1500), lado: 'ESQUERDA', rotulo: 'AA' } as Command).model;
  return { m, t, corteId: m.sections[0].id };
}

describe('anotações (E8.1)', () => {
  it('comandos: texto padrão, altura 250, hachura DIAGONAL, giro normalizado; mover desloca; apagar; invariantes recusam pontos de menos, texto vazio, hachura fora da hachura, vista inexistente', () => {
    expect(KERNEL_VERSION).toMatch(/^blueprint-kernel-ts-0\.(4[5-9]|[5-9][0-9])\.\d+$/);
    const { m, t, corteId } = casa();
    let r = applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'TEXTO', pontos: [point(1000, 1000)], rotacaoGraus: 450 });
    const a = r.model.anotacoes[0];
    expect(a).toMatchObject({ tipo: 'TEXTO', texto: 'Texto', alturaMm: 250, traco: 'CONTINUO', hachura: null, rotacaoGraus: 90, cor: null });
    expect(rotuloCurto(a.uid, 'anotacao')).toMatch(/^A-/);
    r = applyCommand(r.model, { type: 'SetAnotacaoProps', anotacaoId: a.id, texto: '  Sala de estar  ', alturaMm: 300, traco: 'TRACEJADO', cor: '#ff0000' });
    expect(r.model.anotacoes[0]).toMatchObject({ texto: 'Sala de estar', alturaMm: 300, traco: 'TRACEJADO', cor: '#ff0000' });
    r = applyCommand(r.model, { type: 'MoveAnotacao', anotacaoId: a.id, dx: 100, dy: -100 });
    expect(r.model.anotacoes[0].pontos).toEqual([point(1100, 900)]);
    r = applyCommand(r.model, { type: 'DeleteAnotacao', anotacaoId: a.id });
    expect(r.model.anotacoes).toEqual([]);
    // Hachura nasce DIAGONAL; corte e elevação são vistas válidas.
    const h = applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'CORTE', corteId }, tipo: 'HACHURA', pontos: [point(0, 0), point(1000, 0), point(1000, 1000)] }).model.anotacoes[0];
    expect(h.hachura).toBe('DIAGONAL');
    expect(applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'ELEVACAO', direcao: 'FRENTE' }, tipo: 'LINHA', pontos: [point(0, 0), point(1000, 0)] }).model.anotacoes[0].vista).toEqual({ tipo: 'ELEVACAO', direcao: 'FRENTE' });
    // Recusas.
    expect(() => applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'LEADER', pontos: [point(0, 0)] })).toThrow(/pede 2 ponto/);
    expect(() => applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'COTA_ANGULAR', pontos: [point(0, 0), point(1, 0)] })).toThrow(/pede 3 ponto/);
    const comTexto = applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'TEXTO', pontos: [point(0, 0)] }).model;
    expect(() => applyCommand(comTexto, { type: 'SetAnotacaoProps', anotacaoId: comTexto.anotacoes[0].id, texto: '   ' })).toThrow(/sem texto/);
    expect(() => applyCommand(comTexto, { type: 'SetAnotacaoProps', anotacaoId: comTexto.anotacoes[0].id, hachura: 'CRUZADA' })).toThrow(/só na região hachurada/);
    expect(() => applyCommand(comTexto, { type: 'SetAnotacaoProps', anotacaoId: comTexto.anotacoes[0].id, cor: 'vermelho' })).toThrow(/#rrggbb/);
    expect(() => applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: 'lvl_x' }, tipo: 'TEXTO', pontos: [point(0, 0)] })).toThrow(/pavimento inexistente/);
    expect(() => applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'CORTE', corteId: 'sec_x' }, tipo: 'TEXTO', pontos: [point(0, 0)] })).toThrow(/corte inexistente/);
  });

  it('a vista manda: RemoveLevel leva as da planta; DeleteCorte leva as do corte; a elevação fica; `anotacoesDaVista` filtra', () => {
    const { m, t, corteId } = casa();
    let model = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const sup = model.levels[1].id;
    model = applyBatch(model, [
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'TEXTO', pontos: [point(0, 0)], texto: 'térreo' },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: sup }, tipo: 'TEXTO', pontos: [point(0, 0)], texto: 'superior' },
      { type: 'AddAnotacao', vista: { tipo: 'CORTE', corteId }, tipo: 'LINHA', pontos: [point(0, 0), point(1000, 0)] },
      { type: 'AddAnotacao', vista: { tipo: 'ELEVACAO', direcao: 'FRENTE' }, tipo: 'LINHA', pontos: [point(0, 0), point(1000, 0)] },
    ]).model;
    expect(anotacoesDaVista(model, { tipo: 'PLANTA', levelId: t }).map((a) => a.texto)).toEqual(['térreo']);
    expect(resumirAnotacoes(model)).toEqual({ total: 4, porTipo: { TEXTO: 2, LEADER: 0, LINHA: 2, HACHURA: 0, COTA_ANGULAR: 0 }, vistas: 4 });
    const semSup = applyCommand(model, { type: 'RemoveLevel', levelId: sup }).model;
    expect(semSup.anotacoes.map((a) => a.vista.tipo)).toEqual(['PLANTA', 'CORTE', 'ELEVACAO']);
    const semCorte = applyCommand(semSup, { type: 'DeleteCorte', corteId }).model;
    expect(semCorte.anotacoes.map((a) => a.vista.tipo)).toEqual(['PLANTA', 'ELEVACAO']);
  });

  it('canônico: chave só com anotação; vista por índice (pavimento, corte, direção); ida e volta preserva tudo; hash estável', () => {
    const { m, t, corteId } = casa();
    expect(JSON.parse(canonicalPayload(m)).anotacoes).toBeUndefined();
    expect(JSON.parse(canonicalPayload(m)).identity.anotacoes).toEqual([]);
    const com = applyBatch(m, [
      { type: 'AddAnotacao', vista: { tipo: 'ELEVACAO', direcao: 'FUNDOS' }, tipo: 'LEADER', pontos: [point(500, 500), point(1500, 1200)], texto: 'ver detalhe' },
      { type: 'AddAnotacao', vista: { tipo: 'CORTE', corteId }, tipo: 'HACHURA', pontos: [point(0, 0), point(800, 0), point(800, 600)], hachura: 'CRUZADA', texto: 'demolir' },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'COTA_ANGULAR', pontos: [point(0, 0), point(1000, 0), point(0, 1000)], cor: '#123456' },
    ]).model;
    const payload = JSON.parse(canonicalPayload(com));
    expect(payload.anotacoes.map((a: { vista: { tipo: string } }) => a.vista.tipo)).toEqual(['PLANTA', 'CORTE', 'ELEVACAO']); // planta < corte < elevação
    expect(payload.anotacoes[0]).toMatchObject({ vista: { tipo: 'PLANTA', level: 0 }, tipo: 'COTA_ANGULAR', texto: null, hachura: null, cor: '#123456' });
    expect(payload.anotacoes[1]).toMatchObject({ vista: { tipo: 'CORTE', corte: 0 }, tipo: 'HACHURA', hachura: 'CRUZADA', texto: 'demolir' });
    expect(payload.anotacoes[2]).toMatchObject({ vista: { tipo: 'ELEVACAO', direcao: 'FUNDOS' }, tipo: 'LEADER', texto: 'ver detalhe' });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com)));
    expect(snapshotHash(volta)).toBe(snapshotHash(com));
    expect(volta.anotacoes.find((a) => a.tipo === 'HACHURA')?.vista).toEqual({ tipo: 'CORTE', corteId: volta.sections[0].id });
    expect(volta.anotacoes.map((a) => a.uid).sort()).toEqual(com.anotacoes.map((a) => a.uid).sort());
  });

  it('geometria: seta proporcional ao texto, hachura só dentro do polígono (diagonal/cruzada/pontos, sólida vazia), cota angular derivada pelo arco menor, distância para seleção', () => {
    const [w1, w2] = pontaDaSeta(point(0, 0), point(1000, 0), 250);
    expect(w1.x).toBe(775);
    expect(w2.x).toBe(775);
    expect(Math.abs(w1.y)).toBe(Math.abs(w2.y));
    expect(w1.y).not.toBe(w2.y);
    const quadrado = [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)];
    const diag = linhasDaHachura(quadrado, 'DIAGONAL', 250);
    expect(diag.length).toBeGreaterThan(3);
    for (const [p, q] of diag) {
      for (const v of [p, q]) {
        expect(v.x).toBeGreaterThanOrEqual(-1);
        expect(v.x).toBeLessThanOrEqual(1001);
        expect(v.y).toBeGreaterThanOrEqual(-1);
        expect(v.y).toBeLessThanOrEqual(1001);
      }
      expect(Math.abs(Math.abs(q.x - p.x) - Math.abs(q.y - p.y))).toBeLessThanOrEqual(2); // 45°
    }
    expect(linhasDaHachura(quadrado, 'CRUZADA', 250).length).toBeGreaterThan(diag.length);
    expect(linhasDaHachura(quadrado, 'PONTOS', 250).length).toBeGreaterThan(9);
    expect(linhasDaHachura(quadrado, 'SOLIDA', 250)).toEqual([]);
    const cota = { id: 'x', uid: 'u', vista: { tipo: 'PLANTA', levelId: 'l' }, tipo: 'COTA_ANGULAR', pontos: [point(0, 0), point(1000, 0), point(0, 1000)], texto: null, alturaMm: 250, traco: 'CONTINUO', hachura: null, rotacaoGraus: 0, cor: null } as Anotacao;
    const c = cotaAngularDesenhada(cota)!;
    expect(c.graus).toBeCloseTo(90, 6);
    expect(c.rotulo).toBe('90°');
    expect(c.raioMm).toBe(600);
    expect(c.arco[0]).toEqual(point(600, 0));
    expect(c.arco[c.arco.length - 1]).toEqual(point(0, 600));
    expect(cotaAngularDesenhada({ ...cota, pontos: [point(0, 0), point(1000, 0), point(-1000, 1)] })!.graus).toBeCloseTo(179.94, 1);
    expect(cotaAngularDesenhada({ ...cota, pontos: [point(0, 0), point(0, 0), point(1, 1)] })).toBeNull();
    // Distância: texto pela caixa; linha pelo segmento; hachura dentro = 0.
    const texto = { ...cota, tipo: 'TEXTO', pontos: [point(0, 0)], texto: 'Sala' } as Anotacao;
    expect(distanciaAAnotacao(texto, point(300, 100))).toBe(0);
    expect(distanciaAAnotacao(texto, point(300, 1000))).toBeGreaterThan(700);
    const linha = { ...cota, tipo: 'LINHA', pontos: [point(0, 0), point(1000, 0)] } as Anotacao;
    expect(distanciaAAnotacao(linha, point(500, 40))).toBe(40);
    const hach = { ...cota, tipo: 'HACHURA', pontos: quadrado, hachura: 'DIAGONAL' } as Anotacao;
    expect(distanciaAAnotacao(hach, point(500, 500))).toBe(0);
    expect(tracejadoMm('TRACEJADO', 250)).toEqual([250, 125]);
    expect(tracejadoMm('CONTINUO', 250)).toEqual([]);
  });

  it('PDF: a planta desenha texto, leader (com a ponta preenchida), hachura e o rótulo da cota; a altura do texto é a do modelo dividida pela escala (mín. 1,5 mm); DXF: camada PLANTA-ANOTACOES com TEXT/LINE/POLYLINE e o bloco do corte leva as suas', () => {
    const { m, t, corteId } = casa();
    const com = applyBatch(m, [
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'TEXTO', pontos: [point(500, 500)], texto: 'Sala', alturaMm: 500 },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'LEADER', pontos: [point(100, 100), point(1500, 1500)], texto: 'ver detalhe 1' },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'HACHURA', pontos: [point(2000, 500), point(3000, 500), point(3000, 1500)], hachura: 'DIAGONAL', texto: 'demolir' },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'COTA_ANGULAR', pontos: [point(0, 0), point(4000, 0), point(0, 3000)] },
      { type: 'AddAnotacao', vista: { tipo: 'CORTE', corteId }, tipo: 'TEXTO', pontos: [point(1000, 1000)], texto: 'no corte' },
    ]).model;
    const A3 = PAPEIS[1];
    const opcoes = { denominador: 100, papel: A3, titulo: 'T', revisao: 1, hash: 'h', aviso: '', cotas: false } as unknown as Parameters<typeof desenharPlanta>[2];
    const enq = enquadrar(com, 100, A3, false);
    const d = new DesenhistaDeProva();
    desenharPlanta(d, com, opcoes, enq);
    const textos = d.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2] as string);
    expect(textos).toEqual(expect.arrayContaining(['Sala', 'ver detalhe 1', 'demolir', '90°']));
    expect(textos).not.toContain('no corte'); // é do corte, não da planta
    const sala = d.chamadas.find((c) => c.tipo === 'texto' && c.args[2] === 'Sala')!;
    expect(sala.args[3]).toBe(5); // 500 mm / 100
    const detalhe = d.chamadas.find((c) => c.tipo === 'texto' && c.args[2] === 'ver detalhe 1')!;
    expect(detalhe.args[3]).toBe(2.5); // 250 / 100
    // Piso mínimo legível: 250 mm em 1:500 daria 0,5 → 1,5.
    const d2 = new DesenhistaDeProva();
    desenharAnotacoes(d2, com.anotacoes.filter((a) => a.tipo === 'TEXTO' && a.vista.tipo === 'PLANTA'), 500, (x) => x, (y) => y);
    expect(d2.chamadas[0].args[3]).toBe(1.5);
    // A ponta da seta é um polígono preenchido na cor da anotação.
    expect(d.chamadas.some((c) => c.tipo === 'poligono' && c.args[1] === '#b45309' && (c.args[0] as unknown[]).length === 3)).toBe(true);
    // DXF.
    const dxf = gerarDxf(com, { titulo: 'T', revisao: 1, hash: 'h' });
    expect(dxf).toMatch(/PLANTA-ANOTACOES/);
    expect(dxf).toMatch(/TEXT\n8\nPLANTA-ANOTACOES/);
    expect(dxf).toMatch(/ver detalhe 1/);
    expect(dxf).toMatch(/demolir/);
    expect(dxf).toMatch(/90°/);
    expect(dxf).not.toMatch(/no corte/); // sem elevações pedidas, o corte não sai
  });
});
