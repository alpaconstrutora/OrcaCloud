import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { chaveDaTipologia } from '../utils/espelhoPlantaDaTipologia';
import { emOrdemDeDecorado, problemaDoAmbiente, type ImagemDoDecorado } from '../utils/espelhoDecoradoDaTipologia';

/**
 * "VER DECORADO" POR TIPOLOGIA (Espelho de Vendas 3D, F8 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * O corte 3D mobiliado (um por tipologia) e as imagens dos ambientes decorados
 * (`empreendimento_tipologia_decorado`), com a imagem no bucket público
 * `empreendimento-midia` (o mesmo das plantas e das vistas). Os portais NÃO leem
 * daqui: recebem o decorado pelas RPCs do espelho.
 */

const BUCKET = 'empreendimento-midia';
const COLS = 'id, empreendimento_id, tipologia, tipologia_chave, papel, legenda, ordem, imagem_url, imagem_path, origem';
// Os mesmos limites que o <ImageDropzone> anuncia ("JPG, PNG ou WEBP · até 5 MB").
const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

/** A tabela ainda não existe no banco (a migration da F8 não foi aplicada). */
export const tabelaDoDecoradoAusente = (e: { code?: string; message?: string } | null | undefined) =>
    !!e && (e.code === '42P01' || e.code === 'PGRST205' || /empreendimento_tipologia_decorado/.test(e.message ?? ''));

const FALTA_A_MIGRATION = 'O banco ainda não tem o cadastro do decorado por tipologia — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110990000).';
const SEM_PERMISSAO = 'você não tem permissão para alterar este empreendimento.';

function conferirArquivo(arquivo: File, oQue: string) {
    if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) throw new Error(`${oQue} precisa ser uma imagem JPG, PNG ou WebP.`);
    if (arquivo.size > TAMANHO_MAXIMO) throw new Error(`${oQue} passa de 5 MB.`);
}

async function subir(organizationId: string, empreendimentoId: string, arquivo: File): Promise<{ path: string; url: string }> {
    const nome = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const path = `${organizationId}/${empreendimentoId}/decorado/${crypto.randomUUID()}-${nome}`;
    await storageService.uploadFile(BUCKET, path, arquivo);
    return { path, url: storageService.getPublicUrl(BUCKET, path) };
}

const apagarArquivo = (path: string | undefined) =>
    path ? storageService.remove(BUCKET, [path]).catch(err => console.warn('[decorado] arquivo não apagado:', err)) : Promise.resolve();

export const empreendimentoTipologiaDecoradoService = {
    /** O decorado do empreendimento. Antes da migration = erro com o motivo (a tela mostra). */
    async listar(empreendimentoId: string): Promise<ImagemDoDecorado[]> {
        const { data, error } = await supabase
            .from('empreendimento_tipologia_decorado')
            .select(COLS)
            .eq('empreendimento_id', empreendimentoId);
        if (error) {
            if (tabelaDoDecoradoAusente(error)) throw new Error(FALTA_A_MIGRATION);
            throw error;
        }
        return ((data ?? []) as unknown as ImagemDoDecorado[]).sort(emOrdemDeDecorado);
    },

    /** O decorado dos empreendimentos de um prédio do estoque — para o 3D aberto DENTRO do app. Sem tabela = []. */
    async doPredio(buildingId: string): Promise<ImagemDoDecorado[]> {
        const { data: emps, error: e1 } = await supabase.from('empreendimentos').select('id').eq('commercial_building_id', buildingId);
        if (e1) throw e1;
        const ids = ((emps ?? []) as { id: string }[]).map(e => e.id);
        if (ids.length === 0) return [];
        const { data, error } = await supabase.from('empreendimento_tipologia_decorado').select(COLS).in('empreendimento_id', ids);
        if (error) {
            if (tabelaDoDecoradoAusente(error)) return [];
            throw error;
        }
        return ((data ?? []) as unknown as ImagemDoDecorado[]).map(i => ({ ...i, commercial_building_id: buildingId }));
    },

    /**
     * Sobe e grava (ou troca) o CORTE 3D da tipologia. ⚠️ Confere a linha que voltou: gravação barrada pela RLS não
     * dá erro, só não grava — e aí o arquivo que acabou de subir não pode sobrar solto. Trocando, o arquivo antigo é
     * apagado depois que a linha nova voltou.
     */
    async salvarCorte(entrada: { organizationId: string; empreendimentoId: string; tipologia: string; arquivo: File; anterior?: ImagemDoDecorado | null }): Promise<ImagemDoDecorado> {
        const tipologia = entrada.tipologia.replace(/\s+/g, ' ').trim();
        const chave = chaveDaTipologia(tipologia);
        if (!chave) throw new Error('O corte precisa de uma tipologia.');
        conferirArquivo(entrada.arquivo, 'A imagem do corte');
        const { path, url } = await subir(entrada.organizationId, entrada.empreendimentoId, entrada.arquivo);

        const linha = { imagem_url: url, imagem_path: path, origem: 'ENVIADA', planta_assinatura: null, planta_estudo_id: null, updated_at: new Date().toISOString() };
        const { data, error } = entrada.anterior?.id
            ? await supabase.from('empreendimento_tipologia_decorado').update(linha).eq('id', entrada.anterior.id).select(COLS)
            : await supabase.from('empreendimento_tipologia_decorado')
                .insert({ ...linha, empreendimento_id: entrada.empreendimentoId, tipologia, tipologia_chave: chave, papel: 'CORTE', ordem: 0 })
                .select(COLS);
        if (error || !data || data.length === 0) {
            await storageService.remove(BUCKET, [path]).catch(() => undefined);
            if (tabelaDoDecoradoAusente(error)) throw new Error(FALTA_A_MIGRATION);
            if (error?.code === '23505') throw new Error(`A tipologia ${tipologia} já tem um corte. Recarregue a página e troque o atual.`);
            if (error) throw new Error(`Não foi possível gravar o corte da tipologia ${tipologia}: ${error.message}`);
            throw new Error(`O corte da tipologia ${tipologia} não foi gravado — ${SEM_PERMISSAO}`);
        }
        if (entrada.anterior?.imagem_path && entrada.anterior.imagem_path !== path) await apagarArquivo(entrada.anterior.imagem_path);
        return data[0] as unknown as ImagemDoDecorado;
    },

    /** Sobe e grava um AMBIENTE no fim da lista da tipologia. Confere a linha que voltou (ver `salvarCorte`). */
    async adicionarAmbiente(entrada: { organizationId: string; empreendimentoId: string; tipologia: string; nome: string; arquivo: File; ambientesJaGravados: readonly ImagemDoDecorado[] }): Promise<ImagemDoDecorado> {
        const tipologia = entrada.tipologia.replace(/\s+/g, ' ').trim();
        const chave = chaveDaTipologia(tipologia);
        if (!chave) throw new Error('O ambiente precisa de uma tipologia.');
        const problema = problemaDoAmbiente({ temArquivo: true, nome: entrada.nome, ambientesJaGravados: entrada.ambientesJaGravados.length });
        if (problema) throw new Error(problema);
        conferirArquivo(entrada.arquivo, 'A imagem do ambiente');
        const { path, url } = await subir(entrada.organizationId, entrada.empreendimentoId, entrada.arquivo);

        const ordem = entrada.ambientesJaGravados.reduce((m, a) => Math.max(m, a.ordem ?? 0), -1) + 1;
        const { data, error } = await supabase
            .from('empreendimento_tipologia_decorado')
            .insert({ empreendimento_id: entrada.empreendimentoId, tipologia, tipologia_chave: chave, papel: 'AMBIENTE', legenda: entrada.nome.trim(), ordem, imagem_url: url, imagem_path: path })
            .select(COLS);
        if (error || !data || data.length === 0) {
            await storageService.remove(BUCKET, [path]).catch(() => undefined);
            if (tabelaDoDecoradoAusente(error)) throw new Error(FALTA_A_MIGRATION);
            if (error) throw new Error(`Não foi possível gravar o ambiente ${entrada.nome.trim()}: ${error.message}`);
            throw new Error(`O ambiente ${entrada.nome.trim()} não foi gravado — ${SEM_PERMISSAO}`);
        }
        return data[0] as unknown as ImagemDoDecorado;
    },

    /** Grava a ordem dos ambientes como está na lista (0, 1, 2…). Confere cada linha que voltou. */
    async reordenar(ambientes: readonly ImagemDoDecorado[]): Promise<void> {
        for (const [ordem, a] of ambientes.entries()) {
            if (!a.id || a.ordem === ordem) continue;
            const { data, error } = await supabase.from('empreendimento_tipologia_decorado').update({ ordem, updated_at: new Date().toISOString() }).eq('id', a.id).select('id');
            if (error) throw new Error(`Não foi possível mudar a ordem dos ambientes: ${error.message}`);
            if (!data || data.length === 0) throw new Error(`A ordem dos ambientes não foi gravada — ${SEM_PERMISSAO}`);
        }
    },

    /** Remove a imagem (linha e arquivo). Confere que a linha saiu. */
    async remover(imagem: ImagemDoDecorado): Promise<void> {
        if (!imagem.id) throw new Error('Imagem sem identificador.');
        const oQue = imagem.papel === 'CORTE' ? 'o corte' : `o ambiente ${imagem.legenda ?? ''}`.trim();
        const { data, error } = await supabase.from('empreendimento_tipologia_decorado').delete().eq('id', imagem.id).select('id');
        if (error) throw new Error(`Não foi possível remover ${oQue}: ${error.message}`);
        if (!data || data.length === 0) throw new Error(`Não foi possível remover ${oQue} — ${SEM_PERMISSAO}`);
        await apagarArquivo(imagem.imagem_path);
    },
};
