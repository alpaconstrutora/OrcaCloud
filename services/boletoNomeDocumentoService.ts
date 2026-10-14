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
 *   configuração, nada muda sozinho. AÇÕES MANUAIS (botão Renomear do boleto e "Renomear
 *   boletos existentes"): usam a máscara que a tela de Nomenclatura mostra, SALVA ou PADRÃO
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
async function renomearLinha(b: LinhaBoleto, jaTemMascara?: boolean, forcar = false): Promise<boolean> {
    if (!b.supplier_id) return false;
    if (!forcar && b.documento_nome_original != null) return false;

    const temMascara = jaTemMascara ?? await hasSavedNumberingConfig(b.organization_id, 'BOLETO');
    if (!temMascara) return false;

    const numero = await generateDocumentNumber('BOLETO', b.organization_id, {
        supplierId: b.supplier_id,
        projectId: b.project_id,
        costCenterId: b.cost_center_id,
    });
    const nomeAtual = b.documento_nome ?? '';
    const novo = montarNomeDocumento(numero, nomeAtual);
    if (!novo || novo === nomeAtual) return false;

    // A 1ª renomeação guarda o nome de upload; as seguintes mantêm esse mesmo original.
    const patch = { documento_nome: novo, documento_nome_original: b.documento_nome_original ?? nomeAtual };
    let q = supabase.from(TABLE).update(patch).eq('id', b.id);
    q = forcar ? q.eq('documento_nome', nomeAtual) : q.is('documento_nome_original', null);
    const { data, error } = await q.select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
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
        return await renomearLinha(data as LinhaBoleto);
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

        const renomeou = await renomearLinha(b, true, true);
        if (!renomeou) return { ok: false, motivo: 'sem_mudanca' };

        const { data: depois } = await supabase.from(TABLE).select('documento_nome').eq('id', boletoId).maybeSingle();
        return { ok: true, nome: (depois as { documento_nome?: string } | null)?.documento_nome ?? '' };
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

const PAGINA = 1000;

/** Quantos boletos da organização o botão "Renomear existentes" vai renomear. */
export async function contarBoletosParaRenomear(organizationId: string): Promise<number> {
    const { count, error } = await supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('documento_nome_original', null)
        .not('supplier_id', 'is', null);
    if (error) throw error;
    return count ?? 0;
}

export interface ResultadoRenomeacao { renomeados: number; falhas: number; total: number }

/**
 * Renomeia os boletos já cadastrados da organização (com fornecedor e ainda não
 * renomeados), do mais antigo ao mais novo. Em pequenos grupos paralelos: o
 * sequencial é atômico no banco (nunca repete); só a ordem DENTRO do grupo pode
 * variar, o que não afeta a unicidade.
 */
export async function renomearBoletosExistentes(
    organizationId: string,
    onProgress?: (feitos: number, total: number) => void,
): Promise<ResultadoRenomeacao> {
    const linhas: LinhaBoleto[] = [];
    for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
            .from(TABLE)
            .select(COLUNAS)
            .eq('organization_id', organizationId)
            .is('documento_nome_original', null)
            .not('supplier_id', 'is', null)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(de, de + PAGINA - 1);
        if (error) throw error;
        linhas.push(...((data ?? []) as LinhaBoleto[]));
        if (!data || data.length < PAGINA) break;
    }

    const total = linhas.length;
    let renomeados = 0;
    let falhas = 0;
    let feitos = 0;
    const GRUPO = 5;
    for (let i = 0; i < linhas.length; i += GRUPO) {
        const grupo = linhas.slice(i, i + GRUPO);
        const res = await Promise.allSettled(grupo.map(b => renomearLinha(b, true)));
        for (const r of res) {
            if (r.status === 'fulfilled') { if (r.value) renomeados++; } else { falhas++; }
        }
        feitos += grupo.length;
        onProgress?.(feitos, total);
    }
    return { renomeados, falhas, total };
}
