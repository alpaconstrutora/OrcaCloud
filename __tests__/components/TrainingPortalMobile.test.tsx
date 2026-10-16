// @vitest-environment jsdom
/**
 * Portal de Treinamentos no celular (16/10/2026).
 * Plano: docs/planos/2026-10-16-portal-treinamentos-mobile.md
 *
 * Com dados falsos nas RPCs do treinando, a casca mobile:
 *   1. mostra a barra inferior com as quatro seções e a organização no cabeçalho;
 *   2. Certificados vira cartão (número, curso, validade, situação, PDF + Validação) — sem tabela;
 *   3. Histórico vira cartão (origem, nota, situação) — sem tabela;
 *   4. a folha de conta abre e leva a "Meus dados";
 *   5. em modo prévia desenha a barra de status falsa; no aparelho, não;
 *   6. "ver como" (prévia do gestor, 16/10): leituras com o alvo, chaves de cache separadas de 'eu',
 *      faixa "nada é gravado", "Inscrever-se" desligado dizendo por quê, ajuda em modoPrevia sem tourKey.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    AcademyPortalIdentity, AcademyTraineeCatalogItem, AcademyTraineeCertificate, AcademyTraineeEnrollment, AcademyTraineeHistoryItem,
} from '../../types/academy';
import { academyKeys } from '../../lib/queryKeys';

const propsDaAjuda = vi.hoisted(() => ({ ultima: null as Record<string, unknown> | null }));

const identidade: AcademyPortalIdentity = {
    portal_user_id: 'pu-1', org_id: 'org-1', org_nome: 'Alpa Construtora', name: 'Altair Prosa',
    email: 'altair@exemplo.com', tipo: 'TERCEIRO', employee_id: 'emp-1',
};
const matricula: AcademyTraineeEnrollment = {
    id: 'm-1', course_id: 'c-1', curso: 'NR-18', nr_referencia: 'NR-18', version_id: 'v-1', versao: 1,
    status: 'EM_ANDAMENTO', origem: 'ATRIBUICAO', percentual: 40, carga_horaria: 8, org_id: 'org-1', org_nome: 'Alpa Construtora',
};
const certificado: AcademyTraineeCertificate = {
    id: 'cert-1', enrollment_id: 'm-1', numero: 'CERT-2026-0007', codigo_validacao: 'abc123',
    emitido_em: '2026-10-01T12:00:00Z', carga_horaria: 8, data_conclusao: '2026-10-01', data_validade: '2028-10-01',
    tem_pdf: true, curso: 'NR-18', nr_referencia: 'NR-18', versao: 1, org_id: 'org-1', org_nome: 'Alpa Construtora',
};
const cursoAberto: AcademyTraineeCatalogItem = {
    id: 'c-9', nome: 'NR-35 Trabalho em altura', versao: 1, version_id: 'v-9', org_id: 'org-1', org_nome: 'Alpa Construtora',
    ja_matriculado: false,
};
const historico: AcademyTraineeHistoryItem = {
    id: 'h-1', course_id: 'c-2', course_nome: 'Integração de segurança', origem: 'MANUAL', data_realizacao: '2026-03-10',
    data_validade: '2027-03-10', status: 'ATIVO', nota: 9, aprovado: true, tem_certificado_arquivo: false,
    org_id: 'org-1', org_nome: 'Alpa Construtora',
};

vi.mock('../../services/academyTraineeService', () => ({
    academyTraineeService: {
        myAccess: vi.fn(async () => [identidade]),
        listEnrollments: vi.fn(async () => [matricula]),
        listCertificates: vi.fn(async () => [certificado]),
        listHistory: vi.fn(async () => [historico]),
        listCatalog: vi.fn(async () => [cursoAberto]),
        enroll: vi.fn(),
        getMediaUrl: vi.fn(async () => 'https://exemplo/pdf'),
    },
}));
vi.mock('../../components/portal/PortalHelp', () => ({
    PortalHelp: (props: Record<string, unknown>) => { propsDaAjuda.ultima = props; return null; },
}));
vi.mock('../../components/academy/AcademyPlayerView', () => ({ default: () => <div>player</div> }));
vi.mock('../../components/academy/academyChannel', () => ({ createTraineeChannel: () => ({}), createTraineePreviewChannel: () => ({}) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import TrainingPortalMobile from '../../components/training/TrainingPortalMobile';
import { academyTraineeService } from '../../services/academyTraineeService';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = (previa = false, verComo: string | null = null) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const r = render(
        <QueryClientProvider client={qc}>
            <ConfirmProvider>
                <TrainingPortalMobile userEmail="gestor@exemplo.com" onLogout={verComo ? undefined : () => {}} previa={previa} verComo={verComo} />
            </ConfirmProvider>
        </QueryClientProvider>,
    );
    return { ...r, qc };
};

describe('TrainingPortalMobile', () => {
    beforeEach(() => { localStorage.clear(); });

    it('mostra a organização no cabeçalho e as quatro seções na barra inferior', async () => {
        montar();
        expect(await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' })).toBeInTheDocument();
        const nav = screen.getByRole('navigation', { name: 'Seções do portal' });
        expect(within(nav).getAllByRole('button')).toHaveLength(4);
        expect(within(nav).getByRole('button', { name: /treinamentos/i })).toHaveAttribute('aria-current', 'page');
        // a matrícula aparece como cartão com o botão de continuar
        expect(await screen.findByRole('button', { name: /Continuar/ })).toBeInTheDocument();
    });

    it('Certificados vira cartão com PDF e Validação, sem tabela', async () => {
        montar();
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        await userEvent.click(screen.getByRole('button', { name: /certificados/i }));
        expect(await screen.findByText('CERT-2026-0007')).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getByText('01/10/2028')).toBeInTheDocument();
        expect(screen.getByText('Válido')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /PDF/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Validação/ })).toBeInTheDocument();
    });

    it('Histórico vira cartão com origem, nota e situação, sem tabela', async () => {
        montar();
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        await userEvent.click(screen.getByRole('button', { name: /histórico/i }));
        expect(await screen.findByText('Integração de segurança')).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getByText('Presencial')).toBeInTheDocument();
        expect(screen.getByText('9')).toBeInTheDocument();
        expect(screen.getByText('Válido')).toBeInTheDocument();
    });

    it('a folha de conta abre e leva a Meus dados', async () => {
        montar();
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        await userEvent.click(screen.getByRole('button', { name: 'Abrir minha conta' }));
        const folha = screen.getByRole('dialog', { name: 'Minha conta' });
        expect(within(folha).getByText('Altair Prosa')).toBeInTheDocument();
        expect(within(folha).getByRole('button', { name: /Sair/ })).toBeInTheDocument();
        await userEvent.click(within(folha).getByRole('button', { name: /Meus dados/ }));
        expect(screen.queryByRole('dialog', { name: 'Minha conta' })).toBeNull();
        expect(await screen.findByText('Cadastro mantido pela empresa. Para alterar, fale com o RH.')).toBeInTheDocument();
    });

    it('"ver como": lê com o alvo, cache separado, nada é gravado, inscrição desligada com motivo', async () => {
        const { qc } = montar(false, 'pu-9');
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        expect(academyTraineeService.myAccess).toHaveBeenCalledWith('pu-9');
        expect(academyTraineeService.listEnrollments).toHaveBeenCalledWith('pu-9');
        expect(screen.getByRole('note')).toHaveTextContent('Prévia — vendo como Altair Prosa. Nada é gravado.');
        // chaves da prévia são outras — Meus Treinamentos do gestor ('eu') fica intocado
        expect(qc.getQueryData(academyKeys.traineeEnrollments('pu-9'))).toEqual([matricula]);
        expect(qc.getQueryData(academyKeys.traineeEnrollments())).toBeUndefined();
        // implica prévia: barra de status falsa; ajuda em modo prévia sem tourKey
        expect(screen.getByRole('heading', { level: 1 }).closest('[data-modo]')?.getAttribute('data-modo')).toBe('previa');
        expect(propsDaAjuda.ultima).toMatchObject({ modoPrevia: true, tourKey: null, autoTour: false });
        // sem "Sair" na conta
        await userEvent.click(screen.getByRole('button', { name: 'Abrir minha conta' }));
        expect(within(screen.getByRole('dialog', { name: 'Minha conta' })).queryByRole('button', { name: /Sair/ })).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
        // catálogo: botão desligado diz por quê
        await userEvent.click(screen.getByRole('button', { name: /catálogo/i }));
        expect(academyTraineeService.listCatalog).toHaveBeenCalledWith('pu-9');
        const inscrever = await screen.findByRole('button', { name: /Inscrever-se/ });
        expect(inscrever).toBeDisabled();
        expect(inscrever).toHaveAttribute('title', 'Na prévia a inscrição não é feita');
    });

    it('sem "ver como" as leituras não levam alvo e a inscrição fica ligada', async () => {
        montar();
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        expect(academyTraineeService.myAccess).toHaveBeenLastCalledWith(null);
        expect(screen.queryByRole('note')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: /catálogo/i }));
        expect(await screen.findByRole('button', { name: /Inscrever-se/ })).toBeEnabled();
    });

    it('barra de status falsa só na prévia', async () => {
        const { container, unmount } = montar(true);
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        expect(container.firstElementChild?.getAttribute('data-modo')).toBe('previa');
        expect(container.querySelector('.h-dvh, .supports-\\[height\\:100dvh\\]\\:h-dvh')).toBeNull();
        unmount();
        const { container: c2 } = montar(false);
        await screen.findByRole('heading', { level: 1, name: 'Alpa Construtora' });
        expect(c2.firstElementChild?.getAttribute('data-modo')).toBe('aparelho');
        expect(c2.firstElementChild?.className).toContain('h-dvh');
    });
});
