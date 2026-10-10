import { supabase } from '../../lib/supabase';
import { documentService } from '../documentService';
import { docGenDocumentoService } from '../docGenDocumentoService';
import type {
    DocGenDocumento, DocGenDocumentoStatus, DocGenEvento, DocGenVinculo, DocGenVinculoTipo, MetadadosOficioRecebido,
} from '../../types/docGen';
import type { OpuraDocument, OpuraDocumentCategoria } from '../../types/documents';
import { dataCurta } from './dataExtenso';
import { anoDe, garantirPasta } from './gedPastas';

/**
 * Tramitação do ofício (F4 — Fase 2 da proposta). Plano:
 * docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 * As regras (transições, quem assina, o que trava) moram no banco; aqui ficam
 * os rótulos da tela, o texto do "em resposta a" e o registro do ofício
 * RECEBIDO de terceiro — que é um documento do GED com
 * `metadados.tipo = 'OFICIO_RECEBIDO'`, arquivado congelado (é prova).
 */

// ─── Rótulos (puros) ──────────────────────────────────────────────────────────

export const ROTULO_SITUACAO: Record<DocGenDocumentoStatus, string> = {
    RASCUNHO: 'Em elaboração',
    EMITIDO: 'Emitido',
    ENVIADO: 'Enviado',
    RECEBIDO: 'Recebido pelo destinatário',
    RESPONDIDO: 'Respondido',
    ENCERRADO: 'Encerrado',
    CANCELADO: 'Cancelado',
};

export const ROTULO_VINCULO: Record<DocGenVinculoTipo, { de: string; para: string }> = {
    RESPONDE: { de: 'Em resposta a', para: 'Respondido por' },
    ENCAMINHA: { de: 'Encaminha', para: 'Encaminhado por' },
    RETIFICA: { de: 'Retifica', para: 'Retificado por' },
    REFERENCIA: { de: 'Faz referência a', para: 'Referenciado por' },
};

export const CANAIS_ENVIO = [
    { value: 'EM_MAOS', label: 'Entregue em mãos' },
    { value: 'CORREIOS', label: 'Correios (AR)' },
    { value: 'EMAIL', label: 'E-mail' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'PROTOCOLO_ONLINE', label: 'Protocolo on-line / portal' },
    { value: 'OUTRO', label: 'Outro' },
] as const;

const rotuloCanal = (v: unknown) => CANAIS_ENVIO.find(c => c.value === v)?.label ?? (v ? String(v) : '');

const texto = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Uma linha legível do histórico ("Enviado — Correios (AR) · rastreio BR123"). Puro. */
export function descreverEvento(e: Pick<DocGenEvento, 'tipo' | 'dados'>): string {
    const d = e.dados ?? {};
    const partes = (lista: string[]) => lista.filter(Boolean).join(' · ');
    switch (e.tipo) {
        case 'APROVACAO_SOLICITADA': return 'Enviado para aprovação';
        case 'APROVADO_NIVEL': return partes([`Aprovado no nível ${texto(d.nivel) || '1'} (falta o próximo nível)`, texto(d.notas)]);
        case 'APROVADO': return partes(['Aprovado', texto(d.notas)]);
        case 'REJEITADO': return partes(['Rejeitado', texto(d.notas) && `motivo: ${texto(d.notas)}`]);
        case 'APROVACAO_DESFEITA': return texto(d.motivo) ? `Aprovação desfeita — ${texto(d.motivo).toLowerCase()}` : 'Retirado da aprovação';
        case 'ASSINADO': return partes([`Assinado eletronicamente por ${texto(d.nome)}`, d.versao ? `versão ${texto(d.versao)}` : '']);
        case 'EMITIDO': return partes(['Emitido', texto(d.numero) && `nº ${texto(d.numero)}`]);
        case 'ENVIADO': return partes(['Enviado', rotuloCanal(d.canal), texto(d.para) && `para ${texto(d.para)}`, texto(d.rastreio) && `rastreio ${texto(d.rastreio)}`, texto(d.observacao)]);
        case 'RECEBIDO': return partes(['Recebido pelo destinatário', texto(d.protocolo) && `protocolo ${texto(d.protocolo)}`, texto(d.recebido_por) && `por ${texto(d.recebido_por)}`, d.recebido_em ? `em ${dataCurta(texto(d.recebido_em))}` : '', texto(d.observacao)]);
        case 'RESPONDIDO': return partes(['Respondido', texto(d.resposta) && `pela ${texto(d.resposta)}`, texto(d.observacao)]);
        case 'ENCERRADO': return partes(['Encerrado', texto(d.observacao)]);
        case 'CANCELADO': return partes(['Cancelado', texto(d.motivo) && `motivo: ${texto(d.motivo)}`]);
        default: return e.tipo;
    }
}

/** "Ofício nº 123/2026 da Prefeitura de Cambuí, de 02/10/2026". Puro. */
export function referenciaDeOficio(r: { numero?: string | null; remetente?: string | null; data?: string | null; nome?: string | null }): string {
    const numero = texto(r.numero);
    const base = numero ? `Ofício nº ${numero}` : texto(r.nome) || 'documento';
    const de = texto(r.remetente) ? ` de ${texto(r.remetente)}` : '';
    const data = r.data ? `, de ${dataCurta(r.data)}` : '';
    return `${base}${de}${data}`;
}

/** O ofício recebido espera resposta? (tem prazo e ninguém respondeu). Puro. */
export function recebidoAguardando(meta: Pick<MetadadosOficioRecebido, 'responder_ate'>, respondido: boolean): boolean {
    return !!meta.responder_ate && !respondido;
}

// ─── Leitura de ofícios recebidos (GED) ──────────────────────────────────────

export interface OficioRecebido {
    documento: OpuraDocument;
    meta: MetadadosOficioRecebido;
}

const COLUNAS_GED = 'id, organization_id, nome, descricao, categoria, tipo_documento, status, data_emissao, tags, criado_por, created_at, updated_at, supplier_id, project_id, active_version_id, folder_id, metadados';

function comoRecebido(d: OpuraDocument): OficioRecebido | null {
    const m = (d as OpuraDocument & { metadados?: Record<string, unknown> | null }).metadados;
    if (!m || m.tipo !== 'OFICIO_RECEBIDO') return null;
    return { documento: d, meta: m as unknown as MetadadosOficioRecebido };
}

/** Ofícios recebidos da organização (REGRA #5: `.eq` só com organização). */
export async function listarRecebidos(organizationId: string | null): Promise<OficioRecebido[]> {
    let q = supabase.from('opura_documents').select(COLUNAS_GED)
        .eq('metadados->>tipo', 'OFICIO_RECEBIDO')
        .order('created_at', { ascending: false });
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as unknown as OpuraDocument[]).map(comoRecebido).filter((x): x is OficioRecebido => !!x);
}

async function lerRecebido(gedId: string): Promise<OficioRecebido | null> {
    const { data, error } = await supabase.from('opura_documents').select(COLUNAS_GED).eq('id', gedId).maybeSingle();
    if (error) throw error;
    return data ? comoRecebido(data as unknown as OpuraDocument) : null;
}

/**
 * Texto do `{{documento.em_resposta_a}}` a partir do vínculo RESPONDE que sai
 * do ofício. Sem vínculo, vazio (a variável fica pendente e o usuário pode
 * preencher "só neste documento").
 */
export async function textoEmRespostaA(vinculos: DocGenVinculo[], documentoId: string): Promise<string> {
    const v = vinculos.find(x => x.tipo === 'RESPONDE' && x.de_documento_id === documentoId);
    if (!v) return '';
    if (v.para_documento_id) {
        const alvo = await docGenDocumentoService.get(v.para_documento_id);
        return alvo ? referenciaDeOficio({ numero: alvo.numero, data: alvo.data_documento, nome: alvo.assunto }) : '';
    }
    if (v.para_ged_id) {
        const r = await lerRecebido(v.para_ged_id);
        return r ? referenciaDeOficio({ numero: r.meta.numero, remetente: r.meta.remetente, data: r.meta.data_documento ?? r.meta.recebido_em }) : '';
    }
    return '';
}

// ─── Registrar ofício recebido ───────────────────────────────────────────────

export interface EntradaRecebido {
    organizationId: string;
    arquivo: File;
    numero: string;
    assunto: string;
    remetente: string;
    remetenteSupplierId?: string | null;
    dataDocumento?: string | null;
    recebidoEm: string;
    responderAte?: string | null;
    categoria: OpuraDocumentCategoria;
    projectId?: string | null;
    /** É a resposta a um ofício nosso → vínculo RESPONDE e o nosso vai a RESPONDIDO. */
    respondeAoOficio?: DocGenDocumento | null;
    emailUsuario?: string | null;
}

/** Caminho no GED: Ofícios / 2026 / Recebidos. Puro. */
export const caminhoDosRecebidos = (ano: string) => ['Ofícios', ano, 'Recebidos'];

/**
 * Arquiva o PDF recebido no GED (congelado, com hash), liga ao nosso ofício
 * quando é resposta, e cria a tarefa do prazo para responder.
 */
export async function registrarRecebido(e: EntradaRecebido): Promise<OficioRecebido> {
    const meta: MetadadosOficioRecebido = {
        tipo: 'OFICIO_RECEBIDO',
        numero: e.numero.trim() || null,
        assunto: e.assunto.trim(),
        remetente: e.remetente.trim(),
        remetente_supplier_id: e.remetenteSupplierId ?? null,
        data_documento: e.dataDocumento || null,
        recebido_em: e.recebidoEm,
        responder_ate: e.responderAte || null,
    };
    const pastaId = await garantirPasta(e.organizationId, e.categoria, caminhoDosRecebidos(anoDe(e.recebidoEm)));
    const ged = await documentService.uploadNewDocument({
        organization_id: e.organizationId,
        nome: meta.numero ? `Ofício recebido ${meta.numero} — ${meta.remetente}` : `Ofício recebido — ${meta.remetente}`,
        descricao: meta.assunto,
        categoria: e.categoria,
        tipo_documento: 'Ofício recebido',
        status: 'ativo',
        data_emissao: meta.data_documento ?? e.recebidoEm,
        alerta_dias_antecedencia: 30,
        tags: ['oficio-recebido', ...(meta.numero ? [meta.numero] : [])],
        supplier_id: e.remetenteSupplierId ?? undefined,
        project_id: e.projectId ?? undefined,
        folder_id: pastaId,
    }, e.arquivo, e.emailUsuario ?? undefined, { congelar: true, metadados: meta as unknown as Record<string, unknown> });

    if (e.respondeAoOficio) {
        await docGenDocumentoService.vincular({
            organization_id: e.organizationId,
            de: { gedId: ged.id },
            para: { documentoId: e.respondeAoOficio.id },
            tipo: 'RESPONDE',
        });
        if (['EMITIDO', 'ENVIADO', 'RECEBIDO'].includes(e.respondeAoOficio.status)) {
            await docGenDocumentoService.tramitar(e.respondeAoOficio.id, 'RESPONDIDO', {
                resposta: referenciaDeOficio({ numero: meta.numero, remetente: meta.remetente, data: meta.data_documento ?? meta.recebido_em }),
            });
        }
        await docGenDocumentoService.concluirTarefaDePrazo(e.respondeAoOficio.id);
    }

    if (meta.responder_ate) {
        await docGenDocumentoService.garantirTarefaDePrazo({
            id: ged.id,
            organizationId: e.organizationId,
            tipo: 'oficio_recebido',
            prazo: meta.responder_ate,
            titulo: `Responder ${referenciaDeOficio({ numero: meta.numero, remetente: meta.remetente })}`,
            descricao: meta.assunto,
        }).catch(err => console.warn('[tramitacao] tarefa do prazo não criada:', err));
    }

    return { documento: ged, meta };
}

/** URL assinada (15 min) do PDF do ofício recebido. */
export async function urlDoRecebido(r: OficioRecebido, emailUsuario?: string | null): Promise<string> {
    if (!r.documento.active_version_id) throw new Error('Documento do GED sem arquivo.');
    const { data, error } = await supabase.from('opura_document_versions').select('storage_path').eq('id', r.documento.active_version_id).maybeSingle();
    if (error) throw error;
    const path = (data as { storage_path?: string } | null)?.storage_path;
    if (!path) throw new Error('Arquivo do GED não encontrado.');
    return documentService.generateDownloadUrl(path, r.documento.organization_id, r.documento.id, emailUsuario ?? undefined);
}

/**
 * Quem respondeu um ofício recebido: o ofício NOSSO, já emitido, que tem o
 * vínculo RESPONDE apontando para ele. Rascunho não conta (ainda não saiu). Puro.
 */
export function respostaDoRecebido(gedId: string, vinculos: DocGenVinculo[], documentos: DocGenDocumento[]): { emitida: DocGenDocumento | null; rascunho: DocGenDocumento | null } {
    const nossos = vinculos
        .filter(v => v.tipo === 'RESPONDE' && v.para_ged_id === gedId && v.de_documento_id)
        .map(v => documentos.find(d => d.id === v.de_documento_id))
        .filter((d): d is DocGenDocumento => !!d && d.status !== 'CANCELADO');
    return {
        emitida: nossos.find(d => d.status !== 'RASCUNHO') ?? null,
        rascunho: nossos.find(d => d.status === 'RASCUNHO') ?? null,
    };
}
