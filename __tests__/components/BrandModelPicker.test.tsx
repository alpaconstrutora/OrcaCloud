import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Campo "Marca / Modelo" do catálogo — docs/planos/2026-10-13-marcas-e-modelos.md
 *
 * O que trava:
 *   1. digitar uma marca que não existe oferece "Cadastrar", cadastra NA ORG DO
 *      REGISTRO e já seleciona (onChange com o id);
 *   2. marca que já existe (mesmo com acento diferente) não é oferecida de novo;
 *   3. modelo fica desligado, dizendo por quê, até haver marca;
 *   4. Escape fecha só a lista — o Sheet em volta (que escuta keydown em
 *      document) não recebe a tecla;
 *   5. escolher modelo devolve o modelo para o autopreenchimento;
 *   6. sem organização conhecida, os campos ficam desligados com o motivo.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BrandModelValue, ProductModel } from '../../types/brandModel';

const listBrands = vi.fn();
const listModels = vi.fn();
const findOrCreateBrand = vi.fn();
const findOrCreateModel = vi.fn();
vi.mock('../../services/brandModelService', () => ({
    brandModelService: {
        listBrands: (...a: unknown[]) => listBrands(...a),
        listModels: (...a: unknown[]) => listModels(...a),
        findOrCreateBrand: (...a: unknown[]) => findOrCreateBrand(...a),
        findOrCreateModel: (...a: unknown[]) => findOrCreateModel(...a),
    },
}));

import { BrandModelPicker } from '../../components/catalog/BrandModelPicker';

const MARCA = { id: 'b1', organization_id: 'org-a', name: 'Mitsubishi', is_active: true, created_at: '', updated_at: '' };
const MODELO: ProductModel = {
    id: 'm1', organization_id: 'org-a', brand_id: 'b1', name: 'MSZ-12', item_type: 'equipamento',
    manufacturer_code: 'PN-77', default_asset_category: 'tecnologia', default_useful_life_months: 96,
    technical_spec: null, datasheet_url: 'https://exemplo.com/ficha.pdf', is_active: true, created_at: '', updated_at: '',
};
const VAZIO: BrandModelValue = { brandId: null, brandName: '', modelId: null, modelName: '' };

/** Wrapper controlado — o picker é totalmente controlado pelo pai. */
function Harness({ org = 'org-a', inicial = VAZIO, onChange }: { org?: string | null; inicial?: BrandModelValue; onChange: (v: BrandModelValue, m?: ProductModel | null) => void }) {
    const [v, setV] = React.useState(inicial);
    return (
        <BrandModelPicker
            organizationId={org}
            value={v}
            defaultItemType="equipamento"
            onChange={(nv, m) => { setV(nv); onChange(nv, m); }}
        />
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    listBrands.mockResolvedValue([MARCA]);
    listModels.mockResolvedValue([MODELO]);
});

describe('BrandModelPicker', () => {
    it('cadastra marca nova na org do registro e já seleciona', async () => {
        findOrCreateBrand.mockResolvedValue({ ...MARCA, id: 'b-novo', name: 'Daikin' });
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await waitFor(() => expect(listBrands).toHaveBeenCalledWith('org-a'));

        await userEvent.type(screen.getByLabelText('Marca'), 'Daikin');
        await userEvent.click(await screen.findByRole('button', { name: /Cadastrar “Daikin”/ }));

        await waitFor(() => expect(findOrCreateBrand).toHaveBeenCalledWith('org-a', 'Daikin'));
        expect(onChange).toHaveBeenLastCalledWith(
            { brandId: 'b-novo', brandName: 'Daikin', modelId: null, modelName: '' }, null,
        );
    });

    it('não oferece cadastrar marca que já existe — nem com acento diferente', async () => {
        render(<Harness onChange={vi.fn()} />);
        await waitFor(() => expect(listBrands).toHaveBeenCalled());
        await userEvent.type(screen.getByLabelText('Marca'), 'mitsubíshi');
        expect(screen.queryByRole('button', { name: /Cadastrar/ })).not.toBeInTheDocument();
        expect(await screen.findByRole('option', { name: /Mitsubishi/ })).toBeInTheDocument();
    });

    it('modelo fica desligado até haver marca, e diz por quê', async () => {
        render(<Harness onChange={vi.fn()} />);
        const modelo = screen.getByLabelText('Modelo');
        expect(modelo).toBeDisabled();
        expect(modelo).toHaveAttribute('title', 'Escolha a marca primeiro');
    });

    it('escolher o modelo devolve o modelo inteiro (para autopreencher) e mostra a ficha técnica', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} inicial={{ brandId: 'b1', brandName: 'Mitsubishi', modelId: null, modelName: '' }} />);
        await waitFor(() => expect(listModels).toHaveBeenCalled());
        await userEvent.click(screen.getByLabelText('Modelo'));
        await userEvent.click(await screen.findByRole('option', { name: /MSZ-12/ }));
        expect(onChange).toHaveBeenLastCalledWith(
            { brandId: 'b1', brandName: 'Mitsubishi', modelId: 'm1', modelName: 'MSZ-12' }, MODELO,
        );
        expect(screen.getByRole('link', { name: /Ficha técnica/ })).toHaveAttribute('href', MODELO.datasheet_url);
        expect(screen.getByText('PN-77')).toBeInTheDocument();
    });

    it('Escape fecha só a lista — a tecla não chega ao document (onde o Sheet escuta)', async () => {
        const noDocument = vi.fn();
        document.addEventListener('keydown', noDocument);
        render(<Harness onChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText('Marca'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(noDocument).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
        document.removeEventListener('keydown', noDocument);
    });

    it('sem organização: campos desligados com o motivo, e nada é carregado', async () => {
        render(<Harness org={null} onChange={vi.fn()} />);
        const marca = screen.getByLabelText('Marca');
        expect(marca).toBeDisabled();
        expect(marca).toHaveAttribute('title', 'Escolha a organização proprietária');
        expect(listBrands).not.toHaveBeenCalled();
    });

    it('texto digitado sem cadastrar fica no campo, com o aviso de que será cadastrado ao salvar', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await waitFor(() => expect(listBrands).toHaveBeenCalled());
        await userEvent.type(screen.getByLabelText('Marca'), 'Gree');
        await userEvent.tab();
        expect(screen.getByLabelText('Marca')).toHaveValue('Gree');
        expect(screen.getByText('Marca nova — será cadastrada ao salvar.')).toBeInTheDocument();
        expect(findOrCreateBrand).not.toHaveBeenCalled();
    });
});
