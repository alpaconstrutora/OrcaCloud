import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Importar Marcas e Modelos de planilha — docs/planos/2026-10-13-marcas-e-modelos.md (Fase 3)
 *
 * O que trava:
 *   1. o destino é resolveWriteOrg('all-allowed') (REGRA #5) e a prévia é
 *      calculada contra o catálogo DESSA organização;
 *   2. em "Todas" mantendo todas, a planilha é aplicada em cada org e a prévia
 *      diz "Varia" quando a ação muda entre elas;
 *   3. nada grava antes de clicar em Importar; o botão desligado diz o motivo;
 *   4. arquivo que não é .xlsx não é lido.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { LinhaLida } from '../../utils/catalogoPlanilha';

const resolveWriteOrg = vi.fn();
vi.mock('../../hooks/useOrgContext', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../hooks/useOrgContext')>();
    return { ...mod, useOrgWriteTarget: () => ({ resolveWriteOrg, orgTargetModal: null }) };
});
const lerPlanilhaCatalogo = vi.fn();
vi.mock('../../utils/catalogoPlanilhaExcel', () => ({
    lerPlanilhaCatalogo: (...a: unknown[]) => lerPlanilhaCatalogo(...a),
    gerarPlanilhaCatalogo: vi.fn(async () => new Blob(['x'])),
}));
const aplicarImportacao = vi.fn();
vi.mock('../../services/brandModelService', () => ({
    brandModelService: { aplicarImportacao: (...a: unknown[]) => aplicarImportacao(...a) },
}));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { BrandModelImportSheet } from '../../components/settings/BrandModelImportSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const marca = (id: string, org: string, name: string) => ({ id, organization_id: org, name, is_active: true, created_at: '', updated_at: '' });
const BRANDS = [marca('b1', 'org-a', 'WEG')];   // WEG só existe na Alpa
const linha = (numero: number, marcaNome: string, modelo?: string, erros: string[] = []): LinhaLida => ({ numero, marca: marcaNome, modelo, erros });
const ORGS: Record<string, string> = { 'org-a': 'Alpa', 'org-b': 'Beta' };

const montar = (onImported = vi.fn()) => {
    render(<ConfirmProvider><BrandModelImportSheet open onClose={vi.fn()} brands={BRANDS} models={[]} orgName={id => ORGS[id]} onImported={onImported} /></ConfirmProvider>);
    return onImported;
};
const xlsx = () => new File(['x'], 'catalogo.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    lerPlanilhaCatalogo.mockResolvedValue({ linhas: [linha(2, 'weg'), linha(3, 'Daikin', 'FTX'), linha(4, '', 'X', ['Marca em branco — todo modelo pertence a uma marca.'])] });
    aplicarImportacao.mockResolvedValue({ gravadas: 1, erros: [] });
});

describe('Importar marcas e modelos', () => {
    it('org do topo: prévia contra o catálogo dela; só grava ao clicar em Importar', async () => {
        resolveWriteOrg.mockResolvedValue({ kind: 'org', orgId: 'org-a' });
        const onImported = montar();
        await userEvent.upload(screen.getByLabelText('Planilha de marcas e modelos'), xlsx());

        expect(await screen.findByText('Prévia — 3 linhas')).toBeInTheDocument();
        expect(resolveWriteOrg).toHaveBeenCalledWith('all-allowed');
        const tabela = screen.getByRole('table');
        expect(within(tabela).getByText('Sem mudança')).toBeInTheDocument();          // "weg" = WEG existente
        expect(within(tabela).getByText('Nova marca e modelo')).toBeInTheDocument();  // Daikin
        expect(within(tabela).getByText('Erro')).toBeInTheDocument();
        expect(aplicarImportacao).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Importar 1 linha' }));
        await waitFor(() => expect(aplicarImportacao).toHaveBeenCalledTimes(1));
        expect(aplicarImportacao.mock.calls[0][0]).toBe('org-a');
        expect(await screen.findByText('1 linha gravada.')).toBeInTheDocument();
        expect(onImported).toHaveBeenCalled();
    });

    it('"Todas" mantido: aplica em cada org e a prévia diz "Varia" quando muda entre elas', async () => {
        resolveWriteOrg.mockResolvedValue({ kind: 'all', orgIds: ['org-a', 'org-b'] });
        montar();
        await userEvent.upload(screen.getByLabelText('Planilha de marcas e modelos'), xlsx());
        expect(await screen.findByText('Destino: 2 organizações (Alpa, Beta).')).toBeInTheDocument();
        const tabela = screen.getByRole('table');
        expect(within(tabela).getByText('Varia')).toBeInTheDocument();   // WEG: existe na Alpa, nova na Beta

        await userEvent.click(screen.getByRole('button', { name: /Importar 3 linhas/ }));
        await waitFor(() => expect(aplicarImportacao).toHaveBeenCalledTimes(2));
        expect(aplicarImportacao.mock.calls.map(c => c[0])).toEqual(['org-a', 'org-b']);
    });

    it('só erros / sem mudança: botão desligado dizendo por quê', async () => {
        resolveWriteOrg.mockResolvedValue({ kind: 'org', orgId: 'org-a' });
        lerPlanilhaCatalogo.mockResolvedValue({ linhas: [linha(2, 'WEG')] });
        montar();
        await userEvent.upload(screen.getByLabelText('Planilha de marcas e modelos'), xlsx());
        const botao = await screen.findByRole('button', { name: 'Importar 0 linhas' });
        expect(botao).toBeDisabled();
        expect(botao).toHaveAttribute('title', 'Nenhuma linha grava algo (só erros ou sem mudança)');
    });

    it('antes do arquivo, o botão diz que falta a planilha', () => {
        montar();
        expect(screen.getByRole('button', { name: 'Importar 0 linhas' })).toHaveAttribute('title', 'Escolha a planilha primeiro');
    });

    it('arquivo que não é .xlsx não é lido', async () => {
        montar();
        await userEvent.upload(screen.getByLabelText('Planilha de marcas e modelos'), new File(['a;b'], 'lista.csv', { type: 'text/csv' }), { applyAccept: false });
        expect(await screen.findByText('Escolha um arquivo Excel (.xlsx).')).toBeInTheDocument();
        expect(lerPlanilhaCatalogo).not.toHaveBeenCalled();
    });
});
