import { describe, it, expect } from 'vitest';
import {
    linhasParaExportar, lerLinha, mapearCabecalho, planejarImportacao, resumirPlano, linhasQueGravam, COLUNAS_PLANILHA,
    type LinhaLida,
} from '../utils/catalogoPlanilha';
import type { ProductBrand, ProductModel } from '../types/brandModel';

const marca = (id: string, name: string, extra: Partial<ProductBrand> = {}): ProductBrand =>
    ({ id, organization_id: 'org-a', name, is_active: true, created_at: '', updated_at: '', ...extra });
const modelo = (id: string, brand: string, name: string, extra: Partial<ProductModel> = {}): ProductModel => ({
    id, brand_id: brand, organization_id: 'org-a', name, item_type: 'equipamento', manufacturer_code: null,
    default_asset_category: null, default_useful_life_months: null, technical_spec: null, datasheet_url: null,
    is_active: true, created_at: '', updated_at: '', ...extra,
});

const CAB = COLUNAS_PLANILHA.map(c => c.titulo);
const { indices } = mapearCabecalho(CAB);
const ler = (vals: Partial<Record<string, string>>, numero = 2) =>
    lerLinha(COLUNAS_PLANILHA.map(c => vals[c.campo] ?? ''), indices, numero) as LinhaLida;

describe('cabeçalho — colunas achadas pelo título, não pela posição', () => {
    it('acha as colunas fora de ordem, sem acento, sem asterisco e com apelido', () => {
        const { indices: ix, erro } = mapearCabecalho(['modelo', 'FABRICANTE', 'Vida util', 'tipo']);
        expect(erro).toBeUndefined();
        expect(ix).toMatchObject({ modelo: 0, marca: 1, vida: 2, tipo: 3 });
    });
    it('sem coluna Marca = erro explicando o que fazer', () => {
        expect(mapearCabecalho(['Modelo', 'Tipo']).erro).toMatch(/coluna "Marca"/);
    });
});

describe('lerLinha — valores conhecidos e validação', () => {
    it('aceita rótulo ou chave, sem caixa e sem acento', () => {
        const l = ler({ marca: 'WEG', modelo: 'W22', tipo: 'VEICULO', categoria: 'imóvel', situacao: 'inativo', vida: '120' });
        expect(l.erros).toEqual([]);
        expect(l).toMatchObject({ tipo: 'veiculo', categoria: 'imovel', ativo: false, vida: 120 });
    });
    it('linha toda em branco é ignorada', () => {
        expect(lerLinha(CAB.map(() => ''), indices, 9)).toBeNull();
    });
    it('erros dizem o que corrigir', () => {
        const l = ler({ marca: 'X', modelo: 'Y', tipo: 'foguete', vida: '0', ficha: 'www.x.com', situacao: 'talvez' });
        expect(l.erros.join(' ')).toMatch(/Tipo de item "foguete"/);
        expect(l.erros.join(' ')).toMatch(/Vida útil "0"/);
        expect(l.erros.join(' ')).toMatch(/http/);
        expect(l.erros.join(' ')).toMatch(/Situação "talvez"/);
    });
    it('modelo sem marca é erro — todo modelo pertence a uma marca', () => {
        expect(ler({ modelo: 'W22' }).erros.join(' ')).toMatch(/Marca em branco/);
    });
    it('dados de modelo sem o nome do modelo não são engolidos', () => {
        expect(ler({ marca: 'WEG', codigo: '123' }).erros.join(' ')).toMatch(/sem o nome do Modelo/);
    });
    it('célula vazia vira "não mexer" (undefined), não string vazia', () => {
        const l = ler({ marca: 'WEG', modelo: 'W22' });
        expect(l.codigo).toBeUndefined();
        expect(l.ativo).toBeUndefined();
    });
});

describe('planejarImportacao — o que cada linha vai fazer', () => {
    const MARCAS = [marca('b1', 'Mitsubishi')];
    const MODELOS = [modelo('m1', 'b1', 'MSZ-12', { manufacturer_code: 'PN-1', default_useful_life_months: 96 })];

    it('marca existente reconhecida ignorando acento e caixa; modelo novo nela', () => {
        const [p] = planejarImportacao([ler({ marca: 'mitsubíshi', modelo: 'MSZ-18' })], MARCAS, MODELOS);
        expect(p).toMatchObject({ acao: 'novo-modelo', marcaId: 'b1' });
    });
    it('marca e modelo novos', () => {
        const [p] = planejarImportacao([ler({ marca: 'Daikin', modelo: 'FTX' })], MARCAS, MODELOS);
        expect(p.acao).toBe('nova-marca-e-modelo');
    });
    it('2ª linha da mesma marca nova vira "novo modelo" (a marca é criada uma vez)', () => {
        const plano = planejarImportacao([ler({ marca: 'Daikin', modelo: 'A' }, 2), ler({ marca: 'DAIKIN', modelo: 'B' }, 3)], MARCAS, MODELOS);
        expect(plano.map(p => p.acao)).toEqual(['nova-marca-e-modelo', 'novo-modelo']);
    });
    it('só o que veio preenchido E diferente entra no patch', () => {
        const [p] = planejarImportacao([ler({ marca: 'Mitsubishi', modelo: 'msz-12', codigo: 'PN-1', vida: '60' })], MARCAS, MODELOS);
        expect(p.acao).toBe('atualiza');
        expect(p.patchModelo).toEqual({ default_useful_life_months: 60 });
        expect(p.detalhe).toBe('Atualiza vida útil.');
    });
    it('tudo igual = sem mudança (não grava)', () => {
        const plano = planejarImportacao([ler({ marca: 'Mitsubishi', modelo: 'MSZ-12', codigo: 'PN-1' })], MARCAS, MODELOS);
        expect(plano[0].acao).toBe('sem-mudanca');
        expect(linhasQueGravam(plano)).toHaveLength(0);
    });
    it('linha repetida na planilha é erro a partir da 2ª, apontando a 1ª', () => {
        const plano = planejarImportacao([ler({ marca: 'WEG', modelo: 'W22' }, 2), ler({ marca: 'weg', modelo: 'w22' }, 7)], MARCAS, MODELOS);
        expect(plano[1]).toMatchObject({ acao: 'erro', detalhe: 'Repetida na planilha (igual à linha 2).' });
    });
    it('linha só com a marca: inativar a marca existente é "atualiza"', () => {
        const [p] = planejarImportacao([ler({ marca: 'Mitsubishi', situacao: 'Inativo' })], MARCAS, MODELOS);
        expect(p).toMatchObject({ acao: 'atualiza', marcaAtiva: false });
    });
    it('resumo conta cada ação', () => {
        const plano = planejarImportacao([
            ler({ marca: 'Daikin' }, 2), ler({ marca: 'Mitsubishi', modelo: 'MSZ-12' }, 3), ler({ marca: '', modelo: 'X' }, 4),
        ], MARCAS, MODELOS);
        expect(resumirPlano(plano)).toMatchObject({ 'nova-marca': 1, 'sem-mudanca': 1, erro: 1 });
    });
});

describe('linhasParaExportar', () => {
    it('um modelo por linha; marca sem modelo vira uma linha só com a marca; rótulos legíveis', () => {
        const linhas = linhasParaExportar(
            [marca('b2', 'WEG'), marca('b1', 'DeWalt', { is_active: false })],
            [modelo('m1', 'b2', 'W22', { item_type: 'componente', default_asset_category: 'ferramenta', default_useful_life_months: 36 })],
        );
        expect(linhas.map(l => [l.marca, l.modelo, l.situacao])).toEqual([['DeWalt', '', 'Inativo'], ['WEG', 'W22', 'Ativo']]);
        expect(linhas[1]).toMatchObject({ tipo: 'Componente', categoria: 'Ferramenta', vida: 36 });
    });
    it('o que se exporta se reimporta sem mudança (ida e volta)', () => {
        const MARCAS = [marca('b1', 'WEG')];
        const MODELOS = [modelo('m1', 'b1', 'W22', { manufacturer_code: 'X1', default_useful_life_months: 120, datasheet_url: 'https://a.b/c.pdf' })];
        const exportadas = linhasParaExportar(MARCAS, MODELOS);
        const lidas = exportadas.map((l, i) => lerLinha(COLUNAS_PLANILHA.map(c => String(l[c.campo] ?? '')), indices, i + 2)!);
        expect(planejarImportacao(lidas, MARCAS, MODELOS).map(p => p.acao)).toEqual(['sem-mudanca']);
    });
});
