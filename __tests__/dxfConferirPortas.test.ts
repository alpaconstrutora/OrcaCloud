/**
 * CONFERIR O LADO DAS PORTAS contra o desenho (22/09/2026, P2.39).
 *
 * A pergunta que a conferência faz é a que o usuário faz olhando a tela: o arco
 * que o app desenha cai em cima do arco do arquivo? Aqui as portas entram
 * certas pelo reconhecimento, duas são estragadas de propósito (é o que uma
 * importação antiga ou um clique errado produzem), e a conferência tem de achar
 * exatamente essas duas e devolver os giros que as consertam.
 */
import { describe, expect, it } from 'vitest';
import { lerDxf } from '../utils/dxfLeitor';
import { aberturasDoDxf, paredesDoDxf, tirarDuplicadas } from '../utils/dxfParaKernel';
import { applyBatch, applyCommand, emptyModel, novoUid, type Command } from '../utils/blueprintKernel';
import { comandosDaCorrecao, conferirPortas } from '../utils/dxfConferirPortas';

type Par = [string, string];
const LINE = (x1: number, y1: number, x2: number, y2: number, camada = 'PAREDE'): Par[] => [['0', 'LINE'], ['8', camada], ['10', String(x1)], ['20', String(y1)], ['11', String(x2)], ['21', String(y2)]];
const ARC = (cx: number, cy: number, r: number, a0: number, a1: number): Par[] => [['0', 'ARC'], ['8', 'PORTAS'], ['10', String(cx)], ['20', String(cy)], ['40', String(r)], ['50', String(a0)], ['51', String(a1)]];

/** Uma parede de 20 m com quatro portas de 900, uma em cada combinação de dobradiça × lado. */
function desenhoDeQuatroPortas(): string {
  const vaos: [number, number, 'E' | 'D', 1 | -1][] = [
    [2000, 2900, 'E', 1],
    [6000, 6900, 'D', 1],
    [10000, 10900, 'E', -1],
    [14000, 14900, 'D', -1],
  ];
  const pares: Par[] = [
    ['0', 'SECTION'], ['2', 'HEADER'], ['9', '$INSUNITS'], ['70', '4'], ['0', 'ENDSEC'],
    ['0', 'SECTION'], ['2', 'ENTITIES'],
  ];
  const cortes = [0, ...vaos.flatMap(([a, b]) => [a, b]), 20000];
  for (let i = 0; i + 1 < cortes.length; i += 2) {
    pares.push(...LINE(cortes[i], 0, cortes[i + 1], 0), ...LINE(cortes[i], 150, cortes[i + 1], 150));
  }
  for (const [x0, x1] of vaos) pares.push(...LINE(x0, 0, x0, 150), ...LINE(x1, 0, x1, 150));
  for (const [x0, x1, dob, lado] of vaos) {
    const cx = dob === 'E' ? x0 : x1;
    const cy = lado === 1 ? 150 : 0;
    const fechada = dob === 'E' ? 0 : 180;
    const aberta = lado === 1 ? 90 : 270;
    const d = (((aberta - fechada) % 360) + 360) % 360;
    pares.push(...(d === 90 ? ARC(cx, cy, 900, fechada, aberta) : ARC(cx, cy, 900, aberta, fechada)));
  }
  pares.push(['0', 'ENDSEC'], ['0', 'EOF']);
  return pares.flatMap(([c, v]) => [c, v]).join('\n');
}

/** Importa o desenho como o painel faz, e devolve o modelo com as quatro portas. */
function modeloImportado(texto: string) {
  const leitura = lerDxf(texto);
  const paredes = tirarDuplicadas(paredesDoDxf(leitura.segmentos.filter((s) => s.camada === 'PAREDE'), 1)).paredes;
  const { paredes: com } = aberturasDoDxf(paredes, leitura, 1, 'PAREDE', 2800);
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  const lote: Command[] = [];
  for (const p of com) {
    const uid = novoUid();
    lote.push({ type: 'AddWall', levelId, a: p.a, b: p.b, thicknessMm: p.espessuraMm, heightMm: 2800, uid });
    for (const ab of p.aberturas) {
      lote.push({ type: 'AddOpening', wallId: '', wallUid: uid, kind: ab.kind, offsetMm: ab.offsetMm, widthMm: ab.widthMm, heightMm: ab.heightMm, sillMm: ab.sillMm, hingeAtStart: ab.hingeAtStart, swingReversed: ab.swingReversed });
    }
  }
  return { model: applyBatch(m, lote).model, levelId };
}

describe('conferir o lado das portas contra o desenho', () => {
  const texto = desenhoDeQuatroPortas();
  const desenho = { texto, mmPorUnidade: 1, dx: 0, dy: 0 };

  it('recém-importadas, as quatro portas conferem e não há o que corrigir', () => {
    const { model, levelId } = modeloImportado(texto);
    expect(model.openings.filter((o) => o.kind === 'door')).toHaveLength(4);
    const r = conferirPortas(model, levelId, desenho);
    expect(r).toMatchObject({ conferidas: 4, certas: 4, semArco: 0 });
    expect(r.corrigir).toEqual([]);
    expect(comandosDaCorrecao(r.corrigir)).toEqual([]);
  });

  it('duas portas estragadas (uma no lado, outra na dobradiça) são achadas — e os giros propostos as consertam', () => {
    const { model, levelId } = modeloImportado(texto);
    const portas = model.openings.filter((o) => o.kind === 'door').sort((a, b) => a.offsetMm - b.offsetMm);
    const estragado = applyBatch(model, [
      { type: 'FlipOpening', openingId: portas[0].id, axis: 'swing' },
      { type: 'FlipOpening', openingId: portas[2].id, axis: 'hinge' },
    ]).model;

    const r = conferirPortas(estragado, levelId, desenho);
    expect(r.conferidas).toBe(4);
    expect(r.certas).toBe(2);
    expect(r.corrigir.map((p) => p.openingId).sort()).toEqual([portas[0].id, portas[2].id].sort());
    expect(r.corrigir.find((p) => p.openingId === portas[0].id)).toMatchObject({ virarLado: true, virarDobradica: false });
    expect(r.corrigir.find((p) => p.openingId === portas[2].id)).toMatchObject({ virarLado: false, virarDobradica: true });
    // A distância diz o tamanho do erro: lado espelhado ou dobradiça na outra ponta passam de um metro.
    for (const p of r.corrigir) {
      expect(p.distanciaAtualMm).toBeGreaterThan(900);
      expect(p.distanciaCorrigidaMm).toBeLessThan(350);
    }

    const corrigido = applyBatch(estragado, comandosDaCorrecao(r.corrigir)).model;
    expect(conferirPortas(corrigido, levelId, desenho)).toMatchObject({ conferidas: 4, certas: 4, corrigir: [] });
    // E o que foi corrigido é exatamente o que a importação tinha produzido.
    for (const antes of portas) {
      const depois = corrigido.openings.find((o) => o.id === antes.id)!;
      expect([depois.hingeAtStart, depois.swingReversed]).toEqual([antes.hingeAtStart, antes.swingReversed]);
    }
  });

  it('porta sem arco no desenho não é conferida (não se inventa lado para ela); desenho sem arco nenhum não diz nada', () => {
    const { model, levelId } = modeloImportado(texto);
    // Uma porta nova, longe de qualquer arco: entra em "sem arco".
    const parede = model.walls[0];
    const comExtra = applyCommand(model, { type: 'AddOpening', wallId: parede.id, kind: 'door', offsetMm: 17000, widthMm: 900, heightMm: 2100, sillMm: 0 }).model;
    expect(conferirPortas(comExtra, levelId, desenho)).toMatchObject({ conferidas: 4, certas: 4, semArco: 1 });
    const semArcos = { ...desenho, texto: texto.replace(/0\nARC\n[\s\S]*?(?=0\n(ARC|ENDSEC))/g, '') };
    expect(conferirPortas(comExtra, levelId, semArcos)).toMatchObject({ conferidas: 0, certas: 0, semArco: 0 });
  });

  it('o deslocamento da importação entra na conta: com ele errado, os arcos não casam com as portas', () => {
    const { model, levelId } = modeloImportado(texto);
    // ⚠️ Com o deslocamento errado por 50 cm, nenhum arco fica perto de uma ombreira e nada é conferido.
    // É por isso que o deslocamento vem GUARDADO com o desenho (P2.38) em vez de chutado: com um erro
    // que por acaso alinhe um arco com a porta vizinha (4 m adiante, aqui), a conferência casaria o par
    // errado e "corrigiria" o que estava certo.
    expect(conferirPortas(model, levelId, { ...desenho, dx: 500 })).toMatchObject({ conferidas: 0, semArco: 4 });
  });
});
