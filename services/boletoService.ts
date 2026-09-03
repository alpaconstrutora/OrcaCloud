import { supabase } from '../lib/supabase';
import { sanitizeFileName } from '../utils/storageUtils';
import { sha256File, extractFromPdfFile, buildExtractionFromLinhaDigitavel } from '../utils/boletoParser';
import { parseLinhaDigitavel, onlyDigits, nomeBanco } from '../utils/febrabanRules';
import { financialApprovalService } from './financialApprovalService';
import type {
    Boleto,
    BoletoStatus,
    BoletoFilters,
    BoletoExtractionResult,
    BoletoAuditoria,
    BoletoStats,
} from '../types/boletos';

const BUCKET = 'boletos';
const TABLE = 'boletos';
const AUDIT_TABLE = 'boletos_auditoria';

/**
 * Tamanho do bloco de paginação. O PostgREST do Supabase corta toda resposta em
 * `db-max-rows` (1000 por padrão) — uma query sem `.range()` devolve no máximo
 * 1000 linhas SEM erro e SEM aviso. Por isso toda leitura de lista aqui é feita
 * em blocos, em laço, até a página vir incompleta.
 */
const PAGE_SIZE = 1000;

const BOLETO_COLUMNS = 'id, numero, organization_id, documento_path, documento_nome, documento_hash, documento_mime, documento_paginas, documento_tamanho, linha_digitavel, codigo_barras, qr_pix, banco_codigo, banco_nome, valor, valor_original, vencimento, data_documento, beneficiario_nome, beneficiario_cnpj, beneficiario_banco, beneficiario_agencia, beneficiario_conta, pagador_nome, pagador_cnpj, multa, multa_percentual, juros_dia, juros_dia_tipo, metodo_extracao, confidence_score, engine_versao, extracao_raw, extracao_em, checksum_valido, duplicado_de, erros_validacao, project_id, cost_center_id, plano_de_contas_id, supplier_id, chart_of_accounts_id, invoice_id, sugestao_supplier_id, sugestao_cc_id, sugestao_confianca, status, observacoes, created_by, created_by_email, created_at, updated_at';

// ─── Helpers internos ───────────────────────────────────────────────────────

/** Aplica organização + filtros. Compartilhado por `list` e `stats` para as duas
 *  lerem exatamente o mesmo recorte. */
function applyFilters<Q>(queryIn: Q, organizationId: string | undefined, filters: BoletoFilters): Q {
    let q = queryIn as any;
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
    return q as Q;
}

/**
 * Lê a tabela inteira em blocos de PAGE_SIZE, até uma página vir incompleta.
 * A ordenação inclui `id` como desempate — sem chave estável, dois registros com
 * o mesmo `created_at` podem trocar de posição entre um bloco e o seguinte e
 * aparecer duplicados ou sumir.
 */
async function fetchAllPages(
    columns: string,
    organizationId: string | undefined,
    filters: BoletoFilters,
): Promise<any[]> {
    const todas: any[] = [];
    for (let pagina = 0; ; pagina++) {
        const from = pagina * PAGE_SIZE;
        const q = applyFilters(
            supabase
                .from(TABLE)
                .select(columns)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(from, from + PAGE_SIZE - 1),
            organizationId,
            filters,
        );
        const { data, error } = await q;
        if (error) throw error;
        const bloco = (data || []) as any[];
        todas.push(...bloco);
        if (bloco.length < PAGE_SIZE) return todas;
    }
}

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
        multa: row.multa !== null ? Number(row.multa) : undefined,
        multa_percentual: row.multa_percentual !== null ? Number(row.multa_percentual) : undefined,
        juros_dia: row.juros_dia !== null ? Number(row.juros_dia) : undefined,
        juros_dia_tipo: row.juros_dia_tipo ?? undefined,
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
        plano_de_contas_id: row.plano_de_contas_id,
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
        multa: ext.campos.multa.valor,
        multa_percentual: ext.campos.multa_percentual.valor,
        juros_dia: ext.campos.juros_dia.valor,
        juros_dia_tipo: ext.campos.juros_dia_tipo.valor,
        metodo_extracao: ext.metodo,
        confidence_score: ext.confidence_score,
        engine_versao: ext.engine_versao,
        extracao_raw: ext.raw,
        extracao_em: new Date().toISOString(),
        /* `checksum_valido` olha SÓ `erros`. Aviso (ex.: fator de vencimento
           ambíguo) não pode marcar como inválido um boleto cujos DVs conferem —
           foi justamente esse campo que descartou o falso alarme dos boletos de
           2017 em 15/08/2026. */
        checksum_valido: ext.erros.length === 0,
        erros_validacao: [...ext.erros, ...(ext.avisos ?? [])].length
            ? [...ext.erros, ...(ext.avisos ?? [])]
            : null,
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
        /** Extração já calculada no cliente (evita reparsear o PDF). */
        extraction?: BoletoExtractionResult | null;
    }): Promise<{ boleto: Boleto; extraction: BoletoExtractionResult; duplicate: boolean }> {
        const { organizationId, file, userEmail, projectId, extraction: precomputed } = params;

        // 1. Hash para dedup
        const hash = await sha256File(file);

        // 2. Checar duplicidade
        const { data: existente } = await supabase
            .from(TABLE)
            .select('id, numero, organization_id, documento_path, documento_nome, documento_hash, documento_mime, documento_paginas, documento_tamanho, linha_digitavel, codigo_barras, qr_pix, banco_codigo, banco_nome, valor, valor_original, vencimento, data_documento, beneficiario_nome, beneficiario_cnpj, beneficiario_banco, beneficiario_agencia, beneficiario_conta, pagador_nome, pagador_cnpj, multa, multa_percentual, juros_dia, juros_dia_tipo, metodo_extracao, confidence_score, engine_versao, extracao_raw, extracao_em, checksum_valido, duplicado_de, erros_validacao, project_id, cost_center_id, supplier_id, chart_of_accounts_id, invoice_id, sugestao_supplier_id, sugestao_cc_id, sugestao_confianca, status, observacoes, created_by, created_by_email, created_at, updated_at')
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
        //    Reaproveita a extração já feita pelo formulário, se houver.
        let extraction: BoletoExtractionResult;
        try {
            extraction = precomputed ?? await extractFromPdfFile(file);
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
                    multa: { valor: null, confidence: 0 },
                    multa_percentual: { valor: null, confidence: 0 },
                    juros_dia: { valor: null, confidence: 0 },
                    juros_dia_tipo: { valor: null, confidence: 0 },
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
        'supplier_id' | 'cost_center_id' | 'plano_de_contas_id' | 'project_id' | 'chart_of_accounts_id' |
        'observacoes' | 'valor' | 'vencimento' | 'beneficiario_nome' | 'beneficiario_cnpj' |
        'multa' | 'multa_percentual' | 'juros_dia' | 'juros_dia_tipo'
    >>, userEmail?: string): Promise<Boleto> {
        const { data, error } = await supabase
            .from(TABLE)
            .update(fields)
            .eq('id', boletoId)
            .select()
            .single();

        if (error) throw error;

        // Sincroniza fornecedor/obra/cc/plano de contas na internal_transaction correspondente (se existir)
        const itSync: Record<string, unknown> = {};
        if ('supplier_id'         in fields) itSync.supplier_id         = fields.supplier_id         ?? null;
        if ('project_id'          in fields) itSync.project_id          = fields.project_id          ?? null;
        if ('cost_center_id'      in fields) itSync.cost_center_id      = fields.cost_center_id      ?? null;
        if ('plano_de_contas_id'  in fields) itSync.plano_de_contas_id  = fields.plano_de_contas_id  ?? null;
        if ('beneficiario_nome' in fields && fields.beneficiario_nome) {
            itSync.entity_name = fields.beneficiario_nome;
            itSync.party_name  = fields.beneficiario_nome;
        }
        if ('valor'     in fields && fields.valor)     itSync.amount           = fields.valor;
        if ('vencimento' in fields && fields.vencimento) {
            itSync.transaction_date = fields.vencimento;
            itSync.due_date         = fields.vencimento;
        }
        if (Object.keys(itSync).length) {
            await supabase
                .from('internal_transactions')
                .update(itSync)
                .eq('source_system', 'BOLETO')
                .eq('reference_id', boletoId);
        }

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
            .select('id, numero, organization_id, documento_path, documento_nome, documento_hash, documento_mime, documento_paginas, documento_tamanho, linha_digitavel, codigo_barras, qr_pix, banco_codigo, banco_nome, valor, valor_original, vencimento, data_documento, beneficiario_nome, beneficiario_cnpj, beneficiario_banco, beneficiario_agencia, beneficiario_conta, pagador_nome, pagador_cnpj, multa, multa_percentual, juros_dia, juros_dia_tipo, metodo_extracao, confidence_score, engine_versao, extracao_raw, extracao_em, checksum_valido, duplicado_de, erros_validacao, project_id, cost_center_id, plano_de_contas_id, supplier_id, chart_of_accounts_id, invoice_id, sugestao_supplier_id, sugestao_cc_id, sugestao_confianca, status, observacoes, created_by, created_by_email, created_at, updated_at')
            .eq('id', boletoId)
            .single();
        if (berr) throw berr;

        if (!boletoRow.supplier_id) {
            throw new Error('Selecione um fornecedor antes de aprovar.');
        }

        let invoiceId = boletoRow.invoice_id;

        /* Idempotência da criação da nota — corrigido em 2026-09-02.
         *
         * `if (!invoiceId) { insert }` é um read-then-write: duas chamadas
         * concorrentes leem `invoice_id = null`, ambas passam pelo `if` e ambas
         * inserem. Foi o que aconteceu — a varredura achou 4 pares de `invoices`
         * apontando para o MESMO arquivo no Storage, criados com 1 a 2 segundos
         * de diferença (clique duplo em "aprovar"). Três apareciam em Contas a
         * Pagar como título duplicado.
         *
         * A trava definitiva é o índice `uq_invoices_file_path`
         * (aplicar_20270918000020): o banco recusa a segunda linha. Mas recusar
         * com erro cru na cara do usuário não é resolver — o clique duplo tem de
         * CONVERGIR para a mesma nota. Daí as duas etapas abaixo: procurar antes,
         * e tratar o 23505 como "a outra chamada ganhou a corrida".
         */
        const caminhoDoc = boletoRow.documento_path ?? null;

        if (!invoiceId && caminhoDoc) {
            const { data: jaExiste } = await supabase
                .from('invoices')
                .select('id')
                .eq('file_path', caminhoDoc)
                .maybeSingle();
            if (jaExiste) invoiceId = jaExiste.id;
        }

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

            if (ierr) {
                // 23505 = unique_violation em `uq_invoices_file_path`: outra
                // chamada criou a nota entre a nossa busca e o nosso insert.
                // Não é erro do usuário — é a corrida sendo vencida. Recupera a
                // linha que ganhou e segue.
                if (ierr.code === '23505' && caminhoDoc) {
                    const { data: vencedora } = await supabase
                        .from('invoices')
                        .select('id')
                        .eq('file_path', caminhoDoc)
                        .maybeSingle();
                    if (!vencedora) throw ierr;
                    invoiceId = vencedora.id;
                } else {
                    throw ierr;
                }
            } else {
                invoiceId = invoice.id;
            }
        }

        // Criar internal_transaction (lançamento no razão) se ainda não existir para este boleto.
        // É o que conecta o boleto ao módulo de conciliação bancária.
        const { data: txExistente } = await supabase
            .from('internal_transactions')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('source_system', 'BOLETO')
            .eq('reference_id', boletoId)
            .maybeSingle();

        if (!txExistente) {
            const hoje = new Date().toISOString().slice(0, 10);
            /* O título NÃO nasce aprovado. Até 15/08/2026 este insert gravava
               `approval_status: 'APROVADO'`, então todo boleto se autodeclarava
               aprovado na alçada e nunca entrava em
               `financialApprovalService.listPendingQueue` (que filtra
               `approval_status='PENDENTE'`). Decisão do usuário em 15/08/2026:
               título vindo de boleto DEVE passar pela alçada — aprovar o boleto
               é o portão que CRIA o título, não o que libera o pagamento. */
            const { data: txNova, error: txErr } = await supabase.from('internal_transactions').insert({
                organization_id:  organizationId,
                source_system:    'BOLETO',
                reference_id:     boletoId,
                direction:        'DEBIT',
                status:           'PENDING',
                amount:           boletoRow.valor,
                transaction_date: hoje,
                due_date:         boletoRow.vencimento ?? null,
                description:      boletoRow.beneficiario_nome ?? boletoRow.documento_nome ?? 'Boleto',
                entity_name:      boletoRow.beneficiario_nome ?? null,
                party_name:       boletoRow.beneficiario_nome ?? null,
                supplier_id:      boletoRow.supplier_id ?? null,
                project_id:       boletoRow.project_id ?? null,
                cost_center_id:   boletoRow.cost_center_id ?? null,
                plano_de_contas_id: boletoRow.plano_de_contas_id ?? null,
            }).select('id').single();

            /* Mesmo raciocínio da nota, algumas linhas acima: a busca por
               `txExistente` e este insert não são atômicos, e o banco tem índice
               único em (organization_id, reference_id, entry_type). Clique duplo
               na aprovação faz a segunda chamada bater em 23505.

               Até 2026-09-03 o `error` deste insert era DESCARTADO. A falha não
               aparecia em lugar nenhum: `txNova` ficava null, o `if` abaixo
               pulava a alçada, e o update no fim da função marcava o boleto como
               `aprovado` assim mesmo. Ou seja, boleto aprovado SEM título no
               razão e FORA da fila de aprovação — e nada na tela dizendo isso.
               Mesmo padrão "erro engolido = número plausível" que produziu as
               notas duplicadas tratadas acima. */
            let txId = txNova?.id ?? null;

            if (txErr) {
                if (txErr.code === '23505') {
                    const { data: vencedora } = await supabase
                        .from('internal_transactions')
                        .select('id')
                        .eq('organization_id', organizationId)
                        .eq('source_system', 'BOLETO')
                        .eq('reference_id', boletoId)
                        .maybeSingle();
                    if (!vencedora) throw txErr;
                    // A outra chamada ganhou a corrida e já submeteu à alçada.
                    // Submeter de novo duplicaria a solicitação.
                    txId = null;
                } else {
                    throw txErr;
                }
            }

            /* Alçada: só entra na fila quem CAI numa faixa configurada — quem
               fica abaixo do piso nasce liberado. A regra vive em
               `approvalService.submit` (`semFaixa: 'liberar'`, ligado em
               `financialApprovalService.submitForApproval`), não aqui: ela vale
               igual para título, contrato e pedido de compra.
               Não derruba a aprovação do boleto se falhar: o título já existe e
               pode ser submetido depois pela tela de Aprovações — perder o
               boleto aprovado seria pior que um título fora da fila. */
            if (txId) {
                try {
                    await financialApprovalService.submitForApproval(txId, organizationId);
                } catch (err) {
                    console.error('[boletoService] submeter titulo a alcada:', err);
                }
            }
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
     * Atualiza o invoice associado e o lançamento no razão para CONCILIATED.
     */
    async marcarPago(boletoId: string, organizationId: string, userEmail?: string): Promise<Boleto> {
        const boleto = await this.transitar(boletoId, organizationId, 'pago', userEmail);
        const hoje = new Date().toISOString().slice(0, 10);
        const [, txResult] = await Promise.all([
            boleto.invoice_id
                ? supabase.from('invoices').update({ status: 'paid' }).eq('id', boleto.invoice_id)
                : Promise.resolve(null),
            /* SEM `.eq('organization_id', ...)`: `reference_id` é o uuid do boleto,
               único por si só, e a RLS de internal_transactions já recorta as orgs
               do usuário. O filtro era redundante — e quando `organizationId`
               chegava vazio (caso "Todas as organizações") o UPDATE casava ZERO
               linhas **sem erro**: o boleto virava 'pago' e o título ficava aberto.
               Em 15/08/2026 havia 14 boletos nesse estado, todos com `status_pago`
               por usuário na auditoria e nenhum estorno. Mesma classe de armadilha
               do `reference_id` composto. */
            supabase.from('internal_transactions')
                .update({ status: 'CONCILIATED', business_status: 'PAGO', payment_date: hoje })
                .eq('source_system', 'BOLETO')
                .eq('reference_id', boletoId)
                .select('id'),
        ]);

        /* Não silencia mais o casamento vazio. Não derruba a operação — o boleto
           já está pago e reverter seria pior —, mas o desencontro precisa
           aparecer em vez de virar divergência descoberta meses depois. */
        if (!txResult?.error && (txResult?.data?.length ?? 0) === 0) {
            console.error(
                `[boletoService] Boleto ${boletoId} marcado como pago, mas nenhum ` +
                'lançamento (internal_transactions) correspondente foi encontrado. ' +
                'O título segue em aberto no Contas a Pagar.',
            );
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
     *
     * Pagina em blocos de PAGE_SIZE: sem isso o PostgREST devolve no máximo 1000
     * linhas silenciosamente e a tela some com os boletos mais antigos.
     */
    async list(organizationId: string | undefined, filters: BoletoFilters = {}): Promise<Boleto[]> {
        const rows = await fetchAllPages(BOLETO_COLUMNS, organizationId, filters);
        return rows.map(mapRowToBoleto);
    },

    /**
     * Totais dos KPIs calculados sobre a base INTEIRA (não sobre a página carregada
     * na tela). Puxa só as colunas necessárias para agregar, também paginado.
     *
     * `filters.status` é ignorado de propósito: os contadores por status precisam
     * refletir todos os status, senão o chip do filtro ativo zera os demais.
     */
    async stats(organizationId: string | undefined, filters: BoletoFilters = {}): Promise<BoletoStats> {
        const { status: _ignorado, ...semStatus } = filters;
        const rows = await fetchAllPages('id, status, valor, vencimento, created_at, updated_at', organizationId, semStatus);

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const em7 = new Date(hoje);
        em7.setDate(hoje.getDate() + 7);
        const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

        const countPorStatus: Record<string, number> = {};
        const acc = {
            totalPendente: 0, countPendente: 0,
            totalAtrasado: 0, countAtrasado: 0,
            totalAVencer7: 0, countAVencer7: 0,
            totalPagoMes: 0, countPagoMes: 0,
        };

        for (const r of rows) {
            const status = r.status as string;
            countPorStatus[status] = (countPorStatus[status] || 0) + 1;

            const valor = r.valor !== null && r.valor !== undefined ? Number(r.valor) : 0;

            if (status === 'pago') {
                if (String(r.updated_at ?? r.created_at).startsWith(anoMes)) {
                    acc.totalPagoMes += valor;
                    acc.countPagoMes += 1;
                }
                continue;
            }
            if (status === 'cancelado') continue;

            acc.totalPendente += valor;
            acc.countPendente += 1;

            if (!r.vencimento) continue;
            // Sem `new Date('YYYY-MM-DD')` puro: o construtor trata como UTC e vira o dia anterior.
            const venc = new Date(`${r.vencimento}T00:00:00`);
            if (venc < hoje) {
                acc.totalAtrasado += valor;
                acc.countAtrasado += 1;
            } else if (venc <= em7) {
                acc.totalAVencer7 += valor;
                acc.countAVencer7 += 1;
            }
        }

        return { ...acc, total: rows.length, countPorStatus };
    },

    async getById(boletoId: string): Promise<Boleto | null> {
        const { data, error } = await supabase
            .from(TABLE)
            .select('id, numero, organization_id, documento_path, documento_nome, documento_hash, documento_mime, documento_paginas, documento_tamanho, linha_digitavel, codigo_barras, qr_pix, banco_codigo, banco_nome, valor, valor_original, vencimento, data_documento, beneficiario_nome, beneficiario_cnpj, beneficiario_banco, beneficiario_agencia, beneficiario_conta, pagador_nome, pagador_cnpj, multa, multa_percentual, juros_dia, juros_dia_tipo, metodo_extracao, confidence_score, engine_versao, extracao_raw, extracao_em, checksum_valido, duplicado_de, erros_validacao, project_id, cost_center_id, supplier_id, chart_of_accounts_id, invoice_id, sugestao_supplier_id, sugestao_cc_id, sugestao_confianca, status, observacoes, created_by, created_by_email, created_at, updated_at')
            .eq('id', boletoId)
            .maybeSingle();
        if (error) throw error;
        return data ? mapRowToBoleto(data) : null;
    },

    async listAuditoria(boletoId: string): Promise<BoletoAuditoria[]> {
        const { data, error } = await supabase
            .from(AUDIT_TABLE)
            .select('id, boleto_id, organization_id, acao, campo, valor_antes, valor_depois, metodo, usuario_email, created_at')
            .eq('boleto_id', boletoId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []) as BoletoAuditoria[];
    },

    // Bucket privado: gera URL assinada (15min). documento_path guarda só o PATH.
    async getDocumentoUrl(path: string): Promise<string> {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 15);
        if (error) throw error;
        return data.signedUrl;
    },

    async exportarExcel(boletos: Boleto[], nomeArquivo = 'boletos'): Promise<void> {
        const ExcelJS = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Opura';
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
        doc.text('Relatório de Boletos — Opura', 14, 12);
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
     * Atualiza em lote os campos de associação (fornecedor, projeto, CC) para múltiplos boletos.
     * Aplica apenas os campos presentes em `fields` (undefined = não alterar).
     */
    async associarEmLote(
        ids: string[],
        organizationId: string,
        fields: Partial<Pick<Boleto, 'supplier_id' | 'cost_center_id' | 'project_id'>>,
        userEmail?: string,
    ): Promise<void> {
        if (!ids.length || !Object.keys(fields).length) return;
        const { error } = await supabase
            .from(TABLE)
            .update(fields)
            .in('id', ids)
            .eq('organization_id', organizationId);
        if (error) throw error;

        // Sincroniza os mesmos campos na internal_transaction correspondente (se existir)
        const itFields: Record<string, unknown> = {};
        if ('supplier_id'    in fields) itFields.supplier_id    = fields.supplier_id    ?? null;
        if ('project_id'     in fields) itFields.project_id     = fields.project_id     ?? null;
        if ('cost_center_id' in fields) itFields.cost_center_id = fields.cost_center_id ?? null;
        if (Object.keys(itFields).length) {
            await supabase
                .from('internal_transactions')
                .update(itFields)
                .eq('source_system', 'BOLETO')
                .eq('organization_id', organizationId)
                .in('reference_id', ids);
        }

        await Promise.all(
            ids.map(id => registrarAuditoria(id, organizationId, 'associacao_lote', {
                metodo: 'usuario',
                usuario_email: userEmail,
                valor_depois: fields,
            })),
        );
    },

    /**
     * Atualiza campos de associação e aprova em lote (criando invoice para cada boleto).
     * Retorna listas de ids que tiveram sucesso e de erros.
     */
    async aprovarEmLote(
        ids: string[],
        organizationId: string,
        fields: Partial<Pick<Boleto, 'supplier_id' | 'cost_center_id' | 'project_id'>>,
        userEmail?: string,
    ): Promise<{ ok: string[]; errors: Array<{ id: string; error: string }> }> {
        if (!ids.length) return { ok: [], errors: [] };
        if (Object.keys(fields).length) {
            const { error } = await supabase
                .from(TABLE)
                .update(fields)
                .in('id', ids)
                .eq('organization_id', organizationId);
            if (error) throw error;
        }
        const ok: string[] = [];
        const errors: Array<{ id: string; error: string }> = [];
        for (const id of ids) {
            try {
                await this.aprovarECriarInvoice(id, organizationId, userEmail);
                ok.push(id);
            } catch (err: unknown) {
                errors.push({ id, error: err instanceof Error ? err.message : String(err) });
            }
        }
        return { ok, errors };
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
