/**
 * Mídia do empreendimento — as imagens que vão para fora da empresa (vitrine do
 * investidor, Credit Room do banco).
 *
 * Extraído de `services/investorPortalService.ts` (spec 2026-11-21 da
 * capacidade de pagamento, §5): o Portal do Investidor e o Credit Room mostram
 * as MESMAS fotos, e duas cópias desta leitura divergiriam na primeira imagem
 * nova. O investidor importa daqui; `FotoDaVitrine` segue re-exportado de lá
 * para não quebrar quem já o importava.
 */

import { supabase } from '../lib/supabase';

export interface FotoDaVitrine { url: string; legenda: string | null }

/**
 * Fotos da vitrine = imagens do empreendimento (bucket público empreendimento-midia): decorado, plantas por
 * tipologia e vistas das torres — a mesma ordem de fn_oportunidade_na_vitrine no banco (Fase 3).
 */
export async function fotosDosEmpreendimentos(ids: string[]): Promise<Map<string, FotoDaVitrine[]>> {
    const out = new Map<string, FotoDaVitrine[]>();
    if (ids.length === 0) return out;
    const [dec, plantas, vistas] = await Promise.all([
        supabase.from('empreendimento_tipologia_decorado').select('empreendimento_id, imagem_url, legenda, tipologia, ordem').in('empreendimento_id', ids).order('ordem', { ascending: true }),
        supabase.from('empreendimento_tipologia_plantas').select('empreendimento_id, imagem_url, tipologia').in('empreendimento_id', ids),
        supabase.from('empreendimento_tower_vistas').select('imagem_url, legenda, andar_de, torre:empreendimento_towers!inner(empreendimento_id, name)').in('torre.empreendimento_id', ids).order('andar_de', { ascending: true }),
    ]);
    for (const r of [dec, plantas, vistas]) if (r.error) throw r.error;
    const por = (id: string) => { if (!out.has(id)) out.set(id, []); return out.get(id)!; };
    for (const d of (dec.data ?? []) as { empreendimento_id: string; imagem_url: string; legenda: string | null; tipologia: string }[]) por(d.empreendimento_id).push({ url: d.imagem_url, legenda: d.legenda ?? d.tipologia });
    for (const p of (plantas.data ?? []) as { empreendimento_id: string; imagem_url: string; tipologia: string }[]) por(p.empreendimento_id).push({ url: p.imagem_url, legenda: `Planta — ${p.tipologia}` });
    for (const v of (vistas.data ?? []) as unknown as { imagem_url: string; legenda: string | null; torre: { empreendimento_id: string; name: string } }[]) por(v.torre.empreendimento_id).push({ url: v.imagem_url, legenda: v.legenda ?? `Vista — ${v.torre.name}` });
    return out;
}

export const empreendimentoMidiaService = { fotosDosEmpreendimentos };
