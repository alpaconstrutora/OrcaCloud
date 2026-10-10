import { supabase } from '../../lib/supabase';
import { documentService } from '../documentService';
import { docGenDocumentoService, rascunhoDoDocumento } from '../docGenDocumentoService';
import { getNumberingConfig } from '../documentNumbering';
import { variablesInUse } from '../documentNumbering/format';
import { resolveVariables } from '../documentNumbering/resolvers';
import type { VariableToken } from '../documentNumbering/types';
import type { DocGenAssinatura, DocGenDocumento, DocGenModelo, SignatarioDoc } from '../../types/docGen';
import { montarContexto, valoresDoDocumento, imagensDasAssinaturas, type DepsContexto } from './resolverContexto';
import { previaDoDocumento } from './previa';
import { sha256DoBlob } from './pdf';
import { ROTULO_TIPO } from './destinatario';
import { anoDe, garantirPasta } from './gedPastas';
import { dataHoraCurta } from './dataExtenso';
import { textoEmRespostaA } from './tramitacao';
import { urlDeValidacao } from './envio';
import { tabelasDoDocumento } from './tabelasDinamicas';

export { anoDe, garantirPasta };

/**
 * Emissão do ofício (F3). Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 *   1. códigos do número (o banco resolve de novo DEPARTAMENTO e ORGANIZACAO);
 *   2. `doc_gen_emitir` — reserva o número, marca EMITIDO, congela a versão;
 *   3. PDF DEFINITIVO com o número e a data oficiais (determinístico: id + emitido_em);
 *   4. SHA-256 do arquivo;
 *   5. pasta Ofícios/<ano>/<departamento> no GED (cria o que faltar);
 *   6. arquiva no GED com a versão CONGELADA, o hash e os metadados;
 *   7. registra o arquivo no ofício.
 *
 * Falha depois do passo 2: o número fica consumido (buraco > duplicidade, a
 * regra da Nomenclatura) e o ofício fica EMITIDO sem arquivo — `arquivarNoGed`
 * pode ser chamado de novo, e é idempotente.
 */

/** Nome do arquivo: "OF-ENG-047/2026" → "OF-ENG-047-2026.pdf". Puro. */
export function nomeDoArquivo(numero: string): string {
    const base = numero.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `${base || 'oficio'}.pdf`;
}

/** Caminho da pasta no GED: Ofícios / 2026 / Engenharia. Puro. */
export function caminhoDaPasta(ano: string, departamento: string | null | undefined): string[] {
    return ['Ofícios', ano, (departamento ?? '').trim() || 'Sem departamento'];
}

/**
 * Assinaturas que valem: as da VERSÃO do documento (salvar de novo invalida as
 * anteriores), na ordem dos signatários. Puro.
 */
export function assinaturasValidas(signatarios: SignatarioDoc[], assinaturas: DocGenAssinatura[], versao: number): (DocGenAssinatura | null)[] {
    return signatarios.map(s => assinaturas.find(a => a.versao === versao && !!s.memberId && a.member_id === s.memberId) ?? null);
}

/** Bloco de assinaturas do PDF: imagem (se houver) e o carimbo da assinatura eletrônica. */
export async function assinaturasParaPdf(
    doc: Pick<DocGenDocumento, 'id' | 'versao' | 'signatarios'>,
    organization: DepsContexto['organization'],
    assinaturas?: DocGenAssinatura[],
) {
    const [imagens, lista] = await Promise.all([
        imagensDasAssinaturas(doc.signatarios, organization),
        assinaturas ? Promise.resolve(assinaturas) : docGenDocumentoService.listAssinaturas(doc.id).catch(() => [] as DocGenAssinatura[]),
    ]);
    const validas = assinaturasValidas(doc.signatarios, lista, doc.versao);
    return doc.signatarios.map((s, i) => ({
        nome: s.nome, cargo: s.cargo, registroProfissional: s.registroProfissional, imagemDataUrl: imagens[i],
        assinadoEm: validas[i] ? dataHoraCurta(validas[i]!.assinado_em) : null,
    }));
}

/** Códigos das variáveis da máscara do ofício que o cliente resolve (o banco faz DEPARTAMENTO e ORGANIZACAO). */
export async function valoresDaNumeracao(doc: Pick<DocGenDocumento, 'organization_id' | 'project_id' | 'empreendimento_id' | 'client_id' | 'supplier_id' | 'department_id'>): Promise<Partial<Record<VariableToken, string>>> {
    const config = await getNumberingConfig(doc.organization_id, 'OFICIO');
    const tokens = variablesInUse(config.slots).filter(t => t !== 'DEPARTAMENTO' && t !== 'ORGANIZACAO');
    return resolveVariables(tokens, {
        organizationId: doc.organization_id,
        projectId: doc.project_id,
        empreendimentoId: doc.empreendimento_id,
        clientId: doc.client_id,
        supplierId: doc.supplier_id,
        departmentId: doc.department_id,
    });
}

export interface DepsEmissao extends DepsContexto {
    modelo: DocGenModelo;
}

/** Passo 2 em diante. Devolve o documento emitido e arquivado. */
export async function emitirOficio(doc: DocGenDocumento, deps: DepsEmissao): Promise<DocGenDocumento> {
    const valores = await valoresDaNumeracao(doc);
    const { error } = await supabase.rpc('doc_gen_emitir', { p_documento_id: doc.id, p_values: valores });
    if (error) throw new Error(error.message || 'Falha ao emitir o documento.');
    return arquivarNoGed(doc.id, deps);
}

/** Passos 3 a 7. Idempotente: documento já arquivado volta como está. */
export async function arquivarNoGed(documentoId: string, deps: DepsEmissao): Promise<DocGenDocumento> {
    const doc = await docGenDocumentoService.get(documentoId);
    if (!doc) throw new Error('Documento não encontrado.');
    if (doc.status === 'RASCUNHO' || doc.status === 'CANCELADO') throw new Error('Só documento emitido é arquivado no GED.');
    if (doc.ged_document_id) return doc;
    if (!doc.numero || !doc.emitido_em) throw new Error('Documento emitido sem número — reabra e tente de novo.');

    const { modelo } = deps;
    const rascunho = rascunhoDoDocumento(doc);
    const vinculos = await docGenDocumentoService.listVinculosDoDocumento(doc.id).catch(() => []);
    const ctx = await montarContexto(rascunho, { ...deps, emRespostaA: await textoEmRespostaA(vinculos, doc.id) });
    if (ctx.documento) ctx.documento.numero = doc.numero;
    const valores = valoresDoDocumento(modelo, ctx, doc.valores);
    const assinaturas = await assinaturasParaPdf(doc, deps.organization);

    const blob = await previaDoDocumento({
        conteudoModelo: modelo.conteudo,
        layout: modelo.layout,
        titulo: `Ofício ${doc.numero} — ${doc.assunto}`,
        valores,
        camposLivres: doc.conteudo,
        assinaturas,
        anexos: doc.anexos.map(a => a.nome),
        organization: deps.organization,
        numero: doc.numero,
        validacaoUrl: urlDeValidacao(doc.id),
        tabelas: tabelasDoDocumento(modelo, ctx),
        // Import dinâmico: pdfjs (e o worker) só carregam quando o ofício leva anexos dentro.
        paginasAnexas: doc.anexos_no_pdf
            ? await import('./anexosNoPdf').then(m => m.rasterizarAnexos(doc.organization_id, doc.anexos))
            : null,
    }, { id: doc.id, criadoEm: new Date(doc.emitido_em) });

    const sha256 = await sha256DoBlob(blob);
    const departamento = deps.nomeDepartamento(doc.department_id);
    const pastaId = await garantirPasta(doc.organization_id, modelo.categoria_ged, caminhoDaPasta(anoDe(doc.data_documento), departamento));

    const arquivo = new File([blob], nomeDoArquivo(doc.numero), { type: 'application/pdf' });
    const ged = await documentService.uploadNewDocument({
        organization_id: doc.organization_id,
        nome: `Ofício ${doc.numero}`,
        descricao: doc.assunto,
        categoria: modelo.categoria_ged,
        tipo_documento: 'Ofício',
        status: 'ativo',
        data_emissao: doc.data_documento ?? undefined,
        alerta_dias_antecedencia: 30,
        tags: ['oficio', doc.numero, ...(departamento ? [departamento] : [])],
        project_id: doc.project_id ?? undefined,
        company_id: doc.company_id ?? undefined,
        contract_id: doc.contract_id ?? undefined,
        client_id: doc.client_id ?? undefined,
        supplier_id: doc.supplier_id ?? undefined,
        folder_id: pastaId,
    }, arquivo, deps.emailUsuario ?? undefined, {
        sha256,
        congelar: true,
        metadados: {
            tipo: 'OFICIO',
            doc_gen_documento_id: doc.id,
            numero: doc.numero,
            assunto: doc.assunto,
            data: doc.data_documento,
            destinatario: doc.destinatario_snapshot?.razao_social ?? null,
            destinatario_tipo: doc.destinatario_snapshot ? ROTULO_TIPO[doc.destinatario_snapshot.tipo] : null,
            modelo: modelo.nome,
            modelo_versao: doc.modelo_versao,
            departamento: departamento || null,
            emitido_por: doc.emitido_por,
            emitido_em: doc.emitido_em,
            signatarios: doc.signatarios.map(s => s.nome),
            assinado_eletronicamente: assinaturas.filter(a => a.assinadoEm).map(a => ({ nome: a.nome, em: a.assinadoEm })),
            validacao: urlDeValidacao(doc.id),
            anexos_no_pdf: doc.anexos_no_pdf,
        },
    });

    if (!ged.active_version_id) throw new Error('O GED não devolveu a versão do arquivo.');
    await docGenDocumentoService.registrarArquivo(doc.id, ged.id, ged.active_version_id);
    const final = await docGenDocumentoService.get(doc.id);
    return final ?? doc;
}

/** URL assinada (15 min) do PDF arquivado — Baixar / Imprimir. */
export async function urlDoPdf(doc: DocGenDocumento, emailUsuario?: string | null): Promise<string> {
    if (!doc.ged_version_id || !doc.ged_document_id) throw new Error('Documento ainda sem arquivo no GED.');
    const { data, error } = await supabase.from('opura_document_versions').select('storage_path').eq('id', doc.ged_version_id).maybeSingle();
    if (error) throw error;
    const path = (data as { storage_path?: string } | null)?.storage_path;
    if (!path) throw new Error('Arquivo do GED não encontrado.');
    return documentService.generateDownloadUrl(path, doc.organization_id, doc.ged_document_id, emailUsuario ?? undefined);
}

/** Cancela o ofício e marca o arquivo do GED como cancelado (arquivado + etiqueta) — nada é apagado. */
export async function cancelarOficio(doc: DocGenDocumento, motivo?: string): Promise<DocGenDocumento> {
    const cancelado = await docGenDocumentoService.cancelar(doc.id, motivo);
    await docGenDocumentoService.concluirTarefaDePrazo(doc.id);
    if (doc.ged_document_id) {
        const { data } = await supabase.from('opura_documents').select('tags').eq('id', doc.ged_document_id).maybeSingle();
        const tags = Array.from(new Set([...(((data as { tags?: string[] } | null)?.tags) ?? []), 'cancelado']));
        await documentService.updateDocument(doc.ged_document_id, { status: 'arquivado', tags });
    }
    return cancelado;
}
