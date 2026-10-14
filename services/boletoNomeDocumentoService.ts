import { supabase } from '../lib/supabase';
import { generateDocumentNumber, hasSavedNumberingConfig } from './documentNumbering';

/**
 * Nome do DOCUMENTO do boleto (`boletos.documento_nome`) conforme a Nomenclatura
 * (Configurações do Sistema › Nomenclatura › "Boletos", doc_type 'BOLETO').
 *
 * Por que existe: `documento_nome` é o nome do arquivo como o usuário o enviou —
 * "download (98).pdf" — e é o que aparece na coluna Documento (Financeiro do
 * condomínio, telas de boleto, planilha). Aqui ele passa a seguir a máscara.
 *
 * Regras:
 * - Só renomeia o rótulo (`documento_nome`). O `documento_path` do storage NÃO muda,
 *   então o link do arquivo continua o mesmo.
 * - Uma vez só: a 1ª renomeação guarda o nome de upload em `documento_nome_original`
 *   (que é também a reversão) e a condição `documento_nome_original IS NULL` do
 *   UPDATE impede gastar outro sequencial em salvamentos seguintes.
 * - Só com fornecedor definido (o nome é montado quando o boleto recebe fornecedor).
 * - AUTOMÁTICO (ao salvar o boleto): só se a organização SALVOU a máscara de Boletos — sem
 *   configuração, nada muda sozinho. AÇÕES MANUAIS (botão Renomear do boleto e "Renomear"
 *   da barra de seleção em Boletos a Pagar): usam a máscara que a tela de Nomenclatura mostra, SALVA ou PADRÃO
 *   — quem clicou pediu; exigir "salvar antes" confundia (a linha aparece preenchida mesmo
 *   sem nunca ter sido gravada). 14/10/2026.
 * - NUNCA bloqueia: qualquer falha mantém o nome atual e o salvamento segue
 *   (feedback_nomenclatura_nunca_bloqueia).
 */

const TABLE = 'boletos';

/** Extensão do nome de upload (".pdf"), ou '' se não houver. */
export function extensaoDoNome(nomeOriginal: string): string {
    const m = /\.[A-Za-z0-9]{1,8}$/.exec(nomeOriginal.trim());
    return m ? m[0].toLowerCase() : '';
}

/** "BOL-FORN003-0001" + "download (98).pdf" → "BOL-FORN003-0001.pdf". Sem `/` nem `\`. */
export function montarNomeDocumento(numero: string, nomeOriginal: string): string {
    const base = numero.replace(/[\\/]/g, '-').trim();
    return `${base}${extensaoDoNome(nomeOriginal)}`;
}

interface LinhaBoleto {
    id: string;
    organization_id: string;
    documento_nome: string | null;
    documento_nome_original: string | null;
    supplier_id: string | null;
    project_id: string | null;
    cost_center_id: string | null;
}

const COLUNAS = 'id, organization_id, documento_nome, documento_nome_original, supplier_id, project_id, cost_center_id';

/**
 * `forcar` = renomear DE NOVO um boleto que já foi renomeado (ação manual do
 * formulário). Gasta outro número da sequência, mantém o `documento_nome_original`
 * de upload (nunca o sobrescreve) e protege contra edição concorrente comparando o
 * nome atual no UPDATE.
 */
async function renomearLinha(b: LinhaBoleto, jaTemMascara?: boolean, forcar = false): Promise<string | null> {
    if (!b.supplier_id) return null;
    if (!forcar && b.documento_nome_original != null) return null;

    const temMascara = jaTemMascara ?? await hasSavedNumberingConfig(b.organization_id, 'BOLETO');
    if (!temMascara) return null;

    const numero = await generateDocumentNumber('BOLETO', b.organization_id, {
        supplierId: b.supplier_id,
        projectId: b.project_id,
        costCenterId: b.cost_center_id,
    });
    const nomeAtual = b.documento_nome ?? '';
    const novo = montarNomeDocumento(numero, nomeAtual);
    if (!novo || novo === nomeAtual) return null;

    // A 1ª renomeação guarda o nome de upload; as seguintes mantêm esse mesmo original.
    const patch = { documento_nome: novo, documento_nome_original: b.documento_nome_original ?? nomeAtual };
    let q = supabase.from(TABLE).update(patch).eq('id', b.id);
    q = forcar ? q.eq('documento_nome', nomeAtual) : q.is('documento_nome_original', null);
    const { data, error } = await q.select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0 ? novo : null;
}

/** Renomeia um boleto pelo id. Devolve `true` se renomeou; nunca lança. */
export async function renomearDocumentoDoBoleto(boletoId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select(COLUNAS)
            .eq('id', boletoId)
            .maybeSingle();
        if (error || !data) return false;
        return (await renomearLinha(data as LinhaBoleto)) != null;
    } catch (e) {
        console.warn('[boletoNomeDocumento] não renomeou o documento', boletoId, e);
        return false;
    }
}

export type ResultadoRenomearNovamente =
    | { ok: true; nome: string }
    | { ok: false; motivo: 'nao_encontrado' | 'sem_fornecedor' | 'sem_mudanca' | 'erro'; detalhe?: string };

/**
 * Ação manual "Renomear pela Nomenclatura" do formulário do boleto: renomeia de novo,
 * mesmo que já tenha sido renomeado (ex.: a máscara mudou), com a máscara salva ou, se
 * não houver, a padrão. Usa o fornecedor/obra JÁ SALVOS do boleto. Ao contrário do automático, devolve o motivo de não ter renomeado
 * para a tela explicar; ainda assim nunca lança.
 */
export async function renomearDocumentoDeNovo(boletoId: string): Promise<ResultadoRenomearNovamente> {
    try {
        const { data, error } = await supabase.from(TABLE).select(COLUNAS).eq('id', boletoId).maybeSingle();
        if (error) return { ok: false, motivo: 'erro', detalhe: error.message };
        if (!data) return { ok: false, motivo: 'nao_encontrado' };
        const b = data as LinhaBoleto;
        if (!b.supplier_id) return { ok: false, motivo: 'sem_fornecedor' };

        const novo = await renomearLinha(b, true, true);
        if (!novo) return { ok: false, motivo: 'sem_mudanca' };
        return { ok: true, nome: novo };
    } catch (e) {
        console.warn('[boletoNomeDocumento] não renomeou de novo', boletoId, e);
        return { ok: false, motivo: 'erro', detalhe: e instanceof Error ? e.message : String(e) };
    }
}

/** Vários boletos, em ordem (a ordem dos ids define a ordem do sequencial). */
export async function renomearDocumentosDosBoletos(ids: string[]): Promise<number> {
    let n = 0;
    for (const id of ids) {
        if (await renomearDocumentoDoBoleto(id)) n++;
    }
    return n;
}

export interface ResultadoRenomearSelecionados {
    /** id → nome novo, para a lista atualizar só essas linhas (§22). */
    renomeados: Record<string, string>;
    /** Selecionados sem fornecedor: o nome da máscara usa o fornecedor. */
    semFornecedor: number;
    falhas: number;
}

/**
 * "Renomear" da barra de seleção de Boletos a Pagar (14/10/2026 — substitui o botão
 * "Renomear boletos existentes" da Nomenclatura). Renomeia SÓ os boletos marcados,
 * mesmo os já renomeados (quem marcou pediu), com a máscara salva ou a padrão.
 * Em ordem de criação, um por vez: a ordem do sequencial acompanha a dos boletos.
 * Falha num boleto não para os outros e é contada.
 */
export async function renomearSelecionados(
    ids: string[],
    onProgress?: (feitos: number, total: number) => void,
): Promise<ResultadoRenomearSelecionados> {
    const out: ResultadoRenomearSelecionados = { renomeados: {}, semFornecedor: 0, falhas: 0 };
    if (!ids.length) return out;

    const linhas: LinhaBoleto[] = [];
    for (let i = 0; i < ids.length; i += LOTE_IDS) {
        const { data, error } = await supabase
            .from(TABLE)
            .select(COLUNAS + ', created_at')
            .in('id', ids.slice(i, i + LOTE_IDS));
        if (error) throw error;
        linhas.push(...((data ?? []) as unknown as Array<LinhaBoleto & { created_at: string }>));
    }
    (linhas as Array<LinhaBoleto & { created_at?: string }>).sort((a, b) =>
        (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));

    let feitos = 0;
    for (const b of linhas) {
        if (!b.supplier_id) {
            out.semFornecedor++;
        } else {
            try {
                const novo = await renomearLinha(b, true, true);
                if (novo) out.renomeados[b.id] = novo; else out.falhas++;
            } catch (e) {
                console.warn('[boletoNomeDocumento] não renomeou', b.id, e);
                out.falhas++;
            }
        }
        onProgress?.(++feitos, linhas.length);
    }
    return out;
}

/** `.in('id', …)` em pedaços: URL do PostgREST tem limite de tamanho. */
const LOTE_IDS = 200;
