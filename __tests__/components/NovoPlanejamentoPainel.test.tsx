// @vitest-environment jsdom
/**
 * "Novo planejamento" = painel único com 3 origens (2ª crítica de Engenharia › Planejamento,
 * publicação 2 de docs/planos/2026-11-15-planejamento-lista-critica-2.md). Antes havia duas portas:
 * o modal central (orçamento escondido na 2ª aba, "Criar" ligado com tudo vazio) e o painel de
 * importação. Também: "Importar datas" diz o bloqueio do What-If ao abrir, não no clique final.
 */
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConfirmProvider } from '../../components/ui/confirm';

vi.mock('../../services/projectService', () => ({
    projectService: {
        listProjects: vi.fn().mockResolvedValue([]),
        getOrderCounts: vi.fn().mockResolvedValue({}),
        deleteProject: vi.fn(),
        loadProject: vi.fn().mockResolvedValue(null),
    },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { mapObrasToEmpreendimentos: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../components/ExcelImportModal', () => ({ default: () => null }));
vi.mock('../../hooks/useIndicadoresDosPlanejamentos', () => ({
    useIndicadoresDosPlanejamentos: () => ({ porProjeto: {}, estado: 'pronto', tentarDeNovo: vi.fn() }),
}));

import ProjectList from '../../components/ProjectList';
import ImportarCronogramaSheet from '../../components/ImportarCronogramaSheet';
import { herdadoDoOrcamento, settingsDaCopia } from '../../services/importarCronogramaService';

const PROJETOS = [
    { id: 'orc1', name: 'Igreja Divino', code: '003', created_at: '2026-01-01', updated_at: '2026-01-01', settings: { classification: 'ORCAMENTO' } },
    { id: 'pl1', name: 'Divino Espirito Santo', code: '001', created_at: '2026-01-01', updated_at: '2026-01-01', settings: { classification: 'PLANEJAMENTO', code: '001', linkedProjectId: 'orc1' } },
];

const montarLista = async () => {
    const props = {
        onLoadProject: vi.fn(), onEditProject: vi.fn(), onNewProject: vi.fn(), onDuplicateProject: vi.fn(),
        onImportProject: vi.fn(), onExportProject: vi.fn(), onRowClick: vi.fn(),
    };
    render(
        <ConfirmProvider>
            <ProjectList {...props} projects={PROJETOS} classificationFilter="PLANEJAMENTO" />
        </ConfirmProvider>,
    );
    await act(async () => { await new Promise(res => setTimeout(res, 30)); });
    return props;
};

beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* sem storage */ }
});

describe('Planejamento — uma porta só para criar', () => {
    it('"Novo planejamento" abre o painel (não o modal) e não há mais "Importar cronograma" separado', async () => {
        const props = await montarLista();
        expect(screen.queryByRole('button', { name: /Importar cronograma/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Novo planejamento/ }));
        expect(props.onNewProject).not.toHaveBeenCalled();
        const painel = await screen.findByRole('dialog', { name: /Novo planejamento/ });
        const origens = within(painel).getAllByRole('radio');
        expect(origens.map(r => (r as HTMLInputElement).value)).toEqual(['branco', 'arquivo', 'duplicar']);
        expect((within(painel).getByRole('radio', { name: /Em branco/ }) as HTMLInputElement).checked).toBe(true);
    });

    it('"Duplicar" da linha abre o painel em Duplicar, com o planejamento e o nome "(cópia)" — não grava direto', async () => {
        const props = await montarLista();
        fireEvent.click(screen.getAllByTitle(/Duplicar/)[0]);
        expect(props.onDuplicateProject).not.toHaveBeenCalled();
        const painel = await screen.findByRole('dialog', { name: /Novo planejamento/ });
        expect((within(painel).getByRole('radio', { name: /Duplicar/ }) as HTMLInputElement).checked).toBe(true);
        expect((within(painel).getByLabelText('Planejamento a copiar') as HTMLSelectElement).value).toBe('pl1');
        expect((within(painel).getByLabelText('Nome do planejamento') as HTMLInputElement).value).toBe('Divino Espirito Santo (cópia)');
    });
});

describe('ImportarCronogramaSheet — criar', () => {
    const abrir = (extra: Partial<React.ComponentProps<typeof ImportarCronogramaSheet>> = {}) => render(
        <ConfirmProvider>
            <ImportarCronogramaSheet modo="criar" open onClose={vi.fn()} onCriado={vi.fn()}
                orcamentos={[{ id: 'orc1', name: 'Igreja Divino', organizacao: 'Viver Bem' }]}
                planejamentos={[{ id: 'pl1', name: 'Divino Espirito Santo', code: '001' }]}
                {...(extra as object)} />
        </ConfirmProvider>,
    );

    it('em branco: "Criar planejamento" desligado diz o que falta, orçamento primeiro', () => {
        abrir();
        const criar = screen.getByRole('button', { name: 'Criar planejamento' }) as HTMLButtonElement;
        expect(criar.disabled).toBe(true);
        expect(screen.getAllByText('Escolha o orçamento base').length).toBeGreaterThan(0);
        // sem passos (só a importação tem 3 passos)
        expect(screen.queryByRole('list', { name: 'Passos' })).toBeNull();
    });

    it('importar arquivo: mostra os passos e o campo do arquivo; duplicar: pede o planejamento', () => {
        abrir();
        fireEvent.click(screen.getByRole('radio', { name: /Importar arquivo/ }));
        expect(screen.getByRole('list', { name: 'Passos' })).toBeTruthy();
        expect(screen.getByText('Arquivo do cronograma')).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: /Duplicar/ }));
        expect(screen.getAllByText('Escolha o planejamento a copiar').length).toBeGreaterThan(0);
        fireEvent.change(screen.getByLabelText('Planejamento a copiar'), { target: { value: 'pl1' } });
        expect((screen.getByLabelText('Nome do planejamento') as HTMLInputElement).value).toBe('Divino Espirito Santo (cópia)');
        expect((screen.getByRole('button', { name: 'Criar planejamento' }) as HTMLButtonElement).disabled).toBe(false);
    });
});

describe('ImportarCronogramaSheet — atualizar', () => {
    it('modo What-If: o bloqueio aparece ao abrir e o botão fica desligado com o motivo', () => {
        const motivo = 'Você está no modo What-If, onde nada é gravado. Saia do What-If para importar datas.';
        render(<ConfirmProvider><ImportarCronogramaSheet modo="atualizar" open onClose={vi.fn()} planejamentoNome="Divino" orcamento={[]}
            schedule={undefined} onAplicar={vi.fn()} bloqueadoPor={motivo} /></ConfirmProvider>);
        expect(screen.getByRole('alert').textContent).toContain('modo What-If');
        expect((screen.getByRole('button', { name: 'Ver o que muda' }) as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('serviço — o que o planejamento novo herda e o que a cópia leva', () => {
    it('em branco herda organização, empresa, cliente e o vínculo do orçamento (como o "Vincular" do modal)', () => {
        const h = herdadoDoOrcamento({ id: 'orc1', name: 'Igreja Divino', organization_id: 'org1', empresa_id: 'emp1', settings: { client: 'Viver Bem', bdi: 22, city: 'Cuiabá' } });
        expect(h).toMatchObject({ organizationId: 'org1', empresaId: 'emp1', client: 'Viver Bem', bdi: 22, city: 'Cuiabá', linkedProjectId: 'orc1', linkedProjectName: 'Igreja Divino' });
    });
    it('a cópia leva tudo menos o código (o serviço gera o próximo — antes ficavam dois "001")', () => {
        const c = settingsDaCopia({ code: '001', classification: 'PLANEJAMENTO', schedule: { startDate: '2026-08-01' } }, ' Divino (cópia) ');
        expect(c).not.toHaveProperty('code');
        expect(c).toMatchObject({ name: 'Divino (cópia)', classification: 'PLANEJAMENTO', schedule: { startDate: '2026-08-01' } });
    });
});
