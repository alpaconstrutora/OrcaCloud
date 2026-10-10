import { supabase } from '../lib/supabase';
import type { DocGenFonte, VariacaoFonte } from '../types/docGen';

/**
 * Fontes da organização para os modelos (F9 — "fonte livre nos modelos").
 * Arquivos `.ttf`/`.otf` no bucket privado `doc-gen-assets`
 * (`<org>/fontes/<id>/<variacao>.<ext>`), cadastro em `doc_gen_fontes`.
 * REGRA #5: `list(orgId)` só aplica `.eq` quando há organização.
 */
const BUCKET = 'doc-gen-assets';
const COLUNAS = 'id, organization_id, nome, arquivos, created_by, created_at';
const MAX_BYTES = 5 * 1024 * 1024;

export const VARIACOES: { id: VariacaoFonte; rotulo: string }[] = [
    { id: 'normal', rotulo: 'Regular' },
    { id: 'bold', rotulo: 'Negrito' },
    { id: 'italics', rotulo: 'Itálico' },
    { id: 'bolditalics', rotulo: 'Negrito itálico' },
];

/**
 * TrueType ou OpenType pelos primeiros bytes (não pela extensão). WOFF/WOFF2 e
 * qualquer outra coisa → null: o PDF precisa do arquivo de fonte de verdade. Puro.
 */
export function tipoDoArquivoDeFonte(b: Uint8Array): 'ttf' | 'otf' | null {
    if (b.length < 4) return null;
    const assinatura = String.fromCharCode(b[0], b[1], b[2], b[3]);
    if (assinatura === 'OTTO') return 'otf';
    if ((b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) || assinatura === 'true') return 'ttf';
    return null;
}

async function emailDaSessao(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
}

function paraBase64(bytes: Uint8Array): string {
    let s = '';
    const passo = 0x8000;
    for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
    return btoa(s);
}

const cacheArquivos = new Map<string, Promise<{ fonte: DocGenFonte; base64: Partial<Record<VariacaoFonte, string>> }>>();

export const docGenFonteService = {
    async list(organizationId?: string | null): Promise<DocGenFonte[]> {
        let q = supabase.from('doc_gen_fontes').select(COLUNAS).order('nome');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as DocGenFonte[];
    },

    /** Confere e sobe os arquivos e grava o cadastro. Regular é obrigatório. */
    async criar(p: { organizationId: string; nome: string; arquivos: Partial<Record<VariacaoFonte, File>> }): Promise<DocGenFonte> {
        const nome = p.nome.trim();
        if (!nome) throw new Error('Dê um nome à fonte.');
        if (nome.toLowerCase() === 'roboto') throw new Error('"Roboto" já é a fonte padrão — use outro nome.');
        if (!p.arquivos.normal) throw new Error('O arquivo Regular é obrigatório.');
        const id = crypto.randomUUID();
        const enviados: string[] = [];
        const caminhos: Partial<Record<VariacaoFonte, string>> = {};
        try {
            for (const v of VARIACOES) {
                const arq = p.arquivos[v.id];
                if (!arq) continue;
                if (arq.size > MAX_BYTES) throw new Error(`${v.rotulo}: o arquivo passa de 5 MB.`);
                const tipo = tipoDoArquivoDeFonte(new Uint8Array(await arq.slice(0, 4).arrayBuffer()));
                if (!tipo) throw new Error(`${v.rotulo}: "${arq.name}" não é uma fonte TrueType (.ttf) nem OpenType (.otf).`);
                const caminho = `${p.organizationId}/fontes/${id}/${v.id}.${tipo}`;
                // O navegador manda .ttf/.otf sem tipo (ou como octet-stream), e o bucket só aceita font/ttf e
                // font/otf: o arquivo é reembrulhado com o tipo certo (o envio usa o tipo do Blob, não o `contentType`).
                const mime = tipo === 'otf' ? 'font/otf' : 'font/ttf';
                const corpo = new Blob([await arq.arrayBuffer()], { type: mime });
                const { error } = await supabase.storage.from(BUCKET).upload(caminho, corpo, { contentType: mime, upsert: false });
                if (error) throw error;
                enviados.push(caminho);
                caminhos[v.id] = caminho;
            }
            const { data, error } = await supabase.from('doc_gen_fontes')
                .insert({ id, organization_id: p.organizationId, nome, arquivos: caminhos, created_by: await emailDaSessao() })
                .select(COLUNAS).single();
            if (error) {
                if (error.code === '23505') throw new Error(`Já existe uma fonte chamada "${nome}" nesta organização.`);
                throw error;
            }
            return data as DocGenFonte;
        } catch (e) {
            // Nada fica pela metade: arquivo sem cadastro é removido.
            if (enviados.length) await supabase.storage.from(BUCKET).remove(enviados).catch(() => undefined);
            throw e;
        }
    },

    /** Apaga o cadastro e os arquivos. PDF já emitido não muda (a fonte vai embutida nele). */
    async remover(fonte: DocGenFonte): Promise<void> {
        const { error } = await supabase.from('doc_gen_fontes').delete().eq('id', fonte.id);
        if (error) throw error;
        const caminhos = Object.values(fonte.arquivos).filter((c): c is string => !!c);
        if (caminhos.length) await supabase.storage.from(BUCKET).remove(caminhos).catch(() => undefined);
        cacheArquivos.delete(fonte.id);
    },

    /** Os arquivos da fonte em base64, para o pdfmake (cache por sessão). */
    arquivosEmBase64(fonteId: string): Promise<{ fonte: DocGenFonte; base64: Partial<Record<VariacaoFonte, string>> }> {
        let p = cacheArquivos.get(fonteId);
        if (!p) {
            p = (async () => {
                const { data, error } = await supabase.from('doc_gen_fontes').select(COLUNAS).eq('id', fonteId).maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('A fonte deste modelo não existe mais — escolha outra no modelo.');
                const fonte = data as DocGenFonte;
                const base64: Partial<Record<VariacaoFonte, string>> = {};
                for (const [v, caminho] of Object.entries(fonte.arquivos) as [VariacaoFonte, string][]) {
                    if (!caminho) continue;
                    const { data: blob, error: e2 } = await supabase.storage.from(BUCKET).download(caminho);
                    if (e2 || !blob) throw new Error(`Não foi possível ler a fonte "${fonte.nome}" (${v}).`);
                    base64[v] = paraBase64(new Uint8Array(await blob.arrayBuffer()));
                }
                return { fonte, base64 };
            })().catch(e => { cacheArquivos.delete(fonteId); throw e; });
            cacheArquivos.set(fonteId, p);
        }
        return p;
    },
};
