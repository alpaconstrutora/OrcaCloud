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
 *
 * ⚠️ NÃO deixe `BLUEPRINT_E2E=1` num `.env.local` sem as credenciais ao lado. O
 * Vite carrega esse arquivo sozinho, então a variável liga este bloco para
 * TODA rodada de `npm run test` — e aí a suíte inteira falha aqui por falta de
 * senha, num erro que não parece ter relação com o que se estava fazendo.
 * Aconteceu em 06/09/2026.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { supabase } from '../lib/supabase';
import {
  EH_UID,
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  computeQuantities,
  emptyModel,
  point,
  snapshotHash,
  type BlueprintModel,
  type CanonicalPayload,
  type Command,
} from '../utils/blueprintKernel';
import {
  computeAndStoreQuantities,
  createStudy,
  getBranch,
  getQuantitySnapshot,
  listQuantitySnapshots,
  listSnapshots,
  loadBranchModel,
  publishSnapshot,
  saveDraft,
  verifyQuantitySnapshot,
  verifySnapshotIntegrity,
} from '../services/blueprintService';
import {
  aplicarNoProjeto,
  deleteMapping,
  listMappings,
  preverLancamentos,
  saveMapping,
} from '../services/blueprintBudgetService';
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
let projetoDescartavelId = '';
const mapeamentosCriados: string[] = [];

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

    for (const id of mapeamentosCriados) await deleteMapping(id);

    if (projetoDescartavelId) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projetoDescartavelId);
      if (error) {
        throw new Error(
          `limpeza falhou — o projeto ${projetoDescartavelId} ficou no banco: ${error.message}`,
        );
      }

      // Mesma lição do estudo: RLS pode filtrar a linha e o DELETE devolver
      // sucesso afetando zero linhas. Ausência de erro não é ausência de lixo.
      const { data: resto } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projetoDescartavelId);
      if ((resto ?? []).length > 0) {
        throw new Error(
          `limpeza silenciosa: a obra de teste ${projetoDescartavelId} continua existindo`,
        );
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

  it('grava o quantitativo da versão publicada, e o número bate com o local', async () => {
    const [snapshot] = await listSnapshots(studyId);
    const gravado = await computeAndStoreQuantities(snapshot.id);

    expect(gravado.snapshot_id).toBe(snapshot.id);
    expect(gravado.organization_id).toBe(orgId);
    expect(gravado.policy_version).toBe(POLITICA_PADRAO.version);

    // O valor gravado tem que ser o MESMO que o kernel produz sobre o modelo de
    // teste — senão o banco estaria guardando um número que ninguém consegue
    // reproduzir, que é exatamente o que o CA-08 proíbe.
    //
    // COMPARAR VALOR A VALOR, NUNCA A SERIALIZAÇÃO. `JSONB` não preserva ordem
    // de chave: o Postgres reordena por tamanho e depois por bytes na gravação.
    // A primeira versão deste caso comparava `JSON.stringify` dos dois lados e
    // reprovou com TODOS os números idênticos, só porque o que voltou do banco
    // veio com as chaves em outra ordem.
    //
    // Vale para qualquer comparação de payload que passe por JSONB. O hash do
    // snapshot escapa disso porque não é calculado sobre o JSON gravado: o
    // modelo é reconstruído e RE-serializado em ordem canônica antes.
    const local = computeQuantities(modeloDeTeste(), POLITICA_PADRAO, snapshot.kernel_version);
    const gravadoTotais = gravado.totais as Record<string, number>;
    const localTotais = local.totais as unknown as Record<string, number>;

    expect(Object.keys(gravadoTotais).sort()).toEqual(Object.keys(localTotais).sort());
    for (const chave of Object.keys(localTotais)) {
      // `toStrictEqual`, não `toBe`: `porMaterial` e `porEsquadria` são ARRAYS,
      // e identidade de referência os declara diferentes mesmo idênticos. Foi o
      // mesmo engano que quebrou `verifyQuantitySnapshot` no produto.
      expect(gravadoTotais[chave], `total "${chave}"`).toStrictEqual(localTotais[chave]);
    }
  }, 60000);

  it('recalcular com a mesma política devolve o registro existente (CA-08)', async () => {
    const [snapshot] = await listSnapshots(studyId);
    const primeiro = await getQuantitySnapshot(snapshot.id, POLITICA_PADRAO.version);
    const repetido = await computeAndStoreQuantities(snapshot.id);

    expect(repetido.id, 'não pode criar um segundo registro').toBe(primeiro!.id);
    expect(await listQuantitySnapshots(snapshot.id)).toHaveLength(1);
  }, 60000);

  it('trocar a política cria OUTRO registro, sem sobrescrever o anterior', async () => {
    // O que o orçamento já citou não pode mudar sob os pés dele. Política nova é
    // linha nova; a antiga continua consultável com os parâmetros que a geraram.
    const [snapshot] = await listSnapshots(studyId);
    const outra = await computeAndStoreQuantities(snapshot.id, {
      ...POLITICA_PADRAO,
      version: 'quant-e2e-sem-perda',
      perdaRevestimento: 0,
    });

    expect(outra.policy_version).toBe('quant-e2e-sem-perda');
    expect(await listQuantitySnapshots(snapshot.id)).toHaveLength(2);

    const padrao = await getQuantitySnapshot(snapshot.id, POLITICA_PADRAO.version);
    expect(padrao, 'o registro anterior tem que continuar lá').not.toBeNull();
    expect(
      (outra.totais as Record<string, number>).areaPisoComPerdaM2,
    ).not.toBeCloseTo((padrao!.totais as Record<string, number>).areaPisoComPerdaM2, 2);
  }, 60000);

  it('o quantitativo gravado sobrevive ao próprio recálculo', async () => {
    const [snapshot] = await listSnapshots(studyId);
    const resultado = await verifyQuantitySnapshot(snapshot.id, POLITICA_PADRAO.version);

    expect(resultado.ok, `divergências: ${resultado.divergencias.join(', ')}`).toBe(true);
  }, 60000);

  it('quantitativo publicado não pode ser alterado', async () => {
    // Mesma lição do snapshot: a RLS não tem policy de UPDATE, então o PostgREST
    // devolve SUCESSO afetando zero linhas. O que se verifica é o conteúdo.
    const [snapshot] = await listSnapshots(studyId);
    const antes = await getQuantitySnapshot(snapshot.id, POLITICA_PADRAO.version);

    await supabase
      .from('blueprint_quantity_snapshots')
      .update({ totais: { areaPisoM2: 99999 } })
      .eq('id', antes!.id);

    const depois = await getQuantitySnapshot(snapshot.id, POLITICA_PADRAO.version);
    expect(JSON.stringify(depois!.totais)).toBe(JSON.stringify(antes!.totais));
  }, 60000);

  // ───────────────────────────────────────────────────────────────────────────
  // RF-122 — de-para para o orçamento
  //
  // Os itens vêm do catálogo REAL, não de constante inventada: metade do que
  // este trecho verifica é se `resolverItens` acha o código e devolve a unidade
  // que o Postgres tem gravada. Item fabricado no teste provaria só que a função
  // sabe ler um objeto que ela mesma recebeu.
  // ───────────────────────────────────────────────────────────────────────────

  let itemM2 = '';
  let itemM = '';

  /**
   * As linhas geradas pelos de-para DESTE teste, e só elas.
   *
   * ⚠️ A organização real tem de-para próprio cadastrado — em 06/09/2026 era um
   * `AREA_PISO → 101751`, ativo. Ele gera uma linha em TODA prévia, inclusive na
   * do estudo descartável daqui, e as três asserções abaixo contavam o total.
   * Contar o total é medir a configuração da organização de quem roda o teste,
   * não o comportamento do código.
   *
   * O `id` da linha é `bp:<estudo>:<mapeamento>:<ref>`, então o id do
   * mapeamento é o filtro exato — imune tanto ao de-para alheio quanto às
   * linhas de camada e de esquadria, que têm outra procedência.
   */
  const minhas = (entries: { id: string }[]) =>
    entries.filter((e) => mapeamentosCriados.some((id) => e.id.includes(id)));

  it('acha no catálogo real um item por m² e outro por metro', async () => {
    const { data } = await supabase
      .from('sinapi_items')
      .select('code, unit')
      .in('unit', ['M2', 'M'])
      .limit(400);

    itemM2 = (data ?? []).find((i) => i.unit === 'M2')?.code ?? '';
    itemM = (data ?? []).find((i) => i.unit === 'M')?.code ?? '';

    expect(itemM2, 'catálogo sem item em M2 — o resto do bloco não mede nada').toBeTruthy();
    expect(itemM, 'catálogo sem item em M').toBeTruthy();
  }, 60000);

  it('A TRAVA DE UNIDADE FUNCIONA CONTRA O CATÁLOGO REAL', async () => {
    // Área de piso (m²) apontada para item cotado por metro linear. É o erro que
    // não se anuncia: sairia uma linha plausível e errada por um fator de 4 ou 5.
    const m = await saveMapping({
      organization_id: orgId,
      medida: 'AREA_PISO',
      item_code: itemM,
      phase: '',
      budget_group: MARCADOR,
      agrupamento: 'TOTAL',
      filtro_ambiente: [],
      active: true,
    });
    mapeamentosCriados.push(m.id);

    const [snapshot] = await listSnapshots(studyId);
    const previa = await preverLancamentos(snapshot.id);

    expect(minhas(previa.entries), 'nenhuma linha pode ser gerada').toHaveLength(0);
    const daTrava = previa.divergencias.filter((d) => d.itemCode === itemM);
    expect(daTrava, 'a trava tinha de acusar o item em metro').toHaveLength(1);
  }, 60000);

  it('com a unidade certa, a linha sai com a área de PISO', async () => {
    for (const id of mapeamentosCriados) await deleteMapping(id);
    mapeamentosCriados.length = 0;

    const m = await saveMapping({
      organization_id: orgId,
      medida: 'AREA_PISO',
      item_code: itemM2,
      phase: '',
      budget_group: MARCADOR,
      agrupamento: 'TOTAL',
      filtro_ambiente: [],
      active: true,
    });
    mapeamentosCriados.push(m.id);

    const [snapshot] = await listSnapshots(studyId);
    const previa = await preverLancamentos(snapshot.id);

    const geradas = minhas(previa.entries);
    expect(geradas).toHaveLength(1);
    // Divergência NENHUMA vinda do meu mapeamento — as de terceiros não são
    // assunto deste caso.
    expect(previa.divergencias.filter((d) => d.itemCode === itemM2)).toHaveLength(0);

    // Sala 6 × 4 dividida ao meio, parede de 150 mm. Piso de cada metade:
    //   x: 3,00 − 0,075 − 0,075 = 2,85     (parede externa de um lado, divisória do outro)
    //   y: 4,00 − 0,15          = 3,85
    //   2 × (2,85 × 3,85) = 21,945 m²
    expect(geradas[0].quantity).toBeCloseTo(21.945, 3);
    expect(geradas[0].sinapiItem.unit).toBe('M2');
  }, 60000);

  it('o de-para volta do banco como foi gravado', async () => {
    const lista = await listMappings(orgId);
    const meu = lista.find((m) => m.id === mapeamentosCriados[0]);

    expect(meu, 'o mapeamento gravado tem que aparecer na listagem').toBeTruthy();
    expect(meu!.item_code).toBe(itemM2);
    // `filtro_ambiente` é TEXT[]: se voltasse como string, o filtro por nome
    // silenciosamente não casaria com nada.
    expect(Array.isArray(meu!.filtro_ambiente)).toBe(true);
  }, 60000);

  it('APLICAR NO ORÇAMENTO NÃO DUPLICA AO REGERAR', async () => {
    // Contra uma obra DESCARTÁVEL, nunca uma real: aplicar reescreve
    // `projects.budget`, e o defeito que este caso procura é justamente o de
    // empilhar linha a cada revisão publicada.
    const { data: projeto, error } = await supabase
      .from('projects')
      .insert({
        organization_id: orgId,
        name: `${MARCADOR} obra descartável`,
        budget: [
          {
            id: 'digitado-a-mao',
            sinapiItem: { code: 'X', description: 'linha manual', unit: 'M2', price: 1 },
            quantity: 1,
            phase: 'Manual',
            group: 'Manual',
          },
        ],
      })
      .select('id')
      .single();

    expect(error, `não foi possível criar a obra de teste: ${error?.message}`).toBeNull();
    projetoDescartavelId = projeto!.id;

    const [snapshot] = await listSnapshots(studyId);
    const previa = await preverLancamentos(snapshot.id);

    // Os números são RELATIVOS ao que a prévia gerou, e não absolutos: a
    // organização pode ter de-para próprio, e quantas linhas saem disso é
    // configuração dela, não comportamento deste código. O que se mede aqui é a
    // não-duplicação.
    const n = previa.entries.length;
    expect(n, 'sem linha nenhuma o caso não mede nada').toBeGreaterThan(0);

    const primeira = await aplicarNoProjeto(projetoDescartavelId, previa.entries, previa.contexto);
    expect(primeira.adicionadas).toBe(n);
    expect(primeira.removidas, 'na primeira vez não há o que substituir').toBe(0);
    expect(primeira.total, 'a linha manual continua lá').toBe(n + 1);

    const segunda = await aplicarNoProjeto(projetoDescartavelId, previa.entries, previa.contexto);
    expect(segunda.removidas, 'a segunda passada substitui a primeira').toBe(n);
    expect(segunda.total, 'o orçamento não pode ter crescido').toBe(n + 1);

    // E a linha digitada à mão sobreviveu às duas passadas.
    const { data: depois } = await supabase
      .from('projects')
      .select('budget')
      .eq('id', projetoDescartavelId)
      .single();

    const budget = (depois?.budget ?? []) as { id: string }[];
    expect(budget.find((e) => e.id === 'digitado-a-mao'), 'linha manual apagada').toBeTruthy();
  }, 60000);

  // ── Identidade de elemento (04/09/2026) ───────────────────────────────────
  //
  // Ficam DEPOIS de tudo o que assume "uma revisão só": o segundo caso publica
  // a revisão 2. O `afterAll` apaga o estudo em cascata, snapshot novo incluso.

  /** uid das paredes de um snapshot, na ordem canônica, lidos de `blueprint_objects`. */
  async function uidsDasParedes(snapshotId: string): Promise<(string | null)[]> {
    const { data, error } = await supabase
      .from('blueprint_objects')
      .select('object_index, element_uid')
      .eq('snapshot_id', snapshotId)
      .eq('object_type', 'WALL')
      .order('object_index');
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.element_uid as string | null);
  }

  it('element_uid gravado na publicação bate com identity.walls do payload, na ordem canônica', async () => {
    const snapshots = await listSnapshots(studyId);
    const primeiro = snapshots.find((s) => s.revision === 1) ?? snapshots[0];

    const { data: linha, error } = await supabase
      .from('blueprint_snapshots')
      .select('payload')
      .eq('id', primeiro.id)
      .single();
    expect(error).toBeNull();
    const payload = linha!.payload as CanonicalPayload;
    expect(payload.identity?.v, 'o payload publicado carrega identity').toBe(1);

    const gravados = await uidsDasParedes(primeiro.id);
    expect(gravados).toHaveLength(5);
    expect(gravados).toEqual(payload.identity!.walls);
    for (const u of gravados) expect(u).toMatch(EH_UID);

    // Ambiente sem etiqueta não tem identidade — a coluna fica NULL, não vazia.
    const { data: ambientes } = await supabase
      .from('blueprint_objects')
      .select('element_uid')
      .eq('snapshot_id', primeiro.id)
      .eq('object_type', 'SPACE');
    expect((ambientes ?? []).map((a) => a.element_uid)).toEqual([null, null]);
  }, 60000);

  it('mover uma parede e republicar: as CINCO paredes mantêm o uid entre as revisões', async () => {
    const branch = await getBranch(branchId);
    const antes = await loadBranchModel(branchId);
    expect(antes, 'o ramo tem snapshot publicado para recarregar').not.toBeNull();
    const [snapshotAnterior] = (await listSnapshots(studyId)).filter((s) => s.revision === branch!.base_revision);
    const uidsAntes = await uidsDasParedes(snapshotAnterior.id);

    const divisoria = antes!.walls.find((w) => w.a.x === 3000 && w.b.x === 3000)!;
    const depois = applyCommand(antes!, {
      type: 'TranslateEntities',
      wallIds: [divisoria.id],
      boundaryIds: [],
      structuralIds: [],
      delta: point(500, 0),
      manterJuncoes: false,
    }).model;
    expect(snapshotHash(depois)).not.toBe(snapshotHash(antes!));

    const novoId = await publishSnapshot({
      branchId,
      baseRevision: branch!.base_revision,
      model: depois,
    });
    const uidsDepois = await uidsDasParedes(novoId);

    // O MESMO conjunto de uids — a parede movida continua sendo ela mesma…
    expect(new Set(uidsDepois)).toEqual(new Set(uidsAntes));
    expect(uidsDepois).toContain(divisoria.uid);
    // …e a linha dela na revisão nova tem a geometria nova.
    const { data: movida } = await supabase
      .from('blueprint_objects')
      .select('props')
      .eq('snapshot_id', novoId)
      .eq('element_uid', divisoria.uid)
      .single();
    expect((movida!.props as { a: { x: number } }).a.x).toBe(3500);

    // E o snapshot novo reproduz o próprio hash (só geometria, identidade fora).
    const integridade = await verifySnapshotIntegrity(novoId);
    expect(integridade.ok, `gravado=${integridade.storedHash} recalculado=${integridade.recomputedHash}`).toBe(true);
  }, 60000);

  it('publicar TELHADO grava as águas como ROOF, com o uid e a inclinação em props', async () => {
    // Fecha o ciclo do kernel 0.12.0 pelo caminho do CLIENTE (sob RLS), e não
    // como `postgres`: a sonda SQL da migration provou o banco, este prova o
    // que o app de fato consegue publicar.
    const branch = await getBranch(branchId);
    const base = await loadBranchModel(branchId);
    expect(base).not.toBeNull();

    const nivel = base!.levels[0];
    const comTelhado = applyCommand(base!, {
      type: 'AddAgua',
      levelId: nivel.id,
      pontos: [point(-500, -500), point(6500, -500), point(6500, 4500), point(-500, 4500)],
      inclinacaoPct: 30,
      baseMm: nivel.defaultHeightMm,
    }).model;

    const snapshotId = await publishSnapshot({
      branchId,
      baseRevision: branch!.base_revision,
      model: comTelhado,
    });

    const { data: aguas, error } = await supabase
      .from('blueprint_objects')
      .select('object_index, element_uid, level_index, props, area_mm2')
      .eq('snapshot_id', snapshotId)
      .eq('object_type', 'ROOF')
      .order('object_index');
    expect(error, 'o CHECK de object_type aceita ROOF').toBeNull();
    expect(aguas).toHaveLength(1);
    expect(aguas![0].element_uid).toBe(comTelhado.roofs[0].uid);
    expect((aguas![0].props as { inclinacaoPct: number }).inclinacaoPct).toBe(30);
    // `area_mm2` é do AMBIENTE: a água tem DUAS áreas e nenhuma cabe na coluna
    // genérica sem dizer qual é (ver o cabeçalho da migration).
    expect(aguas![0].area_mm2).toBeNull();

    // E o snapshot continua reproduzindo o próprio hash.
    const integridade = await verifySnapshotIntegrity(snapshotId);
    expect(integridade.ok).toBe(true);
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
