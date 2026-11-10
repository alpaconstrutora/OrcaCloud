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
/** Com a unidade da vista (10/11/2026). Lida à parte: antes da migration a coluna não existe, e a faixa não pode cair junto. */
const COLS_COM_UNIDADE = `${COLS}, unit_id, unidade:empreendimento_units(name)`;
// Os mesmos limites que o <ImageDropzone> anuncia ("JPG, PNG ou WEBP · até 5 MB").
const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

/** A tabela ainda não existe no banco (a migration da F6 não foi aplicada). */
export const tabelaDasVistasAusente = (e: { code?: string; message?: string } | null | undefined) =>
    !!e && (e.code === '42P01' || e.code === 'PGRST205' || /empreendimento_tower_vistas/.test(e.message ?? ''));

/** A coluna `unit_id` (ou a relação com a unidade) ainda não existe: a migration da vista por unidade não foi aplicada. */
const unidadeDaVistaAusente = (e: { code?: string; message?: string } | null | undefined) =>
    !!e && (e.code === '42703' || e.code === 'PGRST200' || e.code === 'PGRST204' || /unit_id|empreendimento_units/.test(e.message ?? ''));
const FALTA_A_MIGRATION_DA_UNIDADE = 'O banco ainda não aceita vista por unidade — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110800000). Por faixa de andares já funciona.';

type LinhaDaVista = VistaDaTorre & { unidade?: { name: string | null } | null };
const daLinha = ({ unidade, ...v }: LinhaDaVista): VistaDaTorre => ({ ...v, unit_id: v.unit_id ?? null, unit_name: unidade?.name ?? null });

/** Lê as vistas com a unidade; sem a coluna (migration por aplicar), só as de faixa — nunca derruba a leitura. */
async function ler(filtrar: (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>) {
    const comUnidade = await filtrar(supabase.from('empreendimento_tower_vistas').select(COLS_COM_UNIDADE));
    if (!comUnidade.error) return { data: ((comUnidade.data ?? []) as LinhaDaVista[]).map(daLinha), error: null };
    if (!unidadeDaVistaAusente(comUnidade.error)) return { data: [] as VistaDaTorre[], error: comUnidade.error };
    const soFaixa = await filtrar(supabase.from('empreendimento_tower_vistas').select(COLS));
    return { data: ((soFaixa.data ?? []) as LinhaDaVista[]).map(daLinha), error: soFaixa.error };
}

const FALTA_A_MIGRATION = 'O banco ainda não tem o cadastro de vistas da janela — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110600000).';

const emOrdem = (a: VistaDaTorre, b: VistaDaTorre) => a.andar_de - b.andar_de || a.andar_ate - b.andar_ate;

export const empreendimentoTowerVistasService = {
    /** As vistas de uma torre. Antes da migration = erro com o motivo (a tela mostra). */
    async listar(towerId: string): Promise<VistaDaTorre[]> {
        const { data, error } = await ler((q) => q.eq('tower_id', towerId));
        if (error) {
            if (tabelaDasVistasAusente(error)) throw new Error(FALTA_A_MIGRATION);
            throw error;
        }
        return data.sort(emOrdem);
    },

    /** As vistas de várias torres, por torre — para o 3D aberto DENTRO do app. Sem tabela = mapa vazio. */
    async dasTorres(torreIds: readonly string[]): Promise<Map<string, VistaDaTorre[]>> {
        const out = new Map<string, VistaDaTorre[]>();
        if (torreIds.length === 0) return out;
        const { data, error } = await ler((q) => q.in('tower_id', [...torreIds]));
        if (error) {
            if (tabelaDasVistasAusente(error)) return out;
            throw error;
        }
        for (const v of data.sort(emOrdem)) {
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
        /** A vista é só desta unidade (da MESMA torre); ausente = vista da faixa de andares. */
        unidade?: { id: string; name: string } | null;
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
                // Só vai no INSERT quando há unidade: sem ela, o banco de antes da migration aceita a linha.
                ...(entrada.unidade ? { unit_id: entrada.unidade.id } : {}),
            })
            .select(COLS);
        if (error || !data || data.length === 0) {
            await storageService.remove(BUCKET, [path]).catch(() => undefined);
            if (entrada.unidade && error?.code === '23505') throw new Error(`A unidade ${entrada.unidade.name} já tem uma vista. Remova a atual para cadastrar outra.`);
            if (entrada.unidade && unidadeDaVistaAusente(error)) throw new Error(FALTA_A_MIGRATION_DA_UNIDADE);
            if (tabelaDasVistasAusente(error)) throw new Error(FALTA_A_MIGRATION);
            if (error) throw new Error(`Não foi possível gravar a vista: ${error.message}`);
            throw new Error('A vista não foi gravada — você não tem permissão para alterar esta torre.');
        }
        return { ...(data[0] as unknown as VistaDaTorre), unit_id: entrada.unidade?.id ?? null, unit_name: entrada.unidade?.name ?? null };
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
