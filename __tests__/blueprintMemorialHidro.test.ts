/**
 * E3.1 / E3.2 — OS MEMORIAIS HIDROSSANITÁRIOS (28/09/2026): derivados do
 * modelo, com os MESMOS números da tela, e só com as seções dos sistemas que
 * existem. E o texto guardado na emissão volta aos mesmos blocos.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point } from '../utils/blueprintKernel';
import {
  HIPOTESES_HIDRO_PADRAO,
  blocosDasLinhas,
  linhasDoMemorial,
  memorialDeCalculoHidro,
  memorialDescritivoHidro,
  type BlocoDoMemorial,
} from '../utils/blueprintMemorialHidro';
import { arquivosDoDocx, documentoDoMemorial } from '../utils/blueprintMemorialDocx';
import { pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { esgotoTrechoATrecho, verificarDnDoEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { paraWinAnsi } from '../services/blueprintMemorialHidroService';
import { sobrado } from './fixtures/sobradoHidro';

const ctx = { nomeDoEstudo: 'Sobrado de prova', geradoEm: '2026-09-28T12:00:00Z' };
const secoes = (b: BlocoDoMemorial[]) => b.filter((x) => x.tipo === 'secao').map((x) => (x as { texto: string }).texto);
const tabelas = (b: BlocoDoMemorial[]) => b.filter((x): x is Extract<BlocoDoMemorial, { tipo: 'tabela' }> => x.tipo === 'tabela');

describe('E3.1 — memorial de cálculo', () => {
  it('sobrado: premissas, água, reservação, esgoto e colunas — nessa ordem', () => {
    const b = memorialDeCalculoHidro(sobrado(), HIPOTESES_HIDRO_PADRAO, ctx);
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'Memorial de cálculo — instalações hidrossanitárias' });
    expect(secoes(b)).toEqual(['Premissas de cálculo', 'Água fria e água quente', 'Reservação', 'Esgoto sanitário', 'Colunas, tubos de queda e ventilação']);
    // E4.1: sem volume nem medidas na caixa, a reservação diz que não dá para conferir.
    expect(b.some((x) => x.tipo === 'paragrafo' && /^Não atende: Reservar 800 L, mas há caixa sem volume/.test(x.texto))).toBe(true);
  });

  it('a tabela da água tem UMA linha por trecho calculado, com os números de `pressoesDoModelo`', () => {
    const m = sobrado();
    const b = memorialDeCalculoHidro(m, HIPOTESES_HIDRO_PADRAO, ctx);
    const agua = tabelas(b).find((t) => t.cabecalho[0] === 'Trecho' && t.cabecalho.includes('Q (L/s)'))!;
    const calculados = pressoesDoModelo(m).flatMap((r) => r.trechos);
    expect(agua.linhas).toHaveLength(calculados.length);
    const primeira = calculados[0];
    const iQ = agua.cabecalho.indexOf('Q (L/s)');
    const iV = agua.cabecalho.indexOf('V (m/s)');
    expect(agua.linhas[0][iQ]).toBe(primeira.vazaoLs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(agua.linhas[0][iV]).toBe(primeira.velocidadeMs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    // ΣP volta da vazão: Q = 0,3·√ΣP.
    const iP = agua.cabecalho.indexOf('ΣP');
    expect(Number(agua.linhas[0][iP].replace('.', '').replace(',', '.'))).toBeCloseTo((primeira.vazaoLs / 0.3) ** 2, 1);
    // E a tabela de pressões diz a situação de cada ponto.
    const pontos = tabelas(b).find((t) => t.cabecalho.includes('Mínima (kPa)'))!;
    expect(pontos.linhas.length).toBe(pressoesDoModelo(m).flatMap((r) => r.pontos).length);
  });

  it('esgoto: aparelhos com UHC e total; trechos com os números de `esgotoTrechoATrecho`; caixas com tampa e fundo', () => {
    const m = sobrado();
    const b = memorialDeCalculoHidro(m, HIPOTESES_HIDRO_PADRAO, ctx);
    const aparelhos = tabelas(b).find((t) => t.cabecalho[0] === 'Aparelho')!;
    const total = aparelhos.linhas[aparelhos.linhas.length - 1];
    expect(total[0]).toBe('Total');
    // 2 banheiros × (vaso 6 + lavatório 1 + chuveiro 2 + sifonada…): o total é a soma da coluna.
    const soma = aparelhos.linhas.slice(0, -1).reduce((s, l) => s + Number(l[3]), 0);
    expect(Number(total[3])).toBe(soma);
    const trechos = tabelas(b).find((t) => t.cabecalho.includes('UHC') && t.cabecalho.includes('i mín. (%)'))!;
    expect(trechos.linhas).toHaveLength(esgotoTrechoATrecho(m).length);
    // O lançamento automático atende: nenhuma situação diferente de "Atende" (a verificação concorda).
    expect(verificarDnDoEsgoto(m)).toEqual([]);
    expect(trechos.linhas.every((l) => l[l.length - 1] === 'Atende')).toBe(true);
    const caixas = tabelas(b).find((t) => t.cabecalho[0] === 'Caixa')!;
    expect(caixas.linhas[0][0]).toBe('CI');
    expect(caixas.linhas[0][3]).toMatch(/^−\d,\d\d$/);
  });

  it('⚠️ o lançamento automático nunca fica abaixo da declividade mínima (a queda arredonda para CIMA — antes 0,72 m a 2 % davam 1,94 %)', () => {
    for (const c of esgotoTrechoATrecho(sobrado())) {
      if (c.declividadePct != null) expect(c.declividadePct).toBeGreaterThanOrEqual(c.declividadeMinimaPct - 1e-9);
    }
  });

  it('o DN reduzido à mão aparece como "DN abaixo do exigido" — o memorial não esconde o que a verificação acusa', () => {
    const m = sobrado();
    const tronco = esgotoTrechoATrecho(m).find((c) => c.dnAtualMm === 100 && c.declividadePct != null)!;
    const reduzido = applyCommand(m, { type: 'SetTrechoProps', trechoId: tronco.trechoId, bitolaMm: 50 }).model;
    const b = memorialDeCalculoHidro(reduzido, HIPOTESES_HIDRO_PADRAO, ctx);
    const trechos = tabelas(b).find((t) => t.cabecalho.includes('i mín. (%)'))!;
    expect(trechos.linhas.some((l) => /DN abaixo do exigido \(100\)/.test(l[l.length - 1]))).toBe(true);
  });

  it('reservação (E4.1): os dois quartos (2 pessoas cada), 800 L/dia; caixa com medidas = volume bruto', () => {
    const m = sobrado();
    const cx = m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    const comMedidas = applyCommand(m, { type: 'SetTerminalProps', terminalId: cx.id, larguraMm: 1200, profundidadeMm: 1000, alturaMm: 800 }).model;
    const b = memorialDeCalculoHidro(comMedidas, HIPOTESES_HIDRO_PADRAO, ctx);
    const r = tabelas(b).find((t) => t.cabecalho[0] === 'Reservatório')!;
    expect(r.linhas[0][4]).toBe('960 (bruto)');
    expect(r.linhas[0][1]).toBe('Superior');
    const pop = tabelas(b).find((t) => t.cabecalho[0] === 'Ambiente')!;
    expect(pop.linhas).toEqual([['Quarto', 'Dormitório', '2'], ['Quarto', 'Dormitório', '2'], ['Total contado', '', '4']]);
    const grandezas = tabelas(b).find((t) => t.cabecalho[0] === 'Grandeza')!;
    expect(grandezas.linhas.find((l) => l[0] === 'Consumo diário')![1]).toBe('800 L');
    expect(b.some((x) => x.tipo === 'paragrafo' && x.texto === 'Atende: Reservar 800 L; o desenho tem 960 L.')).toBe(true);
  });

  it('só esgoto: nenhuma linha de premissa nem seção de água', () => {
    const m = sobrado();
    const soEsgoto = { ...m, trechos: m.trechos!.filter((t) => t.disciplina === 'ESGOTO'), terminais: m.terminais!.filter((t) => t.disciplina === 'ESGOTO') };
    const b = memorialDeCalculoHidro(soEsgoto, HIPOTESES_HIDRO_PADRAO, ctx);
    expect(secoes(b)).not.toContain('Água fria e água quente');
    const premissas = tabelas(b)[0];
    expect(premissas.linhas.every((l) => l[0] === 'Esgoto')).toBe(true);
  });

  it('desenho sem rede: diz que não há o que memorializar', () => {
    const vazio = applyBatch(applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model, []).model;
    const b = memorialDeCalculoHidro(vazio, HIPOTESES_HIDRO_PADRAO, ctx);
    expect(secoes(b)).toEqual([]);
    expect(b.some((x) => x.tipo === 'paragrafo' && /nada a memorializar/.test(x.texto))).toBe(true);
  });

  it('o cabeçalho amarra o documento ao desenho (base e kernel) e ao aviso de responsabilidade', () => {
    const b = memorialDeCalculoHidro(sobrado(), HIPOTESES_HIDRO_PADRAO, ctx);
    const texto = b.filter((x) => x.tipo === 'paragrafo').map((x) => (x as { texto: string }).texto).join(' ');
    expect(texto).toMatch(/base [0-9a-f]{16}, blueprint-kernel-ts-/);
    expect(texto).toMatch(/Gerado em 28\/09\/2026/);
    expect(texto).toMatch(/profissional habilitado/);
  });
});

describe('E3.2 — memorial descritivo', () => {
  it('objeto, normas, sistemas, materiais, peças, premissas e ensaios — dos mesmos dados', () => {
    const b = memorialDescritivoHidro(sobrado(), HIPOTESES_HIDRO_PADRAO, ctx);
    expect(secoes(b)).toEqual(['Objeto', 'Normas', 'Sistemas', 'Materiais', 'Peças e pontos de utilização', 'Premissas', 'Execução e ensaios']);
    const normas = tabelas(b).find((t) => t.cabecalho[0] === 'Norma')!;
    expect(normas.linhas.map((l) => l[0])).toEqual(['ABNT NBR 5626:2020', 'ABNT NBR 8160:1999']);
    const materiais = tabelas(b).find((t) => t.cabecalho[0] === 'Rede — material')!;
    expect(materiais.linhas.some((l) => /^Água fria — PVC soldável$/.test(l[0]))).toBe(true);
    expect(materiais.linhas.some((l) => /^Esgoto — PVC esgoto/.test(l[0]) && l[1].includes('100'))).toBe(true);
    const pecas = tabelas(b).find((t) => t.cabecalho[0] === 'Peça')!;
    expect(pecas.linhas.find((l) => l[0] === 'Vaso sanitário' && l[1] === 'Esgoto' && l[2] === 'Superior')?.[3]).toBe('1');
    const objeto = b.find((x) => x.tipo === 'paragrafo' && x.texto.startsWith('Este memorial'))!;
    expect((objeto as { texto: string }).texto).toMatch(/água fria e esgoto sanitário.*2 pavimento\(s\): Térreo, Superior/);
  });
});

describe('E3 — texto, DOCX e PDF', () => {
  it('blocos → linhas → blocos: ida e volta sem perda (inclusive "|" e célula vazia)', () => {
    const b = memorialDeCalculoHidro(sobrado(), HIPOTESES_HIDRO_PADRAO, ctx);
    const comPipe: BlocoDoMemorial[] = [...b, { tipo: 'tabela', cabecalho: ['a | b', 'c'], linhas: [['', 'x \\ y'], ['1', '']] }];
    expect(blocosDasLinhas(linhasDoMemorial(comPipe))).toEqual(comPipe);
  });

  it('DOCX: os cinco arquivos, título e tabela no document.xml, XML escapado, página deitada quando pedida', () => {
    const b: BlocoDoMemorial[] = [
      { tipo: 'titulo', texto: 'Memorial <teste> & cia' },
      { tipo: 'tabela', cabecalho: ['Trecho', 'ΣP'], linhas: [['T01', '1,0']] },
    ];
    expect(arquivosDoDocx(b).map((a) => a.caminho)).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/document.xml']);
    const d = documentoDoMemorial(b, true);
    expect(d).toContain('<w:pStyle w:val="Title"/>');
    expect(d).toContain('Memorial &lt;teste&gt; &amp; cia');
    expect(d).toContain('<w:tblHeader/>');
    expect(d).toContain('ΣP');
    expect(d).toContain('w:orient="landscape"');
    expect(documentoDoMemorial(b, false)).not.toContain('landscape');
  });

  it('PDF: o que as fontes WinAnsi não têm vira texto legível', () => {
    expect(paraWinAnsi('Q = 0,3 · √ΣP')).toBe('Q = 0,3 · raiz(soma P)');
    expect(paraWinAnsi('cota −0,70 · Δh · de → para · ø100 — ok')).toBe('cota -0,70 · delta h · de -> para · ø100 — ok');
  });
});
