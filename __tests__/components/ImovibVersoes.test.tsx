// @vitest-environment jsdom
/**
 * Versões congeladas (item 10.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, D5).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listarVersoes: vi.fn(), snapshotDaVersao: vi.fn(), congelarVersao: vi.fn(), organizacaoDoEstudo: vi.fn(), iniciarEdicaoDaVersao: vi.fn(), excluirVersao: vi.fn(), renomearVersao: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const oportunidades = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock('../../services/investorPortalService', () => ({
    investorPortalService: { oportunidadesComVersaoDoEstudo: () => Promise.resolve(oportunidades.lista) },
}));
// A captura dos gráficos (html2canvas) não roda no jsdom: devolve uma imagem pronta.
vi.mock('html2canvas', () => ({ default: async () => ({ toDataURL: () => 'data:image/png;base64,AAAA', width: 10, height: 5 }) }));
const pdf = vi.hoisted(() => ({ secoes: null as unknown, extras: null as unknown, save: vi.fn() }));
vi.mock('../../utils/imovibRelatorioPdf', () => ({
    pdfDoRelatorio: (secoes: unknown, _nome: unknown, extras: unknown) => { pdf.secoes = secoes; pdf.extras = extras; return { save: pdf.save }; },
}));

import ImovibVersoesTab from '../../components/ImovibVersoesTab';
import ImovibCongelarVersao from '../../components/ImovibCongelarVersao';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { resultadosDoEstudo } from '../../utils/imovibVersoes';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' });
const versao = (id: string, label: string, over: Record<string, unknown> = {}) => {
    const s = estudo(over);
    return { linha: { id, study_id: 'estudo-teste', label, notes: null, results: resultadosDoEstudo(s as never), created_at: '2026-11-10T12:00:00Z', created_by: null }, snapshot: s };
};
const comEdicao = (ui: React.ReactElement, pode = true) => (
    <ToastProvider>
        <ConfirmProvider>
            <ImovibEdicaoProvider value={pode ? { pode: true, motivo: '' } : { pode: false, motivo: 'Sem permissão' }}>{ui}</ImovibEdicaoProvider>
        </ConfirmProvider>
    </ToastProvider>
);

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
});

describe('10.2 — aba Versões', () => {
    it('sem versão: diz como congelar', async () => {
        svc.listarVersoes.mockResolvedValue([]);
        render(comEdicao(<ImovibVersoesTab study={estudo({ discount_rate: 15 }) as never} />));
        expect(await screen.findByText(/Nenhuma versão congelada/)).toBeTruthy();
    });

    it('compara a versão mais recente com o estudo atual: premissa que mudou e indicadores lado a lado', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockResolvedValue(v.snapshot);
        render(comEdicao(<ImovibVersoesTab study={estudo({ discount_rate: 15 }) as never} />));
        const mudou = await screen.findByRole('region', { name: 'Premissas que mudaram' });
        expect(await within(mudou).findByText('TMA')).toBeTruthy();
        expect(within(mudou).getByText('12% a.a.')).toBeTruthy();
        expect(within(mudou).getByText('15% a.a.')).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'Indicadores lado a lado' })).getByText('VPL')).toBeTruthy();
        expect(svc.snapshotDaVersao).toHaveBeenCalledWith('v1');
    });

});

// Plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md (F3.1): versão publicada = só leitura;
// as demais se editam (pelo estudo), se renomeiam na linha e se excluem. Substitui o teste da D5
// ("não oferece editar nem apagar"), que a decisão de 19/11 derrubou.
describe('editar e excluir versão', () => {
    beforeEach(() => { oportunidades.lista = []; svc.snapshotDaVersao.mockResolvedValue(estudo()); });

    it('não publicada: Editar e Excluir ligados', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        await screen.findAllByText('Comitê de outubro');
        expect((screen.getByRole('button', { name: 'Editar a versão' }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole('button', { name: 'Excluir a versão' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('publicada: Editar, Excluir e Renomear desligados, com o motivo no hover', async () => {
        const v = versao('v1', 'Comitê de outubro');
        oportunidades.lista = [{ id: 'o1', title: 'Garden Cambuhy', is_published: true, imovib_version_id: 'v1' }];
        svc.listarVersoes.mockResolvedValue([v.linha]);
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        const editar = await screen.findByRole('button', { name: 'Editar a versão' }) as HTMLButtonElement;
        await vi.waitFor(() => expect(editar.disabled).toBe(true));
        expect(editar.parentElement!.getAttribute('title')).toBe('Publicada em «Garden Cambuhy» — só leitura.');
        expect((screen.getByRole('button', { name: 'Excluir a versão' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Renomear a versão' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('Editar: confirma dizendo o que a versão não guardou e abre a edição no estudo', async () => {
        const user = userEvent.setup();
        const v = versao('v1', 'Comitê de outubro');
        const aoMudar = vi.fn();
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockResolvedValue({ ...v.snapshot, cenarios: [], capex_items: [], funding_sources: [] });
        svc.iniciarEdicaoDaVersao.mockResolvedValue(undefined);
        const e = estudo();
        render(comEdicao(<ImovibVersoesTab study={e as never} onEstudoMudou={aoMudar} />));
        await user.click(await screen.findByRole('button', { name: 'Editar a versão' }));
        expect(await screen.findByText(/não guardou comparáveis, riscos, due diligence e sócios/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Editar versão' }));
        await vi.waitFor(() => expect(svc.iniciarEdicaoDaVersao).toHaveBeenCalledWith(e, 'v1'));
        expect(aoMudar).toHaveBeenCalled();
    });

    it('Excluir: confirma nomeando o rascunho que a escolhia e tira a versão da lista', async () => {
        const user = userEvent.setup();
        const v = versao('v1', 'Comitê de outubro');
        oportunidades.lista = [{ id: 'o2', title: 'Garden rascunho', is_published: false, imovib_version_id: 'v1' }];
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.excluirVersao.mockResolvedValue(undefined);
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        await user.click(await screen.findByRole('button', { name: 'Excluir a versão' }));
        expect(await screen.findByText(/escolhida no rascunho «Garden rascunho»/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Excluir' }));
        await vi.waitFor(() => expect(svc.excluirVersao).toHaveBeenCalledWith('v1'));
        await vi.waitFor(() => expect(screen.queryByText('Comitê de outubro')).toBeNull());
    });

    it('Renomear: nome e observações na linha, gravados ao confirmar', async () => {
        const user = userEvent.setup();
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.renomearVersao.mockResolvedValue(undefined);
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        await user.click(await screen.findByRole('button', { name: 'Renomear a versão' }));
        const nome = screen.getByRole('textbox', { name: 'Nome da versão' });
        await user.clear(nome); await user.type(nome, 'Cenário banco');
        await user.type(screen.getByRole('textbox', { name: 'Observações da versão' }), 'com financiamento');
        await user.click(screen.getByRole('button', { name: 'Salvar nome e observações' }));
        await vi.waitFor(() => expect(svc.renomearVersao).toHaveBeenCalledWith('v1', 'Cenário banco', 'com financiamento'));
        expect((await screen.findAllByText('Cenário banco')).length).toBeGreaterThan(0);
    });

    it('versão editada mostra quando', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([{ ...v.linha, updated_at: '2026-11-19T17:05:00Z' }]);
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        expect(await screen.findByText(/editada em/)).toBeTruthy();
    });
});

// Fase 1 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md.
describe('relatório da versão', () => {
    it('baixa o relatório completo da versão, com os dados e a data da versão', async () => {
        const user = userEvent.setup();
        const v = versao('v1', 'Comitê de outubro');
        const risco = { id: 'r1', study_id: 'estudo-teste', category: 'legal', description: 'Matrícula com ônus', probability: 3, impact: 4, status: 'aberto', sort_order: 0 };
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockResolvedValue({ ...v.snapshot, cenarios: [], relatorio: { riscos: [risco] } });
        pdf.save.mockReset();
        // jsdom não desenha em <canvas>: o recorte de cada gráfico usa um contexto falso.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as never);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
        render(comEdicao(<ImovibVersoesTab study={estudo({ discount_rate: 15 }) as never} />));
        await user.click(await screen.findByRole('button', { name: 'Relatório da versão (PDF)' }));
        // Gera o relatório inteiro (motor, tornado, gráficos fora da tela): ~0,7 s sozinho, 1,6 s com a suíte.
        await vi.waitFor(() => expect(pdf.save).toHaveBeenCalledWith('Relatorio_Estudo_teste_Comitê_de_outubro.pdf'), { timeout: 10_000 });
        const secoes = pdf.secoes as { id: string; paragrafos: string[]; tabelas: { linhas: string[][] }[] }[];
        expect(secoes.find(x => x.id === 'capa')!.paragrafos.join(' ')).toContain('10/11/2026');
        expect(JSON.stringify(secoes.find(x => x.id === 'riscos')!.tabelas)).toContain('Matrícula com ônus');
        // Fase 3: capa com a versão e os gráficos das seções.
        const extras = pdf.extras as { capa: { subtitulo: string }; imagens: Record<string, unknown> };
        expect(extras.capa.subtitulo).toBe('Versão Comitê de outubro · congelada em 10/11/2026');
        expect(Object.keys(extras.imagens)).toEqual(expect.arrayContaining(['curva_s', 'fluxo_anual', 'tornado', 'marcos']));
    });
});

describe('versão publicada para o investidor (plano 2026-11-15, Fase 2)', () => {
    it('diz em que oportunidade cada versão está publicada (ou escolhida, em rascunho)', async () => {
        const v1 = versao('v1', 'Comitê de outubro');
        const v2 = versao('v2', 'Comitê de novembro');
        svc.listarVersoes.mockResolvedValue([v2.linha, v1.linha]);
        svc.snapshotDaVersao.mockResolvedValue(v2.snapshot);
        oportunidades.lista = [
            { id: 'o1', title: 'Garden — captação', is_published: true, imovib_version_id: 'v2' },
            { id: 'o2', title: 'Garden — sócios', is_published: false, imovib_version_id: 'v1' },
        ];
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        expect(await screen.findByText('Publicada em Garden — captação')).toBeTruthy();
        expect(screen.getByText('Escolhida em Garden — sócios (rascunho)')).toBeTruthy();
        oportunidades.lista = [];
    });
});

describe('10.2 (revisão) — erro ao ler a versão', () => {
    it('mostra o erro e não fica em "Lendo as versões…"', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockRejectedValue(new Error('rede caiu'));
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        expect(await screen.findByText(/rede caiu/)).toBeTruthy();
        expect(screen.queryByText(/Lendo as versões/)).toBeNull();
    });
});

describe('10.2 — congelar versão', () => {
    it('grava com o nome e as observações e avisa que não se altera depois', async () => {
        const user = userEvent.setup();
        svc.congelarVersao.mockResolvedValue({ id: 'v9' });
        const onCongelada = vi.fn();
        const s = estudo();
        render(comEdicao(<ImovibCongelarVersao open study={s as never} onClose={vi.fn()} onCongelada={onCongelada} />));
        expect(screen.getByText(/não pode ser editada nem apagada/i)).toBeTruthy();
        const nome = screen.getByLabelText('Nome da versão') as HTMLInputElement;
        await user.clear(nome);
        await user.type(nome, 'Comitê de novembro');
        await user.type(screen.getByLabelText('Observações'), 'Antes da renegociação do terreno');
        await user.click(screen.getByRole('button', { name: 'Congelar' }));
        expect(svc.congelarVersao).toHaveBeenCalledWith(s, 'Comitê de novembro', 'Antes da renegociação do terreno');
        expect(onCongelada).toHaveBeenCalled();
    });

    it('sem nome o botão diz por quê; quem só lê não congela', async () => {
        const user = userEvent.setup();
        const { unmount } = render(comEdicao(<ImovibCongelarVersao open study={estudo() as never} onClose={vi.fn()} onCongelada={vi.fn()} />));
        await user.clear(screen.getByLabelText('Nome da versão'));
        expect(screen.getByRole('button', { name: 'Congelar' }).getAttribute('title')).toBe('Dê um nome à versão.');
        unmount();
        render(comEdicao(<ImovibCongelarVersao open study={estudo() as never} onClose={vi.fn()} onCongelada={vi.fn()} />, false));
        const b = screen.getByRole('button', { name: 'Congelar' }) as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        expect(b.getAttribute('title')).toBe('Sem permissão');
    });
});
