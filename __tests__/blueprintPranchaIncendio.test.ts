/**
 * INCÊNDIO E8.1 (01/10/2026): as plantas de incêndio por pavimento — hidrantes,
 * sprinklers e preventivo — a folha do quadro-resumo e legenda, a prancha
 * avulsa e a camada no DXF.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDeIncendio, desenharPlanta, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { itensDaLegendaDeIncendio, temIncendioNoPavimento } from '../utils/blueprintPranchaIncendio';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';
import { desenharConjunto, ehPlantaDaPrancha } from '../services/blueprintExportService';
import { gerarDxf } from '../utils/blueprintDxf';
import { HIPOTESES_INCENDIO_PADRAO } from '../utils/blueprintIncendioClassificacao';

/** Térreo 10 × 8 com a bomba, a coluna, dois hidrantes e um extintor; 1º pavimento com três sprinklers e uma placa. */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 10000, 0], [10000, 0, 10000, 8000], [10000, 8000, 0, 8000], [0, 8000, 0, 0]].map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command);
  const p = (levelId: string, tipo: string, x: number, y: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota, ...extra }) as Command;
  const tr = (levelId: string, ax: number, bx: number, ca: number, cb: number, dn = 65): Command => ({ type: 'AddTrecho', levelId, disciplina: 'INCENDIO', a: point(ax, 1000), b: point(bx, 1000), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
  return applyBatch(m, [
    ...paredes(t),
    ...paredes(s),
    p(t, 'BOMBA_INCENDIO', 1000, 1000, 300),
    tr(t, 1000, 1000, 300, 2600),
    tr(t, 1000, 9000, 2600, 2600),
    p(t, 'HIDRANTE_SIMPLES', 9000, 1000, 2600),
    p(t, 'HIDRANTE_SIMPLES', 5000, 7000, 1300),
    p(t, 'EXTINTOR', 2000, 7000, 1600, { agenteExtintor: 'PQS_ABC' }),
    p(s, 'SPRINKLER', 3000, 4000, 2800),
    p(s, 'SPRINKLER', 6000, 4000, 2800),
    p(s, 'SPRINKLER', 9000, 4000, 2800),
    p(s, 'PLACA', 2000, 1000, 1800, { codigoPlaca: 'S12' }),
  ]).model;
}

const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ denominador: 50, papel, titulo: 'Prédio', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-01T12:00:00Z'), ...extra });
const so = (inc: Record<string, boolean>) => ({ ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, ...inc } });

describe('E8.1 · o conjunto', () => {
  it('⚠️ PRONTO QUANDO: só as famílias que cada pavimento tem, e a folha de quadro-resumo e legenda no fim', () => {
    const m = predio();
    const [t, s] = m.levels.map((l) => l.id);
    expect(temIncendioNoPavimento(m, t, 'HIDRANTES')).toBe(true);
    expect(temIncendioNoPavimento(m, t, 'SPRINKLERS')).toBe(false);
    expect(temIncendioNoPavimento(m, s, 'SPRINKLERS')).toBe(true);
    const plano = planejarConjunto(m, so({ incendio: true }));
    expect(plano.map((p) => p.titulo)).toEqual([
      'Incêndio — hidrantes — Térreo',
      'Incêndio — sprinklers — 1º',
      'Incêndio — preventivo — Térreo',
      'Incêndio — preventivo — 1º',
      'Incêndio — quadro-resumo e legenda',
      // E8.2: a planilha de pressões, porque há rede.
      'Incêndio — planilha de pressões e curva da bomba',
    ]);
    // Sem a opção, nenhuma.
    expect(planejarConjunto(m, so({})).some((p) => p.tipo === 'INCENDIO')).toBe(false);
  });

  it('cada folha leva só a sua família, com os números do desenho inteiro e o DN da rede', () => {
    const m = predio();
    const folhas: DesenhistaDeProva[] = [];
    const { pranchas } = desenharConjunto(m, opcoes(), so({ incendio: true }), () => {
      const d = new DesenhistaDeProva();
      folhas.push(d);
      return d;
    });
    const texto = (i: number) => folhas[i].textos().join(' | ');
    expect(pranchas[0].familiaDeIncendio).toBe('HIDRANTES');
    expect(texto(0)).toMatch(/H-1/);
    expect(texto(0)).toMatch(/DN 65/);
    expect(texto(0)).not.toMatch(/EXT-1|SPK-/);
    expect(texto(1)).toMatch(/SPK-1.*SPK-2.*SPK-3|SPK-3.*SPK-2.*SPK-1/);
    expect(texto(2)).toMatch(/EXT-1/);
    expect(texto(2)).not.toMatch(/DN 65|H-1/);
    // A placa diz o código.
    expect(texto(3)).toMatch(/PL-1 \(S12\)/);
  });

  it('o quadro-resumo vem das premissas do estudo; sem elas, a folha diz que falta a classificação', () => {
    const m = predio();
    const enq = enquadrar(m, 50, papel, false);
    const com = new DesenhistaDeProva();
    desenharFolhaDeIncendio(com, m, opcoes({ hipotesesDeIncendio: { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' } } }), enq);
    const t = com.textos().join(' | ');
    expect(t).toMatch(/QUADRO-RESUMO DAS MEDIDAS DE SEGURANÇA/);
    expect(t).toMatch(/Ocupação: A-2/);
    expect(t).toMatch(/Extintores \| (Exigida|Dispensada|Sem tabela)/);
    expect(t).toMatch(/Hidrantes e mangotinhos/);
    expect(t).toMatch(/SPK — Chuveiro automático.*\(3\)|Sprinkler.*\(3\)/);
    const sem = new DesenhistaDeProva();
    desenharFolhaDeIncendio(sem, m, opcoes(), enq);
    expect(sem.textos().join(' | ')).toMatch(/Classificação da edificação não informada/);
  });

  it('a legenda: só o que existe, por família, com a quantidade', () => {
    const itens = itensDaLegendaDeIncendio(predio());
    expect(itens.map((i) => [i.familia, i.tipo, i.quantidade])).toEqual([
      ['HIDRANTES', 'HIDRANTE_SIMPLES', 2],
      ['HIDRANTES', 'BOMBA_INCENDIO', 1],
      ['SPRINKLERS', 'SPRINKLER', 3],
      ['PREVENTIVO', 'EXTINTOR', 1],
      ['PREVENTIVO', 'PLACA', 1],
    ]);
  });
});

describe('E8.1 · a prancha avulsa e o DXF', () => {
  it('a prancha avulsa "incendio" é planta e mostra tudo; sem `incendio`, a planta não leva nada dele', () => {
    const m = predio();
    expect(ehPlantaDaPrancha('incendio')).toBe(true);
    const a = new DesenhistaDeProva();
    desenharPlanta(a, m, opcoes(), enquadrar(m, 50, papel, false));
    expect(a.textos().join(' | ')).not.toMatch(/H-1|EXT-1|DN 65/);
    const b = new DesenhistaDeProva();
    desenharPlanta(b, m, opcoes({ incendio: 'TODAS' }), enquadrar(m, 50, papel, false));
    expect(b.textos().join(' | ')).toMatch(/H-1.*EXT-1|EXT-1.*H-1/);
  });

  it('o DXF leva a camada PLANTA-INCENDIO só quando pedida', () => {
    const m = predio();
    // A tabela de camadas declara todas (vazias também): o que conta são as ENTIDADES nela.
    const sem = gerarDxf(m, { titulo: 'x', revisao: 1, hash: 'h', cotas: false });
    expect(sem).not.toMatch(/DN 65|\bH-1\b/);
    const dxf = gerarDxf(m, { titulo: 'x', revisao: 1, hash: 'h', cotas: false, incendio: true });
    expect(dxf).toMatch(/8\r?\nPLANTA-INCENDIO-TEXTO\r?\n/);
    expect(dxf).toMatch(/DN 65/);
    expect(dxf).toMatch(/\bH-1\b/);
  });
});
