// @vitest-environment jsdom
/**
 * "Importar de mapa cadastrado" (Empreendimentos › aba Mapa Regulatório) — 26/10/2026.
 *
 * Bug: o 011 - Garden Cambuhy vive na SPE dele; o mapa de Cambuí-MG (175 zonas) foi
 * cadastrado na Alpa. O modal buscava "mapas de Cambuí DA SPE" e dizia que não havia
 * nenhum. O mapa é a lei da cidade: a busca é pela cidade, e a RLS limita às
 * organizações do usuário. Importar continua gravando na organização do empreendimento.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { ORGS, svc } = vi.hoisted(() => ({
    ORGS: [
        { id: 'org-alpa', name: 'Alpa Construtora e Incorporadora' },
        { id: 'org-spe', name: 'Garden Cambuhy SPE' },
    ],
    svc: {
        list: vi.fn(),
        listByCity: vi.fn(),
        listZones: vi.fn(),
        importZonesToEmpreendimento: vi.fn(),
    },
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: { organizations: typeof ORGS }) => unknown) => sel({ organizations: ORGS }),
}));
vi.mock('../../services/regulatoryMapService', () => ({ regulatoryMapService: svc }));

// O autocomplete de verdade busca em master_cities; aqui basta escolher a cidade.
vi.mock('../../components/regulatoryMap/CitySearchSelect', () => ({
    default: ({ onChange }: { onChange: (c: unknown) => void }) => (
        <button type="button" onClick={() => onChange({ id: 'c-cambui', name: 'Cambuí', state_code: 'MG' })}>
            escolher Cambuí
        </button>
    ),
}));

import ImportRegulatoryZonesModal from '../../components/regulatoryMap/ImportRegulatoryZonesModal';

const mapa = (id: string, organization_id: string, name = 'Plano Diretor') => ({
    id, organization_id, city_id: 'c-cambui', name, status: 'ATIVO',
    created_at: '', updated_at: '', city_name: 'Cambuí', state_code: 'MG',
});

const abrir = () => render(
    <ImportRegulatoryZonesModal
        organizationId="org-spe"
        empreendimentoId="emp-garden"
        existingCount={0}
        onClose={() => {}}
        onImported={() => {}}
    />,
);

beforeEach(() => {
    vi.clearAllMocks();
    svc.listZones.mockResolvedValue([{ id: 'z1', zona: 'ZR-1', macroarea: 'Urbana' }]);
    svc.importZonesToEmpreendimento.mockResolvedValue(undefined);
});

describe('ImportRegulatoryZonesModal — mapa da cidade em outra organização', () => {
    it('acha o mapa da Alpa para o empreendimento da SPE, buscando só pela cidade', async () => {
        svc.listByCity.mockResolvedValue([mapa('m-alpa', 'org-alpa')]);
        abrir();
        fireEvent.click(screen.getByText('escolher Cambuí'));

        expect(await screen.findByRole('option', { name: 'Plano Diretor' })).toBeTruthy();
        expect(svc.listByCity).toHaveBeenCalledWith('c-cambui');
        expect(svc.list).not.toHaveBeenCalled();
        expect(screen.queryByText(/Nenhum mapa regulatório/)).toBeNull();
    });

    it('importa as zonas na organização do EMPREENDIMENTO, não na dona do mapa', async () => {
        svc.listByCity.mockResolvedValue([mapa('m-alpa', 'org-alpa')]);
        abrir();
        fireEvent.click(screen.getByText('escolher Cambuí'));
        await screen.findByRole('option', { name: 'Plano Diretor' });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm-alpa' } });
        await screen.findByText('ZR-1');
        fireEvent.click(screen.getByRole('button', { name: /Importar selecionadas/ }));

        await waitFor(() => expect(svc.importZonesToEmpreendimento).toHaveBeenCalled());
        expect(svc.importZonesToEmpreendimento.mock.calls[0][0]).toMatchObject({
            organizationId: 'org-spe',
            empreendimentoId: 'emp-garden',
        });
    });

    it('dois mapas de mesmo nome em organizações diferentes: o rótulo diz de quem é cada um', async () => {
        svc.listByCity.mockResolvedValue([mapa('m-alpa', 'org-alpa'), mapa('m-spe', 'org-spe')]);
        abrir();
        fireEvent.click(screen.getByText('escolher Cambuí'));

        expect(await screen.findByRole('option', { name: 'Plano Diretor · Alpa Construtora e Incorporadora' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Plano Diretor · Garden Cambuhy SPE' })).toBeTruthy();
    });
});
