import { supabase } from '../lib/supabase';
import { comprimirFoto } from '../utils/comprimirFoto';
import { totalEfetivoDoPedido } from '../utils/pedidoItemValor';
import type { LeituraFast, ResultadoDoPedidoFast } from '../lib/pedidoFast';
import { MAX_FOTOS_FAST } from '../lib/pedidoFast';

/**
 * Pedido Fast no navegador — a FONTE que a tela usa (docs/planos/2026-11-14-pedido-fast.md).
 *
 * Tudo que grava passa pela Edge Function `pedido-fast` (a regra mora em
 * `lib/pedidoFast.ts`, importada por ela). Molde de fonte: `services/celular/*Fonte.ts`
 * — `modo: 'logado'` hoje; a Parte 2 acrescenta `fonteDoLink(token)` com o
 * mesmo contrato, e a tela (`PedidoFastFluxo`) não muda.
 *
 * Sem fallback silencioso: o erro chega à tela com o motivo que a Edge deu.
 */

export interface FalhaDaLeitura {
    codigo: 'IA_NAO_CONFIGURADA' | 'IA_RECUSOU' | 'IA_FALHOU' | string;
    motivo: string;
}

export interface LeituraDoLote {
    lote: string;
    leitura: LeituraFast;
    falha: FalhaDaLeitura | null;
}

export interface FontePedidoFast {
    modo: 'logado' | 'link';
    /** Guarda as fotos e lê com a IA. A compra já está salva quando isto volta. */
    ler(fotos: File[]): Promise<LeituraDoLote>;
    /** Cria o pedido do lote na obra. Idempotente por lote. */
    criar(lote: string, projectId: string): Promise<ResultadoDoPedidoFast>;
}

/** Erro com a mensagem que a Edge mandou (ou uma legível). */
export class ErroPedidoFast extends Error {
    constructor(message: string, public status?: number) { super(message); }
}

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

/** File → { base64, mediaType }, comprimido como as fotos do Diário (2048 px, JPEG 0,82). */
export async function fotoParaEnvio(file: File): Promise<{ base64: string; mediaType: string }> {
    let foto = await comprimirFoto(file);
    if (!TIPOS_ACEITOS.includes(foto.type)) {
        // HEIC que o navegador não converteu, ou outro formato: tenta forçar JPEG.
        foto = await comprimirFoto(new File([foto], foto.name, { type: 'image/heic' }));
    }
    if (!TIPOS_ACEITOS.includes(foto.type)) {
        throw new ErroPedidoFast('Formato de foto não aceito — tire a foto de novo ou use JPEG/PNG.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => reject(new ErroPedidoFast('Não consegui ler a foto.'));
        leitor.readAsDataURL(foto);
    });
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: foto.type };
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('pedido-fast', { body: corpo });
    if (error) {
        const ctx = (error as { context?: Response }).context;
        let msg: string | null = null;
        let status: number | undefined;
        if (ctx && typeof ctx.json === 'function') {
            status = ctx.status;
            const c = await ctx.json().catch(() => null) as { error?: string } | null;
            msg = c?.error ?? null;
        }
        throw new ErroPedidoFast(
            msg || (/Failed to send/i.test(error.message)
                ? 'Sem conexão com o servidor. Confira a internet e tente de novo.'
                : error.message || 'Falha no Pedido Fast.'),
            status,
        );
    }
    const r = data as T & { error?: string };
    if (r && typeof r === 'object' && 'error' in r && r.error) throw new ErroPedidoFast(String(r.error));
    return r;
}

export const fontePedidoFastLogado: FontePedidoFast = {
    modo: 'logado',
    async ler(fotos) {
        if (fotos.length < 1 || fotos.length > MAX_FOTOS_FAST) {
            throw new ErroPedidoFast(`Envie de 1 a ${MAX_FOTOS_FAST} fotos.`);
        }
        const enviar = [];
        for (const f of fotos) enviar.push(await fotoParaEnvio(f));
        return chamar<LeituraDoLote>({ acao: 'ler', fotos: enviar });
    },
    async criar(lote, projectId) {
        return chamar<ResultadoDoPedidoFast>({ acao: 'criar', lote, projectId });
    },
};

export interface PedidoFastRecente {
    id: string;
    numero: string;
    obraNome: string;
    status: string;
    total: number;
    quantidadeItens: number;
    criadoEm: string;
}

/**
 * "Meus Pedidos Fast" do celular: os últimos que EU comprei. A RLS recorta; o
 * filtro de org só entra quando o topo aponta uma (null = "Todas", REGRA #5).
 */
export async function listarMeusPedidosFast(userId: string, organizationId: string | null, limite = 20): Promise<PedidoFastRecente[]> {
    let q = supabase
        .from('purchase_orders')
        .select('id, number, project_id, status, items, created_at')
        .eq('origem', 'FAST')
        .eq('criado_por', userId)
        .order('created_at', { ascending: false })
        .limit(limite);
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) throw error;
    const linhas = (data ?? []) as { id: string; number: string | null; project_id: string | null; status: string; items: unknown; created_at: string }[];

    const idsObra = [...new Set(linhas.map(l => l.project_id).filter((id): id is string => !!id))];
    const nomes: Record<string, string> = {};
    if (idsObra.length) {
        const { data: obras } = await supabase.from('projects').select('id, name').in('id', idsObra);
        for (const o of (obras ?? []) as { id: string; name: string }[]) nomes[o.id] = o.name;
    }
    return linhas.map(l => {
        const itens = Array.isArray(l.items) ? l.items as Parameters<typeof totalEfetivoDoPedido>[0] : [];
        return {
            id: l.id,
            numero: l.number ?? '—',
            obraNome: (l.project_id && nomes[l.project_id]) || '—',
            status: l.status,
            total: totalEfetivoDoPedido(itens),
            quantidadeItens: itens?.length ?? 0,
            criadoEm: l.created_at,
        };
    });
}
