/**
 * CLIMATIZAÇÃO E8.4 (07/10/2026): o PROJETO DE CLIMATIZAÇÃO com ART — as
 * verificações saem das mesmas conferências das gavetas, o hash da base amarra
 * desenho + premissas + materiais + cidade, e a capa leva os dois memoriais.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoEstudo, cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { planejarLinhasFrigorigenas } from '../utils/blueprintLinhaFrigorigena';
import { hashDaBaseClimatizacao, memorialExecutivoClimatizacao, verificacoesClimatizacao } from '../utils/blueprintClimatizacaoExecutivo';
import { blocosDasLinhas, linhasDoMemorial } from '../utils/blueprintMemorialHidro';
import { paraWinAnsi } from '../services/blueprintMemorialHidroService';
import type { ResponsavelTecnico } from '../utils/blueprintTopografiaExecutivo';

const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const RT: ResponsavelTecnico = { nome: 'Ana Engenheira', titulo: 'Engenheira Mecânica', conselho: 'CREA', registro: 'MG 123456', artNumero: 'MG2026000001', artData: '2026-10-07' };
const SEM_RT: ResponsavelTecnico = { nome: '', titulo: '', conselho: 'CREA', registro: '', artNumero: '', artData: '' };
const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const nome = () => 'Térreo';

/** Sala + Cozinha; o split escolhido pela carga (E4) e a linha e o dreno lançados (E5). */
function casa(instalada = true) {
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
  if (!instalada) return m;
  const carga = cargaTermicaDoNivel(m, hip, t);
  m = applyBatch(m, planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO).comandos).model;
  return applyBatch(m, planejarLinhasFrigorigenas(m, t, hip.linha).comandos).model;
}

describe('climatização E8.4 · verificações', () => {
  it('⚠️ PRONTO QUANDO: sem responsável não emite; com ele e o split lançado pela cadeia, as conferências das gavetas viram verificações', () => {
    const m = casa();
    const niveis = cargaTermicaDoEstudo(m, hip);
    const sem = verificacoesClimatizacao(m, niveis, hip, SEM_RT, nome);
    expect(sem.podeEmitir).toBe(false);
    expect(sem.pendencias.some((p) => /Responsável técnico identificado/.test(p))).toBe(true);
    expect(sem.pendencias.some((p) => /ART recolhida/.test(p))).toBe(true);

    const r = verificacoesClimatizacao(m, niveis, hip, RT, nome);
    const grupos = new Set(r.verificacoes.map((v) => v.grupo));
    expect([...grupos]).toEqual(expect.arrayContaining(['RESPONSAVEL', 'CARGA', 'SELECAO', 'LINHA']));
    // Nada de VRF nem de rede de ar neste desenho: os grupos não aparecem (NÃO AVALIADO não entra).
    expect(grupos.has('VRF')).toBe(false);
    expect(grupos.has('AR')).toBe(false);
    expect(r.verificacoes.some((v) => /Linha frigorígena entre cada evaporadora e sua condensadora — Térreo/.test(v.item) && v.atende)).toBe(true);
    // O catálogo é da organização — não é verificação do projeto.
    expect(r.verificacoes.some((v) => /Catálogo/.test(v.item))).toBe(false);
    expect(r.podeEmitir).toBe(r.pendencias.length === 0);
  });

  it('desenho sem ambiente climatizado nem equipamento não emite', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const r = verificacoesClimatizacao(vazio, cargaTermicaDoEstudo(vazio, hip), hip, RT, nome);
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias).toEqual(['Ambiente climatizado no desenho: nenhum']);
  });

  it('a evaporadora sem linha é FALTA e trava a emissão; o AVISO atende, dito no obtido', () => {
    const m = casa();
    const semLinha = applyBatch(m, (m.trechos ?? []).filter((t) => t.disciplina === 'FRIGORIGENA').map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }) as Command)).model;
    const r = verificacoesClimatizacao(semLinha, cargaTermicaDoEstudo(semLinha, hip), hip, RT, nome);
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias.some((p) => /Linha frigorígena entre cada evaporadora/.test(p))).toBe(true);
    const comAviso = verificacoesClimatizacao(m, cargaTermicaDoEstudo(m, hip), hip, RT, nome).verificacoes.filter((v) => v.obtido.startsWith('aviso: '));
    expect(comAviso.every((v) => v.atende)).toBe(true);
  });
});

describe('climatização E8.4 · base e memorial', () => {
  it('o hash da base muda com o desenho, as premissas, os materiais e a cidade', () => {
    const m = casa();
    const a = hashDaBaseClimatizacao(m, hip);
    expect(hashDaBaseClimatizacao(m, hip)).toEqual(a);
    expect(hashDaBaseClimatizacao(m, { ...hip, linha: { ...hip.linha, preCargaM: hip.linha.preCargaM + 2 } }).base).not.toBe(a.base);
    expect(hashDaBaseClimatizacao(m, hip, { cidadeDoContexto: 'Belo Horizonte' }).base).not.toBe(a.base);
    expect(hashDaBaseClimatizacao(m, hip, { materiais: [{ id: 'x', lambda: 0.5 }] }).base).not.toBe(a.base);
    const outra = casa(false);
    expect(hashDaBaseClimatizacao(outra, hip).desenho).not.toBe(a.desenho);
  });

  it('a capa: responsável, base, verificações, declaração — e os dois memoriais; ida e volta em texto sem perda; nada vira "?" no PDF', () => {
    const m = casa();
    const niveis = cargaTermicaDoEstudo(m, hip);
    const r = verificacoesClimatizacao(m, niveis, hip, RT, nome);
    const h = hashDaBaseClimatizacao(m, hip);
    const b = memorialExecutivoClimatizacao(m, niveis, hip, RT, r, { nomeDoEstudo: 'Casa', hashDoDesenho: h.desenho, hashDaBase: h.base, emitidoEm: '2026-10-07T12:00:00Z', nomeDoNivel: nome });
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'Projeto de climatização' });
    expect(b.filter((x) => x.tipo === 'secao').map((x) => x.texto).slice(0, 4)).toEqual(['Responsável técnico', 'Base do projeto', 'Verificações', 'Declaração']);
    expect(b.filter((x) => x.tipo === 'titulo').map((x) => x.texto)).toEqual(['Projeto de climatização', 'Memorial de cálculo', 'Memorial descritivo']);
    const linhas = linhasDoMemorial(b);
    const txt = linhas.join('\n');
    expect(txt).toMatch(/Emitido em 07\/10\/2026/);
    expect(txt).toMatch(/MG2026000001/);
    expect(txt).toMatch(/CONFERIR NA NORMA ou HIPÓTESE/);
    expect(txt).toMatch(/5\. Equipamentos e terminais/);
    expect(blocosDasLinhas(linhas)).toEqual(b);
    expect([...new Set(txt)].filter((ch) => ch !== '?' && ch !== '\n' && paraWinAnsi(ch).includes('?'))).toEqual([]);
  });
});
