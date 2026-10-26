// @vitest-environment jsdom
/**
 * "Importar de mapa cadastrado" (Empreendimentos › aba Mapa Regulatório).
 *
 * 26/10/2026 (PR #188) — o 011 - Garden Cambuhy vive na SPE dele; o mapa de Cambuí-MG
 * (175 zonas) foi cadastrado na Alpa. O modal buscava "mapas de Cambuí DA SPE" e dizia que
 * não havia nenhum. A busca é pela cidade, a RLS limita às organizações do usuário, e
 * importar continua gravando na organização do empreendimento.
 *
 * 26/10/2026 (plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md, item B) — o
 * modal vinha com TODAS as zonas marcadas e o Garden recebeu as 175 da cidade. Agora vêm
 * desmarcadas, há busca, "Marcar todas", cada zona mostra C.A./T.O. (o mapa de Cambuí tem a
 * mesma macroárea × zona repetida com números diferentes) e dá para SUBSTITUIR as atuais.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { ORGS, svc, empSvc, confirmar } = vi.hoisted(() => ({
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
    empSvc: { deleteRegulatoryZones: vi.fn() },
    confirmar: vi.fn(),
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: { organizations: typeof ORGS }) => unknown) => sel({ organizations: ORGS }),
}));
vi.mock('../../services/regulatoryMapService', () => ({ regulatoryMapService: svc }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: empSvc }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));

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

const ZONAS_DE_CAMBUI = [
    { id: 'z1', zona: 'ZEPEC 2', macroarea: 'Urbanização Consolidada', ca_minimo: '0,25', ca_basico: '3', ca_maximo: '3' },
    { id: 'z2', zona: 'ZEPEC 2', macroarea: 'Urbanização Consolidada', ca_minimo: '0,25', ca_basico: '3', ca_maximo: '3', taxa_ocupacao_maxima: '0,9' },
    { id: 'z3', zona: 'ZM 4', macroarea: 'Transição Urbana' },
];

const onImported = vi.fn();
const abrir = (existingZoneIds: string[] = []) => render(
    <ImportRegulatoryZonesModal
        organizationId="org-spe"
        empreendimentoId="emp-garden"
        existingZoneIds={existingZoneIds}
        onClose={() => {}}
        onImported={onImported}
    />,
);

/** Cidade → mapa → espera as zonas. */
const ateAsZonas = async () => {
    fireEvent.click(screen.getByText('escolher Cambuí'));
    await screen.findByRole('option', { name: 'Plano Diretor' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm-alpa' } });
    await screen.findAllByText('ZEPEC 2');
};
const caixa = (rotulo: RegExp) => screen.getByRole('checkbox', { name: rotulo }) as HTMLInputElement;

beforeEach(() => {
    vi.clearAllMocks();
    svc.listByCity.mockResolvedValue([mapa('m-alpa', 'org-alpa')]);
    svc.listZones.mockResolvedValue(ZONAS_DE_CAMBUI);
    svc.importZonesToEmpreendimento.mockResolvedValue([{ id: 'nova-1' }]);
    empSvc.deleteRegulatoryZones.mockResolvedValue(undefined);
    confirmar.mockResolvedValue(true);
});

describe('ImportRegulatoryZonesModal — mapa da cidade em outra organização', () => {
    it('acha o mapa da Alpa para o empreendimento da SPE, buscando só pela cidade', async () => {
        abrir();
        fireEvent.click(screen.getByText('escolher Cambuí'));

        expect(await screen.findByRole('option', { name: 'Plano Diretor' })).toBeTruthy();
        expect(svc.listByCity).toHaveBeenCalledWith('c-cambui');
        expect(svc.list).not.toHaveBeenCalled();
        expect(screen.queryByText(/Nenhum mapa regulatório/)).toBeNull();
    });

    it('importa as zonas na organização do EMPREENDIMENTO, não na dona do mapa', async () => {
        abrir();
        await ateAsZonas();
        fireEvent.click(caixa(/ZM 4/));
        fireEvent.click(screen.getByRole('button', { name: /Importar 1 zona/ }));

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

describe('ImportRegulatoryZonesModal — importar só o que vale', () => {
    it('as zonas vêm DESMARCADAS e o botão diz o motivo de estar desligado', async () => {
        abrir();
        await ateAsZonas();
        expect(screen.getAllByRole('checkbox').filter(c => c !== screen.queryByRole('checkbox', { name: /Substituir/ }))
            .every(c => !(c as HTMLInputElement).checked)).toBe(true);
        const botao = screen.getByRole('button', { name: /Importar/ }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.title).toMatch(/Marque ao menos uma zona/);
    });

    it('cada zona mostra C.A. e T.O. — as duas ZEPEC 2 de Cambuí se distinguem', async () => {
        abrir();
        await ateAsZonas();
        expect(caixa(/ZEPEC 2.*T\.O\. 0,9/)).toBeTruthy();
        expect(screen.getAllByText(/C\.A\. 0,25 \/ 3 \/ 3/)).toHaveLength(2);
    });

    it('a busca recorta a lista; "Marcar todas" marca só as que estão na tela', async () => {
        abrir();
        await ateAsZonas();
        fireEvent.change(screen.getByPlaceholderText(/Buscar zona/), { target: { value: 'zepec' } });
        expect(screen.queryByText('ZM 4')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Marcar todas/ }));
        fireEvent.click(screen.getByRole('button', { name: /Importar 2 zonas/ }));

        await waitFor(() => expect(svc.importZonesToEmpreendimento).toHaveBeenCalled());
        expect(svc.importZonesToEmpreendimento.mock.calls[0][0].zones.map((z: { id: string }) => z.id)).toEqual(['z1', 'z2']);
    });

    it('sem zonas atuais, não oferece substituir', async () => {
        abrir([]);
        await ateAsZonas();
        expect(screen.queryByRole('checkbox', { name: /Substituir/ })).toBeNull();
    });

    it('substituir: confirma, importa PRIMEIRO e só depois apaga as antigas', async () => {
        const ordem: string[] = [];
        svc.importZonesToEmpreendimento.mockImplementation(async () => { ordem.push('importa'); return [{ id: 'nova-1' }]; });
        empSvc.deleteRegulatoryZones.mockImplementation(async () => { ordem.push('apaga'); });
        abrir(['velha-1', 'velha-2']);
        await ateAsZonas();
        fireEvent.click(caixa(/Substituir as 2 zonas atuais/));
        fireEvent.click(caixa(/ZEPEC 2.*T\.O\. 0,9/));
        fireEvent.click(screen.getByRole('button', { name: /Importar 1 zona/ }));

        await waitFor(() => expect(onImported).toHaveBeenCalled());
        expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
        expect(ordem).toEqual(['importa', 'apaga']);
        expect(empSvc.deleteRegulatoryZones).toHaveBeenCalledWith(
            ['velha-1', 'velha-2'], { empreendimentoId: 'emp-garden', organizationId: 'org-spe' },
        );
        // Substituindo, a numeração recomeça do zero.
        expect(svc.importZonesToEmpreendimento.mock.calls[0][0].sortOrderOffset).toBe(0);
    });

    it('substituir cancelado na confirmação: não importa nem apaga', async () => {
        confirmar.mockResolvedValue(false);
        abrir(['velha-1']);
        await ateAsZonas();
        fireEvent.click(caixa(/Substituir a zona atual/));
        fireEvent.click(caixa(/ZM 4/));
        fireEvent.click(screen.getByRole('button', { name: /Importar 1 zona/ }));

        await waitFor(() => expect(confirmar).toHaveBeenCalled());
        expect(svc.importZonesToEmpreendimento).not.toHaveBeenCalled();
        expect(empSvc.deleteRegulatoryZones).not.toHaveBeenCalled();
    });

    it('sem substituir: acrescenta depois das atuais', async () => {
        abrir(['velha-1', 'velha-2']);
        await ateAsZonas();
        fireEvent.click(caixa(/ZM 4/));
        fireEvent.click(screen.getByRole('button', { name: /Importar 1 zona/ }));

        await waitFor(() => expect(onImported).toHaveBeenCalled());
        expect(svc.importZonesToEmpreendimento.mock.calls[0][0].sortOrderOffset).toBe(2);
        expect(empSvc.deleteRegulatoryZones).not.toHaveBeenCalled();
        expect(confirmar).not.toHaveBeenCalled();
    });
});
