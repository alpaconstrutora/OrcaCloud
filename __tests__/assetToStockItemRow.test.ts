import { describe, it, expect } from 'vitest';
import { assetToStockItemRow, ASSET_CATEGORY_LABELS } from '../utils/assetToStockItemRow';
import type { OpuraAsset } from '../types/assets';

const base: OpuraAsset = {
    id: 'a1',
    organization_id: 'org1',
    code: 'OPR-PAT-000123',
    name: 'Betoneira 400L',
    category: 'equipamento',
    brand: 'Menegotti',
    model: 'CS400',
    purchase_value: 4500,
    status: 'disponivel',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
};

describe('assetToStockItemRow — Gestão de Ativos → catálogo do Almoxarifado', () => {
    it('ativo completo: código patrimonial, "Nome — Marca Modelo", UN, categoria rotulada, custo, origem ativos, 1 UN', () => {
        expect(assetToStockItemRow(base)).toEqual({
            inputCode: 'OPR-PAT-000123',
            inputDescription: 'Betoneira 400L — Menegotti CS400',
            inputUnit: 'UN',
            category: 'Equipamento',
            unitCostHint: 4500,
            source: 'ativos',
            initialQuantity: 1,
            brandId: null,
            modelId: null,
            brand: 'Menegotti',
            model: 'CS400',
        });
    });

    it('marca/modelo do catálogo vão junto para o item (13/10/2026 — Configurações › Marcas e Modelos)', () => {
        const row = assetToStockItemRow({ ...base, brand_id: 'b1', model_id: 'm1' });
        expect(row).toMatchObject({ brandId: 'b1', modelId: 'm1', brand: 'Menegotti', model: 'CS400' });
    });

    it('ativo sem marca não mexe na marca do item (nenhuma chave de marca na linha)', () => {
        const row = assetToStockItemRow({ ...base, brand: undefined, model: undefined });
        expect(row).not.toHaveProperty('brandId');
        expect(row).not.toHaveProperty('brand');
    });

    it('sem marca/modelo: descrição é só o nome (sem travessão pendurado)', () => {
        expect(assetToStockItemRow({ ...base, brand: undefined, model: undefined }).inputDescription).toBe('Betoneira 400L');
        expect(assetToStockItemRow({ ...base, brand: '  ', model: '' }).inputDescription).toBe('Betoneira 400L');
    });

    it('só marca ou só modelo: entra o que existe', () => {
        expect(assetToStockItemRow({ ...base, model: undefined }).inputDescription).toBe('Betoneira 400L — Menegotti');
        expect(assetToStockItemRow({ ...base, brand: undefined }).inputDescription).toBe('Betoneira 400L — CS400');
    });

    it('purchase_value zero: sem custo de referência', () => {
        expect(assetToStockItemRow({ ...base, purchase_value: 0 }).unitCostHint).toBeUndefined();
    });

    it('categoria fora do mapa cai no valor cru (não perde o dado)', () => {
        const row = assetToStockItemRow({ ...base, category: 'categoria_legada' as OpuraAsset['category'] });
        expect(row.category).toBe('categoria_legada');
    });

    it('sistema predial (ativo do Condomínio) tem rótulo legível, não a chave crua', () => {
        expect(assetToStockItemRow({ ...base, category: 'sistema_predial' }).category).toBe('Sistema Predial');
    });

    it('as sete categorias do módulo têm rótulo', () => {
        expect(Object.keys(ASSET_CATEGORY_LABELS).sort()).toEqual(
            ['equipamento', 'ferramenta', 'imovel', 'mobiliario', 'sistema_predial', 'tecnologia', 'veiculo'],
        );
    });
});
