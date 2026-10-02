/**
 * Travas dos três defeitos que a PROVA REAL do envio da Planta Inteligente ao
 * Empreendimento achou em 02/10/2026 (Estudo de Massa, M3) — e que existiam no
 * envio do loteamento (B3) desde 25/09, sem nenhum teste pegar:
 *
 *  1. `EMPREENDIMENTO_COLS` não tinha `blueprint_study_id`: o vínculo era gravado,
 *     mas `getById` não o devolvia, e todo envio parava em "não está vinculado".
 *  2. O payload publicado chega como OBJETO (jsonb) e os adaptadores faziam
 *     `as string`: o parse lia "[object Object]".
 *  3. O relatório somava os avisos da origem duas vezes.
 *
 * As listas de colunas são EXPLÍCITAS (supabase-js exige literal), então a trava
 * é lida no texto do arquivo — coluna de proveniência nova sem entrar na lista
 * reprova aqui, e não em produção.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyBatch, canonicalPayload, emptyModel } from '../utils/blueprintKernel';
import { modeloDoPayloadPublicado } from '../services/sync/modeloPublicado';
import { relatorioDoPlano } from '../services/massaEmpreendimentoSync';
import { buildPlan } from '../services/sync/planner';
import type { CanonicalSide } from '../services/sync/types';
import type { Empreendimento } from '../types/empreendimento';

const fonte = readFileSync(path.resolve(__dirname, '../services/empreendimentoService.ts'), 'utf-8');
const lista = (nome: string) => {
  const m = new RegExp(`const ${nome} = '([^']+)'`).exec(fonte);
  return (m?.[1] ?? '').split(',').map((s) => s.trim());
};

describe('travas do envio da Planta Inteligente ao Empreendimento', () => {
  it('as colunas de proveniência estão nas listas explícitas de leitura', () => {
    expect(lista('EMPREENDIMENTO_COLS')).toEqual(expect.arrayContaining(['imovib_study_id', 'planta_ai_study_id', 'blueprint_study_id']));
    expect(lista('TOWER_COLS')).toEqual(expect.arrayContaining(['imovib_block_id', 'planta_ai_scenario_id', 'blueprint_quadra_uid', 'blueprint_bloco_uid']));
    expect(lista('UNIT_COLS')).toEqual(expect.arrayContaining(['imovib_instance_id', 'planta_ai_unit_id', 'blueprint_lote_uid', 'blueprint_massa_chave']));
  });

  it('o modelo publicado é lido de OBJETO (como o banco devolve) e de texto', () => {
    const m = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 },
    ]).model;
    const comBloco = applyBatch(m, [{ type: 'AddBloco', levelId: m.levels[0].id, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }] }]).model;
    const texto = canonicalPayload(comBloco);
    expect(modeloDoPayloadPublicado(JSON.parse(texto)).blocos).toHaveLength(1);
    expect(modeloDoPayloadPublicado(texto).blocos).toHaveLength(1);
    expect(() => modeloDoPayloadPublicado('[object Object]')).toThrow(/A versão publicada não pôde ser lida/);
  });

  it('o relatório não repete os avisos da origem', () => {
    const lado: CanonicalSide = {
      origin: 'massa',
      empreendimento: { id: 'e', organization_id: 'o' } as unknown as Empreendimento,
      towers: [],
      commonAreaCandidates: [],
      liveTowerSourceIds: new Set(),
      liveUnitSourceIds: new Set(),
      warnings: ['"Subsolo" é garagem: não vira torre.'],
    };
    const r = relatorioDoPlano(lado, buildPlan(lado, { towers: [], units: [], commonAreas: [] }));
    expect(r.warnings).toEqual(['"Subsolo" é garagem: não vira torre.']);
  });
});
