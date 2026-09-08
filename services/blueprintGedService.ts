/**
 * A planta publicada VAI PARA O GED — e, quando alguém autoriza, para o Portal.
 *
 * ─── O QUE ISTO RESOLVE ─────────────────────────────────────────────────────
 *
 * Até 08/09/2026 toda exportação da Planta Inteligente terminava no download de
 * quem clicou. O arquivo então vivia numa pasta de Downloads, e chegava ao
 * cliente por e-mail — fora do GED, fora do controle de revisão, e sem ninguém
 * saber depois QUAL versão foi enviada. Um IFC de revisão 3 e um de revisão 7
 * têm o mesmo nome na caixa de entrada de quem recebeu.
 *
 * ─── POR QUE NÃO TEM TABELA NOVA ────────────────────────────────────────────
 *
 * Nada aqui é um repositório novo: o documento entra pelo mesmo
 * `documentService.uploadNewDocument` que o resto do sistema usa (mesmo bucket
 * `opura-docs`, mesmo versionamento, mesma auditoria), e o compartilhamento com
 * o Portal do Cliente é o `sharePortalDocumentsBatch` que já existe. É a mesma
 * disciplina do `cnoService.uploadAndAttach`.
 *
 * Uma aba nova com RPC própria pareceria mais simples e seria pior: teria a sua
 * própria noção de "quem pode ver", que é justamente a parte que ninguém quer
 * ter duas vezes.
 *
 * ─── ⚠️ O QUE FOI MEDIDO NO BANCO ANTES DE ESCREVER ─────────────────────────
 *
 * A fatia anterior desta etapa foi publicada QUEBRADA porque "a coluna existe"
 * foi confundida com "a escrita passa" — faltava policy e havia trigger no
 * caminho. Então, em 08/09/2026, antes de uma linha deste arquivo:
 *
 * | tabela | RLS | policies | triggers |
 * |---|---|---|---|
 * | `opura_documents` | on | 3 | 2 — ambos `BEFORE UPDATE` |
 * | `opura_document_versions` | on | 3 | 0 |
 * | `opura_document_portal_shares` | on | 2 | 0 |
 *
 * Os dois triggers de `opura_documents` são de UPDATE (`updated_at` e a trava de
 * documento bloqueado); o INSERT do upload não passa por nenhum deles. E a
 * policy de escrita é `organization_id IN (orgs de que sou membro)` — daí o
 * `organization_id` vir do ESTUDO, que já é uma org do usuário porque a linha
 * do estudo passou pela RLS dele para ser lida.
 */
import { supabase } from '../lib/supabase';
import { documentService } from './documentService';
import {
  montarDxf,
  montarIfc,
  montarPdf,
  montarQuantitativoXlsx,
  type ArtefatoExportado,
} from './blueprintExportService';
import type { OpcoesExportacao } from '../utils/blueprintExport';
import type { BlueprintModel } from '../utils/blueprintKernel';
import type { OpuraDocument } from '../types/documents';

export type FormatoParaGed = 'ifc' | 'pdf' | 'dxf' | 'xlsx';

/** O que cada formato monta. Um só lugar decide, e vale para GED e download. */
export function artefatosDoFormato(
  formato: FormatoParaGed,
  model: BlueprintModel,
  o: OpcoesExportacao,
): ArtefatoExportado[] {
  switch (formato) {
    case 'ifc':
      return montarIfc(model, o);
    case 'dxf':
      return montarDxf(model, o);
    case 'xlsx':
      return montarQuantitativoXlsx(model, o);
    case 'pdf':
      return montarPdf(model, o);
  }
}

export interface AlvoDaPublicacao {
  organizationId: string;
  /** A obra, quando o estudo tem uma. Vira o `project_id` do documento. */
  projectId?: string | null;
  /** Título do estudo — o nome que a pessoa reconhece. */
  titulo: string;
  revisao: number;
  hash: string;
}

/**
 * Quem está publicando.
 *
 * Sai da SESSÃO, e não de um parâmetro — mesma disciplina do
 * `blueprintCommentService`, que grava o autor do comentário assim. Receber o
 * e-mail de fora abriria a porta para a tela mandar o de outra pessoa, e o
 * campo existe justamente para a auditoria.
 */
async function autorDaSessao(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? undefined;
}

/**
 * O nome do documento no GED.
 *
 * ⚠️ A REVISÃO entra no nome, e não só na coluna `revisao`. Quem procura no GED
 * lê a lista, não abre o registro: dois arquivos chamados "Planta Térreo" na
 * mesma pasta são indistinguíveis exatamente quando importa saber qual é o mais
 * novo. O hash NÃO entra — ele é longo, não diz nada a quem lê, e já vai na
 * descrição e dentro do próprio arquivo.
 */
export function nomeNoGed(alvo: AlvoDaPublicacao, artefato: ArtefatoExportado): string {
  const sufixo = artefato.tipo === 'cobertura' ? ' (cobertura)' : '';
  return `${alvo.titulo} — rev. ${alvo.revisao} — ${artefato.tipo.toUpperCase()}${sufixo}`;
}

/**
 * A descrição, que é onde a PROCEDÊNCIA fica legível.
 *
 * O hash do snapshot é o que liga o arquivo à revisão exata que o gerou. Sem
 * ele, "rev. 3" é só um número que alguém digitou; com ele, dá para provar que
 * este PDF saiu deste desenho.
 */
export function descricaoNoGed(alvo: AlvoDaPublicacao): string {
  return `Gerado pela Planta Inteligente a partir da revisão ${alvo.revisao} (hash ${alvo.hash}).`;
}

export interface DocumentoPublicado {
  documento: OpuraDocument;
  artefato: ArtefatoExportado;
}

/**
 * Publica os artefatos de UM formato no GED.
 *
 * ⚠️ A COBERTURA vai junto, como documento próprio. Ela é o `.txt` que declara o
 * que o arquivo NÃO contém, e é o único motivo pelo qual exportar um IFC parcial
 * é honesto. Publicar o desenho e deixar a cobertura para trás faria no GED
 * exatamente o que o download evita: entregar o arquivo sem o que o limita.
 */
export async function publicarNoGed(
  formato: FormatoParaGed,
  model: BlueprintModel,
  opcoes: OpcoesExportacao,
  alvo: AlvoDaPublicacao,
): Promise<DocumentoPublicado[]> {
  const artefatos = artefatosDoFormato(formato, model, opcoes);
  const autor = await autorDaSessao();
  const publicados: DocumentoPublicado[] = [];

  for (const artefato of artefatos) {
    const arquivo = new File([artefato.blob], artefato.nome, {
      type: artefato.blob.type || 'application/octet-stream',
    });
    const documento = await documentService.uploadNewDocument(
      {
        organization_id: alvo.organizationId,
        project_id: alvo.projectId || undefined,
        nome: nomeNoGed(alvo, artefato),
        descricao: descricaoNoGed(alvo),
        // O desenho é de engenharia. Não há categoria "projeto" no catálogo, e
        // inventar uma aqui criaria um valor que nenhuma tela do GED filtra.
        categoria: 'engenharia',
        tipo_documento: 'Planta Inteligente',
        revisao: String(alvo.revisao),
        status: 'ativo',
        alerta_dias_antecedencia: 30,
        tags: ['planta-inteligente', artefato.tipo],
      },
      arquivo,
      autor,
    );
    publicados.push({ documento, artefato });
  }

  return publicados;
}

/**
 * Compartilha com o Portal do Cliente o que já está no GED.
 *
 * ⚠️ Publicar e compartilhar são DUAS decisões, e é de propósito que sejam duas
 * chamadas. Publicar põe o arquivo sob controle de revisão da empresa;
 * compartilhar o põe diante do cliente. Fundir as duas faria toda planta
 * publicada virar planta divulgada — e a revisão de estudo que ninguém queria
 * mostrar chegaria ao portal por omissão.
 */
export async function compartilharComCliente(
  documentIds: string[],
  clientId: string,
): Promise<void> {
  if (documentIds.length === 0) return;
  await documentService.sharePortalDocumentsBatch(
    documentIds,
    { audience: 'cliente', clientId },
    (await autorDaSessao()) ?? 'sistema',
  );
}
