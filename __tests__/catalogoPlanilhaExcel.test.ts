import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { gerarPlanilhaCatalogo, lerPlanilhaCatalogo, ABA_DADOS } from '../utils/catalogoPlanilhaExcel';
import { linhasParaExportar } from '../utils/catalogoPlanilha';
import type { ProductBrand, ProductModel } from '../types/brandModel';

// Ida e volta com o ExcelJS de verdade: o que o app exporta, o app lê de novo igual.
const MARCAS: ProductBrand[] = [{ id: 'b1', organization_id: 'org-a', name: 'Mitsubishi', is_active: true, created_at: '', updated_at: '' }];
const MODELOS: ProductModel[] = [{
    id: 'm1', brand_id: 'b1', organization_id: 'org-a', name: 'MSZ-12', item_type: 'equipamento', manufacturer_code: 'PN-77',
    default_asset_category: 'tecnologia', default_useful_life_months: 96, technical_spec: 'Inverter, 220 V\n12.000 BTU',
    datasheet_url: 'https://exemplo.com/ficha.pdf', is_active: true, created_at: '', updated_at: '',
}];

const paraBuffer = async (b: Blob) => b.arrayBuffer();

describe('planilha de Marcas e Modelos (.xlsx)', () => {
    it('exporta e lê de volta os mesmos valores, incluindo texto de várias linhas', async () => {
        const blob = await gerarPlanilhaCatalogo(linhasParaExportar(MARCAS, MODELOS), { comOrganizacao: false });
        const { linhas, erro } = await lerPlanilhaCatalogo(await paraBuffer(blob));
        expect(erro).toBeUndefined();
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatchObject({
            numero: 2, marca: 'Mitsubishi', modelo: 'MSZ-12', tipo: 'equipamento', codigo: 'PN-77', categoria: 'tecnologia',
            vida: 96, ficha: 'https://exemplo.com/ficha.pdf', especificacao: 'Inverter, 220 V\n12.000 BTU', ativo: true, erros: [],
        });
    });

    it('planilha modelo: cabeçalho, listas de escolha e aba de instruções; sem coluna Organização', async () => {
        const blob = await gerarPlanilhaCatalogo([], { comOrganizacao: false });
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await paraBuffer(blob));
        const ws = wb.getWorksheet(ABA_DADOS)!;
        expect(ws.getRow(1).getCell(1).value).toBe('Marca *');
        expect((ws.getRow(1).values as unknown[]).includes('Organização')).toBe(false);
        expect(ws.getCell('C2').dataValidation?.type).toBe('list');
        expect(wb.getWorksheet('Instruções')).toBeTruthy();
        const { erro } = await lerPlanilhaCatalogo(await paraBuffer(blob));
        expect(erro).toMatch(/Nenhuma linha preenchida/);
    });

    it('exportação em "Todas" leva a coluna Organização, que a leitura ignora', async () => {
        const blob = await gerarPlanilhaCatalogo(linhasParaExportar(MARCAS, MODELOS, () => 'Alpa'), { comOrganizacao: true });
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await paraBuffer(blob));
        expect(wb.getWorksheet(ABA_DADOS)!.getRow(2).getCell(10).value).toBe('Alpa');
        const { linhas } = await lerPlanilhaCatalogo(await paraBuffer(blob));
        expect(linhas[0].erros).toEqual([]);
    });

    it('arquivo que não é xlsx dá erro legível', async () => {
        const { erro } = await lerPlanilhaCatalogo(new TextEncoder().encode('não sou planilha').buffer as ArrayBuffer);
        expect(erro).toMatch(/Não foi possível ler/);
    });

    it('célula de link (hyperlink) é lida pelo endereço', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Plan1');
        ws.addRow(['Marca', 'Modelo', 'Ficha técnica']);
        ws.addRow(['WEG', 'W22', { text: 'ficha', hyperlink: 'https://weg.net/w22.pdf' }]);
        const buf = await wb.xlsx.writeBuffer();
        const { linhas } = await lerPlanilhaCatalogo(buf as ArrayBuffer);
        expect(linhas[0].ficha).toBe('https://weg.net/w22.pdf');
    });
});
