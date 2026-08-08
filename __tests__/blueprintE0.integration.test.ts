/**
 * E0 — verificação de integração contra o Supabase REAL.
 *
 * Prova o que a chave anônima não alcança: RLS no caminho positivo e negativo,
 * a RPC de publicação, a idempotência, o conflito de revisão, os triggers de
 * imutabilidade e a reprodutibilidade do hash sobre um registro gravado.
 *
 * ⚠️ ESCREVE NO BANCO. Cria um estudo com nome marcado e o apaga no fim (o
 * CASCADE leva ramo, snapshot e objetos junto). Roda contra as tabelas
 * `blueprint_*`, que são novas e não são lidas por nenhuma tela — não toca em
 * dado de nenhum outro módulo.
 *
 * NÃO roda no CI: fica de fora enquanto `BLUEPRINT_E2E` não valer '1'.
 *
 * Duas formas de fornecer credencial — nenhuma delas versionada:
 *
 *   a) ambiente (some com o processo, mas fica no histórico do shell)
 *      BLUEPRINT_E2E=1 BLUEPRINT_EMAIL=... BLUEPRINT_PASSWORD='...' \
 *        npx vitest run __tests__/blueprintE0.integration.test.ts
 *
 *   b) `.env.local`, que está no .gitignore (linha 16):
 *      BLUEPRINT_E2E=1
 *      BLUEPRINT_EMAIL=voce@empresa.com
 *      BLUEPRINT_PASSWORD=...
 *
 * (b) mantém a senha fora do histórico do shell e dispensa escapar caractere
 * especial, mas ela PERSISTE em disco — apague as linhas quando terminar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { supabase } from '../lib/supabase';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  snapshotHash,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  createStudy,
  getBranch,
  listSnapshots,
  loadBranchModel,
  publishSnapshot,
  saveDraft,
  verifySnapshotIntegrity,
} from '../services/blueprintService';
import { BlueprintRevisionConflict } from '../types/blueprint';

/**
 * Credenciais: variável de ambiente, com `.env.local` como alternativa.
 *
 * `.env.local` está no .gitignore (linha 16) e já é onde o projeto guarda chave
 * local. Ler de lá evita duas coisas ruins: a senha atravessar o histórico do
 * shell, e o usuário ter que escapar caractere especial na linha de comando.
 * O Vite só expõe variáveis com prefixo `VITE_`, então este arquivo precisa ser
 * lido à mão — de propósito: `BLUEPRINT_PASSWORD` NUNCA deve chegar ao bundle.
 */
function fromEnvLocal(chave: string): string {
  try {
    const linha = readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .find((l) => l.trimStart().startsWith(`${chave}=`));
    if (!linha) return '';
    return linha.slice(linha.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

const ENABLED = (process.env.BLUEPRINT_E2E || fromEnvLocal('BLUEPRINT_E2E')) === '1';
const EMAIL = process.env.BLUEPRINT_EMAIL || fromEnvLocal('BLUEPRINT_EMAIL');
const PASSWORD = process.env.BLUEPRINT_PASSWORD || fromEnvLocal('BLUEPRINT_PASSWORD');

const MARCADOR = '[VERIFICACAO E0 — pode apagar]';

let orgId = '';
let outraOrgId: string | null = null;
let studyId = '';
let branchId = '';

/** Sala de 4 paredes + divisória: dois ambientes, geometria não trivial. */
function modeloDeTeste(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });

  return applyBatch(base.model, [
    w(0, 0, 6000, 0),
    w(6000, 0, 6000, 4000),
    w(6000, 4000, 0, 4000),
    w(0, 4000, 0, 0),
    w(3000, 0, 3000, 4000),
  ]).model;
}

describe.skipIf(!ENABLED)('E0 · integração com o Supabase real', () => {
  beforeAll(async () => {
    expect(EMAIL, 'defina BLUEPRINT_EMAIL').toBeTruthy();
    expect(PASSWORD, 'defina BLUEPRINT_PASSWORD').toBeTruthy();

    const { error } = await supabase.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(error, `login falhou: ${error?.message}`).toBeNull();

    const { data: membros } = await supabase
      .from('organization_members')
      .select('organization_id')
      .limit(50);

    const minhas = [...new Set((membros ?? []).map((m) => m.organization_id))];
    expect(minhas.length, 'a conta precisa ser membro de ao menos uma organização').toBeGreaterThan(0);
    orgId = minhas[0];

    // Para o teste negativo: uma organização de que a conta NÃO participa.
    // Se a conta for membro de todas, o cross-org não tem como ser exercitado —
    // e isso é reportado em vez de virar falso positivo.
    const { data: todas } = await supabase.from('organizations').select('id').limit(100);
    outraOrgId = (todas ?? []).map((o) => o.id).find((id) => !minhas.includes(id)) ?? null;
  }, 60000);

  afterAll(async () => {
    if (studyId) {
      // CASCADE leva ramo, snapshot e objetos. A auditoria fica: é append-only
      // e não tem FK para o estudo de propósito.
      //
      // CHECAR O ERRO, e não só disparar o delete. A primeira versão ignorava o
      // retorno, e por isso não percebeu que o trigger de imutabilidade estava
      // em `BEFORE UPDATE OR DELETE` e abortava o CASCADE inteiro: todo estudo
      // com versão publicada ficava impossível de excluir. O lixo se acumulou no
      // banco por várias execuções até aparecer na tela do editor.
      const { error } = await supabase.from('blueprint_studies').delete().eq('id', studyId);
      if (error) {
        throw new Error(
          `limpeza falhou — o estudo ${studyId} ficou no banco: ${error.message}`,
        );
      }

      const { data } = await supabase
        .from('blueprint_studies')
        .select('id')
        .eq('id', studyId);
      if ((data ?? []).length > 0) {
        throw new Error(`limpeza silenciosa: o estudo ${studyId} continua existindo`);
      }
    }
    await supabase.auth.signOut();
  }, 60000);

  it('cria estudo e ramo principal na organização do usuário', async () => {
    const { study, branch } = await createStudy({
      organizationId: orgId,
      name: `${MARCADOR} ${new Date().toISOString()}`,
    });

    studyId = study.id;
    branchId = branch.id;

    expect(study.organization_id).toBe(orgId);
    expect(branch.name).toBe('principal');
    expect(branch.base_revision).toBe(0);
  }, 60000);

  it('autosave grava rascunho sem publicar versão', async () => {
    const model = modeloDeTeste();
    const hash = await saveDraft(branchId, model);

    expect(hash).toBe(snapshotHash(model));

    const branch = await getBranch(branchId);
    expect(branch?.draft_hash).toBe(hash);
    expect(branch?.base_revision, 'rascunho não pode avançar revisão').toBe(0);
    expect(await listSnapshots(studyId), 'rascunho não cria snapshot').toHaveLength(0);
  }, 60000);

  it('o modelo volta do banco com o mesmo hash — round-trip real', async () => {
    const original = modeloDeTeste();
    const recarregado = await loadBranchModel(branchId);

    expect(recarregado).not.toBeNull();
    expect(snapshotHash(recarregado!)).toBe(snapshotHash(original));
    expect(recarregado!.spaces).toHaveLength(2);
  }, 60000);

  it('publica snapshot: avança revisão, limpa rascunho e explode objetos', async () => {
    const model = modeloDeTeste();
    const snapshotId = await publishSnapshot({ branchId, baseRevision: 0, model });

    expect(snapshotId).toBeTruthy();

    const branch = await getBranch(branchId);
    expect(branch?.base_revision).toBe(1);
    expect(branch?.parent_snapshot_id).toBe(snapshotId);
    expect(branch?.draft_payload, 'publicar descarta o rascunho').toBeNull();

    const { data: objetos } = await supabase
      .from('blueprint_objects')
      .select('object_type')
      .eq('snapshot_id', snapshotId);

    const tipos = (objetos ?? []).map((o) => o.object_type);
    expect(tipos.filter((t) => t === 'WALL')).toHaveLength(5);
    expect(tipos.filter((t) => t === 'SPACE')).toHaveLength(2);
  }, 60000);

  it('republicar o mesmo conteúdo é idempotente (CA-07)', async () => {
    const model = modeloDeTeste();
    const snapshots = await listSnapshots(studyId);
    const primeiro = snapshots[0];

    // Mesma revisão de base da publicação anterior, mesmo conteúdo.
    const repetido = await publishSnapshot({ branchId, baseRevision: 0, model });

    expect(repetido, 'não pode criar um segundo snapshot').toBe(primeiro.id);
    expect(await listSnapshots(studyId)).toHaveLength(1);
  }, 60000);

  it('revisão desatualizada é recusada, não sobrescrita (CA-05)', async () => {
    const model = modeloDeTeste();
    // Conteúdo diferente, revisão velha: o ramo já está em 1.
    const alterado = applyCommand(model, {
      type: 'AddWall',
      levelId: model.levels[0].id,
      a: point(0, 2000),
      b: point(3000, 2000),
      thicknessMm: 150,
      heightMm: 2800,
    }).model;

    await expect(
      publishSnapshot({ branchId, baseRevision: 0, model: alterado }),
    ).rejects.toBeInstanceOf(BlueprintRevisionConflict);
  }, 60000);

  it('o snapshot gravado reproduz o próprio hash (RNF-011)', async () => {
    const [snapshot] = await listSnapshots(studyId);
    const resultado = await verifySnapshotIntegrity(snapshot.id);

    expect(resultado.ok, `gravado=${resultado.storedHash} recalculado=${resultado.recomputedHash}`).toBe(true);
    expect(resultado.kernelMatches).toBe(true);
  }, 60000);

  it('snapshot publicado não pode ser alterado nem apagado', async () => {
    const [snapshot] = await listSnapshots(studyId);

    // ATENÇÃO ao que se afirma aqui. A primeira versão deste caso exigia um
    // ERRO, e falhou: o PostgREST devolveu sucesso. Não porque a alteração
    // passou — porque `blueprint_snapshots` só tem policy de SELECT e INSERT, e
    // sem policy de UPDATE a RLS filtra a linha ANTES, o comando afeta zero
    // linhas e isso não é erro.
    //
    // Ou seja: ausência de erro não é ausência de proteção, e exigir erro era
    // medir a coisa errada. O que prova a imutabilidade é o CONTEÚDO seguir
    // igual — e é isso que se verifica.
    await supabase
      .from('blueprint_snapshots')
      .update({ notes: 'tentativa de alterar versão publicada' })
      .eq('id', snapshot.id);

    await supabase.from('blueprint_snapshots').delete().eq('id', snapshot.id);

    const depois = await listSnapshots(studyId);
    expect(depois, 'o snapshot não pode ter sumido').toHaveLength(1);
    expect(depois[0].id).toBe(snapshot.id);
    expect(depois[0].notes, 'a nota não pode ter mudado').toBe(snapshot.notes);
    expect(depois[0].hash, 'o hash não pode ter mudado').toBe(snapshot.hash);

    // O trigger fn_blueprint_block_mutation é a segunda linha de defesa, para
    // caminhos que não passam pela RLS (service-role, psql, job). Não dá para
    // exercitá-lo por aqui justamente porque a RLS barra antes — fica coberto
    // por inspeção da migration, não por este teste.
  }, 60000);

  it('não é possível criar estudo em organização de terceiros (RLS negativa)', async () => {
    if (!outraOrgId) {
      console.warn('cross-org NÃO exercitado: a conta é membro de todas as organizações visíveis');
      return;
    }

    const { error } = await supabase
      .from('blueprint_studies')
      .insert({ organization_id: outraOrgId, name: `${MARCADOR} cross-org` })
      .select('id')
      .single();

    expect(error, 'a RLS deveria ter bloqueado a escrita cross-org').not.toBeNull();
  }, 60000);

  it('não é possível ler estudo de organização de terceiros', async () => {
    if (!outraOrgId) return;

    const { data, error } = await supabase
      .from('blueprint_studies')
      .select('id')
      .eq('organization_id', outraOrgId);

    expect(error).toBeNull();
    expect(data, 'RLS deve devolver conjunto vazio, nunca linha de outra org').toHaveLength(0);
  }, 60000);
});
