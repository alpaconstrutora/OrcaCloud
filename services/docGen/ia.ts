import { supabase } from '../../lib/supabase';
import type { DocTipTap, NoTipTap } from '../../types/docGen';

/**
 * Assistente de redação dos ofícios (F7 — "IA para redação e resposta").
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 * A Edge Function `doc-gen-ia` chama o Claude; aqui ficam a chamada e as
 * conversões entre o texto do editor (TipTap) e os parágrafos da sugestão.
 * A sugestão nunca entra sozinha no documento: a tela mostra, a pessoa decide.
 */
export type AcaoIA = 'redigir' | 'revisar' | 'responder';

export interface PedidoIA {
    organizationId: string;
    acao: AcaoIA;
    campo: string;
    instrucao?: string;
    textoAtual?: string;
    contexto: Record<string, string | null | undefined>;
    documentoGedId?: string | null;
}

export interface SugestaoIA {
    paragrafos: string[];
    observacao: string | null;
}

/** Erro com o motivo para a tela — `naoConfigurada` vira um aviso, não uma falha. */
export class ErroIA extends Error {
    constructor(message: string, public naoConfigurada = false) { super(message); }
}

export async function pedirSugestao(p: PedidoIA): Promise<SugestaoIA> {
    const { data, error } = await supabase.functions.invoke('doc-gen-ia', {
        body: {
            organization_id: p.organizationId,
            acao: p.acao,
            campo: p.campo,
            instrucao: p.instrucao ?? '',
            texto_atual: p.textoAtual ?? '',
            contexto: p.contexto,
            documento_ged_id: p.documentoGedId ?? null,
        },
    });
    if (error) {
        let corpo: { error?: string; codigo?: string } | null = null;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') corpo = await ctx.json().catch(() => null);
        throw new ErroIA(corpo?.error || error.message || 'Falha ao falar com a IA.', corpo?.codigo === 'IA_NAO_CONFIGURADA');
    }
    const r = data as SugestaoIA & { error?: string };
    if (r?.error) throw new ErroIA(r.error);
    return { paragrafos: r.paragrafos ?? [], observacao: r.observacao ?? null };
}

// ─── Conversões (puras) ──────────────────────────────────────────────────────

/** Texto corrido de um documento do editor — um parágrafo por linha; variável vira {{chave}}. */
export function textoDoEditor(doc: DocTipTap | null | undefined): string {
    const linhas: string[] = [];
    const inline = (n: NoTipTap): string => {
        if (n.type === 'text') return n.text ?? '';
        if (n.type === 'variavel') return `{{${String(n.attrs?.chave ?? '')}}}`;
        if (n.type === 'hardBreak') return '\n';
        return (n.content ?? []).map(inline).join('');
    };
    const bloco = (n: NoTipTap) => {
        if (n.type === 'paragraph' || n.type === 'heading') { linhas.push(inline(n)); return; }
        if (n.type === 'listItem') { linhas.push(`- ${(n.content ?? []).map(inline).join(' ')}`); return; }
        (n.content ?? []).forEach(bloco);
    };
    (doc?.content ?? []).forEach(bloco);
    return linhas.join('\n').trim();
}

/** Parágrafos da sugestão → documento do editor. */
export function paragrafosParaEditor(paragrafos: string[]): DocTipTap {
    return {
        type: 'doc',
        content: paragrafos.map(t => (t.trim() ? { type: 'paragraph', content: [{ type: 'text', text: t.trim() }] } : { type: 'paragraph' })),
    };
}

/** Acrescenta a sugestão ao fim do texto existente (sem o parágrafo vazio de quem ainda não escreveu). */
export function acrescentar(atual: DocTipTap | null | undefined, paragrafos: string[]): DocTipTap {
    const existentes = (atual?.content ?? []).filter(n => !(n.type === 'paragraph' && !(n.content ?? []).length));
    return { type: 'doc', content: [...existentes, ...(paragrafosParaEditor(paragrafos).content ?? [])] };
}
