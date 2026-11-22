// @vitest-environment jsdom
/**
 * Book e Data Room no lado INTERNO — CreditRoomDetail.
 *
 * O que estes testes protegem:
 *  - "Baixar book" gera o book da VERSÃO NA TELA (a prévia de hoje, ou a liberada escolhida no seletor),
 *    SEM marca d'água de credor (é a própria empresa) e NÃO registra DOWNLOAD na trilha do credor;
 *  - sem prévia pronta nem versão liberada o botão desliga e diz o motivo (calculando / erro);
 *  - "Sugerir documentos" também lê a versão na tela (a prévia), e desliga dizendo o motivo;
 *  - o Data Room mostra a coluna "Empresa" só quando o room é de GRUPO.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { baixar, documentosDoIndice, listVersions, listDocuments, log, prepararVersao, sugerirProps } = vi.hoisted(() => ({
    sugerirProps: vi.fn(),
    baixar: vi.fn(),
    documentosDoIndice: vi.fn(),
    listVersions: vi.fn(),
    listDocuments: vi.fn(),
    log: vi.fn(),
    prepararVersao: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/creditRoomBookService', () => ({
    creditRoomBookService: { baixar, documentosDoIndice },
}));
vi.mock('../services/creditRoomService', () => ({
    creditRoomService: { listVersions, listDocuments, log, prepararVersao },
}));

// O painel de sugestões tem teste próprio: aqui só interessa QUAL versão ele recebe.
vi.mock('../components/credit/CreditRoomSugerirDocumentos', () => ({
    default: (props: { open: boolean; versao: { id: string } }) => { sugerirProps(props); return null; },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import CreditRoomDetail from '../components/credit/CreditRoomDetail';
import type { CreditRoom, CreditRoomDocument, CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators } from '../utils/creditRoomSnapshot';
import { hojeLocalISO } from '../utils/periodoControladoria';

const versao = (): CreditRoomVersion => {
    const snapshot = buildSnapshot({
        dataBase: '2026-09-07',
        operacao: {
            requestedAmount: 5_000_000, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        escopo: {
            fonte: 'creditRoom', data_base: '2026-09-07', tipo: 'GRUPO',
            organizacoes: [{ id: 'o1', nome: 'Alfa Construtora', cnpj: null }],
        },
    } as Parameters<typeof buildSnapshot>[0]);
    return {
        id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, dataBase: '2026-09-07',
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [], frozenAt: '2026-09-07T12:00:00Z',
    };
};

/** O que `prepararVersao` devolve: a prévia de hoje (mesmo cadastro da versão liberada). */
const preparada = () => {
    const v = versao();
    return { roomId: 'r1', dataBase: hojeLocalISO(), snapshot: v.snapshot, indicators: v.indicators, servicoNovoSimulado: true };
};

const sala = (over: Partial<CreditRoom> = {}) =>
    ({ id: 'r1', code: 'CR-1', name: 'Operação', status: 'ENVIADA', escopo: 'EMPRESA', activeVersionId: 'v1', ...over }) as unknown as CreditRoom;

const DOCUMENTO = {
    shareId: 's1', documentId: 'd1', nome: 'Matrícula.pdf', categoria: 'juridico', tipoDocumento: 'matricula',
    organizationId: 'o1', sharedAt: '2026-09-08T00:00:00Z', storagePath: 'x/y.pdf', dataValidade: null,
} as unknown as CreditRoomDocument;

const abrir = (room: CreditRoom, aba: 'visao' | 'dataroom' | 'participantes' = 'visao') => {
    // A aba é lembrada por sala no localStorage (usePersistedState).
    localStorage.setItem(`creditRoom:${room.id}:aba`, JSON.stringify(aba));
    return render(
        <ConfirmProvider>
            <CreditRoomDetail room={room} onBack={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />
        </ConfirmProvider>,
    );
};

const botaoBook = () => screen.getByRole('button', { name: /Baixar book/ });
const botaoSugerir = () => screen.getByRole('button', { name: /Sugerir documentos/ });

beforeEach(() => {
    localStorage.clear();
    for (const f of [baixar, documentosDoIndice, listVersions, listDocuments, log, prepararVersao, sugerirProps]) f.mockReset();
    prepararVersao.mockResolvedValue(preparada());
    baixar.mockResolvedValue(undefined);
    documentosDoIndice.mockReturnValue([]);
    listVersions.mockResolvedValue([versao()]);
    listDocuments.mockResolvedValue([DOCUMENTO]);
    log.mockResolvedValue(undefined);
});

describe('CreditRoomDetail — book e Data Room internos', () => {
    it('com a prévia na tela, "Baixar book" gera o book da PRÉVIA, sem marca de credor e sem DOWNLOAD no log', async () => {
        abrir(sala());
        await waitFor(() => expect(botaoBook()).toBeEnabled());
        expect(botaoBook().parentElement?.getAttribute('title')).toMatch(/prévia de hoje/);
        fireEvent.click(botaoBook());

        await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
        const [salaChamada, versaoChamada, opcoes] = baixar.mock.calls[0];
        expect(salaChamada.id).toBe('r1');
        expect(versaoChamada.id).toBe('previa');
        expect(versaoChamada.versionNo).toBe(0);
        expect(versaoChamada.dataBase).toBe(hojeLocalISO());
        expect(opcoes).not.toHaveProperty('marcaDagua');
        expect(documentosDoIndice).toHaveBeenCalledWith([DOCUMENTO], versaoChamada);
        await waitFor(() => expect(screen.getByRole('button', { name: /Baixar book/ })).toBeEnabled());
        expect(log).not.toHaveBeenCalled();
    });

    it('numa aba que não calcula a prévia, o clique em "Baixar book" calcula na hora e gera o book da prévia', async () => {
        abrir(sala(), 'participantes');
        await waitFor(() => expect(listVersions).toHaveBeenCalled());
        expect(prepararVersao).not.toHaveBeenCalled();
        expect(botaoBook()).toBeEnabled();
        fireEvent.click(botaoBook());

        await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
        expect(prepararVersao).toHaveBeenCalledTimes(1);
        expect(baixar.mock.calls[0][1].id).toBe('previa');
    });

    it('com uma versão liberada escolhida no seletor, o book é o dela (como sempre)', async () => {
        abrir(sala());
        await waitFor(() => expect(botaoBook()).toBeEnabled());
        await waitFor(() => expect(screen.getByRole('option', { name: /V1 — liberada em/ })).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Visão exibida'), { target: { value: 'v1' } });
        expect(botaoBook()).toBeEnabled();
        fireEvent.click(botaoBook());

        await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
        const [, versaoChamada, opcoes] = baixar.mock.calls[0];
        expect(versaoChamada.id).toBe('v1');
        expect(versaoChamada.versionNo).toBe(1);
        expect(opcoes).not.toHaveProperty('marcaDagua');
        expect(log).not.toHaveBeenCalled();
    });

    it('sem prévia pronta nem versão liberada o botão desliga e diz o motivo (calculando)', async () => {
        listVersions.mockResolvedValue([]);
        prepararVersao.mockReturnValue(new Promise(() => undefined));
        abrir(sala({ activeVersionId: undefined } as Partial<CreditRoom>));
        await waitFor(() => expect(listVersions).toHaveBeenCalled());
        expect(botaoBook()).toBeDisabled();
        expect(botaoBook().parentElement).toHaveAttribute('title', 'Calculando a prévia…');
        fireEvent.click(botaoBook());
        expect(baixar).not.toHaveBeenCalled();
    });

    it('prévia com erro: o botão desliga e mostra o motivo, sem gerar book', async () => {
        listVersions.mockResolvedValue([]);
        prepararVersao.mockRejectedValue(new Error('Você não é membro de todas as empresas do grupo.'));
        abrir(sala({ activeVersionId: undefined } as Partial<CreditRoom>));
        await waitFor(() => expect(botaoBook().parentElement).toHaveAttribute('title', 'Você não é membro de todas as empresas do grupo.'));
        expect(botaoBook()).toBeDisabled();
        expect(baixar).not.toHaveBeenCalled();
    });

    it('prévia com erro e uma versão liberada: o motivo aponta o seletor (V{n})', async () => {
        prepararVersao.mockRejectedValue(new Error('Falha ao calcular.'));
        abrir(sala());
        await waitFor(() => expect(botaoBook().parentElement).toHaveAttribute('title', 'Falha ao calcular. — ou escolha a V1 no seletor (aba Visão)'));
        expect(botaoBook()).toBeDisabled();
    });

    it('numa aba que não calcula a prévia, o erro da prévia NÃO trava o book: o botão segue ligado e o clique tenta de novo', async () => {
        prepararVersao.mockRejectedValueOnce(new Error('Rede caiu.'));
        abrir(sala(), 'participantes');
        await waitFor(() => expect(listVersions).toHaveBeenCalled());
        expect(botaoBook()).toBeEnabled();
        fireEvent.click(botaoBook());

        expect((await screen.findAllByText('Rede caiu.'))[0]).toBeInTheDocument();
        expect(baixar).not.toHaveBeenCalled();
        // Com erro a prévia vale "nenhuma": o botão não desliga (nem fica preso no erro) e o novo clique recalcula.
        expect(botaoBook()).toBeEnabled();
        fireEvent.click(botaoBook());
        await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
        expect(prepararVersao).toHaveBeenCalledTimes(2);
        expect(baixar.mock.calls[0][1].id).toBe('previa');
    });

    it('prévia de OUTRO dia numa aba que não a calcula: o botão não fica preso em "Calculando…" — o clique recalcula para hoje', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(new Date('2026-11-22T12:00:00'));
            prepararVersao.mockImplementation(async (_r: unknown, dataBase: string) => ({ ...preparada(), dataBase }));
            abrir(sala());
            await waitFor(() => expect(botaoBook()).toBeEnabled());
            expect(prepararVersao).toHaveBeenCalledTimes(1);

            // Virou o dia com a aba aberta; a aba "Participantes" não recalcula sozinha.
            vi.setSystemTime(new Date('2026-11-23T12:00:00'));
            fireEvent.click(screen.getByRole('tab', { name: /^Participantes/ }));
            await waitFor(() => expect(listVersions).toHaveBeenCalled());
            expect(botaoBook()).toBeEnabled();
            expect(botaoBook().parentElement?.getAttribute('title') ?? '').not.toBe('Calculando a prévia…');
            expect(prepararVersao).toHaveBeenCalledTimes(1);

            fireEvent.click(botaoBook());
            await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
            expect(prepararVersao).toHaveBeenCalledTimes(2);
            expect(prepararVersao.mock.calls[1][1]).toBe('2026-11-23');
            expect(baixar.mock.calls[0][1].dataBase).toBe('2026-11-23');
        } finally {
            vi.useRealTimers();
        }
    });

    it('cálculo sob demanda superado (o cadastro mudou no meio): avisa em vez de não fazer nada', async () => {
        let resolver!: (p: ReturnType<typeof preparada>) => void;
        prepararVersao.mockReturnValueOnce(new Promise(r => { resolver = r; }));
        const r = sala();
        const ui = (room: CreditRoom) => (
            <ConfirmProvider>
                <CreditRoomDetail room={room} onBack={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />
            </ConfirmProvider>
        );
        localStorage.setItem(`creditRoom:${r.id}:aba`, JSON.stringify('participantes'));
        const { rerender } = render(ui(r));
        await waitFor(() => expect(listVersions).toHaveBeenCalled());
        fireEvent.click(botaoBook());
        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(1));

        // Cadastro salvo: o room novo invalida a prévia que estava sendo calculada.
        rerender(ui({ ...r, name: 'Operação (editada)' } as CreditRoom));
        resolver(preparada());

        expect(await screen.findByText('O cadastro mudou enquanto a prévia era calculada — clique de novo.')).toBeInTheDocument();
        expect(baixar).not.toHaveBeenCalled();
        await waitFor(() => expect(botaoBook()).toBeEnabled());
    });

    it('Data Room: a coluna "Empresa" usa a versão NA TELA (a prévia), não a ativa', async () => {
        // A ativa (V1) conhece só a Alfa; a prévia de hoje traz também a Beta.
        const previaComBeta = preparada();
        previaComBeta.snapshot = {
            ...previaComBeta.snapshot,
            escopo: { ...previaComBeta.snapshot.escopo!, organizacoes: [{ id: 'o1', nome: 'Alfa Construtora', cnpj: null }, { id: 'o2', nome: 'Beta Locações', cnpj: null }] },
        };
        prepararVersao.mockResolvedValue(previaComBeta);
        listDocuments.mockResolvedValue([{ ...DOCUMENTO, organizationId: 'o2' }]);
        abrir(sala({ escopo: 'GRUPO' }), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        expect(await screen.findByText('Beta Locações')).toBeInTheDocument();
    });

    it('Data Room: "Sugerir documentos" liga com a prévia pronta e entrega a PRÉVIA ao painel', async () => {
        abrir(sala(), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        await waitFor(() => expect(botaoSugerir()).toBeEnabled());
        expect(prepararVersao).toHaveBeenCalledTimes(1);
        const ultimo = sugerirProps.mock.calls.at(-1)![0];
        expect(ultimo.versao.id).toBe('previa');
        expect(ultimo.open).toBe(false);
        fireEvent.click(botaoSugerir());
        expect(sugerirProps.mock.calls.at(-1)![0].open).toBe(true);
    });

    it('Data Room: sem prévia nem versão liberada, "Sugerir documentos" desliga e diz o motivo', async () => {
        listVersions.mockResolvedValue([]);
        prepararVersao.mockReturnValue(new Promise(() => undefined));
        abrir(sala({ activeVersionId: undefined } as Partial<CreditRoom>), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        expect(botaoSugerir()).toBeDisabled();
        expect(botaoSugerir().parentElement).toHaveAttribute('title', 'Calculando a prévia…');
        expect(sugerirProps).not.toHaveBeenCalled();
    });

    it('Data Room: a coluna "Empresa" só existe quando o room é de GRUPO', async () => {
        const { unmount } = abrir(sala({ escopo: 'GRUPO' }), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Empresa' })).toBeInTheDocument());
        expect(screen.getByText('Alfa Construtora')).toBeInTheDocument();
        unmount();

        abrir(sala({ escopo: 'EMPRESA' }), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        expect(screen.queryByRole('columnheader', { name: 'Empresa' })).toBeNull();
    });
});
