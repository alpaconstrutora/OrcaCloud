import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { problemaDaVista, type VistaDaTorre } from '../utils/espelhoVistaDaJanela';
import type { UnitSunOrientation } from '../types/empreendimento';

/**
 * VISTA DA JANELA (Espelho de Vendas 3D, F6 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * A foto do que se vê da janela, por torre e faixa de andares
 * (`empreendimento_tower_vistas`), com a imagem no bucket público
 * `empreendimento-midia` (o mesmo das plantas por tipologia). Os portais NÃO
 * leem daqui: recebem as vistas pelas RPCs do espelho.
 */

const BUCKET = 'empreendimento-midia';
const COLS = 'id, tower_id, andar_de, andar_ate, orientacao, imagem_url, imagem_path, legenda';
// Os mesmos limites que o <ImageDropzone> anuncia ("JPG, PNG ou WEBP · até 5 MB").
const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

/** A tabela ainda não existe no banco (a migration da F6 não foi aplicada). */
export const tabelaDasVistasAusente = (e: { code?: string; message?: string } | null | undefined) =>
    !!e && (e.code === '42P01' || e.code === 'PGRST205' || /empreendimento_tower_vistas/.test(e.message ?? ''));

const FALTA_A_MIGRATION = 'O banco ainda não tem o cadastro de vistas da janela — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110600000).';

const emOrdem = (a: VistaDaTorre, b: VistaDaTorre) => a.andar_de - b.andar_de || a.andar_ate - b.andar_ate;

export const empreendimentoTowerVistasService = {
    /** As vistas de uma torre. Antes da migration = erro com o motivo (a tela mostra). */
    async listar(towerId: string): Promise<VistaDaTorre[]> {
        const { data, error } = await supabase.from('empreendimento_tower_vistas').select(COLS).eq('tower_id', towerId);
        if (error) {
            if (tabelaDasVistasAusente(error)) throw new Error(FALTA_A_MIGRATION);
            throw error;
        }
        return ((data ?? []) as unknown as VistaDaTorre[]).sort(emOrdem);
    },

    /** As vistas de várias torres, por torre — para o 3D aberto DENTRO do app. Sem tabela = mapa vazio. */
    async dasTorres(torreIds: readonly string[]): Promise<Map<string, VistaDaTorre[]>> {
        const out = new Map<string, VistaDaTorre[]>();
        if (torreIds.length === 0) return out;
        const { data, error } = await supabase.from('empreendimento_tower_vistas').select(COLS).in('tower_id', [...torreIds]);
        if (error) {
            if (tabelaDasVistasAusente(error)) return out;
            throw error;
        }
        for (const v of ((data ?? []) as unknown as VistaDaTorre[]).sort(emOrdem)) {
            const lista = out.get(v.tower_id!);
            if (lista) lista.push(v);
            else out.set(v.tower_id!, [v]);
        }
        return out;
    },

    /**
     * Sobe a foto e grava a vista da faixa. ⚠️ Confere a linha que voltou:
     * gravação barrada pela RLS não dá erro, só não grava — e aí o arquivo que
     * acabou de subir não pode sobrar solto.
     */
    async adicionar(entrada: {
        organizationId: string;
        empreendimentoId: string;
        towerId: string;
        andar_de: number;
        andar_ate: number;
        orientacao: UnitSunOrientation | null;
        legenda: string | null;
        arquivo: File;
    }): Promise<VistaDaTorre> {
        const problema = problemaDaVista(entrada);
        if (problema) throw new Error(problema);
        if (!TIPOS_DE_IMAGEM.includes(entrada.arquivo.type)) throw new Error('A vista precisa ser uma imagem JPG, PNG ou WebP.');
        if (entrada.arquivo.size > TAMANHO_MAXIMO) throw new Error('A imagem da vista passa de 5 MB.');

        const nome = entrada.arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
        const path = `${entrada.organizationId}/${entrada.empreendimentoId}/vistas/${crypto.randomUUID()}-${nome}`;
        await storageService.uploadFile(BUCKET, path, entrada.arquivo);

        const { data, error } = await supabase
            .from('empreendimento_tower_vistas')
            .insert({
                tower_id: entrada.towerId,
                andar_de: entrada.andar_de,
                andar_ate: entrada.andar_ate,
                orientacao: entrada.orientacao,
                legenda: entrada.legenda?.trim() || null,
                imagem_url: storageService.getPublicUrl(BUCKET, path),
                imagem_path: path,
            })
            .select(COLS);
        if (error || !data || data.length === 0) {
            await storageService.remove(BUCKET, [path]).catch(() => undefined);
            if (tabelaDasVistasAusente(error)) throw new Error(FALTA_A_MIGRATION);
            if (error) throw new Error(`Não foi possível gravar a vista: ${error.message}`);
            throw new Error('A vista não foi gravada — você não tem permissão para alterar esta torre.');
        }
        return data[0] as unknown as VistaDaTorre;
    },

    /** Remove a vista (linha e arquivo). Confere que a linha saiu. */
    async remover(vista: VistaDaTorre): Promise<void> {
        if (!vista.id) throw new Error('Vista sem identificador.');
        const { data, error } = await supabase.from('empreendimento_tower_vistas').delete().eq('id', vista.id).select('id');
        if (error) throw new Error(`Não foi possível remover a vista: ${error.message}`);
        if (!data || data.length === 0) throw new Error('A vista não foi removida — você não tem permissão para alterar esta torre.');
        if (vista.imagem_path) await storageService.remove(BUCKET, [vista.imagem_path]).catch(err => console.warn('[vistas] arquivo não apagado:', err));
    },
};
