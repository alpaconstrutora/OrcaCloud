import { supabase } from '../lib/supabase';
import { sanitizeFileName } from '../utils/storageUtils';
import { sha256File, extractFromPdfFile, buildExtractionFromLinhaDigitavel } from '../utils/boletoParser';
import { parseLinhaDigitavel, onlyDigits, nomeBanco } from '../utils/febrabanRules';
import type {
    Boleto,
    BoletoStatus,
    BoletoFilters,
    BoletoExtractionResult,
    BoletoAuditoria,
} from '../types/boletos';

const BUCKET = 'boletos';
const TABLE = 'boletos';
const AUDIT_TABLE = 'boletos_auditoria';

// ─── Helpers internos ───────────────────────────────────────────────────────

function mapRowToBoleto(row: any): Boleto {
    return {
        id: row.id,
        numero: row.numero,
        organization_id: row.organization_id,
        documento_path: row.documento_path,
        documento_nome: row.documento_nome,
        documento_hash: row.documento_hash,
        documento_mime: row.documento_mime,
        documento_paginas: row.documento_paginas,
        documento_tamanho: row.documento_tamanho,
        linha_digitavel: row.linha_digitavel,
        codigo_barras: row.codigo_barras,
        qr_pix: row.qr_pix,
        banco_codigo: row.banco_codigo,
        banco_nome: row.banco_nome,
        valor: row.valor !== null ? Number(row.valor) : undefined,
        valor_original: row.valor_original !== null ? Number(row.valor_original) : undefined,
        vencimento: row.vencimento,
        data_documento: row.data_documento,
        beneficiario_nome: row.beneficiario_nome,
        beneficiario_cnpj: row.beneficiario_cnpj,
        beneficiario_banco: row.beneficiario_banco,
        beneficiario_agencia: row.beneficiario_agencia,
        beneficiario_conta: row.beneficiario_conta,
        pagador_nome: row.pagador_nome,
        pagador_cnpj: row.pagador_cnpj,
        metodo_extracao: row.metodo_extracao,
        confidence_score: row.confidence_score,
        engine_versao: row.engine_versao,
        extracao_raw: row.extracao_raw,
        extracao_em: row.extracao_em,
        checksum_valido: row.checksum_valido,
        duplicado_de: row.duplicado_de,
        erros_validacao: row.erros_validacao,
        project_id: row.project_id,
        cost_center_id: row.cost_center_id,
        supplier_id: row.supplier_id,
        chart_of_accounts_id: row.chart_of_accounts_id,
        invoice_id: row.invoice_id,
        sugestao_supplier_id: row.sugestao_supplier_id,
        sugestao_cc_id: row.sugestao_cc_id,
        sugestao_confianca: row.sugestao_confianca,
        status: row.status,
        observacoes: row.observacoes,
        created_by: row.created_by,
        created_by_email: row.created_by_email,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function extractionToColumns(ext: BoletoExtractionResult) {
    return {
        linha_digitavel: ext.campos.linha_digitavel.valor,
        codigo_barras: ext.campos.codigo_barras.valor,
        qr_pix: ext.campos.qr_pix.valor,
        valor: ext.campos.valor.valor,
        valor_original: ext.campos.valor_original.valor,
        vencimento: ext.campos.vencimento.valor,
        beneficiario_nome: ext.campos.beneficiario_nome.valor,
        beneficiario_cnpj: ext.campos.beneficiario_cnpj.valor,
        banco_codigo: ext.campos.banco_codigo.valor,
        banco_nome: ext.campos.banco_nome.valor,
        metodo_extracao: ext.metodo,
        confidence_score: ext.confidence_score,
        engine_versao: ext.engine_versao,
        extracao_raw: ext.raw,
        extracao_em: new Date().toISOString(),
        checksum_valido: ext.erros.length === 0,
        erros_validacao: ext.erros.length ? ext.erros : null,
    };
}

async function registrarAuditoria(
    boletoId: string,
    organizationId: string,
    acao: string,
    payload: Partial<Omit<BoletoAuditoria, 'id' | 'boleto_id' | 'organization_id' | 'acao' | 'created_at'>> = {},
) {
    try {
        await supabase.from(AUDIT_TABLE).insert({
            boleto_id: boletoId,
            organization_id: organizationId,
            acao,
            campo: payload.campo,
            valor_antes: payload.valor_antes,
            valor_depois: payload.valor_depois,
            metodo: payload.metodo ?? 'usuario',
            usuario_email: payload.usuario_email,
        });
    } catch (err) {
        console.warn('[boletoService] falha ao registrar auditoria', err);
    }
}

// ─── Service público ────────────────────────────────────────────────────────

export const boletoService = {
    /**
     * Faz upload, extrai dados (PDF) e cria o registro em status='rascunho'.
     * Se já existir boleto com mesmo hash na organização, marca como duplicado.
     */
    async uploadBoleto(params: {
        organizationId: string;
        file: File;
        userEmail?: string;
        projectId?: string;
    }): Promise<{ boleto: Boleto; extraction: BoletoExtractionResult; duplicate: boolean }> {
        const { organizationId, file, userEmail, projectId } = params;

        // 1. Hash para dedup
        const hash = await sha256File(file);

        // 2. Checar duplicidade
        const { data: existente } = await supabase
            .from(TABLE)
            .select('*')
            .eq('organization_id', organizationId)
            .eq('documento_hash', hash)
            .maybeSingle();

        if (existente) {
            return {
                boleto: mapRowToBoleto(existente),
                extraction: existente.extracao_raw as any || buildExtractionFromLinhaDigitavel(existente.linha_digitavel || '', 'pdf_text'),
                duplicate: true,
            };
        }

        // 3. Upload do arquivo
        const path = `${organizationId}/${new Date().getFullYear()}/${Date.now()}_${sanitizeFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: '3600',
            upsert: false,
        });
        if (upErr) throw upErr;

        // 4. Extração client-side (PDF apenas; imagens caem em fallback manual)
        let extraction: BoletoExtractionResult;
        try {
            extraction = await extractFromPdfFile(file);
        } catch (err) {
            console.warn('[boletoService] extração falhou, seguindo com fallback manual', err);
            extraction = {
                metodo: 'manual',
                confidence_score: 0,
                engine_versao: 'fallback',
                campos: {
                    linha_digitavel: { valor: null, confidence: 0 },
                    codigo_barras: { valor: null, confidence: 0 },
                    qr_pix: { valor: null, confidence: 0 },
                    valor: { valor: null, confidence: 0 },
                    valor_original: { valor: null, confidence: 0 },
                    vencimento: { valor: null, confidence: 0 },
                    beneficiario_nome: { valor: null, confidence: 0 },
                    beneficiario_cnpj: { valor: null, confidence: 0 },
                    banco_codigo: { valor: null, confidence: 0 },
                    banco_nome: { valor: null, confidence: 0 },
                },
                raw: { error: String(err) },
                erros: ['Falha na extração automática'],
            };
        }

        // 5. Insere o registro
        const insertPayload = {
            organization_id: organizationId,
            documento_path: path,
            documento_nome: file.name,
            documento_hash: hash,
            documento_mime: file.type,
            documento_tamanho: file.size,
            documento_paginas: extraction.raw?.paginas,
            project_id: projectId,
            status: 'rascunho' as BoletoStatus,
            created_by_email: userEmail,
            ...extractionToColumns(extraction),
        };

        const { data: inserted, error: insErr } = await supabase
            .from(TABLE)
            .insert(insertPayload)
            .select()
            .single();

        if (insErr) {
            await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
            throw insErr;
        }

        const boleto = mapRowToBoleto(inserted);

        await registrarAuditoria(boleto.id, organizationId, 'upload', {
            metodo: 'sistema',
            usuario_email: userEmail,
            valor_depois: { documento_nome: file.name, confidence: extraction.confidence_score },
        });

        // 6. Sugestão de fornecedor aguardada para incluir no retorno imediato
        if (extraction.campos.beneficiario_cnpj.valor) {
            const suggestedId = await this.sugerirFornecedor(
                boleto.id, organizationId, extraction.campos.beneficiario_cnpj.valor,
            ).catch(err => { console.warn('[boletoService] sugestão de fornecedor falhou', err); return null; });
            if (suggestedId) boleto.sugestao_supplier_id = suggestedId;
        }

        return { boleto, extraction, duplicate: false };
    },

    /**
     * Aplica entrada manual de linha digitável a um boleto existente.
     * Reprocessa validação FEBRABAN e atualiza os campos extraídos.
     */
    async aplicarLinhaDigitavelManual(boletoId: string, organizationId: string, linha: string, userEmail?: string): Promise<Boleto> {
        const limpa = onlyDigits(linha);
        const parsed = parseLinhaDigitavel(limpa);
        const extraction = buildExtractionFromLinhaDigitavel(limpa, 'manual');

        const updates = {
            ...extractionToColumns(extraction),
            banco_nome: nomeBanco(parsed.bancoCodigo) ?? null,
        };

        const { data, error } = await supabase
            .from(TABLE)
            .update(updates)
            .eq('id', boletoId)
            .select()
            .single();

        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, 'extracao_manual', {
            metodo: 'usuario',
            usuario_email: userEmail,
            campo: 'linha_digitavel',
            valor_depois: { linha_digitavel: limpa, confidence: extraction.confidence_score },
        });

        return mapRowToBoleto(data);
    },

    /**
     * Atualiza campos de associação (fornecedor, CC, projeto, etc.) e observações.
     */
    async associar(boletoId: string, organizationId: string, fields: Partial<Pick<Boleto,
        'supplier_id' | 'cost_center_id' | 'project_id' | 'chart_of_accounts_id' |
        'observacoes' | 'valor' | 'vencimento' | 'beneficiario_nome' | 'beneficiario_cnpj'
    >>, userEmail?: string): Promise<Boleto> {
        const { data, error } = await supabase
            .from(TABLE)
            .update(fields)
            .eq('id', boletoId)
            .select()
            .single();

        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, 'associacao', {
            metodo: 'usuario',
            usuario_email: userEmail,
            valor_depois: fields,
        });

        return mapRowToBoleto(data);
    },

    /**
     * Transição de workflow.
     */
    async transitar(boletoId: string, organizationId: string, novoStatus: BoletoStatus, userEmail?: string): Promise<Boleto> {
        const { data: atual, error: errAtual } = await supabase
            .from(TABLE)
            .select('status')
            .eq('id', boletoId)
            .single();

        if (errAtual) throw errAtual;

        const statusAnterior: BoletoStatus = atual.status;

        const { data, error } = await supabase
            .from(TABLE)
            .update({ status: novoStatus })
            .eq('id', boletoId)
            .select()
            .single();

        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, `status_${novoStatus}`, {
            metodo: 'usuario',
            usuario_email: userEmail,
            campo: 'status',
            valor_antes: statusAnterior,
            valor_depois: novoStatus,
        });

        return mapRowToBoleto(data);
    },

    /**
     * Aprova o boleto e cria o invoice correspondente (se ainda não houver).
     * O invoice é a entidade que aparece no contas a pagar existente.
     */
    async aprovarECriarInvoice(boletoId: string, organizationId: string, userEmail?: string): Promise<Boleto> {
        const { data: boletoRow, error: berr } = await supabase
            .from(TABLE)
            .select('*')
            .eq('id', boletoId)
            .single();
        if (berr) throw berr;

        if (!boletoRow.supplier_id) {
            throw new Error('Selecione um fornecedor antes de aprovar.');
        }

        let invoiceId = boletoRow.invoice_id;

        if (!invoiceId) {
            const { data: invoice, error: ierr } = await supabase
                .from('invoices')
                .insert({
                    supplier_id:           boletoRow.supplier_id,
                    file_path:             boletoRow.documento_path,
                    file_name:             boletoRow.documento_nome,
                    amount:                boletoRow.valor,
                    due_date:              boletoRow.vencimento ?? null,
                    cost_center_id:        boletoRow.cost_center_id ?? null,
                    chart_of_accounts_id:  boletoRow.chart_of_accounts_id ?? null,
                    status:                'approved',
                    notes:                 `[boleto:${boletoRow.id}] ${boletoRow.observacoes ?? ''}`.trim(),
                })
                .select('id')
                .single();
            if (ierr) throw ierr;
            invoiceId = invoice.id;
        }

        const { data, error } = await supabase
            .from(TABLE)
            .update({ status: 'aprovado', invoice_id: invoiceId })
            .eq('id', boletoId)
            .select()
            .single();
        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, 'aprovacao', {
            metodo: 'usuario',
            usuario_email: userEmail,
            valor_depois: { invoice_id: invoiceId },
        });

        return mapRowToBoleto(data);
    },

    /**
     * Marca como pago (já programado anteriormente ou direto a partir de aprovado).
     * Atualiza também o invoice associado para status='paid'.
     */
    async marcarPago(boletoId: string, organizationId: string, userEmail?: string): Promise<Boleto> {
        const boleto = await this.transitar(boletoId, organizationId, 'pago', userEmail);
        if (boleto.invoice_id) {
            await supabase.from('invoices').update({ status: 'paid' }).eq('id', boleto.invoice_id);
        }
        return boleto;
    },

    /**
     * Sugestão de fornecedor por CNPJ exato (MVP — fuzzy fica para fase 2).
     * Retorna o id do supplier encontrado, ou null.
     */
    async sugerirFornecedor(boletoId: string, organizationId: string, cnpj: string): Promise<string | null> {
        const cnpjLimpo = onlyDigits(cnpj);
        if (cnpjLimpo.length < 11) return null;

        const { data: supplier } = await supabase
            .from('suppliers')
            .select('id, name, document')
            .ilike('document', `%${cnpjLimpo}%`)
            .limit(1)
            .maybeSingle();

        if (supplier) {
            await supabase
                .from(TABLE)
                .update({ sugestao_supplier_id: supplier.id, sugestao_confianca: 95 })
                .eq('id', boletoId);
            return supplier.id as string;
        }
        return null;
    },

    /**
     * Lista boletos com filtros opcionais. Se organizationId for omitido, retorna todas as
     * organizações acessíveis ao usuário (RLS garante o escopo).
     */
    async list(organizationId: string | undefined, filters: BoletoFilters = {}): Promise<Boleto[]> {
        let q = supabase
            .from(TABLE)
            .select('*')
            .order('created_at', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);

        if (filters.status) {
            if (Array.isArray(filters.status)) q = q.in('status', filters.status);
            else q = q.eq('status', filters.status);
        }
        if (filters.supplier_id) q = q.eq('supplier_id', filters.supplier_id);
        if (filters.project_id) q = q.eq('project_id', filters.project_id);
        if (filters.vencimento_de) q = q.gte('vencimento', filters.vencimento_de);
        if (filters.vencimento_ate) q = q.lte('vencimento', filters.vencimento_ate);
        if (filters.search) {
            q = q.or(`documento_nome.ilike.%${filters.search}%,beneficiario_nome.ilike.%${filters.search}%,linha_digitavel.ilike.%${filters.search}%`);
        }

        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map(mapRowToBoleto);
    },

    async getById(boletoId: string): Promise<Boleto | null> {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('id', boletoId)
            .maybeSingle();
        if (error) throw error;
        return data ? mapRowToBoleto(data) : null;
    },

    async listAuditoria(boletoId: string): Promise<BoletoAuditoria[]> {
        const { data, error } = await supabase
            .from(AUDIT_TABLE)
            .select('*')
            .eq('boleto_id', boletoId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []) as BoletoAuditoria[];
    },

    getDocumentoUrl(path: string): string {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return data.publicUrl;
    },

    async exportarExcel(boletos: Boleto[], nomeArquivo = 'boletos'): Promise<void> {
        const ExcelJS = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'OrçaCloud';
        const ws = wb.addWorksheet('Boletos');

        ws.columns = [
            { header: 'Documento',      key: 'documento_nome',   width: 30 },
            { header: 'Banco',          key: 'banco_nome',        width: 20 },
            { header: 'Beneficiário',   key: 'beneficiario_nome', width: 28 },
            { header: 'CNPJ',           key: 'beneficiario_cnpj', width: 18 },
            { header: 'Valor (R$)',     key: 'valor',             width: 14 },
            { header: 'Vencimento',     key: 'vencimento',        width: 14 },
            { header: 'Status',         key: 'status',            width: 12 },
            { header: 'Linha Digitável',key: 'linha_digitavel',   width: 52 },
            { header: 'Capturado em',   key: 'created_at',        width: 20 },
        ];

        // Header styling
        ws.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
            cell.alignment = { vertical: 'middle' };
        });

        const STATUS_PT: Record<string, string> = {
            rascunho: 'Rascunho', revisao: 'Em revisão', aprovado: 'Aprovado',
            programado: 'Programado', pago: 'Pago', cancelado: 'Cancelado',
        };

        boletos.forEach(b => {
            const row = ws.addRow({
                documento_nome:   b.documento_nome,
                banco_nome:       b.banco_nome ?? '',
                beneficiario_nome:b.beneficiario_nome ?? '',
                beneficiario_cnpj:b.beneficiario_cnpj ?? '',
                valor:            b.valor ?? '',
                vencimento:       b.vencimento ? new Date(b.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '',
                status:           STATUS_PT[b.status] ?? b.status,
                linha_digitavel:  b.linha_digitavel ?? '',
                created_at:       new Date(b.created_at).toLocaleString('pt-BR'),
            });

            // Destaque para atrasados
            if (b.vencimento && new Date(b.vencimento + 'T00:00:00') < new Date() && !['pago','cancelado'].includes(b.status)) {
                row.getCell('vencimento').font = { bold: true, color: { argb: 'FFDC2626' } };
            }
        });

        ws.autoFilter = { from: 'A1', to: 'I1' };

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nomeArquivo}_${new Date().toISOString().slice(0,10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    },

    async exportarPDF(boletos: Boleto[], nomeArquivo = 'boletos'): Promise<void> {
        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 18, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Relatório de Boletos — OrçaCloud', 14, 12);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${boletos.length} registro(s)`, pageWidth - 14, 12, { align: 'right' });

        const STATUS_PT: Record<string, string> = {
            rascunho: 'Rascunho', revisao: 'Em revisão', aprovado: 'Aprovado',
            programado: 'Programado', pago: 'Pago', cancelado: 'Cancelado',
        };

        const hoje = new Date(); hoje.setHours(0,0,0,0);

        autoTable(doc, {
            startY: 22,
            head: [['Beneficiário / Documento', 'Banco', 'Valor', 'Vencimento', 'Status']],
            body: boletos.map(b => [
                (b.beneficiario_nome ?? b.documento_nome) + (b.beneficiario_cnpj ? `\n${b.beneficiario_cnpj}` : ''),
                b.banco_nome ?? '—',
                b.valor != null ? b.valor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) : '—',
                b.vencimento ? new Date(b.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
                STATUS_PT[b.status] ?? b.status,
            ]),
            headStyles: { fillColor: [37, 99, 235], fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 70 },
                2: { halign: 'right' },
                3: { halign: 'center' },
                4: { halign: 'center' },
            },
            didParseCell(data) {
                if (data.section === 'body' && data.column.index === 3) {
                    const b = boletos[data.row.index];
                    if (b?.vencimento && new Date(b.vencimento + 'T00:00:00') < hoje && !['pago','cancelado'].includes(b.status)) {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        doc.save(`${nomeArquivo}_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    /**
     * Cancela o boleto (não exclui — preserva histórico).
     */
    async cancelar(boletoId: string, organizationId: string, motivo: string, userEmail?: string): Promise<Boleto> {
        const { data, error } = await supabase
            .from(TABLE)
            .update({
                status: 'cancelado',
                observacoes: motivo,
            })
            .eq('id', boletoId)
            .select()
            .single();

        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, 'cancelamento', {
            metodo: 'usuario',
            usuario_email: userEmail,
            valor_depois: { motivo },
        });

        return mapRowToBoleto(data);
    },

    /**
     * Exclui permanentemente um boleto rascunho (e seu arquivo no storage).
     * Apenas rascunhos podem ser excluídos — demais status devem ser cancelados.
     */
    async excluirRascunho(boletoId: string, organizationId: string, userEmail?: string): Promise<void> {
        const boleto = await this.getById(boletoId);
        if (!boleto) return;
        if (boleto.status !== 'rascunho') {
            throw new Error('Apenas boletos em rascunho podem ser excluídos. Use cancelar nos demais casos.');
        }

        await supabase.storage.from(BUCKET).remove([boleto.documento_path]).catch(() => {});
        const { error } = await supabase.from(TABLE).delete().eq('id', boletoId);
        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, 'exclusao', {
            metodo: 'usuario',
            usuario_email: userEmail,
        });
    },
};
