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
 *   5. em modo prévia desenha a barra de status falsa; no aparelho, não.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    AcademyPortalIdentity, AcademyTraineeCertificate, AcademyTraineeEnrollment, AcademyTraineeHistoryItem,
} from '../../types/academy';

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
        listCatalog: vi.fn(async () => []),
        enroll: vi.fn(),
        getMediaUrl: vi.fn(async () => 'https://exemplo/pdf'),
    },
}));
vi.mock('../../components/portal/PortalHelp', () => ({ PortalHelp: () => null }));
vi.mock('../../components/academy/AcademyPlayerView', () => ({ default: () => <div>player</div> }));
vi.mock('../../components/academy/academyChannel', () => ({ createTraineeChannel: () => ({}) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import TrainingPortalMobile from '../../components/training/TrainingPortalMobile';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = (previa = false) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <ConfirmProvider>
                <TrainingPortalMobile userEmail="altair@exemplo.com" onLogout={() => {}} previa={previa} />
            </ConfirmProvider>
        </QueryClientProvider>,
    );
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
