/**
 * O MEMORIAL ELÉTRICO EM BLOCOS (E5.3 do roadmap elétrico, 29/09/2026).
 *
 * Descritivo e de cálculo derivados do desenho na hora (antes da emissão), no
 * formato de blocos do memorial hidrossanitário — PDF com `paraWinAnsi` e DOCX.
 * Os textos do descritivo são editáveis por estudo e ficam FORA do hash da base.
 * A emissão com ART grava a capa + o cálculo + o descritivo.
 */
import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO, textoDoMemorial, type HipotesesEletricas } from '../utils/blueprintEletricaDimensionamento';
import { memorialDeCalculoEletrico, memorialDescritivoEletrico, memorialExecutivoEletrico } from '../utils/blueprintMemorialEletrico';
import { blocosDasLinhas, linhasDoMemorial, type BlocoDoMemorial } from '../utils/blueprintMemorialHidro';
import { arquivosDoDocx } from '../utils/blueprintMemorialDocx';
import { memorialHidroEmDocx, paraWinAnsi } from '../services/blueprintMemorialHidroService';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { hashDaBaseEletrica, memorialEletrico, verificacoesEletricas } from '../utils/blueprintEletricaExecutivo';
import { hipotesesDaColuna } from '../hooks/useBlueprintEletrica';

const TETO = 2800;
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
  const t = m.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: TETO });
  m = applyBatch(m, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, icnKa: 6, alimentadorM: 10 }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'SetQuadroProps', quadroId: q, dps: { classe: 'II', upKv: 1.5, inKa: 20, disjuntorDesconexaoA: 20 } }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1 — iluminação', tipo: 'Iluminação', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10, curva: 'C' }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2 — tomadas', tipo: 'TUG sala', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16, curva: 'C' }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  m = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 25, idnMa: 30, polos: 2, circuitoIds: [c2] }).model;
  const ponto = (x: number, y: number, tipoEletrico: string, cotaMm: number, circuitoId: string, potenciaW: number) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico, potenciaW } as never).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  };
  ponto(3000, 2000, 'ILUMINACAO_TETO', TETO, c1, 100);
  ponto(2000, 75, 'TUG', 300, c2, 600);
  ponto(4000, 75, 'TUG', 300, c2, 600);
  m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(3000, 2000), cotaAMm: TETO, cotaBMm: TETO, bitolaMm: 25, circuitoIds: [c1] }).model;
  return m;
}
const CTX = { nomeDoEstudo: 'Casa', geradoEm: '2026-09-29T12:00:00Z' };
const secoes = (b: BlocoDoMemorial[]) => b.filter((x) => x.tipo === 'secao').map((x) => (x as { texto: string }).texto);
const textos = (b: BlocoDoMemorial[]) => b.map((x) => (x.tipo === 'tabela' ? [...x.cabecalho, ...x.linhas.flat()].join(' | ') : x.texto)).join('\n');

describe('memorial descritivo', () => {
  it('as seções do plano, na ordem; Observações só com texto; sem quadro, só o cabeçalho (nenhuma seção)', () => {
    const m = casa();
    expect(secoes(memorialDescritivoEletrico(m, HIPOTESES_PADRAO, CTX))).toEqual(['Objeto', 'Normas', 'Entrada de energia', 'Quadros de distribuição', 'Circuitos', 'Proteção', 'Condutores e eletrodutos', 'Aterramento', 'Quantitativos']);
    const comObs = { ...HIPOTESES_PADRAO, textosDoMemorial: { observacoes: 'Entregar com as-built.' } };
    expect(secoes(memorialDescritivoEletrico(m, comObs, CTX)).at(-1)).toBe('Observações');
    const vazio = memorialDescritivoEletrico(emptyModel(), HIPOTESES_PADRAO, CTX);
    expect(secoes(vazio)).toEqual([]);
    expect(vazio[0]).toEqual({ tipo: 'titulo', texto: 'Memorial descritivo — instalações elétricas' });
  });

  it('o conteúdo sai do desenho: objeto gerado, normas pelo que existe, quadro com DPS e Icn, circuitos com seções F/N/PE, disjuntor com curva, DR', () => {
    const t = textos(memorialDescritivoEletrico(casa(), HIPOTESES_PADRAO, CTX));
    expect(t).toMatch(/instalações elétricas de baixa tensão do estudo "Casa": 1 quadro\(s\), 2 circuito\(s\) e 3 ponto\(s\) em 1 pavimento\(s\)/);
    for (const x of ['ABNT NBR 5410:2004', 'ABNT NBR 14136', 'ABNT NBR NM 60898', 'Norma técnica da concessionária local', 'DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A', 'C2 — tomadas', 'TUG sala', '2,5 / 2,5 / 2,5', '16 A C', '25 A / 30 mA · 2P', 'Condutor fase 1,5 mm²', 'Eletroduto Ø25']) expect(t, x).toContain(x);
    // A categoria com vírgula decimal (7,5 — antes saía "7.5") e a frase do "conferir" com maiúscula.
    expect(t).toMatch(/QDC: categoria M1 \(FN até 7,5 kVA\)/);
    expect(t).toMatch(/hipótese de projeto\. Valores usuais de projeto/);
  });

  it('⚠️ os textos são EDITÁVEIS por estudo, com o padrão quando vazios — e ficam FORA do hash da base (editar não invalida emissão)', () => {
    const m = casa();
    const editado: HipotesesEletricas = { ...HIPOTESES_PADRAO, textosDoMemorial: { objeto: 'Reforma elétrica do apartamento 101.', aterramento: 'Esquema TN-S com haste existente.' } };
    const t = textos(memorialDescritivoEletrico(m, editado, CTX));
    expect(t).toContain('Reforma elétrica do apartamento 101.');
    expect(t).not.toMatch(/do estudo "Casa": 1 quadro/);
    expect(t).toContain('Esquema TN-S com haste existente.');
    expect(t).toContain(TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO.execucao);
    expect(textoDoMemorial({ textosDoMemorial: { execucao: '   ' } }, 'execucao')).toBe(TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO.execucao);
    expect(hashDaBaseEletrica(m, editado).base).toBe(hashDaBaseEletrica(m, HIPOTESES_PADRAO).base);
    // Uma hipótese de cálculo, sim, muda o hash.
    expect(hashDaBaseEletrica(m, { ...HIPOTESES_PADRAO, ikEntradaKa: 10 }).base).not.toBe(hashDaBaseEletrica(m, HIPOTESES_PADRAO).base);
    // A coluna gravada lê só strings.
    expect(hipotesesDaColuna({ textosDoMemorial: { objeto: 'x', aterramento: 3, lixo: 'y' } }).textosDoMemorial).toEqual({ objeto: 'x' });
    expect(hipotesesDaColuna({}).textosDoMemorial).toEqual({});
  });
});

describe('memorial de cálculo', () => {
  it('hipóteses, cada quadro com a tabela dos circuitos (IB, seção, Iz, disjuntor, curva, ΔV, situação) e a conferência regra a regra', () => {
    const m = casa();
    const b = memorialDeCalculoEletrico(m, HIPOTESES_PADRAO, CTX);
    expect(secoes(b)).toEqual(['Hipóteses', 'Quadros e circuitos', 'Conferência NBR 5410']);
    expect(b.filter((x) => x.tipo === 'subsecao').map((x) => (x as { texto: string }).texto)).toEqual(['QDC — QD · FN 127 V · entrada']);
    const tabelaDoQuadro = b.find((x) => x.tipo === 'tabela' && x.cabecalho[0] === 'Circuito') as Extract<BlocoDoMemorial, { tipo: 'tabela' }>;
    expect(tabelaDoQuadro.cabecalho).toEqual(['Circuito', 'Lig./V', 'VA', 'IB (A)', 'Seção decl./mín. (mm²)', 'Iz (A)', 'Disjuntor decl./sug. (A)', 'Curva', 'ΔV (%)', 'Situação']);
    expect(tabelaDoQuadro.linhas.map((l) => l[0])).toEqual(['C1 — iluminação', 'C2 — tomadas']);
    expect(tabelaDoQuadro.linhas[1][2]).toBe('1200');
    const conf = b.at(-1) as Extract<BlocoDoMemorial, { tipo: 'tabela' }>;
    expect(conf.linhas.map((l) => l[0])).toEqual(conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.map((r) => (r.codigo === 'SUGERIDAS' ? 'Sugeridas' : r.codigo === 'ENTRADA' ? 'Entrada' : r.codigo)));
    const t = textos(b);
    expect(t).toMatch(/Queda máxima da origem \(6\.2\.7\.1\) \| 5,0 %/);
    expect(t).toMatch(/Carga instalada 1300 VA; demandada 1300 VA/);
    expect(t).toMatch(/queda no alimentador [\d,]+ % em 10,0 m/);
    expect(secoes(memorialDeCalculoEletrico(emptyModel(), HIPOTESES_PADRAO, CTX))).toEqual([]);
  });
});

describe('emissão, PDF e DOCX', () => {
  it('a emissão grava capa + cálculo + descritivo, e o texto gravado volta aos mesmos blocos', () => {
    const m = casa();
    const RT = { nome: 'Eng.', titulo: 'Engenheiro', conselho: 'CREA' as const, registro: '1', artNumero: '123', artData: '2026-09-29' };
    const r = verificacoesEletricas(m, HIPOTESES_PADRAO, RT, conferirNbr5410(m, null, HIPOTESES_PADRAO));
    const capa = memorialEletrico(RT, HIPOTESES_PADRAO, r, { nomeDoEstudo: 'Casa', hashDoDesenho: 'd'.repeat(64), hashDaBase: 'b'.repeat(64), emitidoEm: CTX.geradoEm }, m);
    const blocos = memorialExecutivoEletrico(capa, m, HIPOTESES_PADRAO, CTX);
    const s = secoes(blocos);
    expect(s.slice(0, 2)).toEqual(['1. Responsável técnico', '2. Base do projeto']);
    expect(s).toContain('Memorial de cálculo');
    expect(s).toContain('Memorial descritivo');
    expect(s.indexOf('Memorial de cálculo')).toBeLessThan(s.indexOf('Memorial descritivo'));
    expect(blocos.filter((x) => x.tipo === 'titulo')).toHaveLength(1); // os cabeçalhos dos dois saem
    const gravado = linhasDoMemorial(blocos).join('\n');
    expect(blocosDasLinhas(gravado.split('\n'))).toEqual(blocos);
  });

  it('⚠️ DOCX: abre como zip, tem as cinco partes, o document.xml tem título, seções e tabelas, e as tags fecham (XML bem formado)', async () => {
    const b = memorialDescritivoEletrico(casa(), HIPOTESES_PADRAO, CTX);
    expect(arquivosDoDocx(b).map((a) => a.caminho)).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/document.xml']);
    const blob = await memorialHidroEmDocx(b);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const zip = new PizZip(await blob.arrayBuffer());
    const doc = zip.file('word/document.xml')!.asText();
    expect(doc).toContain('<w:pStyle w:val="Title"/>');
    expect(doc).toContain('Memorial descritivo — instalações elétricas');
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain('<w:tbl>');
    expect(doc).toContain('Quadros de distribuição');
    // Tags balanceadas: cada abertura tem o seu fechamento, na ordem.
    const pilha: string[] = [];
    for (const m of doc.matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
      const [, fecha, nome, auto] = m;
      if (nome.startsWith('?') || auto) continue;
      if (fecha) expect(pilha.pop(), `fechou ${nome}`).toBe(nome);
      else pilha.push(nome);
    }
    expect(pilha).toEqual([]);
    for (const parte of ['[Content_Types].xml', 'word/styles.xml']) expect(zip.file(parte)).not.toBeNull();
    // ⚠️ Um LEITOR DE DOCX de verdade (mammoth) abre o arquivo e tira o texto e as tabelas.
    const mammoth = await import('mammoth');
    const html = (await mammoth.convertToHtml({ buffer: Buffer.from(await blob.arrayBuffer()) })).value;
    expect(html).toContain('Memorial descritivo — instalações elétricas');
    expect(html).toContain('Quadros de distribuição');
    expect(html).toContain('<table>');
    expect(html).toContain('ABNT NBR 5410:2004');
  });

  it('PDF: Ω, ρ, ≤ e ≥ do memorial elétrico viram texto WinAnsi legível (não "?")', () => {
    expect(paraWinAnsi('ρ 0,0206 Ω·mm²/m')).toBe('rho 0,0206 ohm·mm²/m');
    expect(paraWinAnsi('IB ≤ In ≤ Iz · Icn ≥ Ik')).toBe('IB <= In <= Iz · Icn >= Ik');
    expect(paraWinAnsi('ΔV 2,1 %')).toBe('delta V 2,1 %');
    const t = textos(memorialDeCalculoEletrico(casa(), HIPOTESES_PADRAO, CTX));
    expect(paraWinAnsi(t)).not.toMatch(/\?·mm²/);
  });
});
