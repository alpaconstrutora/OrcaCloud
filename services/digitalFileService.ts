// services/digitalFileService.ts
//
// Os ARQUIVOS de modelo da organização — primeira tabela do Objeto Digital.
//
// ─── REVISÃO É LINHA NOVA, NUNCA `UPDATE` ─────────────────────────────────────
//
// O usuário pediu para "comparar a revisão de fevereiro com a próxima que o
// calculista mandar". Sobrescrever o arquivo destruiria a pergunta. Linhas do
// mesmo `modeloGrupo` são revisões do mesmo modelo; subir uma nova copia o grupo
// e incrementa. É o princípio de `blueprint_snapshots`.
//
// ─── REGRA OBRIGATÓRIA #5 ─────────────────────────────────────────────────────
//
// Na LEITURA, `organizationId` nulo significa "Todas as organizações" — não
// "nenhuma": o `.eq()` só entra quando há org, e a RLS recorta o resto. Na
// ESCRITA é obrigatório, porque gravar exige saber onde; quem resolve isso
// quando o topo está em "Todas" é `useOrgWriteTarget`, na tela.

import { supabase } from '../lib/supabase';

const BUCKET = 'bim_files';

export interface ArquivoDigital {
  id: string;
  organizationId: string;
  projectId: string | null;
  nome: string;
  nomeArquivo: string;
  disciplina: string;
  /** Agrupa as revisões do MESMO modelo. */
  modeloGrupo: string;
  revisao: number;
  storagePath: string;
  fileSha256: string;
  bytes: number;
  schemaIfc: string;
  elementos: number;
  triangulos: number;
  createdAt: string;
}

/** O que a tela sabe do modelo recém-aberto, para gravar junto. */
export interface ResumoDoModelo {
  schemaIfc: string;
  elementos: number;
  triangulos: number;
}

/** Colunas nomeadas, nunca `select('*')`. */
const COLS =
  'id, organization_id, project_id, nome, nome_arquivo, disciplina, modelo_grupo, revisao, ' +
  'storage_path, file_sha256, bytes, schema_ifc, elementos, triangulos, created_at';

function mapear(row: Record<string, unknown>): ArquivoDigital {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: (row.project_id as string | null) ?? null,
    nome: row.nome as string,
    nomeArquivo: row.nome_arquivo as string,
    disciplina: (row.disciplina as string) ?? '',
    modeloGrupo: row.modelo_grupo as string,
    revisao: row.revisao as number,
    storagePath: row.storage_path as string,
    fileSha256: row.file_sha256 as string,
    bytes: Number(row.bytes ?? 0),
    schemaIfc: (row.schema_ifc as string) ?? '',
    elementos: (row.elementos as number) ?? 0,
    triangulos: (row.triangulos as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`digitalFile/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

async function sha256Do(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `organizationId` nulo = "Todas": lista o que a RLS deixar ver. */
export async function listarArquivos(organizationId: string | null): Promise<ArquivoDigital[]> {
  let q = supabase
    .from('digital_files')
    .select(COLS)
    .order('modelo_grupo')
    .order('revisao', { ascending: false });
  if (organizationId) q = q.eq('organization_id', organizationId);

  const { data, error } = await q;
  if (error) fail('listarArquivos', error);
  return (data ?? []).map((r) => mapear(r as unknown as Record<string, unknown>));
}

/**
 * Sobe o arquivo e grava a linha.
 *
 * ⚠️ O caminho COMEÇA pelo `organizationId`, e isso não é organização de pastas:
 * a policy do bucket recorta por `is_org_member` sobre o PRIMEIRO SEGMENTO do
 * caminho. Mudar a forma do caminho aqui derruba a proteção do storage — que é
 * outra RLS, independente da tabela (ver a migration `..._digital_files_ifc`).
 *
 * `revisaoDe` traz o `modeloGrupo` de um arquivo existente: a nova linha entra
 * como revisão dele. Sem isso, nasce grupo próprio.
 */
export async function subirArquivo(
  organizationId: string,
  arquivo: File,
  dados: {
    nome: string;
    disciplina: string;
    projectId: string | null;
    resumo: ResumoDoModelo;
    revisaoDe?: { modeloGrupo: string; ultimaRevisao: number };
  },
): Promise<ArquivoDigital> {
  const sha256 = await sha256Do(arquivo);
  const storagePath = `${organizationId}/${sha256.slice(0, 16)}.ifc`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arquivo, { upsert: true, contentType: 'application/x-step' });
  if (erroUpload) fail('subirArquivo/storage', erroUpload);

  const { data, error } = await supabase
    .from('digital_files')
    .insert({
      organization_id: organizationId,
      project_id: dados.projectId,
      nome: dados.nome.trim(),
      nome_arquivo: arquivo.name,
      disciplina: dados.disciplina.trim(),
      ...(dados.revisaoDe
        ? { modelo_grupo: dados.revisaoDe.modeloGrupo, revisao: dados.revisaoDe.ultimaRevisao + 1 }
        : {}),
      storage_path: storagePath,
      file_sha256: sha256,
      bytes: arquivo.size,
      schema_ifc: dados.resumo.schemaIfc,
      elementos: dados.resumo.elementos,
      triangulos: dados.resumo.triangulos,
      uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select(COLS)
    .single();

  if (error) fail('subirArquivo', error);
  return mapear(data as unknown as Record<string, unknown>);
}

/** Baixa o arquivo para abrir no visualizador. */
export async function baixarArquivo(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) fail('baixarArquivo', error);
  return data.arrayBuffer();
}

/**
 * Apaga a LINHA, e o objeto só quando mais nenhuma revisão o aponta.
 *
 * Duas linhas podem compartilhar o mesmo objeto: o caminho vem do sha256, então
 * reenviar um arquivo idêntico como revisão nova cai no mesmo lugar. Apagar o
 * objeto junto com a primeira linha deixaria a outra apontando para o vazio —
 * e é o oposto do que a `blueprint_underlays` faz hoje (ela nunca apaga o
 * objeto, e acumula órfãos).
 */
export async function apagarArquivo(id: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('digital_files').delete().eq('id', id);
  if (error) fail('apagarArquivo', error);

  const { count, error: erroConta } = await supabase
    .from('digital_files')
    .select('id', { count: 'exact', head: true })
    .eq('storage_path', storagePath);
  if (erroConta) fail('apagarArquivo/contagem', erroConta);

  if ((count ?? 0) === 0) {
    const { error: erroObj } = await supabase.storage.from(BUCKET).remove([storagePath]);
    // O objeto órfão é feio, mas a linha já saiu: falhar aqui só serviria para
    // deixar a tela num erro sobre algo que o usuário já viu acontecer.
    if (erroObj) console.warn('digitalFile/apagarArquivo: objeto não removido', erroObj.message);
  }
}
