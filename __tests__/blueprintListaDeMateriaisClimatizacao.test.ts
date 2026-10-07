/**
 * CLIMATIZAÇÃO E9.1/E9.3 (07/10/2026): a LISTA DE MATERIAIS — o que o
 * quantitativo mede e o que a compra acrescenta (cobre por diâmetro,
 * isolamento, chapa em m² e kg, cabo de interligação, gás, suportes), com as
 * folgas nas premissas do estudo; a folha do conjunto e a aba do XLSX.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, hipotesesClimatizacaoDaColuna, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { linhaExistente, planejarLinhasFrigorigenas, sistemasDoNivel } from '../utils/blueprintLinhaFrigorigena';
import { abaDaListaDeMateriaisClimatizacao, caboPeloEletroduto, chapaDoDuto, fatorDeGasDoVrf, materiaisDeClimatizacao, nomeDoCobre, temMateriaisDeClimatizacao } from '../utils/blueprintMateriaisClimatizacao';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDaListaDeMateriaisClimatizacao, enquadrar, orientar } from '../utils/blueprintExport';
import { montarQuantitativoXlsx } from '../services/blueprintExportService';
import * as XLSX from 'xlsx';

const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));

/** Sala + Cozinha com o split escolhido pela carga (E4) e a linha/dreno lançados (E5) + um duto 600×300 de 4 m isolado. */
function casa(): BlueprintModel {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 1000, widthMm: 2000, heightMm: 1000, sillMm: 1000 } as never,
  ]).model;
  const carga = cargaTermicaDoNivel(m, hip, t);
  m = applyBatch(m, planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO).comandos).model;
  m = applyBatch(m, planejarLinhasFrigorigenas(m, t, hip.linha).comandos).model;
  return applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(500, 2000), b: point(4500, 2000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 600, alturaDutoMm: 300, material: 'CHAPA_GALVANIZADA', isolamentoMm: 25 } as Command).model;
}

const linha = (m: ReturnType<typeof materiaisDeClimatizacao>, re: RegExp) => m.totais.find((l) => re.test(l.item));

describe('climatização E9.1 · o que a compra acrescenta', () => {
  it('⚠️ PRONTO QUANDO: o cobre por diâmetro soma os DOIS tubos de cada trecho da linha, e o isolamento é um por tubo', () => {
    const m = casa();
    const q = computeQuantities(m, POLITICA_PADRAO);
    const lista = materiaisDeClimatizacao(m, hip, q);
    const pares = q.totais.porBitola.filter((b) => b.disciplina === 'FRIGORIGENA');
    expect(pares.length).toBeGreaterThan(0);
    // Cada metro de linha Ø líq/suc são dois metros de cobre, um em cada diâmetro.
    const totalLinha = pares.reduce((s, b) => s + b.comprimentoM, 0);
    const cobre = lista.totais.filter((l) => /^Tubo de cobre/.test(l.item));
    expect(cobre.reduce((s, l) => s + l.quantidade, 0)).toBeCloseTo(2 * totalLinha, 6);
    expect(cobre.map((l) => l.item)).toEqual(expect.arrayContaining([`Tubo de cobre ${nomeDoCobre(pares[0].bitolaMm)}`]));
    expect(nomeDoCobre(6)).toBe('1/4" (6 mm)');
    expect(nomeDoCobre(13)).toBe('1/2" (13 mm)');
    const isol = lista.totais.filter((l) => /^Isolamento elastomérico/.test(l.item));
    expect(isol.reduce((s, l) => s + l.quantidade, 0)).toBeCloseTo(2 * pares.filter((b) => b.isolamentoMm).reduce((s, b) => s + b.comprimentoM, 0), 6);
  });

  it('a chapa do duto: perímetro × comprimento + a perda declarada, em m² e em kg pela espessura da maior dimensão; a manta pela área', () => {
    const m = casa();
    const lista = materiaisDeClimatizacao(m, hip);
    // 2 × (0,6 + 0,3) × 4 m = 7,2 m²; + 10 % = 7,92 m².
    expect(linha(lista, /^Chapa — duto 600×300/)!.quantidade).toBeCloseTo(7.92, 6);
    expect(chapaDoDuto({ bitolaMm: 600, alturaDutoMm: 300 })).toMatchObject({ espessuraMm: 0.65, bitola: '#24' });
    expect(linha(lista, /^Aço galvanizado #24/)!.quantidade).toBeCloseTo(7.92 * 0.65 * 7.85, 6);
    expect(linha(lista, /^Manta isolante 25 mm/)!.quantidade).toBeCloseTo(7.2, 6);
    // A perda é premissa: zero, a chapa é a área nua.
    const semPerda = materiaisDeClimatizacao(m, { ...hip, materiais: { ...hip.materiais, perdaDaChapaPct: 0 } });
    expect(linha(semPerda, /^Chapa — duto 600×300/)!.quantidade).toBeCloseTo(7.2, 6);
  });

  it('o cabo de interligação segue a linha + a sobra; o gás vem da faixa da linha; os suportes pelo espaçamento', () => {
    const m = casa();
    const t = m.levels[0].id;
    const lista = materiaisDeClimatizacao(m, hip);
    const s = sistemasDoNivel(m, t)[0];
    const caminho = linhaExistente(m, s)!.mm / 1000;
    expect(lista.porSistema).toHaveLength(1);
    expect(lista.porSistema[0]).toMatchObject({ tipo: 'SPLIT', evaporadoras: 1 });
    expect(lista.porSistema[0].caboM).toBeCloseTo(caminho + hip.materiais.folgaDoCaboM, 6);
    expect(linha(lista, /^Cabo de interligação/)!.quantidade).toBeCloseTo(caminho + hip.materiais.folgaDoCaboM, 6);
    expect(linha(lista, /^Carga adicional de gás/)).toBeTruthy();
    // Suporte do duto: 4 m ÷ 2,5 m → 2.
    expect(linha(lista, /^Suporte do duto/)!.quantidade).toBe(2);
    const outro = materiaisDeClimatizacao(m, { ...hip, materiais: { ...hip.materiais, espacamentoSuporteDutoM: 1, folgaDoCaboM: 0 } });
    expect(linha(outro, /^Suporte do duto/)!.quantidade).toBe(4);
    expect(outro.porSistema[0].caboM).toBeCloseTo(caminho, 6);
  });

  it('o que não dá para comprar fica dito: evaporadora sem capacidade, linha sem isolamento, sistema sem linha', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    let m = applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(5000, 0), cotaMm: 300 } as Command).model;
    const cd = m.terminais![0].id;
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(0, 0), cotaMm: 2200, condensadoraId: cd } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(0, 3000), b: point(2000, 3000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10 } as Command,
    ]).model;
    const lista = materiaisDeClimatizacao(m, hip);
    expect(lista.avisos.join(' | ')).toMatch(/1 evaporadora\(s\) sem capacidade/);
    expect(lista.avisos.join(' | ')).toMatch(/sem isolamento declarado/);
    expect(lista.avisos.join(' | ')).toMatch(/1 sistema\(s\) sem linha frigorígena traçada/);
    expect(linha(lista, /^Cabo de interligação/)).toBeUndefined();
  });

  it('as premissas dos materiais vêm da coluna com faixa e padrão', () => {
    expect(hipotesesClimatizacaoDaColuna({ materiais: { perdaDaChapaPct: 15, folgaDoCaboM: 99 } }).materiais).toEqual({ ...HIPOTESES_CLIMATIZACAO_PADRAO.materiais, perdaDaChapaPct: 15 });
    expect(hipotesesClimatizacaoDaColuna({}).materiais).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO.materiais);
  });
});

describe('climatização E9b · gás do VRF, cabo pelo eletroduto, peso do painel', () => {
  it('o gás do VRF: Σ comprimento × o fator do Ø de líquido de cada trecho', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    let m = applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: point(0, 0), cotaMm: 2500, capacidadeBtuH: 48000 } as Command).model;
    const cd = m.terminais![0].id;
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_CASSETE', at: point(5000, 0), cotaMm: 2500, capacidadeBtuH: 18000, condensadoraId: cd } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_CASSETE', at: point(5000, 3000), cotaMm: 2500, capacidadeBtuH: 18000, condensadoraId: cd } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(0, 0), b: point(5000, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 10, bitolaSuccaoMm: 16 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(5000, 0), b: point(5000, 3000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 13 } as Command,
    ]).model;
    const lista = materiaisDeClimatizacao(m, hip);
    const vrf = lista.porSistema.find((x) => x.tipo === 'VRF')!;
    // 5 m × 0,059 + 3 m × 0,022 = 0,361 kg.
    expect(vrf.gasG).toBe(361);
    expect(linha(lista, /gás refrigerante \(VRF\)/)!.quantidade).toBeCloseTo(0.361, 6);
    expect(lista.avisos.join(' ')).not.toMatch(/não estimada/);
    expect(fatorDeGasDoVrf(6)).toBe(0.022);
    expect(fatorDeGasDoVrf(40)).toBe(0.37);
  });

  it('⚠️ o cabo pelo eletroduto desenhado do ponto de força à condensadora; sem eletroduto, pela linha — e diz', () => {
    const m = casa();
    const t = m.levels[0].id;
    const s = sistemasDoNivel(m, t)[0];
    const ac = m.terminais!.find((x) => x.tipoEletrico === 'AR_CONDICIONADO')!;
    const sem = materiaisDeClimatizacao(m, hip);
    expect(sem.porSistema[0].origemDoCabo).toBe('LINHA');
    expect(sem.avisos.join(' ')).toMatch(/sem eletroduto desenhado/);
    // Um eletroduto com desvio (Q) do ponto de força até a condensadora — mais longo que a linha.
    const q = point(ac.at.x + 2000, ac.at.y + 2000);
    const eletroduto = (b: { x: number; y: number }, cotaB: number): Command[] => [
      { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: ac.at, b: q, cotaAMm: ac.cotaMm, cotaBMm: ac.cotaMm, bitolaMm: 20 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: q, b: point(b.x, b.y), cotaAMm: ac.cotaMm, cotaBMm: cotaB, bitolaMm: 20 } as Command,
    ];
    const com = applyBatch(m, eletroduto(s.condensadora.at, s.condensadora.cotaMm)).model;
    const esperado = Math.hypot(2000, 2000) + Math.hypot(s.condensadora.at.x - q.x, s.condensadora.at.y - q.y, s.condensadora.cotaMm - ac.cotaMm);
    expect(caboPeloEletroduto(com, s.evaporadora, s.condensadora, 1000)).toBeCloseTo(esperado, 3);
    const lista = materiaisDeClimatizacao(com, hip);
    expect(lista.porSistema[0].origemDoCabo).toBe('ELETRODUTO');
    expect(lista.porSistema[0].caboM).toBeCloseTo(esperado / 1000 + hip.materiais.folgaDoCaboM, 6);
    expect(lista.avisos.join(' ')).not.toMatch(/sem eletroduto desenhado/);
    expect(linha(lista, /^Cabo de interligação/)!.nota).toMatch(/1 pelo eletroduto desenhado/);
    // O eletroduto que para a 1,5 m da condensadora: com alcance de 0,3 m não liga (volta para a linha —
    // com 1 m, a ponta no próprio ponto de força já alcançaria a condensadora, a ~0,6 m dele);
    // com 2 m liga, e os 1,5 m fora do eletroduto entram no comprimento.
    const curto = applyBatch(m, eletroduto({ x: s.condensadora.at.x, y: s.condensadora.at.y + 1500 }, s.condensadora.cotaMm)).model;
    expect(materiaisDeClimatizacao(curto, { ...hip, materiais: { ...hip.materiais, raioDoEletrodutoM: 0.3 } }).porSistema[0].origemDoCabo).toBe('LINHA');
    const alcance2 = materiaisDeClimatizacao(curto, { ...hip, materiais: { ...hip.materiais, raioDoEletrodutoM: 2 } });
    expect(alcance2.porSistema[0].origemDoCabo).toBe('ELETRODUTO');
    const ate = Math.hypot(2000, 2000) + Math.hypot(s.condensadora.at.x - q.x, s.condensadora.at.y + 1500 - q.y, s.condensadora.cotaMm - ac.cotaMm) + 1500;
    expect(alcance2.porSistema[0].caboM).toBeCloseTo(ate / 1000 + hip.materiais.folgaDoCaboM, 6);
  });

  it('o painel pré-isolado sai em kg pelo peso por m² declarado (com a perda)', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const m = applyCommand(m0, { type: 'AddTrecho', levelId: m0.levels[0].id, disciplina: 'MECANICA', a: point(0, 0), b: point(4000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 600, alturaDutoMm: 300, material: 'PAINEL_PREISOLADO' } as Command).model;
    const lista = materiaisDeClimatizacao(m, hip);
    expect(linha(lista, /^Painel pré-isolado — duto 600×300/)!.quantidade).toBeCloseTo(7.92 * 1.4, 6);
    expect(linha(lista, /^Aço galvanizado/)).toBeUndefined();
    const outro = materiaisDeClimatizacao(m, { ...hip, materiais: { ...hip.materiais, pesoDoPainelKgM2: 2 } });
    expect(linha(outro, /^Painel pré-isolado/)!.quantidade).toBeCloseTo(7.92 * 2, 6);
  });
});

describe('climatização E9.3 · a folha e a aba do XLSX', () => {
  it('⚠️ PRONTO QUANDO: o XLSX tem a aba "Climatização — materiais", e ela se LÊ com o cobre, a chapa, o sistema e o pavimento', () => {
    const m = casa();
    const [xlsx] = montarQuantitativoXlsx(m, { denominador: 50, papel: PAPEIS[0], titulo: 'Casa', revisao: 1, hash: 'h'.repeat(64), hipotesesDeClimatizacao: hip });
    return xlsx.blob.arrayBuffer().then((buf) => {
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      expect(wb.SheetNames).toContain('Climatização — materiais');
      const linhas = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['Climatização — materiais'], { header: 1 });
      const texto = linhas.map((l) => l.join(' | ')).join('\n');
      expect(texto).toMatch(/Linha frigorígena \| Tubo de cobre 1\/4" \(6 mm\)/);
      expect(texto).toMatch(/Dutos \| Chapa — duto 600×300 \| 7\.92 \| m²/);
      expect(texto).toMatch(/Sistema \| Tipo \| Evaporadoras/);
      expect(texto).toMatch(/SPLIT \| 1/);
      expect(texto).toMatch(/Térreo \| /);
      // O Totais diz a medida certa do duto (antes: "Mecânica DN 600").
      const totais = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Totais, { header: 1 }).map((l) => l.join(' | ')).join('\n');
      expect(totais).toMatch(/Mecânica 600×300 · isol\. 25 mm/);
      expect(totais).not.toMatch(/Mecânica DN 600/);
    });
  });

  it('a aba: cabeçalhos e linhas; a folha escreve o total, o sistema e o pavimento; desenho vazio não tem lista', () => {
    const m = casa();
    const aba = abaDaListaDeMateriaisClimatizacao(materiaisDeClimatizacao(m, hip));
    expect(aba.nome).toBe('Climatização — materiais');
    expect(aba.linhas[1]).toEqual(['Grupo', 'Item', 'Quantidade', 'Unidade', 'Código', 'Como saiu']);
    const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
    const d = new DesenhistaDeProva();
    desenharFolhaDaListaDeMateriaisClimatizacao(d, m, { denominador: 0, papel, titulo: 'Casa', revisao: 1, hash: 'h'.repeat(64), hipotesesDeClimatizacao: hip }, enquadrar(m, 50, papel, false));
    const t = d.textos().join(' | ');
    expect(t).toMatch(/LISTA DE MATERIAIS — CLIMATIZAÇÃO/);
    expect(t).toMatch(/TOTAL DO DESENHO.*POR SISTEMA.*POR PAVIMENTO/);
    expect(t).not.toMatch(/Premissas padrão/);
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(temMateriaisDeClimatizacao(vazio)).toBe(false);
    expect(temMateriaisDeClimatizacao(m)).toBe(true);
  });
});
