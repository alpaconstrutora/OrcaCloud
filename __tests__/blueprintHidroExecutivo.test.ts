/**
 * E3.3 — EMISSÃO DO PROJETO EXECUTIVO HIDROSSANITÁRIO com ART (29/09/2026):
 * a conferência NBR 5626/8160 que libera a emissão, o hash da base (desenho +
 * premissas) e o memorial gravado. E as premissas do ESTUDO (a coluna parcial
 * completada com o padrão).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRO_PADRAO, blocosDasLinhas, linhasDoMemorial } from '../utils/blueprintMemorialHidro';
import { hashDaBaseHidro, memorialExecutivoHidro, verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { RESPONSAVEL_VAZIO, type ResponsavelTecnico } from '../utils/blueprintTopografiaExecutivo';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { sobrado } from './fixtures/sobradoHidro';

const ana: ResponsavelTecnico = { nome: 'Ana Souza', titulo: 'Engenheira Civil', conselho: 'CREA', registro: 'SP-5069', artNumero: '2802723', artData: '2026-09-29' };
/** Tudo confirmado (o lançamento nasce sugerido). */
const confirmado = (m: BlueprintModel): BlueprintModel => ({
  ...m,
  trechos: (m.trechos ?? []).map((t) => ({ ...t, sugerido: false })),
  terminais: (m.terminais ?? []).map((t) => ({ ...t, sugerida: false })),
});
/** Caixa elevada 4,5 m acima do piso do superior e DN ajustado pela pressão: atende a tudo. */
const pronto = () => confirmado(sobrado(true, { cotaDaCaixaMm: 4500, comAjuste: true }));
const itens = (m: BlueprintModel, r: ResponsavelTecnico = ana) => verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, r);

describe('E3.3 — a conferência que libera a emissão', () => {
  it('sobrado com caixa elevada, confirmado e com responsável: nenhuma pendência, pode emitir', () => {
    const r = itens(pronto());
    expect(r.pendencias).toEqual([]);
    expect(r.podeEmitir).toBe(true);
    expect([...new Set(r.verificacoes.map((v) => v.grupo))]).toEqual(['RESPONSAVEL', 'DADOS', 'NBR5626', 'NBR8160']);
  });

  it('sem responsável nem ART: as duas pendências do grupo RESPONSAVEL', () => {
    const r = itens(pronto(), RESPONSAVEL_VAZIO);
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias).toEqual(['Responsável técnico identificado: incompleto', 'ART recolhida: incompleta']);
  });

  it('caixa no teto do superior: o chuveiro de cima não tem pressão — nem o ajuste de DN resolve', () => {
    const r = itens(confirmado(sobrado(true, { comAjuste: true })));
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias).toHaveLength(1);
    expect(r.pendencias[0]).toMatch(/^Pressão dinâmica mínima em cada ponto: 1 ponto\(s\) abaixo; pior Chuveiro -?\d+,\d kPa$/);
  });

  it('peça ainda sugerida trava a emissão (o lançamento nasce sugerido)', () => {
    const r = itens(sobrado(true, { cotaDaCaixaMm: 4500, comAjuste: true }));
    expect(r.pendencias.some((p) => /^Nenhuma peça ainda sugerida: \d+ sugerida\(s\)$/.test(p))).toBe(true);
  });

  it('DN do esgoto reduzido à mão: pendência da NBR 8160', () => {
    const m = pronto();
    const tronco = m.trechos!.find((t) => t.disciplina === 'ESGOTO' && t.bitolaMm === 100 && (t.a.x !== t.b.x || t.a.y !== t.b.y))!;
    const r = itens(applyCommand(m, { type: 'SetTrechoProps', trechoId: tronco.id, bitolaMm: 50 }).model);
    expect(r.pendencias.some((p) => p.startsWith('DN de cada trecho pelas UHC a montante:'))).toBe(true);
  });

  it('desenho sem instalação: não há o que emitir', () => {
    const m = pronto();
    const r = itens({ ...m, trechos: [], terminais: [] });
    expect(r.pendencias).toContain('Há instalação hidrossanitária no desenho: nenhuma');
    expect(r.verificacoes.some((v) => v.grupo === 'NBR5626' || v.grupo === 'NBR8160')).toBe(false);
  });
});

describe('E3.3 — a base da emissão', () => {
  it('o hash é estável e muda com o desenho OU com as premissas', () => {
    const m = pronto();
    const h = hashDaBaseHidro(m, HIPOTESES_HIDRO_PADRAO);
    expect(h.desenho).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDaBaseHidro(m, HIPOTESES_HIDRO_PADRAO)).toEqual(h);
    const outraPremissa = { ...HIPOTESES_HIDRO_PADRAO, pressao: { ...HIPOTESES_HIDRO_PADRAO.pressao, pressaoMinimaKpa: 15 } };
    const h2 = hashDaBaseHidro(m, outraPremissa);
    expect(h2.desenho).toBe(h.desenho);
    expect(h2.base).not.toBe(h.base);
    const vaso = m.terminais!.find((t) => t.tipoHidraulico === 'VASO_SANITARIO')!;
    const movido = applyCommand(m, { type: 'SetTerminalProps', terminalId: vaso.id, cotaMm: vaso.cotaMm + 10 }).model;
    expect(hashDaBaseHidro(movido, HIPOTESES_HIDRO_PADRAO).base).not.toBe(h.base);
  });

  it('o memorial da emissão: capa (responsável, ART, base, verificações, declaração) + cálculo + descritivo; volta do texto gravado', () => {
    const m = pronto();
    const r = itens(m);
    const h = hashDaBaseHidro(m, HIPOTESES_HIDRO_PADRAO);
    const blocos = memorialExecutivoHidro(m, HIPOTESES_HIDRO_PADRAO, ana, r, { nomeDoEstudo: 'Sobrado', hashDoDesenho: h.desenho, hashDaBase: h.base, emitidoEm: '2026-09-29T10:00:00Z' });
    const titulos = blocos.filter((b) => b.tipo === 'titulo').map((b) => (b as { texto: string }).texto);
    expect(titulos).toEqual([
      'Projeto executivo de instalações hidrossanitárias',
      'Memorial de cálculo — instalações hidrossanitárias',
      'Memorial descritivo — instalações hidrossanitárias',
    ]);
    const resp = blocos.find((b) => b.tipo === 'tabela' && b.cabecalho[0] === 'Nome') as { linhas: string[][] };
    expect(resp.linhas[0]).toEqual(['Ana Souza', 'Engenheira Civil', 'CREA SP-5069', '2802723', '29/09/2026']);
    const verif = blocos.find((b) => b.tipo === 'tabela' && b.cabecalho[1] === 'Verificação') as { linhas: string[][] };
    expect(verif.linhas).toHaveLength(r.verificacoes.length);
    expect(verif.linhas.every((l) => l[5] === 'Atende')).toBe(true);
    const texto = linhasDoMemorial(blocos).join('\n');
    expect(texto).toContain(`Desenho ${h.desenho.slice(0, 16)} e premissas ${h.base.slice(0, 16)}`);
    expect(texto).toMatch(/não substitui o profissional habilitado/);
    expect(blocosDasLinhas(texto.split('\n'))).toEqual(blocos);
  });
});

describe('E3.3 — premissas do estudo (coluna parcial)', () => {
  it('completa com o padrão, ignora tipo errado e chave estranha, e aceita `rotaMaximaVezes: null`', () => {
    const h = hipotesesHidroDaColuna({
      agua: { velocidadeMaxMs: 2.5, dnMinimoAguaFriaMm: '25', rotaMaximaVezes: null, lixo: 1 },
      pressao: { pressaoMinimaKpa: 15 },
    });
    expect(h.agua.velocidadeMaxMs).toBe(2.5);
    expect(h.agua.dnMinimoAguaFriaMm).toBe(HIPOTESES_HIDRO_PADRAO.agua.dnMinimoAguaFriaMm);
    expect(h.agua.rotaMaximaVezes).toBeNull();
    expect((h.agua as unknown as Record<string, unknown>).lixo).toBeUndefined();
    expect(h.pressao.pressaoMinimaKpa).toBe(15);
    expect(h.pressao.estaticaMaximaKpa).toBe(HIPOTESES_HIDRO_PADRAO.pressao.estaticaMaximaKpa);
    expect(h.esgoto).toEqual(HIPOTESES_HIDRO_PADRAO.esgoto);
    expect(hipotesesHidroDaColuna(null)).toEqual(HIPOTESES_HIDRO_PADRAO);
  });
});
