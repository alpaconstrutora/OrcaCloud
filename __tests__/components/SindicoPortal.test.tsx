// @vitest-environment jsdom
/**
 * Portal do Síndico (20/10/2026, docs/planos/2026-10-20-portal-do-sindico.md).
 *
 * O que fica travado:
 *  1. a casca carrega pela identidade certa (token no link/login, clientId na
 *     prévia do admin) e mostra o prédio;
 *  2. a prévia diz que é somente leitura;
 *  3. a aba Unidades mostra o contato dos ocupantes e a situação da cota —
 *     inclusive "Não cobrada" para cota sem título (nunca "em aberto");
 *  4. acesso recusado mostra o motivo do banco (ex.: mandato não vigente).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDados = vi.fn();
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: {
        getDados: (...a: unknown[]) => getDados(...a),
        abrirDocumento: vi.fn(),
        comprovantesDoRateio: vi.fn(),
    },
}));

import SindicoPortal from '../../components/sindico/SindicoPortal';
// Na app o provedor vive na raiz (index.tsx); a casca do portal fica dentro dele.
import { ConfirmProvider } from '../../components/ui/confirm';

const payload = {
    ok: true,
    sindico: { clientId: 's1', nome: 'Maria Síndica', email: 'maria@x.com' },
    condominios: [{ id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: null, razaoSocial: null, cidade: 'Uberaba', mandatoInicio: null, mandatoFim: null }],
    unidades: [{
        unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pavimento: 2, tipologia: 'Sala',
        areaPrivativa: 17, fracaoIdeal: null, fracaoOrigem: null, papeis: [],
        condominioId: 'c1', condominioCode: '010', condominioNome: '010 - Galeria Altavista', condominioCnpj: null,
        ocupacoes: [{ papel: 'INQUILINO', nome: 'João Inquilino', clientId: 'p1', email: 'joao@x.com', telefone: '34 9999-0000', desde: null }],
    }],
    avisos: [], documentos: [], manutencao: [], ordens: [], ativos: [],
    rateios: [{
        id: 'r1', numero: 'RAT-1', competencia: '2026-09-01', tipo: 'ORDINARIO', criterio: 'AREA_PRIVATIVA',
        status: 'FECHADO', totalDespesas: 1000, totalRateado: 1000, fechadoEm: '2026-09-30', condominioId: 'c1',
        condominioNome: '010 - Galeria Altavista', despesas: [],
        cotas: [{ id: 'i1', unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pessoa: 'João Inquilino', peso: 1, valor: 250, ajusteManual: false, minha: false, tituloStatus: null, tituloNegocio: null, vencimento: null, pagoEm: null }],
    }],
};

describe('SindicoPortal', () => {
    beforeEach(() => { getDados.mockReset(); localStorage.clear(); });

    it('1–2. prévia por clientId: carrega o prédio e avisa que é somente leitura', async () => {
        getDados.mockResolvedValue(payload);
        render(<ConfirmProvider><SindicoPortal clientId="s1" somenteLeitura embutido /></ConfirmProvider>);
        expect(await screen.findByText(/somente leitura, nada é gravado/)).toBeTruthy();
        expect(getDados).toHaveBeenCalledWith({ clientId: 's1' });
        expect((await screen.findAllByText('010 - Galeria Altavista')).length).toBeGreaterThan(0);
    });

    it('3. Unidades: contato do ocupante e cota sem título = Não cobrada', async () => {
        getDados.mockResolvedValue(payload);
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        expect(getDados).toHaveBeenCalledWith({ token: 'tok' });
        fireEvent.click(screen.getAllByRole('button', { name: /Unidades/ })[0]);
        expect(await screen.findByText('joao@x.com')).toBeTruthy();
        expect(screen.getByText('34 9999-0000')).toBeTruthy();
        expect(screen.getByText('Não cobrada')).toBeTruthy();
        expect(screen.queryByText('Em aberto')).toBeNull();
    });

    it('5. prévia do admin não oferece ação (publicar, responder)', async () => {
        getDados.mockResolvedValue({ ...payload, chamados: [{
            id: 'ch1', titulo: 'Vazamento', descricao: null, categoria: 'Hidráulica', prioridade: 'Alta', status: 'Aberto',
            abertoEm: '2026-10-01', resolvidoEm: null, notaDaEquipe: null, unitId: 'u1', unidade: 'Sala - 201', torre: null,
            morador: 'João Inquilino', moradorEmail: null, moradorTelefone: null, condominioId: 'c1', condominioNome: '010', eventos: [],
        }] });
        render(<ConfirmProvider><SindicoPortal clientId="s1" somenteLeitura embutido /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /Avisos/ })[0]);
        await screen.findByText('Avisos do condomínio');
        expect(screen.queryByRole('button', { name: /Publicar aviso/ })).toBeNull();
        fireEvent.click(screen.getAllByRole('button', { name: /Chamados/ })[0]);
        expect(await screen.findByText('Vazamento')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Ver' })).toBeTruthy();
    });

    it('6. aprovar o rateio: só com login (pelo link o botão diz o caminho)', async () => {
        const comRascunho = { ...payload, rateios: [{ ...payload.rateios[0], status: 'RASCUNHO', aprovacao: { status: null, em: null, porNome: null, observacao: null, desatualizada: false } }] };
        getDados.mockResolvedValue(comRascunho);
        const { unmount } = render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /Prestação de contas/ })[0]);
        const aprovarLink = await screen.findByRole('button', { name: /Aprovar/ });
        expect((aprovarLink as HTMLButtonElement).disabled).toBe(true);
        expect(aprovarLink.getAttribute('title')).toMatch(/e-mail e senha/);
        unmount();

        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        const aprovarLogin = await screen.findByRole('button', { name: /Aprovar/ });
        expect((aprovarLogin as HTMLButtonElement).disabled).toBe(false);
    });

    it('4. acesso recusado mostra o motivo do banco', async () => {
        getDados.mockResolvedValue({ ok: false, motivo: 'Seu mandato de síndico não está vigente em nenhum condomínio.' });
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await waitFor(() => expect(screen.getByText(/mandato de síndico não está vigente/)).toBeTruthy());
    });
});
