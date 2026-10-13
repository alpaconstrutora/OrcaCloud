// utils/assetToStockItemRow.ts — ponte Gestão de Ativos → catálogo do Almoxarifado
//
// Um ativo patrimonial (opura_assets) vira uma linha de importação do catálogo
// (stock_items). O código patrimonial é o input_code — é ele que liga as duas
// tabelas (não há FK). Ativo é unitário, então a linha já nasce com
// initialQuantity = 1: só vira movimento de entrada se o usuário marcar
// "Lançar saldo inicial" no modal. Fica fora do componente para ser testável
// sem jsdom/ExcelJS. Ver docs/planos/2026-09-19-almoxarifado-importar-itens-gestao-de-ativos.md.
import type { AssetCategory, OpuraAsset } from '../types/assets';
import type { StockItemImportRow } from '../types/inventory';

// Fonte única dos rótulos de categoria: as <option> de OpuraAssetsModule.tsx
// (filtro e formulário) e a célula da tabela são geradas a partir daqui.
export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
    equipamento: 'Equipamento',
    ferramenta: 'Ferramenta',
    veiculo: 'Veículo',
    tecnologia: 'Tecnologia',
    imovel: 'Imóvel',
    mobiliario: 'Mobiliário',
    sistema_predial: 'Sistema Predial',
};

export const ASSET_CATEGORIES = Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[];

export const ASSET_UNIT = 'UN';

export function assetToStockItemRow(asset: OpuraAsset): StockItemImportRow {
    const marcaModelo = [asset.brand, asset.model].filter(s => s && s.trim()).join(' ');
    const description = [asset.name.trim(), marcaModelo].filter(Boolean).join(' — ');
    return {
        inputCode: asset.code,
        inputDescription: description,
        inputUnit: ASSET_UNIT,
        category: ASSET_CATEGORY_LABELS[asset.category] ?? asset.category,
        unitCostHint: asset.purchase_value > 0 ? asset.purchase_value : undefined,
        source: 'ativos',
        initialQuantity: 1,
        // Marca/modelo do bem entram no item (mesma org, mesmo catálogo de
        // Configurações › Marcas e Modelos). Ativo sem marca não mexe na do item.
        ...(asset.brand_id || (asset.brand && asset.brand.trim())
            ? { brandId: asset.brand_id ?? null, modelId: asset.model_id ?? null, brand: asset.brand ?? null, model: asset.model ?? null }
            : {}),
    };
}
