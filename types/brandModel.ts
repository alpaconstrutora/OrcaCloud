// types/brandModel.ts — Configurações › Marcas e Modelos
//
// Catálogo neutro por organização (tabelas product_brands / product_models,
// migration aplicar_20271013000100). Atende ativo (opura_assets) e material
// (stock_items): o registro guarda brand_id/model_id e o banco espelha o texto
// em brand/model. Plano: docs/planos/2026-10-13-marcas-e-modelos.md.
import type { AssetCategory } from './assets';

export type ProductItemType =
    | 'equipamento'
    | 'componente'
    | 'material'
    | 'ferramenta'
    | 'veiculo'
    | 'tecnologia'
    | 'mobiliario'
    | 'outro';

export const ITEM_TYPE_LABELS: Record<ProductItemType, string> = {
    equipamento: 'Equipamento',
    componente: 'Componente',
    material: 'Material',
    ferramenta: 'Ferramenta',
    veiculo: 'Veículo',
    tecnologia: 'Tecnologia',
    mobiliario: 'Mobiliário',
    outro: 'Outro',
};

export const ITEM_TYPES = Object.keys(ITEM_TYPE_LABELS) as ProductItemType[];

export interface ProductBrand {
    id: string;
    organization_id: string;
    name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ProductModel {
    id: string;
    organization_id: string;
    brand_id: string;
    name: string;
    item_type: ProductItemType;
    manufacturer_code: string | null;
    default_asset_category: AssetCategory | null;
    default_useful_life_months: number | null;
    technical_spec: string | null;
    datasheet_url: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type ProductModelInput = Pick<ProductModel, 'brand_id' | 'name' | 'item_type'> &
    Partial<Pick<ProductModel,
        'manufacturer_code' | 'default_asset_category' | 'default_useful_life_months' |
        'technical_spec' | 'datasheet_url' | 'is_active'>>;

/** Quantos registros usam a marca/modelo — decide entre Excluir e Inativar. */
export interface CatalogUsage {
    models: number;
    assets: number;
    stockItems: number;
}

/**
 * Valor que um formulário guarda para "Marca e modelo". Texto e id andam
 * juntos: texto sem id = digitado e ainda não vinculado (vira cadastro no
 * salvar — `brandModelService.resolverMarcaModelo`), nunca bloqueia.
 */
export interface BrandModelValue {
    brandId: string | null;
    brandName: string;
    modelId: string | null;
    modelName: string;
}

export const BRAND_MODEL_VAZIO: BrandModelValue = { brandId: null, brandName: '', modelId: null, modelName: '' };

/** Tipo de item que nasce para um modelo cadastrado a partir de um ativo, pela categoria dele. */
export function itemTypeDaCategoria(categoria: string | null | undefined): ProductItemType {
    switch (categoria) {
        case 'ferramenta': return 'ferramenta';
        case 'veiculo': return 'veiculo';
        case 'tecnologia': return 'tecnologia';
        case 'mobiliario': return 'mobiliario';
        case 'imovel': return 'outro';
        default: return 'equipamento';
    }
}
