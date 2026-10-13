// services/brandModelService.ts — Configurações › Marcas e Modelos
//
// Única camada que fala com product_brands / product_models. Substitui as
// funções de marca de assetService (opura_asset_brands, deprecada em 13/10).
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md.
//
// REGRA #5: leitura aceita organizationId nulo ("Todas") e só aplica o filtro
// quando há org — a RLS (is_org_member) recorta o resto. Escrita sempre recebe
// a org do REGISTRO (ativo, item, ou a escolhida em resolveWriteOrg).
//
// O texto `brand`/`model` dos registros é derivado no banco (gatilho
// fn_catalogo_espelho); este service só precisa entregar os ids certos.
import { supabase } from '../lib/supabase';
import type {
    BrandModelValue, CatalogUsage, ProductBrand, ProductItemType, ProductModel, ProductModelInput,
} from '../types/brandModel';
import { acharPorNome, chaveBusca, normalizarNome } from '../utils/catalogoNome';
import { linhasQueGravam, type LinhaPlanejada } from '../utils/catalogoPlanilha';

const BRAND_COLS = 'id, organization_id, name, is_active, created_at, updated_at';
const MODEL_COLS =
    'id, organization_id, brand_id, name, item_type, manufacturer_code, default_asset_category, ' +
    'default_useful_life_months, technical_spec, datasheet_url, is_active, created_at, updated_at';

type PgError = { code?: string; message: string; details?: string | null };

/** Erro do banco → frase para a pessoa. */
export function mensagemDeErroCatalogo(error: PgError, alvo: 'marca' | 'modelo'): string {
    if (error.code === '23505') {
        return alvo === 'marca'
            ? 'Já existe uma marca com esse nome nesta organização.'
            : 'Esta marca já tem um modelo com esse nome.';
    }
    if (error.code === '23503') {
        return alvo === 'marca'
            ? 'A marca tem modelos cadastrados. Exclua ou inative os modelos antes — ou inative a marca.'
            : 'O modelo está em uso. Inative-o em vez de excluir.';
    }
    if (error.code === '23514') {
        return 'Valor fora do permitido (nome até 100 caracteres; link da ficha técnica precisa começar com http:// ou https://).';
    }
    return error.message;
}

function falha(error: PgError, alvo: 'marca' | 'modelo'): never {
    console.error(`[brandModelService] ${alvo}:`, error);
    throw new Error(mensagemDeErroCatalogo(error, alvo));
}

const limparModelo = (input: Partial<ProductModelInput>): Partial<ProductModelInput> => {
    const out: Partial<ProductModelInput> = { ...input };
    if (input.name !== undefined) out.name = normalizarNome(input.name);
    const texto = (v: string | null | undefined) => {
        const t = (v ?? '').trim();
        return t === '' ? null : t;
    };
    if ('manufacturer_code' in input) out.manufacturer_code = texto(input.manufacturer_code);
    if ('technical_spec' in input) out.technical_spec = texto(input.technical_spec);
    if ('datasheet_url' in input) out.datasheet_url = texto(input.datasheet_url);
    if ('default_asset_category' in input) out.default_asset_category = input.default_asset_category || null;
    return out;
};

export const brandModelService = {
    // ── Leitura ────────────────────────────────────────────────────────────
    async listBrands(organizationId?: string | null): Promise<ProductBrand[]> {
        let q = supabase.from('product_brands').select(BRAND_COLS).order('name');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) falha(error, 'marca');
        return (data ?? []) as ProductBrand[];
    },

    async listModels(organizationId?: string | null, opts: { brandId?: string } = {}): Promise<ProductModel[]> {
        let q = supabase.from('product_models').select(MODEL_COLS).order('name');
        if (organizationId) q = q.eq('organization_id', organizationId);
        if (opts.brandId) q = q.eq('brand_id', opts.brandId);
        const { data, error } = await q;
        if (error) falha(error, 'modelo');
        return (data ?? []) as unknown as ProductModel[];
    },

    /**
     * Quantos ativos/itens usam cada marca e cada modelo (e quantos modelos cada
     * marca tem). Volume pequeno: agrega no cliente.
     */
    async usage(organizationId?: string | null): Promise<{ brands: Map<string, CatalogUsage>; models: Map<string, CatalogUsage> }> {
        const doRegistro = (tabela: 'opura_assets' | 'stock_items') => {
            let q = supabase.from(tabela).select('brand_id, model_id').not('brand_id', 'is', null);
            if (organizationId) q = q.eq('organization_id', organizationId);
            return q;
        };
        let qModelos = supabase.from('product_models').select('brand_id');
        if (organizationId) qModelos = qModelos.eq('organization_id', organizationId);

        const [ativos, itens, modelos] = await Promise.all([doRegistro('opura_assets'), doRegistro('stock_items'), qModelos]);
        if (ativos.error) falha(ativos.error, 'marca');
        if (itens.error) falha(itens.error, 'marca');
        if (modelos.error) falha(modelos.error, 'modelo');

        const brands = new Map<string, CatalogUsage>();
        const models = new Map<string, CatalogUsage>();
        const de = (m: Map<string, CatalogUsage>, id: string) => {
            let u = m.get(id);
            if (!u) { u = { models: 0, assets: 0, stockItems: 0 }; m.set(id, u); }
            return u;
        };
        for (const r of (ativos.data ?? []) as { brand_id: string; model_id: string | null }[]) {
            de(brands, r.brand_id).assets++;
            if (r.model_id) de(models, r.model_id).assets++;
        }
        for (const r of (itens.data ?? []) as { brand_id: string; model_id: string | null }[]) {
            de(brands, r.brand_id).stockItems++;
            if (r.model_id) de(models, r.model_id).stockItems++;
        }
        for (const r of (modelos.data ?? []) as { brand_id: string }[]) de(brands, r.brand_id).models++;
        return { brands, models };
    },

    // ── Marcas ─────────────────────────────────────────────────────────────
    async createBrand(organizationId: string, name: string): Promise<ProductBrand> {
        const nome = normalizarNome(name);
        if (!nome) throw new Error('Informe o nome da marca.');
        const { data, error } = await supabase
            .from('product_brands')
            .insert({ organization_id: organizationId, name: nome })
            .select(BRAND_COLS)
            .single();
        if (error) falha(error, 'marca');
        return data as ProductBrand;
    },

    async updateBrand(id: string, patch: { name?: string; is_active?: boolean }): Promise<ProductBrand> {
        const body: Record<string, unknown> = { ...patch };
        if (patch.name !== undefined) {
            body.name = normalizarNome(patch.name);
            if (!body.name) throw new Error('Informe o nome da marca.');
        }
        const { data, error } = await supabase.from('product_brands').update(body).eq('id', id).select(BRAND_COLS).single();
        if (error) falha(error, 'marca');
        return data as ProductBrand;
    },

    async deleteBrand(id: string): Promise<void> {
        const { error } = await supabase.from('product_brands').delete().eq('id', id);
        if (error) falha(error, 'marca');
    },

    // ── Modelos ────────────────────────────────────────────────────────────
    /** A org do modelo é a da marca (FK composta) — quem chama passa a org da marca. */
    async createModel(organizationId: string, input: ProductModelInput): Promise<ProductModel> {
        const body = limparModelo(input);
        if (!body.name) throw new Error('Informe o nome do modelo.');
        const { data, error } = await supabase
            .from('product_models')
            .insert({ ...body, organization_id: organizationId })
            .select(MODEL_COLS)
            .single();
        if (error) falha(error, 'modelo');
        return data as unknown as ProductModel;
    },

    async updateModel(id: string, patch: Partial<ProductModelInput>): Promise<ProductModel> {
        const body = limparModelo(patch);
        if (patch.name !== undefined && !body.name) throw new Error('Informe o nome do modelo.');
        const { data, error } = await supabase.from('product_models').update(body).eq('id', id).select(MODEL_COLS).single();
        if (error) falha(error, 'modelo');
        return data as unknown as ProductModel;
    },

    async deleteModel(id: string): Promise<void> {
        const { error } = await supabase.from('product_models').delete().eq('id', id);
        if (error) falha(error, 'modelo');
    },

    // ── Cadastro na hora (formulários) ─────────────────────────────────────
    /**
     * Devolve a marca de mesmo nome (ignorando maiúsculas E acento) ou cria.
     * Corrida entre duas abas: o INSERT perde no UNIQUE e o SELECT seguinte acha.
     */
    async findOrCreateBrand(organizationId: string, name: string): Promise<ProductBrand> {
        const nome = normalizarNome(name);
        if (!nome) throw new Error('Informe o nome da marca.');
        const existentes = await brandModelService.listBrands(organizationId);
        const achada = acharPorNome(existentes, nome);
        if (achada) return achada;
        try {
            return await brandModelService.createBrand(organizationId, nome);
        } catch (e) {
            const depois = acharPorNome(await brandModelService.listBrands(organizationId), nome);
            if (depois) return depois;
            throw e;
        }
    },

    async findOrCreateModel(organizationId: string, brandId: string, name: string, itemType: ProductItemType): Promise<ProductModel> {
        const nome = normalizarNome(name);
        if (!nome) throw new Error('Informe o nome do modelo.');
        const existentes = await brandModelService.listModels(organizationId, { brandId });
        const achado = acharPorNome(existentes, nome);
        if (achado) return achado;
        try {
            return await brandModelService.createModel(organizationId, { brand_id: brandId, name: nome, item_type: itemType });
        } catch (e) {
            const depois = acharPorNome(await brandModelService.listModels(organizationId, { brandId }), nome);
            if (depois) return depois;
            throw e;
        }
    },

    /**
     * Ponto ÚNICO dos "salvar": transforma o valor do campo em ids, criando o que
     * foi digitado e não chegou a ser cadastrado. Nunca bloqueia o salvar por
     * falta de catálogo — texto vazio vira null.
     */
    async resolverMarcaModelo(
        organizationId: string,
        valor: BrandModelValue,
        defaultItemType: ProductItemType,
    ): Promise<{ brand_id: string | null; model_id: string | null; brand: string | null; model: string | null }> {
        const nomeMarca = normalizarNome(valor.brandName);
        const nomeModelo = normalizarNome(valor.modelName);
        if (!nomeMarca && !valor.brandId) {
            // modelo sem marca não tem onde morar no catálogo: fica só o texto
            return { brand_id: null, model_id: null, brand: null, model: nomeModelo || null };
        }
        const marca = valor.brandId
            ? { id: valor.brandId, name: nomeMarca }
            : await brandModelService.findOrCreateBrand(organizationId, nomeMarca);
        if (!nomeModelo && !valor.modelId) {
            return { brand_id: marca.id, model_id: null, brand: marca.name, model: null };
        }
        const modelo = valor.modelId
            ? { id: valor.modelId, name: nomeModelo }
            : await brandModelService.findOrCreateModel(organizationId, marca.id, nomeModelo, defaultItemType);
        return { brand_id: marca.id, model_id: modelo.id, brand: marca.name, model: modelo.name };
    },

    // ── Importação por planilha (Configurações › Marcas e Modelos) ─────────
    /**
     * Grava o plano (utils/catalogoPlanilha.planejarImportacao) na org dada.
     * Linha a linha, tolerando falha: uma linha recusada pelo banco não derruba
     * as outras e volta com o número dela. Marca nova criada por uma linha é
     * reaproveitada pelas seguintes (cache pela chave sem caixa/acento).
     */
    async aplicarImportacao(
        organizationId: string,
        plano: LinhaPlanejada[],
    ): Promise<{ gravadas: number; erros: { numero: number; mensagem: string }[] }> {
        const criadas = new Map<string, string>();   // chaveBusca(marca) → id
        const erros: { numero: number; mensagem: string }[] = [];
        let gravadas = 0;
        for (const p of linhasQueGravam(plano)) {
            const l = p.linha;
            try {
                let marcaId = p.marcaId ?? criadas.get(chaveBusca(l.marca));
                if (!marcaId) {
                    const b = await brandModelService.findOrCreateBrand(organizationId, l.marca);
                    marcaId = b.id;
                    criadas.set(chaveBusca(l.marca), b.id);
                    // linha só da marca, marcada Inativo
                    if (!l.modelo && l.ativo === false) await brandModelService.updateBrand(b.id, { is_active: false });
                }
                if (p.marcaAtiva !== undefined) await brandModelService.updateBrand(marcaId, { is_active: p.marcaAtiva });
                if (p.modeloId && p.patchModelo) {
                    await brandModelService.updateModel(p.modeloId, p.patchModelo);
                } else if (l.modelo && !p.modeloId) {
                    await brandModelService.createModel(organizationId, {
                        brand_id: marcaId,
                        name: l.modelo,
                        item_type: l.tipo ?? 'equipamento',
                        manufacturer_code: l.codigo ?? null,
                        default_asset_category: l.categoria ?? null,
                        default_useful_life_months: l.vida ?? null,
                        datasheet_url: l.ficha ?? null,
                        technical_spec: l.especificacao ?? null,
                        is_active: l.ativo ?? true,
                    });
                }
                gravadas++;
            } catch (e) {
                erros.push({ numero: l.numero, mensagem: e instanceof Error ? e.message : String(e) });
            }
        }
        return { gravadas, erros };
    },
};
