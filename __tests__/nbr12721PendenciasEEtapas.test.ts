/**
 * Áreas NBR 12721 — pendências que levam à ação, etapas do documento e a prévia do rascunho
 * (crítica `/impeccable` de 15/11/2026, `docs/planos/2026-11-15-areas-nbr12721-critica.md`).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { ambientesParaClassificar, entradaDoEstudo, HIPOTESES_NBR12721_PADRAO } from '../utils/blueprintNbr12721';
import { calcularNbr12721, VERSAO_DO_MOTOR_NBR12721 } from '../utils/nbr12721/quadros';
import { ondeEsta, pendenciasLegiveis } from '../utils/nbr12721/pendenciasLegiveis';
import { etapasDoDocumentoNbr12721, type SituacaoDoDocumentoNbr } from '../utils/nbr12721/etapas';
import { cabecalhoDoDocumentoNbr12721, documentoDaPrevia, nomeDoArquivoNbr12721, tabelasDoDocumentoNbr12721 } from '../utils/nbr12721/documento';

/** "1º" com 2 salas (unidades 101 e 102) e um Hall comum gravado como "padrão diferente" SEM coeficiente. */
function predioBloqueado(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 12000, 0, 200), w(12000, 0, 12000, 8000, 200), w(12000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200), w(0, 6000, 12000, 6000, 150), w(6000, 0, 6000, 6000, 150)]).model;
  const sala = (x: number) => m.spaces.find((s) => s.areaMm2 === 36_000_000 && Math.min(...s.ring.map((p) => p.x)) === x)!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala(0), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: sala(6000), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: m.spaces.find((s) => s.areaMm2 === 24_000_000)!.id, name: 'Hall' },
  ]).model;
  m = applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [m.labels.find((l) => l.name === 'Sala 101')!.id] },
    { type: 'AddUnidade', numero: '102', labelIds: [m.labels.find((l) => l.name === 'Sala 102')!.id] },
  ]).model;
  const hall = m.labels.find((l) => l.name === 'Hall')!.id;
  return applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [hall], declaradoIds: [], nbr12721: { cobertura: 'DIFERENTE', divisao: 'PROPORCIONAL' } } as Command).model;
}

function legiveis(m: BlueprintModel) {
  const { entrada, avisos } = entradaDoEstudo(m, HIPOTESES_NBR12721_PADRAO);
  const saida = calcularNbr12721(entrada);
  const linhas = ambientesParaClassificar(m);
  return { saida, linhas, pendencias: pendenciasLegiveis({ pendencias: saida.pendencias, entrada, avisos, linhas }) };
}

describe('pendenciasLegiveis', () => {
  it('MOTOR_007 diz o ambiente, o pavimento e o conserto; "Resolver" aponta a linha do Hall e o campo das hipóteses', () => {
    const { saida, linhas, pendencias } = legiveis(predioBloqueado());
    expect(saida.status).toBe('failed');
    const p = pendencias[0];
    expect(p.tom).toBe('bloqueia');
    expect(p.codigo).toBe('MOTOR_007');
    expect(p.itens.map(ondeEsta)).toEqual(['Hall · 1º']);
    expect(p.conserto).toMatch(/coeficiente/);
    const hall = linhas.find((l) => l.nome === 'Hall')!;
    expect(p.acoes).toEqual([
      { rotulo: 'Classificar o ambiente', alvo: { tipo: 'classificar', chaves: [hall.chave] } },
      { rotulo: 'Definir o padrão em Hipóteses', alvo: { tipo: 'hipoteses', campo: 'diferente' } },
    ]);
  });

  it('o que entrou pela sugestão vira UM item "a confirmar", depois do que bloqueia, com o filtro da Classificação', () => {
    const { pendencias } = legiveis(predioBloqueado());
    const sugestao = pendencias.find((p) => p.tom === 'classificar')!;
    expect(pendencias.indexOf(sugestao)).toBeGreaterThan(0);
    expect(sugestao.titulo).toBe('2 ambientes entraram no cálculo pela sugestão da Planta');
    expect(sugestao.itens.map((i) => i.nome).sort()).toEqual(['Sala 101', 'Sala 102']);
    expect(sugestao.acoes[0].alvo).toEqual({ tipo: 'aba', aba: 'classificacao', soAClassificar: true });
  });

  it('declarado: o código `dcl:<uid>` leva à linha do declarado', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    m = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: m.levels[0].id, nome: 'Varanda', areaMm2: 5_000_000 }).model;
    const id = m.ambientesDeclarados![0].id;
    m = applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [], declaradoIds: [id], nbr12721: { cobertura: 'DESCOBERTA', divisao: 'PROPORCIONAL' } } as Command).model;
    const { pendencias, linhas } = legiveis(m);
    const p = pendencias.find((x) => x.codigo === 'MOTOR_007')!;
    expect(p.itens[0]).toMatchObject({ nome: 'Varanda', pavimento: 'Térreo', chave: linhas[0].chave });
    // Só descoberta sem padrão: o "Resolver" leva ao campo da descoberta.
    expect(p.acoes[1].alvo).toEqual({ tipo: 'hipoteses', campo: 'descoberta' });
  });
});

describe('etapasDoDocumentoNbr12721', () => {
  const base: SituacaoDoDocumentoNbr = { bloqueado: false, versao: null, hashDoRascunho: 'h1', empreendimento: { nome: 'Garden', fracoesLevadas: false } };

  it('bloqueado: a 1ª etapa é a atual e o próximo passo leva às pendências', () => {
    const r = etapasDoDocumentoNbr12721({ ...base, bloqueado: true });
    expect(r.etapas.map((e) => e.estado)).toEqual(['atual', 'futura', 'futura', 'futura', 'futura']);
    expect(r.proximo.acao).toBe('pendencias');
  });

  it('sem versão: publicar no painel Versões', () => {
    const r = etapasDoDocumentoNbr12721(base);
    expect(r.etapas.find((e) => e.estado === 'atual')!.id).toBe('versao');
    expect(r.proximo).toMatchObject({ acao: 'versoes', rotuloDaAcao: 'Abrir Versões' });
  });

  it('versão aprovada nas duas e frações levadas: tudo feito, sem ação', () => {
    const r = etapasDoDocumentoNbr12721({ ...base, versao: { revisao: 3, hash: 'h1', tecnica: true, juridica: true }, empreendimento: { nome: 'Garden', fracoesLevadas: true } });
    expect(r.etapas.every((e) => e.estado === 'feita')).toBe(true);
    expect(r.proximo.acao).toBeNull();
    expect(r.proximo.texto).toMatch(/versão 3 está aprovada e as frações estão em Garden/);
  });

  it('o rascunho mudou desde a versão: publicar de novo, e o que vinha depois volta a "a fazer"', () => {
    const r = etapasDoDocumentoNbr12721({ ...base, hashDoRascunho: 'h2', versao: { revisao: 3, hash: 'h1', tecnica: true, juridica: true } });
    expect(r.rascunhoMudou).toBe(true);
    expect(r.etapas.find((e) => e.estado === 'atual')!.id).toBe('versao');
    expect(r.proximo.texto).toMatch(/mudou desde a versão 3/);
  });

  it('estudo sem Empreendimento: quatro etapas', () => {
    expect(etapasDoDocumentoNbr12721({ ...base, empreendimento: null }).etapas).toHaveLength(4);
  });
});

describe('documentoDaPrevia', () => {
  it('cabeçalho, arquivo e tabelas dizem PRÉVIA: sem hash, sem aprovação, sem a tabela de aprovações', () => {
    const { saida } = legiveis(predioBloqueado());
    const d = documentoDaPrevia('Garden Cambuhy', saida, VERSAO_DO_MOTOR_NBR12721, new Date('2026-11-15T12:00:00Z'));
    expect(cabecalhoDoDocumentoNbr12721(d)[0]).toEqual(['Documento', 'PRÉVIA do rascunho — não publicada: sem versão, sem hash e sem aprovação']);
    expect(nomeDoArquivoNbr12721(d)).toBe('areas_nbr12721_Garden_Cambuhy_previa');
    const abas = tabelasDoDocumentoNbr12721(d).map((t) => t.aba);
    expect(abas).toContain('Quadro I');
    expect(abas).not.toContain('Aprovações');
  });
});
