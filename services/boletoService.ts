import { supabase } from '../lib/supabase';
import { nomeDoBeneficiario } from '../utils/boletoBeneficiario';
import { MOTIVO_VENCIMENTO_DO_PADRAO, MOTIVO_VALOR_DO_PADRAO } from '../utils/emailCaptureRegras';
import { resolverCategoriaPorId } from './financialCategoryResolver';
import { sanitizeFileName } from '../utils/storageUtils';
import { renomearDocumentoDoBoleto, renomearDocumentosDosBoletos } from './boletoNomeDocumentoService';
import { sha256File, extractFromPdfFile, buildExtractionFromLinhaDigitavel } from '../utils/boletoParser';
import { colunasDaExtracao } from '../utils/boletoTexto';
import { parseLinhaDigitavel, onlyDigits, nomeBanco, vencimentoPlausivel } from '../utils/febrabanRules';
import { financialApprovalService } from './financialApprovalService';
import { processService } from './processService';
import { validateCpfCnpj } from '../lib/validators';
import type {
    Boleto,
    BoletoStatus,
    BoletoFilters,
    BoletoExtractionResult,
    BoletoAuditoria,
    BoletoStats,
} from '../types/boletos';

/** Frase única: o service recusa com ela e o botão "Aprovar e Lançar" a mostra desabilitado. */
export const MOTIVO_SEM_VENCIMENTO = 'Informe o vencimento antes de aprovar — é ele que define a competência do título.';

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

const BOLETO_COLUMNS = 'id, numero, organization_id, documento_path, documento_nome, documento_hash, documento_mime, documento_paginas, documento_tamanho, linha_digitavel, codigo_barras, qr_pix, banco_codigo, banco_nome, valor, valor_original, vencimento, data_documento, beneficiario_nome, beneficiario_cnpj, beneficiario_banco, beneficiario_agencia, beneficiario_conta, pagador_nome, pagador_cnpj, multa, multa_percentual, juros_dia, juros_dia_tipo, metodo_extracao, confidence_score, engine_versao, extracao_raw, extracao_em, checksum_valido, duplicado_de, erros_validacao, project_id, cost_center_id, plano_de_contas_id, category_id, supplier_id, chart_of_accounts_id, invoice_id, sugestao_supplier_id, sugestao_cc_id, sugestao_confianca, status, descricao, observacoes, created_by, created_by_email, created_at, updated_at, origem, email_message_id, nosso_numero';

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
    if (filters.origem) q = q.eq('origem', filters.origem);
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
        category_id: row.category_id ?? null,
        supplier_id: row.supplier_id,
        chart_of_accounts_id: row.chart_of_accounts_id,
        invoice_id: row.invoice_id,
        sugestao_supplier_id: row.sugestao_supplier_id,
        sugestao_cc_id: row.sugestao_cc_id,
        sugestao_confianca: row.sugestao_confianca,
        status: row.status,
        descricao: row.descricao ?? undefined,
        observacoes: row.observacoes,
        created_by: row.created_by,
        created_by_email: row.created_by_email,
        created_at: row.created_at,
        updated_at: row.updated_at,
        origem: row.origem ?? 'upload',
        email_message_id: row.email_message_id ?? null,
        nosso_numero: row.nosso_numero ?? null,
    };
}

/** Conversão extração → colunas: mora em `utils/boletoTexto.ts` (a captura por e-mail usa a mesma). */
function extractionToColumns(ext: BoletoExtractionResult) {
    return colunasDaExtracao(ext);
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
            .select(BOLETO_COLUMNS)
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

        // 4.1 Segunda barreira de duplicidade: a LINHA DIGITÁVEL.
        //
        // O hash do passo 2 identifica o ARQUIVO, não o boleto. O mesmo boleto
        // baixado de novo do banco, rescaneado ou salvo com outro nome gera um PDF
        // diferente, hash diferente, e passava direto. Medido em produção em
        // 05/09/2026: 78 linhas digitáveis repetidas, 83 boletos excedentes,
        // R$ 117.911,57 em contas a pagar que não existem.
        //
        // A linha digitável é a identidade do título para a FEBRABAN: dois boletos
        // com a mesma linha SÃO o mesmo boleto. Só dá para conferir aqui, depois da
        // extração — por isso a checagem não cabia no passo 2.
        const linhaExtraida = onlyDigits(extraction.campos.linha_digitavel.valor ?? '');
        if (linhaExtraida.length >= 44) {
            const { data: mesmaLinha } = await supabase
                .from(TABLE)
                .select(BOLETO_COLUMNS)
                .eq('organization_id', organizationId)
                .eq('linha_digitavel', linhaExtraida)
                .limit(1)
                .maybeSingle();

            if (mesmaLinha) {
                // O arquivo já subiu no passo 3; sem registro que o referencie, ele fica órfão.
                await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
                return {
                    boleto: mapRowToBoleto(mesmaLinha),
                    extraction,
                    duplicate: true,
                };
            }
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
        'supplier_id' | 'cost_center_id' | 'plano_de_contas_id' | 'category_id' | 'project_id' | 'chart_of_accounts_id' |
        'descricao' | 'observacoes' | 'valor' | 'vencimento' | 'beneficiario_nome' | 'beneficiario_cnpj' |
        'multa' | 'multa_percentual' | 'juros_dia' | 'juros_dia_tipo'
    >>, userEmail?: string): Promise<Boleto> {
        // Segunda via de escrita do vencimento — o formulário. `<input
        // type="date">` aceita ano de até 275760, então o guarda vale aqui
        // também; do contrário a correção da extração seria contornável
        // digitando. Aqui a data implausível é RECUSADA (e não zerada como na
        // importação): quem digitou está olhando para o campo e pode corrigir.
        if (fields.vencimento !== undefined) {
            const venc = vencimentoPlausivel(fields.vencimento);
            if (!venc.ok) throw new Error(venc.motivo);
        }

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
        if ('category_id'         in fields) {
            const cat = await resolverCategoriaPorId(fields.category_id);
            itSync.category_id = cat?.category_id ?? null;
            itSync.category    = cat?.category    ?? null;
        }
        // Descrição preenchida acompanha o título; vazia não apaga a que já
        // está lá (o fallback é o beneficiário, decidido na aprovação).
        if ('descricao'           in fields && fields.descricao) itSync.description = fields.descricao;
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

        // Nomenclatura › Boletos: com fornecedor definido, o documento ganha o nome da
        // máscara. Nunca bloqueia — se falhar, o nome de upload fica como está.
        if (await renomearDocumentoDoBoleto(boletoId)) {
            const { data: atualizado } = await supabase.from(TABLE).select().eq('id', boletoId).single();
            if (atualizado) return mapRowToBoleto(atualizado);
        }

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
        /** Título que ESTA chamada criou — só ele dispara `boleto.approved` (a corrida perdida não). */
        let tituloNascido: string | null = null;
        const { data: boletoRow, error: berr } = await supabase
            .from(TABLE)
            .select(BOLETO_COLUMNS)
            .eq('id', boletoId)
            .single();
        if (berr) throw berr;

        if (!boletoRow.supplier_id) {
            throw new Error('Selecione um fornecedor antes de aprovar.');
        }
        // Nome do fornecedor para a descrição/contraparte do título quando o PDF não
        // trouxe beneficiário — antes caía no NOME DO ARQUIVO (16/10/2026).
        const { data: fornecedorDoBoleto } = await supabase.from('suppliers')
            .select('name, nickname').eq('id', boletoRow.supplier_id).maybeSingle();
        const nomeDoFornecedor: string | null = fornecedorDoBoleto?.nickname || fornecedorDoBoleto?.name || null;
        /* Sem vencimento não há competência (15/10/2026). Até aqui o título
           nascia com `transaction_date = hoje`, e "hoje" é o dia do clique —
           o defeito de 24/09 (boleto de 2021 na competência de setembro/2026)
           voltava para os 29% de boletos sem vencimento. Decisão do usuário:
           o boleto não vira título sem a data; o usuário a informa e aprova.
           Ver docs/planos/2026-10-15-captura-boletos-por-email.md, item 1.4. */
        if (!boletoRow.vencimento) {
            throw new Error(MOTIVO_SEM_VENCIMENTO);
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
            /* ── A data de COMPETÊNCIA do título (24/09/2026) ───────────────
               Até aqui `transaction_date` recebia `hoje` — o dia em que o
               boleto foi APROVADO. Medido na base: 532 dos 634 títulos de
               boleto (84%) ficaram com a data da captura, e 508 (80%) foram
               lançados mais de 30 dias depois do vencimento. O caso que
               denunciou: 43 boletos da MN Conservação, capturados entre 17/06
               e 02/07, aprovados todos em 17/09 às 16:28 — e carimbados com
               17/09/2026, embora vençam entre 2020 e 2023.

               Isso dói no condomínio porque o rateio recorta por
               `transaction_date`: um boleto de 2021 caía na competência de
               setembro/2026, e o condômino seria cobrado hoje por despesa de
               cinco anos atrás.

               [15/10/2026: a reserva `hoje` abaixo FOI REMOVIDA — sem
               vencimento a aprovação é recusada lá em cima.]
               `hoje` continuava como reserva porque o vencimento é opcional
               (810 de 1.147 boletos o têm). Sem vencimento não há data melhor
               — e uma data errada é pior que uma aproximada declarada.

               ⚠️ Isto NÃO reescreve o passado: os 532 títulos já gravados
               seguem com a data da captura. O backfill é decisão própria, com
               efeito em DRE, balancete e nos rateios já feitos. */
            const dataCompetencia: string = boletoRow.vencimento;
            const categoriaBoleto = await resolverCategoriaPorId(boletoRow.category_id);
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
                transaction_date: dataCompetencia,
                due_date:         boletoRow.vencimento ?? null,
                description:      boletoRow.descricao || nomeDoFornecedor || boletoRow.beneficiario_nome || 'Boleto',
                entity_name:      boletoRow.beneficiario_nome ?? nomeDoFornecedor,
                party_name:       boletoRow.beneficiario_nome ?? nomeDoFornecedor,
                supplier_id:      boletoRow.supplier_id ?? null,
                project_id:       boletoRow.project_id ?? null,
                cost_center_id:   boletoRow.cost_center_id ?? null,
                plano_de_contas_id: boletoRow.plano_de_contas_id ?? null,
                // Conta Financeira — é o que a DRE lê. Até 2026-09-20 o título de
                // boleto nascia sem categoria nenhuma (498 títulos, R$ 508 k em
                // "Sem Classificação" na Alpa).
                category_id:      categoriaBoleto?.category_id ?? null,
                category:         categoriaBoleto?.category ?? null,
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
                tituloNascido = txId;
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

        // Costura Financeiro (plano 2026-10-16-torre-fluxo-financeiro, C.4):
        // boleto aprovado = título nascido. Depois do boleto gravado, fora de
        // qualquer caminho que possa desfazer a aprovação. Best-effort.
        if (tituloNascido) await processService.triggerBoletoApproved(boletoId, tituloNascido);

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
        // Costura Financeiro: o título do boleto foi baixado aqui, sem passar
        // por `payableService`. Best-effort.
        for (const t of (txResult?.data ?? []) as { id: string }[]) {
            await processService.triggerForFinancialTitle(t.id, 'payable.settled');
        }
        return boleto;
    },

    /**
     * Sugestão de fornecedor pelo CPF/CNPJ do beneficiário, SÓ dentro da
     * organização do boleto. Retorna o id do fornecedor, ou null.
     *
     * Até 15/10/2026 era `suppliers.document ILIKE '%<só dígitos>%'` sem
     * filtro de organização — dois defeitos: `document` é gravado COM máscara
     * (`11.222.333/0001-81`), então o padrão só com dígitos não casava; e,
     * quando casava, podia trazer fornecedor de OUTRA organização (a RLS deixa
     * quem é membro de várias ler todas) e gravá-lo como FK do boleto. Com a
     * captura automática por e-mail isso viraria vínculo cross-tenant sem
     * ninguém olhando. A RPC compara só dígitos e recorta pela organização.
     *
     * Mais de um fornecedor com o mesmo documento na org (legado anterior à
     * trava de 16/07/2026): sugere o mais antigo — é sugestão, o usuário confirma.
     */
    async sugerirFornecedor(boletoId: string, organizationId: string, documento: string): Promise<string | null> {
        const doc = onlyDigits(documento);
        if (!validateCpfCnpj(doc)) return null;

        const { data, error } = await supabase.rpc('find_supplier_in_org_by_document', {
            p_organization_id: organizationId,
            p_document: doc,
        });
        if (error) {
            console.warn('[boletoService] busca de fornecedor por documento falhou', error);
            return null;
        }
        const supplier = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
        if (!supplier?.id) return null;

        await supabase
            .from(TABLE)
            .update({ sugestao_supplier_id: supplier.id, sugestao_confianca: 95 })
            .eq('id', boletoId)
            .eq('organization_id', organizationId);
        return supplier.id;
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
            .select(BOLETO_COLUMNS)
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

    async exportarExcel(boletos: Boleto[], nomeArquivo = 'boletos', nomesFornecedor: Record<string, string> = {}): Promise<void> {
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
                // Mesmo nome da coluna da tela (utils/boletoBeneficiario) — nunca o arquivo.
                beneficiario_nome:nomeDoBeneficiario(b, nomesFornecedor),
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

    async exportarPDF(boletos: Boleto[], nomeArquivo = 'boletos', nomesFornecedor: Record<string, string> = {}): Promise<void> {
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
            // Beneficiário e Documento em colunas próprias (16/10/2026): o arquivo
            // aparecia como beneficiário quando o PDF não trazia o nome.
            head: [['Beneficiário', 'Documento', 'Banco', 'Valor', 'Vencimento', 'Status']],
            body: boletos.map(b => [
                nomeDoBeneficiario(b, nomesFornecedor) + (b.beneficiario_cnpj ? `\n${b.beneficiario_cnpj}` : ''),
                b.documento_nome ?? '—',
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
        fields: Partial<Pick<Boleto, 'supplier_id' | 'cost_center_id' | 'plano_de_contas_id' | 'category_id' | 'project_id' | 'descricao'>>,
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
        if ('category_id'    in fields) {
            const cat = await resolverCategoriaPorId(fields.category_id);
            itFields.category_id = cat?.category_id ?? null;
            itFields.category    = cat?.category    ?? null;
        }
        if ('descricao'      in fields && fields.descricao) itFields.description = fields.descricao;
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

        // Nomenclatura › Boletos (mesma regra do `associar`): em ordem, sem bloquear.
        await renomearDocumentosDosBoletos(ids);
    },

    /**
     * Atualiza campos de associação e aprova em lote (criando invoice para cada boleto).
     * Retorna listas de ids que tiveram sucesso e de erros.
     */
    async aprovarEmLote(
        ids: string[],
        organizationId: string,
        fields: Partial<Pick<Boleto, 'supplier_id' | 'cost_center_id' | 'category_id' | 'project_id' | 'descricao'>>,
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
                // Antes de aprovar: a invoice copia `documento_nome` na aprovação.
                await renomearDocumentoDoBoleto(id);
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
     * Nome de exibição por e-mail (organization_members.name) — a coluna "Capturado por"
     * mostra pessoa, não endereço. A RLS recorta o que o usuário pode ver; e-mail sem
     * nome cadastrado simplesmente não entra no mapa e a tela cai no próprio e-mail.
     * Chave em minúsculas.
     */
    async nomesPorEmail(emails: string[]): Promise<Record<string, string>> {
        const unicos = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
        if (unicos.length === 0) return {};
        const { data, error } = await supabase
            .from('organization_members')
            .select('email, name')
            .in('email', unicos);
        if (error) {
            console.warn('[boletoService] nomes por e-mail indisponíveis', error);
            return {};
        }
        const mapa: Record<string, string> = {};
        for (const m of (data ?? []) as { email: string | null; name: string | null }[]) {
            const email = m.email?.trim().toLowerCase();
            const nome = m.name?.trim();
            if (email && nome && !mapa[email]) mapa[email] = nome;
        }
        return mapa;
    },

    /**
     * Status em que o boleto pode ser excluído.
     *
     * `rascunho` e `revisao` nunca têm reflexo financeiro — confirmado no banco em
     * 16/10/2026 (0 de 245 rascunhos e 0 de 62 revisões com `invoice_id`): nenhum
     * dos dois teve nota (`invoices`) nem título (`internal_transactions`) criados
     * ainda, já que isso só acontece em `aprovarECriarInvoice`. Saem limpos.
     *
     * `aprovado` e `pago` JÁ criaram nota e título, então a exclusão precisa
     * DESFAZER os dois; `desfazerLancamento` é quem decide se isso ainda é seguro.
     *
     * `pago` NÃO entra aqui, por decisão do usuário em 24/09/2026: ele não se
     * exclui de uma vez. O caminho é `reverterParaRascunho` primeiro — dois
     * atos deliberados em vez de um clique que apaga dinheiro lançado.
     *
     * (O que NÃO decide nada em nenhum dos dois caminhos é o status do título:
     * o "pago" do boleto é MARCAÇÃO — `marcarPago` grava `CONCILIATED` no
     * título sozinho, e em 24/09 eram 517 `CONCILIATED` para 7 conciliações
     * bancárias reais. Quem trava são os vínculos, em `desfazerLancamento`.)
     *
     * `cancelado` ENTROU em 16/10/2026: cancelar nasceu como a saída que
     * preserva histórico, mas na prática também é usado para engano de captura
     * (duplicata, PDF que não era boleto, documento pessoal) — esses precisam
     * de um jeito de sair do app de vez, não só ficar marcados e invisíveis.
     * `cancelado` é MISTO (28 de 53 têm `invoice_id`, 25 não) porque `cancelar`
     * nunca desfez o lançamento financeiro — por isso passa pelo MESMO caminho
     * de `aprovado` logo abaixo (`invoice_id` decide, não o status).
     *
     * `programado` (pagamento já agendado, ex.: Asaas) continua fora: não tinha
     * caminho nenhum até aqui (nem para excluir, nem para voltar —
     * `reverterParaRascunho` só aceita `pago`, e a tela não mostra "Marcar como
     * Pago" para `programado`) — o caminho é cancelar primeiro.
     *
     * `motivoParaNaoExcluir` é quem diz tudo isso na tela.
     */
    podeExcluir(status: BoletoStatus): boolean {
        return status !== 'pago' && status !== 'programado';
    },

    /**
     * Por que o botão Excluir está apagado neste status — em uma frase, para a
     * tela mostrar no lugar de um ícone cinza mudo.
     *
     * Botão desligado que não diz o porquê foi exatamente a queixa que abriu
     * esta linha de trabalho (24/09/2026). Quando existe um caminho, o texto
     * aponta o caminho; quando não existe, o texto diz isso em vez de inventar
     * um.
     */
    motivoParaNaoExcluir(status: BoletoStatus): string | null {
        if (this.podeExcluir(status)) return null;
        if (status === 'pago') return 'Reverta para rascunho antes de excluir';
        return 'Boleto com pagamento programado: cancele — não há como excluir direto';
    },

    /**
     * Texto do diálogo de confirmação ao excluir — fonte única para
     * `BoletoManager.tsx` e `BoletoFormModal.tsx` (16/10/2026: eram dois
     * textos duplicados que já tinham divergido um do outro).
     *
     * `cancelado` com `invoice_id` avisa explicitamente que o cancelamento NÃO
     * tinha removido o título — porque esse é o caso novo e mais surpreendente
     * (excluir um boleto "só histórico" também apaga dinheiro lançado).
     */
    mensagemConfirmacaoExclusao(b: Pick<Boleto, 'status' | 'invoice_id'>): string {
        if (b.status === 'aprovado') {
            return 'Este boleto já foi aprovado: o título dele no financeiro e a nota serão removidos junto. Essa ação não pode ser desfeita.';
        }
        if (b.status === 'cancelado' && b.invoice_id) {
            return 'Este boleto cancelado ainda tem um título no financeiro (o cancelamento não o removeu): o título e a nota serão removidos agora. Essa ação não pode ser desfeita.';
        }
        return 'Excluir permanentemente este boleto? Essa ação não pode ser desfeita.';
    },

    /**
     * Mover o boleto de organização só vale ANTES de existir título.
     *
     * A aprovação cria a `internal_transaction` (e a nota) com o
     * `organization_id` do boleto. Trocar a org depois disso deixaria o título
     * no financeiro da org antiga e o boleto na nova — conciliação, rateio de
     * condomínio e exercício fechado passariam a olhar para caixas diferentes.
     * Decidido com o usuário em 24/09/2026: só rascunho/revisão.
     */
    podeMudarOrganizacao(status: BoletoStatus): boolean {
        return status === 'rascunho' || status === 'revisao';
    },

    /** Por que o campo Organização está apagado — frase para a tela mostrar. */
    motivoParaNaoMudarOrganizacao(status: BoletoStatus): string | null {
        if (this.podeMudarOrganizacao(status)) return null;
        if (status === 'aprovado') return 'Boleto aprovado já tem título no financeiro desta organização. Exclua ou cancele para recapturar em outra.';
        if (status === 'pago') return 'Boleto pago: reverta para rascunho antes de mudar de organização.';
        if (status === 'cancelado') return 'Boleto cancelado fica no histórico da organização em que foi capturado.';
        return 'Só é possível mudar a organização enquanto o boleto está em rascunho.';
    },

    /**
     * Move o boleto para outra organização, limpando as dimensões.
     *
     * Fornecedor, obra, centro de custo, plano de contas, conta financeira e
     * plano de contas contábil são FK para catálogo da org ANTIGA — levá-los
     * junto cruzaria tenant (é o mesmo defeito que o centro de custo
     * apontando empreendimento de outra org). Por isso vão a `null` junto com
     * as sugestões automáticas, que também foram calculadas na org antiga.
     */
    async moverParaOrganizacao(
        boletoId: string,
        organizacaoAtual: string,
        novaOrganizacaoId: string,
        userEmail?: string,
    ): Promise<Boleto> {
        if (!novaOrganizacaoId) throw new Error('Selecione a organização de destino.');

        const { data: atual, error: errAtual } = await supabase
            .from(TABLE)
            .select('status, organization_id')
            .eq('id', boletoId)
            .single();
        if (errAtual) throw errAtual;

        // Copiado ANTES do update: `atual` é a linha lida, e ler o
        // `organization_id` dela depois da escrita é ler o valor novo.
        const orgAntiga: string = atual.organization_id ?? organizacaoAtual;
        const status = atual.status as BoletoStatus;
        if (!this.podeMudarOrganizacao(status)) {
            throw new Error(this.motivoParaNaoMudarOrganizacao(status) ?? 'Não é possível mudar a organização deste boleto.');
        }
        if (orgAntiga === novaOrganizacaoId) {
            const mesmo = await this.getById(boletoId);
            if (!mesmo) throw new Error('Boleto não encontrado.');
            return mesmo;
        }

        const { data, error } = await supabase
            .from(TABLE)
            .update({
                organization_id:     novaOrganizacaoId,
                supplier_id:         null,
                cost_center_id:      null,
                plano_de_contas_id:  null,
                category_id:         null,
                project_id:          null,
                chart_of_accounts_id: null,
                sugestao_supplier_id: null,
                sugestao_cc_id:      null,
                sugestao_confianca:  null,
            })
            .eq('id', boletoId)
            .select(BOLETO_COLUMNS)
            .single();
        if (error) throw error;

        await registrarAuditoria(boletoId, novaOrganizacaoId, 'mudanca_organizacao', {
            campo: 'organization_id',
            valor_antes: orgAntiga,
            valor_depois: novaOrganizacaoId,
            metodo: 'usuario',
            usuario_email: userEmail,
        });

        return mapRowToBoleto(data);
    },

    /**
     * Desfaz a baixa e devolve o boleto para rascunho.
     *
     * É o primeiro passo do fluxo de exclusão de um boleto pago, definido pelo
     * usuário em 24/09/2026: pago não se exclui de uma vez. Reverter estorna o
     * que existe no financeiro — título e nota saem — e o boleto volta ao
     * começo; só então o Excluir fica disponível. São dois atos deliberados em
     * vez de um clique que apaga dinheiro lançado.
     *
     * As travas são as mesmas da exclusão, e por isso ficam em
     * `desfazerLancamento`: o que impede apagar o título impede estorná-lo.
     */
    async reverterParaRascunho(boletoId: string, organizationId: string, userEmail?: string): Promise<Boleto> {
        const boleto = await this.getById(boletoId);
        if (!boleto) throw new Error('Boleto não encontrado.');
        if (boleto.status !== 'pago') {
            throw new Error('Só boleto pago é revertido para rascunho. Aprovado pode ser excluído direto.');
        }

        await this.desfazerLancamento(boletoId, organizationId, boleto.invoice_id ?? null);

        const { data, error } = await supabase
            .from(TABLE)
            .update({ status: 'rascunho', invoice_id: null })
            .eq('id', boletoId)
            .select()
            .single();
        if (error) throw error;

        await registrarAuditoria(boletoId, organizationId, 'status_rascunho', {
            metodo: 'usuario',
            usuario_email: userEmail,
            campo: 'status',
            valor_antes: boleto.status,
            valor_depois: 'rascunho',
        });

        return mapRowToBoleto(data);
    },

    /**
     * Desfaz o que a aprovação criou (título no razão + nota), ou explica por
     * que não dá.
     *
     * A aprovação (`aprovarECriarInvoice`) cria duas linhas. O título é a
     * perigosa: ele entra na conciliação bancária, na alçada e pode virar
     * despesa de rateio. Cada `throw` aqui corresponde a um vínculo que tornaria
     * a exclusão uma perda silenciosa de dado em OUTRO módulo — nesses casos o
     * caminho certo continua sendo Cancelar, que preserva o histórico.
     *
     * A alçada não tem tabela própria: `approvalService` grava colunas na
     * própria `internal_transactions` (ver `approvalService.submit`), então
     * apagar o título já leva a solicitação junto.
     */
    async desfazerLancamento(boletoId: string, organizationId: string, invoiceId: string | null): Promise<void> {
        const { data: tx, error: txErr } = await supabase
            .from('internal_transactions')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('source_system', 'BOLETO')
            .eq('reference_id', boletoId)
            .maybeSingle();
        if (txErr) throw txErr;

        if (tx) {
            /* O status do título NÃO decide nada aqui — e isso é deliberado.
               `marcarPago` grava `CONCILIATED` no título por conta própria, sem
               que exista qualquer linha de extrato do outro lado: em 24/09/2026
               eram 517 títulos `CONCILIATED` para 7 conciliações bancárias reais.
               Barrar por status recusaria 510 exclusões legítimas e ainda assim
               não protegeria nada — quem protege são os três vínculos abaixo,
               que são dado de OUTRO módulo e sumiriam em silêncio. */
            const { count: conciliacoes, error: mErr } = await supabase
                .from('reconciliation_matches')
                .select('id', { count: 'exact', head: true })
                .eq('internal_transaction_id', tx.id);
            if (mErr) throw mErr;
            if (conciliacoes) {
                throw new Error('O título deste boleto já está conciliado com uma linha do extrato bancário. Desfaça a conciliação em Financeiro › Conciliação antes de excluir, ou use Cancelar.');
            }

            const { count: rateios, error: rErr } = await supabase
                .from('condominio_rateio_itens')
                .select('id', { count: 'exact', head: true })
                .eq('transaction_id', tx.id);
            if (rErr) throw rErr;
            if (rateios) {
                throw new Error('O título deste boleto entra no rateio de um condomínio. Use Cancelar para não alterar o rateio.');
            }

            const { count: pagamentos, error: pErr } = await supabase
                .from('supplier_payments')
                .select('id', { count: 'exact', head: true })
                .eq('transaction_id', tx.id);
            if (pErr) throw pErr;
            if (pagamentos) {
                throw new Error('Existe pagamento a fornecedor lançado sobre este boleto. Use Cancelar.');
            }

            const { error: delTxErr } = await supabase.from('internal_transactions').delete().eq('id', tx.id);
            if (delTxErr) throw delTxErr;
        }

        if (invoiceId) {
            // A nota é 1:1 com o boleto (índice único em `file_path`), mas a
            // coluna `boletos.invoice_id` não impede que outra linha aponte para
            // ela — conferir antes é barato e evita apagar nota de terceiro.
            const { count: outros, error: oErr } = await supabase
                .from('boletos')
                .select('id', { count: 'exact', head: true })
                .eq('invoice_id', invoiceId)
                .neq('id', boletoId);
            if (oErr) throw oErr;
            if (!outros) {
                const { error: delInvErr } = await supabase.from('invoices').delete().eq('id', invoiceId);
                if (delInvErr) throw delInvErr;
            }
        }
    },

    /**
     * Exclui permanentemente um boleto (e seu arquivo no storage).
     *
     * Rascunho sai direto. Aprovado só sai depois de `desfazerLancamento`
     * remover o título e a nota criados na aprovação — e ela recusa se o título
     * já tiver vida própria no financeiro. Pago e cancelado nunca saem.
     */
    /**
     * Preenche boletos em revisão/rascunho com os padrões do remetente (16/10/2026,
     * "Aplicar aos N boletos em revisão deste remetente?"). Só os campos vazios —
     * o patch já vem calculado por `emailCaptureService.previaDosPadroes`. Trava
     * por `updated_at`: boleto editado por alguém entre a prévia e agora é pulado.
     * Não passa por `associar`: não há título antes de aprovar, e o fornecedor não
     * muda (nada de renomear o documento).
     */
    async preencherComPadroesDoRemetente(
        itens: Array<{ boleto: { id: string; updated_at: string; erros_validacao: string[] | null }; patch: Record<string, unknown>; campos: string[] }>,
        remetenteId: string,
        userEmail?: string,
    ): Promise<{ atualizados: Boleto[]; pulados: number }> {
        const atualizados: Boleto[] = [];
        let pulados = 0;
        for (const it of itens) {
            const antes = it.boleto.erros_validacao ?? [];
            const avisos = [
                ...(it.campos.includes('vencimento') ? [`Captura: ${MOTIVO_VENCIMENTO_DO_PADRAO}`] : []),
                ...(it.campos.includes('valor') ? [`Captura: ${MOTIVO_VALOR_DO_PADRAO}`] : []),
            ];
            const erros = [
                // O vencimento agora existe (do padrão): o aviso de "ausente" sai.
                ...antes.filter(e => !(it.campos.includes('vencimento') && e === 'Captura: Vencimento ausente ou implausível.')),
                ...avisos.filter(a => !antes.includes(a)),
            ];
            const { data, error } = await supabase.from(TABLE)
                .update({ ...it.patch, erros_validacao: erros.length ? erros : null })
                .eq('id', it.boleto.id)
                .eq('updated_at', it.boleto.updated_at)
                .in('status', ['revisao', 'rascunho'])
                .is('invoice_id', null)
                .select(BOLETO_COLUMNS);
            if (error || !data?.length) { pulados++; continue; }
            const b = mapRowToBoleto(data[0]);
            atualizados.push(b);
            await registrarAuditoria(b.id, b.organization_id, 'padroes_remetente', {
                valor_depois: { padroes_do_remetente: { remetente_id: remetenteId, valores: it.patch } },
                metodo: 'usuario',
                usuario_email: userEmail,
            });
        }
        return { atualizados, pulados };
    },

    async excluir(boletoId: string, organizationId: string, userEmail?: string): Promise<void> {
        const boleto = await this.getById(boletoId);
        if (!boleto) return;
        if (!this.podeExcluir(boleto.status)) {
            // 'pago' ganha a explicação mais longa (o motivoParaNaoExcluir é curto, pra
            // caber no title do ícone); os demais vêm da MESMA fonte da tela — não
            // repetir aqui o texto de cada status (16/10/2026: estava desatualizado,
            // chamando 'programado' de "cancelado").
            throw new Error(
                boleto.status === 'pago'
                    ? 'Boleto pago não é excluído direto: reverta para rascunho (o título e a nota são estornados) e então exclua.'
                    : this.motivoParaNaoExcluir(boleto.status) ?? 'Boleto não pode ser excluído neste status.',
            );
        }

        // Só desfaz o lançamento se ele existir de verdade — rascunho e revisão
        // nunca têm `invoice_id` (ver podeExcluir); aprovado sempre tem; cancelado
        // é misto (16/10/2026: 28 de 53 têm, porque `cancelar` nunca desfez).
        if (boleto.invoice_id) {
            await this.desfazerLancamento(boletoId, organizationId, boleto.invoice_id);
        }

        await supabase.storage.from(BUCKET).remove([boleto.documento_path]).catch(() => {});
        const { error } = await supabase.from(TABLE).delete().eq('id', boletoId);
        if (error) throw error;

        /* Não há auditoria de exclusão: `boletos_auditoria.boleto_id` tem FK
           `ON DELETE CASCADE`, então o histórico do boleto some junto com ele e
           um insert depois do delete só violaria a FK. A chamada que existia
           aqui falhava sempre — em silêncio, porque `registrarAuditoria` engole
           o erro. Registro de exclusão, se for preciso, precisa de tabela sem
           FK para `boletos`. */
    },
};
