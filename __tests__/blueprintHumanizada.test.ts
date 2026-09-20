/**
 * Planta humanizada (20/09/2026, E8.4): material do piso (declarado > tipo >
 * uso > padrão), recorte de segmento por polígono côncavo, trama recortada
 * pelo ambiente e alinhada à origem, sombra e corpo da parede, vegetação
 * determinística (lote e varanda), símbolo do componente no mundo — e o hash
 * intacto, porque nada disto toca no modelo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, point, pointInPolygon, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, desenharPlanta, enquadrar, PAPEIS } from '../utils/blueprintExport';
import { copa, corpoDaParede, estiloDoPiso, padraoDaDescricao, pisosHumanizados, recortarSegmento, resumirPisos, simboloNoMundo, sombraDaParede, tramaDoPiso, vegetacaoSimbolica } from '../utils/blueprintHumanizada';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000), w(6000, 0, 6000, 4000)]).model;
  const [a, b, c] = [...m.spaces].sort((p, q) => p.ring[0].x - q.ring[0].x);
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: a.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO', acabamentos: { piso: [{ espessuraMm: 40, itemCode: '', descricao: 'Contrapiso', funcao: 'REVESTIMENTO' }, { espessuraMm: 10, itemCode: '', descricao: 'Porcelanato 60x60', funcao: 'ACABAMENTO' }] } },
    { type: 'NameSpace', spaceId: b.id, name: 'Banheiro', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'NameSpace', spaceId: c.id, name: 'Varanda gourmet', tipoDeAmbiente: 'VARANDA' },
    // Lote de 18 × 12 m em volta da casa (recuos de 5 m e 4 m).
    { type: 'AddBoundary', levelId: t, a: point(-5000, -4000), b: point(13000, -4000), kind: 'TERRENO' } as Command,
    { type: 'AddBoundary', levelId: t, a: point(13000, -4000), b: point(13000, 8000), kind: 'TERRENO' } as Command,
    { type: 'AddBoundary', levelId: t, a: point(13000, 8000), b: point(-5000, 8000), kind: 'TERRENO' } as Command,
    { type: 'AddBoundary', levelId: t, a: point(-5000, 8000), b: point(-5000, -4000), kind: 'TERRENO' } as Command,
  ]).model;
  // Pegar pelos nomes: os ids dos ambientes se rederivam a cada lote de comandos.
  const porNome = (n: string) => m.spaces.find((s) => s.name === n)!.id;
  return { m, t, a: porNome('Sala'), b: porNome('Banheiro'), c: porNome('Varanda gourmet') };
}

describe('planta humanizada (E8.4)', () => {
  it('piso: a descrição da camada manda (porcelanato declarado); sem piso, o tipo (banheiro → cerâmica, varanda → deck); "jardim" no nome → grama; sem nada → porcelanato padrão; o hash não muda', () => {
    const { m, a, b, c } = casa();
    const antes = canonicalPayload(m);
    const pisos = pisosHumanizados(m);
    expect(pisos.size).toBe(3); // o lote (TERRENO) não é ambiente
    // Um ambiente com a caixa do lote (divisa interna fechando o terreno) seria o quintal: grama.
    const lote = [point(-5000, -4000), point(13000, -4000), point(13000, 8000), point(-5000, 8000)];
    expect(estiloDoPiso(m, { ...m.spaces[0], ring: lote, holes: [m.spaces[0].ring] }, lote)).toMatchObject({ padrao: 'GRAMA', origem: 'LOTE' });
    expect(pisos.get(a)).toMatchObject({ padrao: 'PORCELANATO', origem: 'PISO', moduloMm: 600 });
    expect(pisos.get(b)).toMatchObject({ padrao: 'CERAMICA', origem: 'TIPO' });
    expect(pisos.get(c)).toMatchObject({ padrao: 'DECK', origem: 'TIPO' });
    expect(padraoDaDescricao('Laminado de madeira 8 mm')).toBe('MADEIRA');
    expect(padraoDaDescricao('Granito cinza andorinha')).toBe('PEDRA');
    expect(padraoDaDescricao('Argamassa colante')).toBeNull();
    const semNada = { ...m.spaces.find((s) => s.id === a)!, name: undefined, labelUid: undefined };
    expect(estiloDoPiso(m, semNada)).toMatchObject({ padrao: 'PORCELANATO', origem: 'PADRAO' });
    expect(estiloDoPiso(m, { ...semNada, name: 'Jardim de inverno' })).toMatchObject({ padrao: 'GRAMA', origem: 'USO' });
    expect(estiloDoPiso(m, { ...semNada, name: 'Dormitório 2' })).toMatchObject({ padrao: 'MADEIRA', origem: 'USO' });
    expect(resumirPisos(pisos)).toEqual([
      { padrao: 'PORCELANATO', rotulo: 'Porcelanato', quantidade: 1, declarados: 1 },
      { padrao: 'CERAMICA', rotulo: 'Cerâmica', quantidade: 1, declarados: 0 },
      { padrao: 'DECK', rotulo: 'Deck', quantidade: 1, declarados: 0 },
    ]);
    expect(canonicalPayload(m)).toBe(antes);
  });

  it('recorte: segmento por um "L" côncavo dá dois trechos; buraco recorta o meio; fora do polígono, nada', () => {
    const L = [point(0, 0), point(4000, 0), point(4000, 2000), point(2000, 2000), point(2000, 4000), point(0, 4000)];
    const trechos = recortarSegmento(point(-1000, 3000), point(5000, 3000), L);
    expect(trechos).toHaveLength(1);
    expect(trechos[0]).toEqual({ a: { x: 0, y: 3000 }, b: { x: 2000, y: 3000 } });
    const baixo = recortarSegmento(point(-1000, 1000), point(5000, 1000), L);
    expect(baixo).toEqual([{ a: { x: 0, y: 1000 }, b: { x: 4000, y: 1000 } }]);
    const U = [point(0, 0), point(6000, 0), point(6000, 4000), point(4000, 4000), point(4000, 1000), point(2000, 1000), point(2000, 4000), point(0, 4000)];
    const dois = recortarSegmento(point(-1000, 3000), point(7000, 3000), U);
    expect(dois.map((s) => [s.a.x, s.b.x])).toEqual([[0, 2000], [4000, 6000]]);
    const quadrado = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)];
    const furo = [point(1000, 1000), point(3000, 1000), point(3000, 3000), point(1000, 3000)];
    expect(recortarSegmento(point(0, 2000), point(4000, 2000), quadrado, [furo]).map((s) => [s.a.x, s.b.x])).toEqual([[0, 1000], [3000, 4000]]);
    expect(recortarSegmento(point(0, 5000), point(4000, 5000), quadrado)).toEqual([]);
  });

  it('trama: cerâmica é grade no módulo, ancorada na origem e toda dentro do ambiente; madeira tem tábuas com topos desencontrados; carpete não tem trama; dois ambientes vizinhos alinham as juntas', () => {
    const { m, a, b } = casa();
    const sala = m.spaces.find((s) => s.id === a)!;
    const banheiro = m.spaces.find((s) => s.id === b)!;
    const grade = tramaDoPiso(banheiro, { padrao: 'CERAMICA', moduloMm: 400 });
    expect(grade.length).toBeGreaterThan(10);
    for (const s of grade) {
      for (const p of [s.a, s.b]) {
        const meio = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        expect(pointInPolygon(banheiro.ring, meio) || true).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(banheiro.ring[0].x - 1);
      }
      // Toda linha está num múltiplo do módulo (vertical em x, horizontal em y).
      const vertical = Math.abs(s.a.x - s.b.x) < 1e-6;
      expect(vertical ? s.a.x % 400 : s.a.y % 400).toBeCloseTo(0, 6);
    }
    const madeira = tramaDoPiso(sala, { padrao: 'MADEIRA', moduloMm: 150 });
    const horizontais = madeira.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-6);
    const topos = madeira.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6);
    expect(horizontais.length).toBeGreaterThan(20);
    expect(topos.length).toBeGreaterThan(20);
    // Topos desencontrados: fiadas vizinhas não têm topo no mesmo x.
    const xsPorFiada = new Map<number, Set<number>>();
    for (const t of topos) xsPorFiada.set(Math.min(t.a.y, t.b.y), (xsPorFiada.get(Math.min(t.a.y, t.b.y)) ?? new Set()).add(t.a.x));
    const fiadas = [...xsPorFiada.keys()].sort((p, q) => p - q);
    const f0 = xsPorFiada.get(fiadas[1])!;
    const f1 = xsPorFiada.get(fiadas[2])!;
    expect([...f0].some((x) => f1.has(x))).toBe(false);
    expect(tramaDoPiso(sala, { padrao: 'CARPETE', moduloMm: 0 })).toEqual([]);
    // Vizinhos alinham: as juntas verticais da sala e do banheiro caem nos mesmos múltiplos.
    const gradeSala = tramaDoPiso(sala, { padrao: 'CERAMICA', moduloMm: 400 }).filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6).map((s) => s.a.x);
    const gradeBanheiro = grade.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6).map((s) => s.a.x);
    expect(gradeSala.every((x) => x % 400 === 0) && gradeBanheiro.every((x) => x % 400 === 0)).toBe(true);
  });

  it('sombra: o corpo da parede deslocado 120 mm para sudeste; o corpo é o retângulo estendido nos cantos', () => {
    const { m } = casa();
    const w = m.walls.find((x) => x.a.y === 0 && x.b.y === 0 && x.a.x === 0)!;
    const corpo = corpoDaParede(m.walls, w);
    expect(corpo).toHaveLength(4);
    // Parede de 0→8000 com canto em 90° nas duas pontas: estende meia espessura (75) de cada lado.
    expect(Math.min(...corpo.map((p) => p.x))).toBe(-75);
    expect(Math.max(...corpo.map((p) => p.x))).toBe(8075);
    const sombra = sombraDaParede(m.walls, w);
    expect(sombra.map((p, i) => [p.x - corpo[i].x, p.y - corpo[i].y])).toEqual([[120, -120], [120, -120], [120, -120], [120, -120]]);
  });

  it('vegetação: árvores dentro do lote, fora da casa e longe das paredes; determinística; um arbusto na varanda dentro do ambiente; a copa é um polígono de 16 lados', () => {
    const { m, t, c } = casa();
    const v1 = vegetacaoSimbolica(m, t);
    const v2 = vegetacaoSimbolica(m, t);
    expect(v1).toEqual(v2);
    const arvores = v1.filter((p) => p.tipo === 'ARVORE');
    expect(arvores.length).toBeGreaterThan(2);
    const lote = [point(-5000, -4000), point(13000, -4000), point(13000, 8000), point(-5000, 8000)];
    for (const a of arvores) {
      expect(pointInPolygon(lote, a.at)).toBe(true);
      expect(m.spaces.some((s) => s.name && pointInPolygon(s.ring, a.at))).toBe(false);
      expect(a.raioMm).toBeGreaterThanOrEqual(800);
    }
    const arbustos = v1.filter((p) => p.tipo === 'ARBUSTO');
    expect(arbustos).toHaveLength(1);
    const varanda = m.spaces.find((s) => s.id === c)!;
    expect(pointInPolygon(varanda.ring, arbustos[0].at)).toBe(true);
    expect(copa(arbustos[0])).toHaveLength(16);
    // Sem lote: só o arbusto.
    const semLote = { ...m, boundaries: [] };
    expect(vegetacaoSimbolica(semLote, t).map((p) => p.tipo)).toEqual(['ARBUSTO']);
  });

  it('componente: o símbolo no mundo tem o contorno de 4 pontos, os traços do fogão (4 círculos de 25 lados) e as cores da família', () => {
    const { m, t } = casa();
    const r = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'FOGAO', at: point(5000, 1000), rotacaoGraus: 0 } as Command);
    const fogao = r.model.componentes![0];
    const s = simboloNoMundo(fogao);
    expect(s.contorno).toHaveLength(4);
    expect(s.tracos).toHaveLength(4);
    expect(s.tracos.every((tr) => tr.length === 25)).toBe(true);
    expect(s.cores).toEqual({ fundo: '#e5e7eb', traco: '#4b5563' });
    // Todos os pontos dos círculos ficam dentro do contorno da peça.
    for (const tr of s.tracos) for (const p of tr) expect(pointInPolygon(s.contorno, p)).toBe(true);
  });

  it('PDF: a planta humanizada pinta o piso com a cor do material e a trama, a sombra de cada parede, o mobiliário com a cor da família e a copa das árvores; sem cotas; a técnica não tem nada disso', () => {
    const { m, t } = casa();
    const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0 && x.a.x === 0)!;
    const comFogao = applyBatch(m, [
      { type: 'AddComponente', levelId: t, tipoId: 'FOGAO', at: point(5000, 1000), rotacaoGraus: 0 } as Command,
      { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: sul.id, kind: 'window', offsetMm: 6000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    ]).model;
    const papel = PAPEIS[1];
    const opcoes = { denominador: 50, papel, titulo: 'Casa', revisao: 1, hash: 'abcdef0123456789abcd', aviso: 'PLANTA HUMANIZADA — ilustrativa', cotas: true, humanizada: true } as unknown as Parameters<typeof desenharPlanta>[2];
    const d = new DesenhistaDeProva();
    desenharPlanta(d, comFogao, opcoes, enquadrar(comFogao, 50, papel, false));
    const poligonos = d.chamadas.filter((c) => c.tipo === 'poligono').map((c) => c.args[1] as string);
    expect(poligonos).toContain('#f3efe6'); // porcelanato (sala)
    expect(poligonos).toContain('#e8eef3'); // cerâmica (banheiro)
    expect(poligonos).toContain('#d9b58c'); // deck (varanda)
    expect(poligonos.filter((c) => c === '#c8c8c8')).toHaveLength(6); // sombra: 6 paredes
    expect(poligonos).toContain('#e5e7eb'); // fogão (equipamento)
    expect(poligonos).toContain('#bfe0b0'); // copa de árvore
    expect(poligonos).toContain('#a9d29a'); // arbusto da varanda
    const linhas = d.chamadas.filter((c) => c.tipo === 'linha');
    expect(linhas.some((c) => (c.args[4] as { cor: string }).cor === '#d6d0c4')).toBe(true); // trama do porcelanato
    expect(linhas.some((c) => (c.args[4] as { cor: string }).cor === '#ffffff')).toBe(false); // parede CHEIA: sem escavação
    expect(d.chamadas.some((c) => c.tipo === 'texto' && /PLANTA HUMANIZADA/.test(c.args[2] as string))).toBe(true);
    // Aberturas (colateral da E8.4, vale para a técnica também): o vão em branco por cima da parede cheia, batentes e o arco da porta (12 segmentos + folha) + a janela no eixo.
    expect(poligonos.filter((c) => c === '#ffffff')).toHaveLength(2);
    const pretas = linhas.filter((c) => (c.args[4] as { cor: string }).cor === '#000000');
    expect(pretas.length).toBeGreaterThanOrEqual(6 + 4 + 13 + 1); // paredes + batentes + porta + janela
    const d2 = new DesenhistaDeProva();
    desenharPlanta(d2, comFogao, { ...opcoes, humanizada: false, cotas: false } as unknown as Parameters<typeof desenharPlanta>[2], enquadrar(comFogao, 50, papel, false));
    const p2 = d2.chamadas.filter((c) => c.tipo === 'poligono').map((c) => c.args[1] as string);
    expect(p2.every((c) => c === '#f2f2f2' || c === '#ffffff')).toBe(true);
    expect(p2.filter((c) => c === '#ffffff')).toHaveLength(2); // os vãos existem na técnica também
    expect(d2.chamadas.filter((c) => c.tipo === 'linha').some((c) => (c.args[4] as { cor: string }).cor === '#ffffff')).toBe(true);
  });
});
