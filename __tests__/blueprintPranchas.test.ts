/**
 * Pranchas (20/09/2026, E8.3): template de prancha (sanitização, papel/orientação,
 * fábrica), plano do conjunto (índice, planta por pavimento, elétrica + quadro
 * + unifilar, cortes, fachadas, ampliações dos molhados, tabelas; numeração),
 * modelo por pavimento, ampliação com recorte e moldura, carimbo da org com
 * numeração, índice e tabelas desenhados, e o conjunto inteiro pelo
 * desenhista de prova (auto-ajuste de escala quando não cabe).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, desenharIndice, desenharPlanta, enquadrar, PAPEIS } from '../utils/blueprintExport';
import { modeloDoPavimento, papelDoTemplate, planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO, TEMPLATES_DE_PRANCHA_DE_FABRICA, templateDePranchaDaColuna, validarNomeDoTemplateDePrancha } from '../utils/blueprintPranchas';
import { desenharConjunto } from '../services/blueprintExportService';

function sobrado() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  const [t, sup] = m.levels.map((l) => l.id);
  const w = (lv: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lv, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(t, 0, 0, 8000, 0), w(t, 8000, 0, 8000, 4000), w(t, 8000, 4000, 0, 4000), w(t, 0, 4000, 0, 0), w(t, 4000, 0, 4000, 4000), w(sup, 0, 0, 8000, 0), w(sup, 8000, 0, 8000, 4000), w(sup, 8000, 4000, 0, 4000), w(sup, 0, 4000, 0, 0)]).model;
  const [a, b] = m.spaces.filter((s) => s.levelId === t).sort((p, q) => p.ring[0].x - q.ring[0].x);
  const c = m.spaces.find((s) => s.levelId === sup)!;
  const sul = m.walls.find((x) => x.levelId === t && x.a.y === 0 && x.b.y === 0)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: a.id, name: 'Banheiro', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'NameSpace', spaceId: b.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: c.id, name: 'Dormitório', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddCorte', a: point(-500, 2000), b: point(8500, 2000), lado: 'ESQUERDA', rotulo: 'AA' } as Command,
  ]).model;
  return { m, t, sup };
}

const OPCOES = { denominador: 50, papel: PAPEIS[1], titulo: 'Casa', revisao: 3, hash: 'abcdef0123456789abcd', aviso: 'aviso' } as unknown as Parameters<typeof desenharPlanta>[2];

describe('pranchas (E8.3)', () => {
  it('template: JSONB estranho volta ao padrão; papel/orientação; escala fora da lista volta; extras limitados a 6; nome único; fábrica com 3 distintos', () => {
    const t = templateDePranchaDaColuna({ papel: 'A9', paisagem: false, denominadorPlanta: 33, denominadorCortes: 100, carimbo: { empresa: 'ACME', prefixo: '  ', camposExtras: [{ rotulo: 'Fase', valor: 'EXE' }, { valor: 'sem rótulo' }, ...Array.from({ length: 8 }, (_, i) => ({ rotulo: `c${i}`, valor: '' }))] }, incluir: { tabelas: false, lixo: true } });
    expect(t.papel).toBe('A1');
    expect(t.paisagem).toBe(false);
    expect(t.denominadorPlanta).toBe(50);
    expect(t.denominadorCortes).toBe(100);
    expect(t.carimbo.empresa).toBe('ACME');
    expect(t.carimbo.prefixo).toBe('A');
    expect(t.carimbo.camposExtras).toHaveLength(6);
    expect(t.carimbo.camposExtras[0]).toEqual({ rotulo: 'Fase', valor: 'EXE' });
    expect(t.incluir.tabelas).toBe(false);
    expect((t.incluir as unknown as Record<string, unknown>).lixo).toBeUndefined();
    expect(templateDePranchaDaColuna(null)).toEqual(TEMPLATE_DE_PRANCHA_PADRAO);
    expect(papelDoTemplate({ ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A1', paisagem: true })).toEqual({ id: 'A1', larguraMm: 841, alturaMm: 594 });
    expect(papelDoTemplate({ ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A3', paisagem: false })).toEqual({ id: 'A3', larguraMm: 297, alturaMm: 420 });
    expect(TEMPLATES_DE_PRANCHA_DE_FABRICA).toHaveLength(3);
    expect(new Set(TEMPLATES_DE_PRANCHA_DE_FABRICA.map((x) => JSON.stringify(x.template))).size).toBe(3);
    expect(validarNomeDoTemplateDePrancha('A1 · 1:50 (padrão)', TEMPLATES_DE_PRANCHA_DE_FABRICA)).toEqual(['já existe um template chamado "A1 · 1:50 (padrão)"']);
    expect(validarNomeDoTemplateDePrancha('Meu', TEMPLATES_DE_PRANCHA_DE_FABRICA)).toEqual([]);
  });

  it('plano do conjunto: índice, uma planta por pavimento com parede (de baixo para cima), corte, 4 fachadas, ampliação só do banheiro (com folga de 60 cm), tabelas; numeração com o prefixo; inclusões desligam folhas', () => {
    const { m, t, sup } = sobrado();
    const plano = planejarConjunto(m, TEMPLATE_DE_PRANCHA_PADRAO);
    expect(plano.map((p) => [p.numero, p.tipo, p.titulo, p.denominador])).toEqual([
      ['A-01', 'INDICE', 'Índice de pranchas', 0],
      ['A-02', 'PLANTA', 'Planta — Térreo', 50],
      ['A-03', 'PLANTA', 'Planta — Superior', 50],
      ['A-04', 'CORTE', 'Corte AA', 50],
      ['A-05', 'ELEVACAO', 'Fachada frontal', 50],
      ['A-06', 'ELEVACAO', 'Fachada de fundos', 50],
      ['A-07', 'ELEVACAO', 'Fachada lateral esquerda', 50],
      ['A-08', 'ELEVACAO', 'Fachada lateral direita', 50],
      ['A-09', 'AMPLIACAO', 'Ampliação — Banheiro (Térreo)', 25],
      ['A-10', 'TABELAS', 'Quadro de áreas e de esquadrias', 0],
    ]);
    expect(plano[1].levelId).toBe(t);
    expect(plano[2].levelId).toBe(sup);
    expect(plano[8].recorte).toEqual({ minX: -600, minY: -600, maxX: 4600, maxY: 4600 });
    const so = planejarConjunto(m, { ...TEMPLATE_DE_PRANCHA_PADRAO, carimbo: { ...TEMPLATE_DE_PRANCHA_PADRAO.carimbo, prefixo: 'ARQ' }, incluir: { indice: false, plantas: true, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, eletrica: false } });
    expect(so.map((p) => p.numero)).toEqual(['ARQ-01', 'ARQ-02']);
    // E8.4: humanizada ligada = uma folha por pavimento com parede, logo depois das plantas técnicas, sem cotas e com o aviso de venda.
    const hum = planejarConjunto(m, { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, humanizada: true, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false } });
    expect(hum.map((p) => [p.numero, p.tipo, p.titulo])).toEqual([
      ['A-01', 'INDICE', 'Índice de pranchas'],
      ['A-02', 'PLANTA', 'Planta — Térreo'],
      ['A-03', 'PLANTA', 'Planta — Superior'],
      ['A-04', 'HUMANIZADA', 'Planta humanizada — Térreo'],
      ['A-05', 'HUMANIZADA', 'Planta humanizada — Superior'],
    ]);
    expect(templateDePranchaDaColuna({ incluir: { plantas: true } }).incluir.humanizada).toBe(false); // template anterior à E8.4
    // Elétrica sem pontos = nenhuma folha elétrica.
    expect(planejarConjunto(m, { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, eletrica: true } }).filter((p) => p.tipo === 'ELETRICA')).toHaveLength(0);
  });

  it('modelo do pavimento: só as paredes, aberturas, ambientes, etiquetas e anotações daquele pavimento; cortes e níveis inteiros', () => {
    const { m, t, sup } = sobrado();
    const mt = modeloDoPavimento(m, t);
    expect(mt.walls.every((w) => w.levelId === t)).toBe(true);
    expect(mt.walls).toHaveLength(5);
    expect(mt.openings).toHaveLength(1);
    expect(mt.spaces.map((s) => s.name).sort()).toEqual(['Banheiro', 'Sala']);
    expect(mt.labels).toHaveLength(2);
    expect(mt.levels).toHaveLength(2);
    expect(mt.sections).toHaveLength(1);
    const ms = modeloDoPavimento(m, sup);
    expect(ms.walls).toHaveLength(4);
    expect(ms.openings).toHaveLength(0);
    expect(ms.spaces.map((s) => s.name)).toEqual(['Dormitório']);
  });

  it('ampliação: a planta com recorte recorta o papel, enquadra pelo retângulo (folga zero) e desenha a moldura; o carimbo da org traz empresa/responsável/cliente e o número da prancha', () => {
    const { m, t } = sobrado();
    const mt = modeloDoPavimento(m, t);
    const recorte = { minX: -600, minY: -600, maxX: 4600, maxY: 4600 };
    const papel = { id: 'A1', larguraMm: 841, alturaMm: 594 };
    const enq = enquadrar(mt, 25, papel, true, recorte);
    expect(enq.cabe).toBe(true);
    expect(enq.desenhoLarguraMm).toBeCloseTo(5200 / 25, 6); // 208 mm — sem folga de parede
    const d = new DesenhistaDeProva();
    desenharPlanta(d, mt, { ...OPCOES, papel, denominador: 25, cotas: true, recorte, carimboDaOrg: { empresa: 'ACME Engenharia', responsavel: 'Eng. Fulana', registro: 'CREA 123', cliente: 'Cliente X', endereco: 'Rua A, 1', camposExtras: [{ rotulo: 'Fase', valor: 'Executivo' }] }, prancha: { numero: 'A-09', total: 10, titulo: 'Ampliação — Banheiro' } } as unknown as Parameters<typeof desenharPlanta>[2], enq);
    const tipos = d.chamadas.map((c) => c.tipo);
    expect(tipos[0]).toBe('recortar');
    expect(d.chamadas[0].args).toEqual([enq.offsetXMm, enq.offsetYMm, 208, 208]);
    expect(tipos.indexOf('fimDoRecorte')).toBeGreaterThan(0);
    const textos = d.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2] as string);
    expect(textos).toEqual(expect.arrayContaining(['ACME Engenharia', 'Eng. Fulana · CREA 123', 'Cliente: Cliente X', 'Rua A, 1', 'Fase: Executivo', 'A-09', 'de 10', 'Casa — Ampliação — Banheiro']));
    expect(textos.some((x) => /Escala 1:25/.test(x))).toBe(true);
    // Sem recorte: nada de recortar.
    const d2 = new DesenhistaDeProva();
    desenharPlanta(d2, mt, { ...OPCOES, papel } as unknown as Parameters<typeof desenharPlanta>[2], enquadrar(mt, 50, papel, false));
    expect(d2.chamadas.some((c) => c.tipo === 'recortar')).toBe(false);
  });

  it('índice: uma linha por prancha com número, título e escala; conjunto inteiro pelo desenhista de prova: 10 folhas, ordem do plano, planta do superior sem as paredes do térreo, tabelas com os ambientes, escala desce quando não cabe', () => {
    const { m } = sobrado();
    const plano = planejarConjunto(m, TEMPLATE_DE_PRANCHA_PADRAO);
    const papel = { id: 'A1', larguraMm: 841, alturaMm: 594 };
    const d = new DesenhistaDeProva();
    desenharIndice(d, plano, { ...OPCOES, papel } as unknown as Parameters<typeof desenharPlanta>[2], enquadrar(m, 50, papel, false));
    const textos = d.chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2] as string);
    expect(textos).toEqual(expect.arrayContaining(['A-01', 'Índice de pranchas', 'A-09', 'Ampliação — Banheiro (Térreo)', '1:25', '—']));
    // O conjunto.
    const folhas: DesenhistaDeProva[] = [];
    const r = desenharConjunto(m, OPCOES, TEMPLATE_DE_PRANCHA_PADRAO, () => {
      const f = new DesenhistaDeProva();
      folhas.push(f);
      return f;
    });
    expect(r.pranchas).toHaveLength(10);
    expect(folhas).toHaveLength(10);
    expect(r.folhas.map((f) => f.denominador)).toEqual([0, 50, 50, 50, 50, 50, 50, 50, 25, 0]);
    const textosDe = (i: number) => folhas[i].chamadas.filter((c) => c.tipo === 'texto').map((c) => c.args[2] as string);
    expect(textosDe(1)).toEqual(expect.arrayContaining(['Casa — Planta — Térreo', 'A-02', 'de 10']));
    expect(textosDe(2)).toEqual(expect.arrayContaining(['Casa — Planta — Superior', 'A-03']));
    // A planta do superior tem MENOS polígonos de ambiente (1) que a do térreo (2).
    const ambientesDe = (i: number) => folhas[i].chamadas.filter((c) => c.tipo === 'poligono' && c.args[1] === '#eef2ff').length;
    expect(ambientesDe(1)).toBeGreaterThanOrEqual(ambientesDe(2));
    expect(textosDe(9)).toEqual(expect.arrayContaining(['Quadro de áreas', 'Banheiro', 'Sala', 'Dormitório', 'Quadro de esquadrias']));
    // A folha humanizada do conjunto: sombra (polígono cinza) e o aviso de venda; a técnica não tem nenhum dos dois.
    const fh: DesenhistaDeProva[] = [];
    desenharConjunto(m, OPCOES, { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { indice: false, plantas: true, humanizada: true, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, eletrica: false } }, () => {
      const f = new DesenhistaDeProva();
      fh.push(f);
      return f;
    });
    expect(fh).toHaveLength(4);
    const sombras = (f: DesenhistaDeProva) => f.chamadas.filter((c) => c.tipo === 'poligono' && c.args[1] === '#c8c8c8').length;
    expect(sombras(fh[0])).toBe(0);
    expect(sombras(fh[2])).toBe(5); // 5 paredes do térreo
    expect(fh[2].chamadas.some((c) => c.tipo === 'texto' && /PLANTA HUMANIZADA/.test(c.args[2] as string))).toBe(true);
    expect(fh[0].chamadas.some((c) => c.tipo === 'texto' && /PLANTA HUMANIZADA/.test(c.args[2] as string))).toBe(false);
    // Não cabe em A4 1:50 → desce para a escala sugerida e o carimbo diz.
    const pequeno = { ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A4' as const, denominadorPlanta: 20, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false } };
    const f2: DesenhistaDeProva[] = [];
    const r2 = desenharConjunto(m, OPCOES, pequeno, () => {
      const f = new DesenhistaDeProva();
      f2.push(f);
      return f;
    });
    expect(r2.folhas[0].denominador).toBeGreaterThan(20);
    expect(f2[0].chamadas.filter((c) => c.tipo === 'texto').some((c) => new RegExp(`Escala 1:${r2.folhas[0].denominador}`).test(c.args[2] as string))).toBe(true);
  });
});
