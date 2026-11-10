import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { chaveDaTipologia, type PlantaDaTipologia } from '../utils/espelhoPlantaDaTipologia';

/**
 * PLANTA BAIXA POR TIPOLOGIA (Espelho de Vendas 3D, F5 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * Uma planta por tipologia do empreendimento (`empreendimento_tipologia_plantas`),
 * com a imagem no bucket público `empreendimento-midia`. Os portais NÃO leem
 * daqui: recebem as plantas pelas RPCs do espelho.
 */

const BUCKET = 'empreendimento-midia';
const COLS = 'id, empreendimento_id, tipologia, tipologia_chave, imagem_url, imagem_path';
// Os mesmos limites que o <ImageDropzone> anuncia ("JPG, PNG ou WEBP · até 5 MB").
export const TAMANHO_MAXIMO_DA_PLANTA = 5 * 1024 * 1024;
export const TIPOS_DE_IMAGEM_DA_PLANTA = ['image/jpeg', 'image/png', 'image/webp'];

/** A tabela ainda não existe no banco (a migration da F5 não foi aplicada). */
export const tabelaDasPlantasAusente = (e: { code?: string; message?: string } | null | undefined) =>
    !!e && (e.code === '42P01' || e.code === 'PGRST205' || /empreendimento_tipologia_plantas/.test(e.message ?? ''));

const FALTA_A_MIGRATION = 'O banco ainda não tem o cadastro de plantas por tipologia — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110500000).';

export interface TipologiasNoCadastro {
    /** A tipologia de cada unidade do Empreendimento (uma entrada por unidade). */
    unidades: (string | null)[];
    /** A tipologia de cada imóvel do prédio do estoque (uma entrada por imóvel). */
    imoveis: (string | null)[];
}

export const empreendimentoTipologiaPlantasService = {
    /** As plantas do empreendimento. Antes da migration = erro com o motivo (a tela mostra). */
    async listar(empreendimentoId: string): Promise<PlantaDaTipologia[]> {
        const { data, error } = await supabase
            .from('empreendimento_tipologia_plantas')
            .select(COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('tipologia');
        if (error) {
            if (tabelaDasPlantasAusente(error)) throw new Error(FALTA_A_MIGRATION);
            throw error;
        }
        return (data ?? []) as unknown as PlantaDaTipologia[];
    },

    /** As plantas dos empreendimentos de um prédio do estoque — para o 3D aberto DENTRO do app. Sem tabela = []. */
    async doPredio(buildingId: string): Promise<PlantaDaTipologia[]> {
        const { data: emps, error: e1 } = await supabase.from('empreendimentos').select('id').eq('commercial_building_id', buildingId);
        if (e1) throw e1;
        const ids = ((emps ?? []) as { id: string }[]).map(e => e.id);
        if (ids.length === 0) return [];
        const { data, error } = await supabase.from('empreendimento_tipologia_plantas').select(COLS).in('empreendimento_id', ids).order('tipologia');
        if (error) {
            if (tabelaDasPlantasAusente(error)) return [];
            throw error;
        }
        return ((data ?? []) as unknown as PlantaDaTipologia[]).map(p => ({ ...p, commercial_building_id: buildingId }));
    },

    /** As tipologias que o cadastro tem: das unidades das torres e dos imóveis do prédio do estoque. */
    async tipologiasNoCadastro(empreendimentoId: string, buildingId: string | null | undefined): Promise<TipologiasNoCadastro> {
        const { data: tws, error: e1 } = await supabase.from('empreendimento_towers').select('id').eq('empreendimento_id', empreendimentoId);
        if (e1) throw e1;
        const torres = ((tws ?? []) as { id: string }[]).map(t => t.id);
        const [unidades, imoveis] = await Promise.all([
            torres.length === 0
                ? Promise.resolve({ data: [], error: null })
                : supabase.from('empreendimento_units').select('typology').in('tower_id', torres),
            buildingId
                ? supabase.from('commercial_properties').select('typology').eq('parent_id', buildingId).neq('type', 'BUILDING')
                : Promise.resolve({ data: [], error: null }),
        ]);
        if (unidades.error) throw unidades.error;
        if (imoveis.error) throw imoveis.error;
        return {
            unidades: ((unidades.data ?? []) as { typology: string | null }[]).map(u => u.typology),
            imoveis: ((imoveis.data ?? []) as { typology: string | null }[]).map(i => i.typology),
        };
    },

    /**
     * Sobe a imagem e grava (ou troca) a planta da tipologia. ⚠️ Confere a linha
     * que voltou: gravação barrada pela RLS não dá erro, só não grava. Trocando,
     * o arquivo antigo é apagado depois — falha nisso não desfaz a troca.
     */
    async salvar(entrada: { organizationId: string; empreendimentoId: string; tipologia: string; arquivo: File; anterior?: PlantaDaTipologia | null }): Promise<PlantaDaTipologia> {
        const tipologia = entrada.tipologia.replace(/\s+/g, ' ').trim();
        const chave = chaveDaTipologia(tipologia);
        if (!chave) throw new Error('A planta precisa de uma tipologia.');
        if (!TIPOS_DE_IMAGEM_DA_PLANTA.includes(entrada.arquivo.type)) throw new Error('A planta precisa ser uma imagem JPG, PNG ou WebP.');
        if (entrada.arquivo.size > TAMANHO_MAXIMO_DA_PLANTA) throw new Error('A imagem da planta passa de 5 MB.');

        const nome = entrada.arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
        const path = `${entrada.organizationId}/${entrada.empreendimentoId}/plantas/${crypto.randomUUID()}-${nome}`;
        await storageService.uploadFile(BUCKET, path, entrada.arquivo);

        const { data, error } = await supabase
            .from('empreendimento_tipologia_plantas')
            .upsert(
                { empreendimento_id: entrada.empreendimentoId, tipologia, tipologia_chave: chave, imagem_url: storageService.getPublicUrl(BUCKET, path), imagem_path: path, updated_at: new Date().toISOString() },
                { onConflict: 'empreendimento_id,tipologia_chave' },
            )
            .select(COLS);
        if (error || !data || data.length === 0) {
            // A linha não ficou: o arquivo que acabou de subir não pode sobrar solto.
            await storageService.remove(BUCKET, [path]).catch(() => undefined);
            if (tabelaDasPlantasAusente(error)) throw new Error(FALTA_A_MIGRATION);
            if (error) throw new Error(`Não foi possível gravar a planta da tipologia ${tipologia}: ${error.message}`);
            throw new Error(`A planta da tipologia ${tipologia} não foi gravada — você não tem permissão para alterar este empreendimento.`);
        }
        const antigo = entrada.anterior?.imagem_path;
        if (antigo && antigo !== path) await storageService.remove(BUCKET, [antigo]).catch(err => console.warn('[plantas] arquivo antigo não apagado:', err));
        return data[0] as unknown as PlantaDaTipologia;
    },

    /** Remove a planta (linha e arquivo). Confere que a linha saiu. */
    async remover(planta: PlantaDaTipologia): Promise<void> {
        if (!planta.id) throw new Error('Planta sem identificador.');
        const { data, error } = await supabase.from('empreendimento_tipologia_plantas').delete().eq('id', planta.id).select('id');
        if (error) throw new Error(`Não foi possível remover a planta da tipologia ${planta.tipologia}: ${error.message}`);
        if (!data || data.length === 0) throw new Error(`A planta da tipologia ${planta.tipologia} não foi removida — você não tem permissão para alterar este empreendimento.`);
        if (planta.imagem_path) await storageService.remove(BUCKET, [planta.imagem_path]).catch(err => console.warn('[plantas] arquivo não apagado:', err));
    },
};
