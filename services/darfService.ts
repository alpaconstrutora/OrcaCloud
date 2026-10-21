import { supabase } from '../lib/supabase';
import type { Darf, Payable } from '../types/financial';
import { BUCKET_ANEXOS_AVULSO, payableService, type PayablePaymentType } from './payableService';
import { processService } from './processService';
import { resolverCategoriaPorNomes } from './financialCategoryResolver';
import { storageService } from './storageService';
import { caminhoDoAnexoDarf, normalizarLinhaDigitavel } from '../utils/darf';

/**
 * DARF — guia que agrupa tributos (plano docs/planos/2026-10-21-agrupar-tributos-em-darf.md).
 *
 * Toda escrita passa pelas RPCs `fn_darf_*` (aplicar_20271021300000): elas
 * validam, travam e gravam numa transação só. A tabela `darfs` recusa escrita
 * direta. O DARF não guarda dinheiro: o total é a soma dos membros
 * (tributos + multa/juros), lida em `vw_darfs`.
 */

/** Categoria das linhas de multa/juros (global, grupo FINANCEIRO da DRE). */
export const CATEGORIA_ENCARGOS_DARF = 'Multa e Juros de Mora';

export interface FormDarf {
    dueDate: string;
    multa: number;
    juros: number;
    codigoBarras: string;
    numeroDocumento: string;
    observacao: string;
}

const COLUNAS_DARF = 'id,organization_id,competencia,due_date,codigo_barras,numero_documento,observacao,documento_path,documento_nome,created_at,updated_at,principal,multa,juros,total,qtd_tributos,tributos_nomes,n_membros,n_pagos,payment_date,payment_type,conciliado_no_extrato,alcada_pendente,asaas_em_curso,status_efetivo';

/** Erro do PostgREST com a frase do banco — é ela que diz ao usuário o que fazer. */
function erro(e: { message?: string } | null | undefined, padrao: string): Error {
    return new Error(e?.message || padrao);
}

function dadosDoForm(form: FormDarf, documentoPath: string | null, documentoNome: string | null) {
    const { digitos, valido } = normalizarLinhaDigitavel(form.codigoBarras);
    if (!valido) throw new Error('Código de barras: informe os 44 dígitos do código ou os 48 da linha digitável.');
    return {
        codigo_barras: digitos || null,
        numero_documento: form.numeroDocumento.trim() || null,
        observacao: form.observacao.trim() || null,
        documento_path: documentoPath,
        documento_nome: documentoNome,
    };
}

async function categoriaEncargos(organizationId: string, form: FormDarf) {
    if ((form.multa ?? 0) <= 0 && (form.juros ?? 0) <= 0) return {};
    return resolverCategoriaPorNomes(organizationId, [CATEGORIA_ENCARGOS_DARF]);
}

async function removerArquivo(path: string | null | undefined): Promise<void> {
    if (!path) return;
    // Arquivo órfão é só espaço no bucket — não derruba a operação.
    await storageService.remove(BUCKET_ANEXOS_AVULSO, [path]).catch(e => {
        console.warn('[darfService] anexo não removido:', path, e);
    });
}

export const darfService = {

    /** DARFs da organização do topo; `null` = "Todas" (a RLS recorta) — REGRA #5. */
    async list(organizationId: string | null): Promise<Darf[]> {
        let q = supabase.from('vw_darfs').select(COLUNAS_DARF).order('due_date', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw erro(error, 'Não foi possível carregar os DARFs.');
        return (data ?? []) as Darf[];
    },

    /** Membros do DARF (tributos + multa/juros), como Contas a Pagar os vê. */
    async membros(darfId: string): Promise<Payable[]> {
        const { data, error } = await supabase
            .from('vw_payables')
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,direction,description,category,status,business_status,effective_status,party_name,party_type,cost_center_id,plano_de_contas_id,payment_date,payment_type,darf_id')
            .eq('darf_id', darfId)
            .order('party_type', { ascending: false });
        if (error) throw erro(error, 'Não foi possível carregar a composição do DARF.');
        return (data ?? []) as Payable[];
    },

    /**
     * Cria o DARF. O id nasce aqui para o anexo subir ANTES, já no caminho do
     * DARF; se a RPC recusar, o arquivo enviado é apagado.
     */
    async criar(organizationId: string, tributoIds: string[], form: FormDarf, arquivo?: File | null): Promise<string> {
        const id = crypto.randomUUID();
        const dadosSemAnexo = dadosDoForm(form, null, null); // valida antes de subir arquivo
        let documentoPath: string | null = null;
        if (arquivo) {
            documentoPath = caminhoDoAnexoDarf(organizationId, id, arquivo.name);
            await storageService.uploadFile(BUCKET_ANEXOS_AVULSO, documentoPath, arquivo);
        }
        const { error } = await supabase.rpc('fn_darf_criar', {
            p_darf_id: id,
            p_tributo_ids: tributoIds,
            p_due_date: form.dueDate,
            p_multa: form.multa || 0,
            p_juros: form.juros || 0,
            p_dados: { ...dadosSemAnexo, documento_path: documentoPath, documento_nome: arquivo?.name ?? null },
            p_categoria_encargos: await categoriaEncargos(organizationId, form),
        });
        if (error) {
            await removerArquivo(documentoPath);
            throw erro(error, 'Não foi possível criar o DARF.');
        }
        return id;
    },

    /**
     * Edita o DARF. `arquivo` troca o anexo; `removerAnexo` tira o atual. Com o
     * DARF pago o banco aceita só código de barras, número, observação e anexo.
     */
    async editar(darf: Darf, form: FormDarf, opcoes: { arquivo?: File | null; removerAnexo?: boolean } = {}): Promise<void> {
        let documentoPath = opcoes.removerAnexo ? null : darf.documento_path;
        let documentoNome = opcoes.removerAnexo ? null : darf.documento_nome;
        const dadosValidados = dadosDoForm(form, documentoPath, documentoNome);
        let novoPath: string | null = null;
        if (opcoes.arquivo) {
            novoPath = caminhoDoAnexoDarf(darf.organization_id, darf.id, opcoes.arquivo.name, Date.now().toString(36));
            await storageService.uploadFile(BUCKET_ANEXOS_AVULSO, novoPath, opcoes.arquivo);
            documentoPath = novoPath;
            documentoNome = opcoes.arquivo.name;
        }
        const { error } = await supabase.rpc('fn_darf_editar', {
            p_darf_id: darf.id,
            p_due_date: form.dueDate,
            p_multa: form.multa || 0,
            p_juros: form.juros || 0,
            p_dados: { ...dadosValidados, documento_path: documentoPath, documento_nome: documentoNome },
            p_categoria_encargos: await categoriaEncargos(darf.organization_id, form),
        });
        if (error) {
            if (novoPath && novoPath !== darf.documento_path) await removerArquivo(novoPath);
            throw erro(error, 'Não foi possível salvar o DARF.');
        }
        // O arquivo anterior saiu do DARF: apaga do bucket.
        if (darf.documento_path && darf.documento_path !== documentoPath) await removerArquivo(darf.documento_path);
    },

    /** Desfaz o DARF: os tributos voltam soltos, com o vencimento original. */
    async desagrupar(darfId: string): Promise<void> {
        const { data, error } = await supabase.rpc('fn_darf_desagrupar', { p_darf_id: darfId });
        if (error) throw erro(error, 'Não foi possível desagrupar o DARF.');
        await removerArquivo((data as { documento_path?: string | null } | null)?.documento_path);
    },

    /**
     * Baixa do DARF inteiro numa transação (todos os membros, mesma data e
     * forma). Depois, a mesma costura de Processos de `payableService.darBaixa`,
     * membro a membro — best-effort, fora da transação, como lá.
     */
    async darBaixa(darfId: string, pagamento: { paymentDate: string; paymentType: PayablePaymentType | null }): Promise<string[]> {
        const { data, error } = await supabase.rpc('fn_darf_dar_baixa', {
            p_darf_id: darfId,
            p_payment_date: pagamento.paymentDate,
            p_payment_type: pagamento.paymentType,
        });
        if (error) throw erro(error, 'Não foi possível dar baixa no DARF.');
        const ids = (data ?? []) as string[];
        for (const id of ids) {
            try {
                await processService.triggerForTransaction(id, 'internal_transaction.paid');
            } catch (e) {
                console.error('[darfService] process trigger (paid) failed:', e);
            }
            try {
                await processService.triggerForFinancialTitle(id, 'payable.settled');
            } catch (e) {
                console.error('[darfService] process trigger (settled) failed:', e);
            }
        }
        return ids;
    },

    /** Estorna a baixa do DARF inteiro (recusado se estiver conciliado com o extrato). */
    async estornar(darfId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_darf_estornar', { p_darf_id: darfId });
        if (error) throw erro(error, 'Não foi possível estornar o DARF.');
    },

    /** Desfaz a conciliação de todos os membros de uma vez (aplicar_20271021300100). */
    async desfazerConciliacao(darfId: string): Promise<number> {
        const { data, error } = await supabase.rpc('fn_darf_desfazer_conciliacao', { p_darf_id: darfId });
        if (error) throw erro(error, 'Não foi possível desfazer a conciliação do DARF.');
        return (data as number | null) ?? 0;
    },

    urlDoAnexo(path: string): Promise<string> {
        return payableService.urlDoAnexo(path);
    },
};
