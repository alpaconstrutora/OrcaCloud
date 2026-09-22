/**
 * PADRÃO ÒPURA DE DESENHO (22/09/2026, P2.35): o template que se entrega ao
 * projetista volta pelo leitor como o que ele declara — parede pelo eixo com a
 * espessura da camada, esquadria pelo bloco com os ATRIBUTOS (largura, altura,
 * peitoril, tipo), ambiente pelo texto. Nada é reconhecido: é lido.
 */
import { describe, expect, it } from 'vitest';
import { lerDxf } from '../utils/dxfLeitor';
import { gerarTemplateOpura, lerPadraoOpura, temPadraoOpura, REGRAS_DO_PADRAO, CAMADAS_DO_TEMPLATE } from '../utils/dxfPadraoOpura';
import { HIPOTESES_ESQUADRIAS_PADRAO } from '../utils/dxfParaKernel';
import { applyBatch, applyCommand, emptyModel, novoUid, type Command } from '../utils/blueprintKernel';

const offsetDe = (p: { a: { x: number; y: number }; b: { x: number; y: number } }, xa: number, xb: number) => (p.b.x > p.a.x ? xa - p.a.x : p.a.x - xb);

describe('Padrão ÒPURA · o template volta pelo leitor', () => {
  const texto = gerarTemplateOpura();
  const leitura = lerDxf(texto);

  it('o template é um DXF que o leitor entende: camadas, blocos com ATTDEF, INSERT com ATTRIB, TEXT', () => {
    expect(texto).toMatch(/\$INSUNITS\n70\n4\n/);
    for (const c of CAMADAS_DO_TEMPLATE) expect(texto).toContain(`\n2\n${c.nome}\n`);
    expect(leitura.recusas).toEqual([]);
    expect(leitura.blocosExpandidos).toBe(2);
    expect(leitura.insercoes.map((i) => [i.nome, i.x, i.y, i.atributos])).toEqual([
      ['OPURA-PORTA', 1000, 0, { LARGURA: '800', ALTURA: '2100', TIPO: 'P1' }],
      ['OPURA-JANELA', 1400, 3000, { LARGURA: '1200', ALTURA: '1200', PEITORIL: '1000', TIPO: 'J1' }],
    ]);
    expect(leitura.textos.find((t) => t.camada === 'OPURA-AMBIENTE')).toEqual({ camada: 'OPURA-AMBIENTE', x: 1700, y: 1500, texto: 'SALA' });
    // As regras vão dentro do arquivo, na camada de notas.
    expect(leitura.textos.filter((t) => t.camada === 'OPURA-NOTAS')).toHaveLength(REGRAS_DO_PADRAO.length);
    expect(temPadraoOpura(leitura)).toBe(true);
  });

  it('paredes pelo eixo com a espessura da camada; porta e janela pelos atributos; o nome do ambiente no ponto', () => {
    const r = lerPadraoOpura(leitura, 2800, HIPOTESES_ESQUADRIAS_PADRAO);
    expect(r.resumo).toMatchObject({ portas: 1, janelas: 1, vaos: 0, correr: 0, ambientes: 1, esquadriasSemParede: 0, esquadriasForaDaParede: 0, pontasSoltas: 0 });
    expect(r.resumo.camadas).toEqual([{ camada: 'OPURA-PAREDE-150', espessuraMm: 150, paredes: 4 }]);
    expect(r.paredes).toHaveLength(4);
    expect(r.paredes.every((p) => p.espessuraMm === 150)).toBe(true);
    const sul = r.paredes.find((p) => p.a.y === 0 && p.b.y === 0)!;
    expect(sul.aberturas).toHaveLength(1);
    const porta = sul.aberturas[0];
    // Bloco em (1000, 0) girado 0°: +X para +x (a outra ombreira em 1800), +Y para +y (abre para dentro da sala).
    expect(porta).toMatchObject({ kind: 'door', widthMm: 800, heightMm: 2100, sillMm: 0, tipo: 'P1', offsetMm: offsetDe(sul, 1000, 1800) });
    expect(porta.hingeAtStart).toBe(sul.b.x > sul.a.x);
    expect(porta.swingReversed).toBe(!(sul.b.x > sul.a.x));
    const norte = r.paredes.find((p) => p.a.y === 3000 && p.b.y === 3000)!;
    expect(norte.aberturas[0]).toMatchObject({ kind: 'window', widthMm: 1200, heightMm: 1200, sillMm: 1000, tipo: 'J1', offsetMm: offsetDe(norte, 1400, 2600) });
    expect(r.ambientes).toEqual([{ at: { x: 1700, y: 1500 }, nome: 'SALA' }]);
  });

  it('atributo ausente cai na hipótese do painel; largura maior que a parede é relatada e não entra; bloco longe de parede é relatado', () => {
    const t = texto
      .replace(/1\nP1\n2\nTIPO/, '1\n\n2\nTIPO') // TIPO vazio
      .replace(/2\nALTURA\n70\n0\n0\nATTRIB\n8\nOPURA-ESQUADRIA\n10\n1000/, '2\nALTURA-X\n70\n0\n0\nATTRIB\n8\nOPURA-ESQUADRIA\n10\n1000'); // ALTURA da porta "some"
    const r = lerPadraoOpura(lerDxf(t), 2600, { ...HIPOTESES_ESQUADRIAS_PADRAO, portaAlturaMm: 2400 });
    const porta = r.paredes.flatMap((p) => p.aberturas).find((ab) => ab.kind === 'door')!;
    expect(porta.heightMm).toBe(2400);
    expect(porta.tipo).toBeUndefined();

    const larga = texto.replace(/1\n800\n2\nLARGURA/, '1\n5000\n2\nLARGURA');
    const r2 = lerPadraoOpura(lerDxf(larga), 2800, HIPOTESES_ESQUADRIAS_PADRAO);
    expect(r2.resumo).toMatchObject({ portas: 0, esquadriasForaDaParede: 1 });

    const longe = texto.replace(/10\n1000\n20\n0\n30\n0\n50\n0\n/, '10\n1000\n20\n900\n30\n0\n50\n0\n');
    const r3 = lerPadraoOpura(lerDxf(longe), 2800, HIPOTESES_ESQUADRIAS_PADRAO);
    expect(r3.resumo).toMatchObject({ portas: 0, esquadriasSemParede: 1 });
  });

  it('girado e espelhado: a dobradiça e o lado de abrir seguem o bloco', () => {
    // A mesma porta inserida em (1800, 0) girada 180°: +X aponta para −x (ombreira em 1000), +Y para −y (abre para fora).
    const girada = texto.replace(/10\n1000\n20\n0\n30\n0\n50\n0\n/, '10\n1800\n20\n0\n30\n0\n50\n180\n');
    const r = lerPadraoOpura(lerDxf(girada), 2800, HIPOTESES_ESQUADRIAS_PADRAO);
    const sul = r.paredes.find((p) => p.a.y === 0 && p.b.y === 0)!;
    const porta = sul.aberturas[0];
    expect(porta.offsetMm).toBe(offsetDe(sul, 1000, 1800));
    expect(porta.hingeAtStart).toBe(!(sul.b.x > sul.a.x));
    expect(porta.swingReversed).toBe(sul.b.x > sul.a.x);
    // Espelhada em Y (42 = −1): abre para o outro lado, dobradiça na mesma ponta.
    const espelhada = texto.replace(/10\n1000\n20\n0\n30\n0\n50\n0\n/, '10\n1000\n20\n0\n30\n0\n42\n-1\n50\n0\n');
    const r2 = lerPadraoOpura(lerDxf(espelhada), 2800, HIPOTESES_ESQUADRIAS_PADRAO);
    const sul2 = r2.paredes.find((p) => p.a.y === 0 && p.b.y === 0)!;
    expect(sul2.aberturas[0].hingeAtStart).toBe(sul2.b.x > sul2.a.x);
    expect(sul2.aberturas[0].swingReversed).toBe(sul2.b.x > sul2.a.x);
  });

  it('o lote do painel (AddWall uid + AddOpening wallUid + PlaceSpaceLabel) nomeia o ambiente no mesmo passo', () => {
    const r = lerPadraoOpura(leitura, 2800, HIPOTESES_ESQUADRIAS_PADRAO);
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const lote: Command[] = [];
    for (const p of r.paredes) {
      const uid = novoUid();
      lote.push({ type: 'AddWall', levelId, a: p.a, b: p.b, thicknessMm: p.espessuraMm, heightMm: 2800, uid });
      for (const ab of p.aberturas) lote.push({ type: 'AddOpening', wallId: '', wallUid: uid, kind: ab.correr ? 'sliding' : ab.kind, offsetMm: ab.offsetMm, widthMm: ab.widthMm, heightMm: ab.heightMm, sillMm: ab.sillMm, hingeAtStart: ab.hingeAtStart, swingReversed: ab.swingReversed, ...(ab.tipo ? { esquadria: { nome: ab.tipo, itemCode: '', descricao: '' } } : {}) });
    }
    for (const amb of r.ambientes) lote.push({ type: 'PlaceSpaceLabel', levelId, at: amb.at, name: amb.nome });
    const m = applyBatch(base, lote).model;
    expect(m.walls).toHaveLength(4);
    expect(m.openings.map((o) => [o.kind, o.esquadria?.nome]).sort()).toEqual([['door', 'P1'], ['window', 'J1']]);
    expect(m.spaces).toHaveLength(1);
    expect(m.labels).toHaveLength(1);
    expect(m.labels[0]).toMatchObject({ name: 'SALA', at: { x: 1700, y: 1500 } });
    expect(m.spaces[0].labelUid).toBe(m.labels[0].uid);
    // Nome vazio é recusado; ponto fora de qualquer ambiente fica esperando o ambiente fechar.
    expect(() => applyCommand(m, { type: 'PlaceSpaceLabel', levelId, at: { x: 100, y: 100 }, name: '  ' })).toThrow(/vazio/);
    const fora = applyCommand(m, { type: 'PlaceSpaceLabel', levelId, at: { x: 9000, y: 9000 }, name: 'DEPOIS' }).model;
    expect(fora.labels).toHaveLength(2);
    // Renomear pelo ponto substitui a etiqueta do ambiente, não empilha.
    const renomeado = applyCommand(m, { type: 'PlaceSpaceLabel', levelId, at: { x: 500, y: 500 }, name: 'ESTAR' }).model;
    expect(renomeado.labels).toHaveLength(1);
    expect(renomeado.labels[0].name).toBe('ESTAR');
  });
});
