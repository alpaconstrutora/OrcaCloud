// @vitest-environment jsdom
/**
 * Configurações › Rotinas automáticas — liga/desliga os jobs do pg_cron (só superadmin).
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 4).
 *
 * O que trava:
 *   1. grupos na ordem do catálogo; horário traduzido; job fora do catálogo em "Outras";
 *   2. falhas da semana: "X de N execuções" e o ÚLTIMO ERRO (da última que falhou) no title;
 *   3. "Desligada por X em dd/mm" a partir do registro de alterações;
 *   4. desligar rotina sensível pede confirmação com o que deixa de acontecer
 *      (cancelar não grava); as demais, e LIGAR, não perguntam;
 *   5. erro ao gravar: o interruptor volta ao estado anterior e a mensagem aparece.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { RotinaAutomatica } from '../../services/rotinasAutomaticasService';

const listar = vi.fn();
const definir = vi.fn();
vi.mock('../../services/rotinasAutomaticasService', () => ({
    rotinasAutomaticasService: {
        listar: (...a: unknown[]) => listar(...a),
        definir: (...a: unknown[]) => definir(...a),
    },
}));

import RotinasAutomaticasSettings from '../../components/settings/RotinasAutomaticasSettings';
import { ConfirmProvider } from '../../components/ui/confirm';
import { rotinaMeta } from '../../utils/rotinasAutomaticas';

let proximoJobid = 101;   // fixo por ordem de criação — nada aleatório na fixture
const rotina = (jobname: string | null, extra: Partial<RotinaAutomatica> = {}): RotinaAutomatica => ({
    jobid: proximoJobid++, jobname, schedule: '5 * * * *', ativa: true,
    ultima: { inicio: '2026-11-16T17:05:00Z', status: 'succeeded', mensagem: '1 row' },
    execucoes7d: 168, falhas7d: 0, ultimoErro: null, ultimaAlteracao: null, ...extra,
});

const LISTA: RotinaAutomatica[] = [
    rotina('process-sla-sweep'),
    rotina('asaas-status-sync', { schedule: '*/15 * * * *' }),
    rotina('daily-payment-tasks', {
        schedule: '0 7 * * *', falhas7d: 3,
        ultima: { inicio: '2026-11-16T07:00:00Z', status: 'failed', mensagem: 'ERROR: function public.create_task(…) does not exist' },
        ultimoErro: { em: '2026-11-16T07:00:00Z', mensagem: 'ERROR: function public.create_task(…) does not exist' },
    }),
    rotina('hourly-bi-report-check', {
        schedule: '0 * * * *', ativa: false,
        ultimaAlteracao: { em: '2026-11-16T15:00:00Z', porEmail: 'chefe@alpa.com.br', ativaDepois: false },
    }),
    rotina('x-nova', { schedule: '0 9 * * 1-5' }),
];

const nome = (job: string) => rotinaMeta(job).nome;
const interruptor = (job: string) => screen.getByRole('checkbox', { name: `Rotina ${nome(job)}` });

function montar() {
    return render(<ConfirmProvider><RotinasAutomaticasSettings /></ConfirmProvider>);
}

describe('RotinasAutomaticasSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        listar.mockReset().mockResolvedValue(LISTA.map(r => ({ ...r })));
        definir.mockReset().mockImplementation(async (job: string | null, ativa: boolean, jobid?: number) => ({
            ...LISTA.find(r => (job === null ? r.jobid === jobid : r.jobname === job))!, ativa,
        }));
    });

    it('mostra os grupos na ordem do catálogo, com o horário traduzido; job desconhecido em Outras', async () => {
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        const grupos = screen.getAllByRole('button', { expanded: true }).map(b => b.textContent ?? '');
        const ordem = ['Avisos à equipe', 'Dinheiro e sistemas externos', 'Relatórios', 'Outras']
            .map(g => grupos.findIndex(t => t.includes(g)));
        expect(ordem.every(i => i >= 0)).toBe(true);
        expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
        expect(screen.getByText('De hora em hora (minuto 5)')).toBeTruthy();
        expect(screen.getByText('x-nova')).toBeTruthy();
        expect(screen.getByText('0 9 * * 1-5')).toBeTruthy();
    });

    it('cabe na área das Configurações (~840 px em tela de 1440): interruptor logo após o nome, sem rolagem lateral', async () => {
        // Visto no app (16/11): com 1200 px de colunas o interruptor ficava fora da vista em 1440.
        const { container } = montar();
        await screen.findByText(nome('process-sla-sweep'));
        const cabecalhos = screen.getAllByRole('columnheader').map(h => (h.textContent ?? '').trim()).filter(Boolean);
        expect(cabecalhos.slice(0, 2)).toEqual(['Rotina', 'Situação']);
        const larguras = [...container.querySelectorAll('col[data-col-key]')].map(c => parseFloat((c as HTMLElement).style.width) || 0);
        expect(larguras.length).toBe(5);
        expect(larguras.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(840);
    });

    it('e-mail longo na nota "Desligada por" quebra linha em vez de cortar', async () => {
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'hourly-bi-report-check'
            ? { ...r, ultimaAlteracao: { em: '2026-11-16T15:00:00Z', porEmail: 'desenvolvedor@alpaconstrutora.com.br', ativaDepois: false } }
            : { ...r })));
        montar();
        const nota = await screen.findByText(/Desligada por desenvolvedor@alpaconstrutora\.com\.br/);
        expect(nota.className).toContain('[overflow-wrap:anywhere]');
    });

    // ── Pendências da revisão do #513 (docs/planos/2026-11-16-rotinas-automaticas-pendencias-menores.md) ──
    it('falhas: o title traz "X de N execuções" e o ÚLTIMO ERRO, mesmo que a última execução tenha passado', async () => {
        listar.mockResolvedValue([rotina('process-sla-sweep', {
            falhas7d: 2, execucoes7d: 168,
            ultima: { inicio: '2026-11-16T17:05:00Z', status: 'succeeded', mensagem: '1 row' },
            ultimoErro: { em: '2026-11-16T07:00:00Z', mensagem: 'ERROR: timeout' },
        })]);
        montar();
        const titulo = (await screen.findByText('2 falhas')).getAttribute('title') ?? '';
        expect(titulo).toContain('2 de 168 execuções nos últimos 7 dias falharam');
        expect(titulo).toContain('Último erro (16/11 04:00): ERROR: timeout');
        expect(titulo).not.toContain('terminou sem erro');
    });

    it('última execução rodando agora: diz "rodando" em português e as falhas não dizem "terminou sem erro"', async () => {
        listar.mockResolvedValue([rotina('process-sla-sweep', {
            falhas7d: 1, execucoes7d: 50,
            ultima: { inicio: '2026-11-16T17:05:00Z', status: 'running', mensagem: null },
            ultimoErro: { em: '2026-11-16T16:05:00Z', mensagem: 'ERROR: x' },
        })]);
        montar();
        expect(await screen.findByText(/· rodando/)).toBeTruthy();
        expect(screen.getByTitle('Situação: rodando')).toBeTruthy();
        expect(screen.getByText('1 falha').getAttribute('title')).not.toContain('terminou sem erro');
    });

    it('status da última execução em português no title', async () => {
        listar.mockResolvedValue([rotina('process-sla-sweep')]);
        montar();
        expect(await screen.findByTitle('Situação: concluída')).toBeTruthy();
    });

    it('sem execução na semana diz "Sem execução"; com execuções e sem falha, o title conta as execuções', async () => {
        listar.mockResolvedValue([
            rotina('process-sla-sweep', { execucoes7d: 0, falhas7d: 0, ultima: null }),
            rotina('asaas-status-sync', { execucoes7d: 672, falhas7d: 0 }),
        ]);
        montar();
        expect((await screen.findByText('Sem execução')).getAttribute('title')).toBe('Nenhuma execução nos últimos 7 dias');
        expect(screen.getByText('Nenhuma').getAttribute('title')).toBe('672 execuções nos últimos 7 dias, nenhuma falhou');
    });

    it('rotina sem nome aparece como "Rotina sem nome (#N)" e liga/desliga pelo jobid', async () => {
        const semNome = rotina(null, { jobid: 77 });
        listar.mockResolvedValue([semNome, rotina('process-sla-sweep')]);
        definir.mockResolvedValue({ ...semNome, ativa: false });
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('checkbox', { name: 'Rotina Rotina sem nome (#77)' }));
        await waitFor(() => expect(definir).toHaveBeenCalledWith(null, false, 77));
        await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Rotina Rotina sem nome (#77)' }) as HTMLInputElement).checked).toBe(false));
        expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(true);
    });

    it('enquanto grava, o interruptor fica desligado com o motivo "Gravando…"', async () => {
        let terminar!: (r: RotinaAutomatica) => void;
        definir.mockImplementation(() => new Promise<RotinaAutomatica>(res => { terminar = res; }));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        await waitFor(() => expect((interruptor('process-sla-sweep') as HTMLInputElement).disabled).toBe(true));
        expect(screen.getByTitle('Gravando…')).toBeTruthy();
        terminar({ ...LISTA[0], ativa: false });
        await waitFor(() => expect((interruptor('process-sla-sweep') as HTMLInputElement).disabled).toBe(false));
        expect(screen.queryByTitle('Gravando…')).toBeNull();
    });

    it('o aviso no pé da tela entra com a animação do guia (§35)', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        const aviso = await screen.findByText(`${nome('process-sla-sweep')}: desligada.`);
        const caixa = aviso.closest('[role="status"]') as HTMLElement;
        expect(caixa.className).toContain('animate-in');
        expect(caixa.className).toContain('slide-in-from-bottom-4');
    });

    // ── Achados da revisão da frente rotinas-pendencias ──
    it('job com NOME "#77" e rotina sem nome de jobid 77 não se confundem', async () => {
        const comNome = rotina('#77', { jobid: 500 });
        const semNome = rotina(null, { jobid: 77 });
        listar.mockResolvedValue([comNome, semNome]);
        definir.mockResolvedValue({ ...semNome, ativa: false });
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('checkbox', { name: 'Rotina Rotina sem nome (#77)' }));
        await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Rotina Rotina sem nome (#77)' }) as HTMLInputElement).checked).toBe(false));
        expect((screen.getByRole('checkbox', { name: 'Rotina #77' }) as HTMLInputElement).checked).toBe(true);
        expect(erro.mock.calls.some(c => String(c[0]).includes('same key'))).toBe(false);
        erro.mockRestore();
    });

    it('segundo aviso com o primeiro ainda na tela troca o texto da MESMA região (leitor de tela anuncia)', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        const primeiro = (await screen.findByText(`${nome('process-sla-sweep')}: desligada.`)).closest('[role="status"]');
        await user.click(interruptor('hourly-bi-report-check'));
        const segundo = (await screen.findByText(`${nome('hourly-bi-report-check')}: ligada.`)).closest('[role="status"]');
        expect(segundo).toBe(primeiro);
    });

    it('com uma rotina só, o resumo fala no singular', async () => {
        listar.mockResolvedValue([rotina('process-sla-sweep')]);
        montar();
        expect(await screen.findByText(/^1 rotina · 1 ligada\./)).toBeTruthy();
    });

    it('falhas da semana com o erro da última execução no title', async () => {
        montar();
        const falhas = await screen.findByText('3 falhas');
        expect(falhas.getAttribute('title')).toContain('create_task');
    });

    // ── Sem mouse (docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md, Tarefa 3) ──
    // O title só aparece ao passar o mouse: teclado e toque precisam ver o mesmo como TEXTO.
    // O botão mora na coluna Rotina (a primeira, sempre à vista — revisão de 16/11: na última
    // coluna, com a tabela rolada, o detalhe abria fora da vista).
    const detalhes = (job: string) => screen.getByRole('region', { name: `Detalhes de ${nome(job)}` });
    const botaoDetalhes = (job: string) => screen.findByRole('button', { name: `Detalhes de ${nome(job)}` });

    it('teclado: o botão "Detalhes de …" na coluna Rotina abre a contagem e o último erro por escrito', async () => {
        const user = userEvent.setup();
        montar();
        const botao = await botaoDetalhes('daily-payment-tasks');
        expect(botao.closest('tr')?.querySelector('td')).toBe(botao.closest('td'));   // 1ª célula da linha
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByRole('region', { name: `Detalhes de ${nome('daily-payment-tasks')}` })).toBeNull();

        botao.focus();
        await user.keyboard('{Enter}');

        expect(botao.getAttribute('aria-expanded')).toBe('true');
        // o nome não muda com o estado — quem diz aberto/fechado é o aria-expanded
        expect(screen.getByRole('button', { name: `Detalhes de ${nome('daily-payment-tasks')}` })).toBe(botao);
        const painel = detalhes('daily-payment-tasks');
        expect(botao.getAttribute('aria-controls')).toBe(painel.id);
        expect(within(painel).getByText('3 de 168 execuções nos últimos 7 dias falharam.')).toBeTruthy();
        expect(within(painel).getByText('Último erro (16/11 04:00)')).toBeTruthy();
        expect(within(painel).getByText('ERROR: function public.create_task(…) does not exist').className).not.toContain('font-mono');
        // a fonte Inter junta '=>' numa seta (⇒): a mensagem do banco tem de sair literal
        expect(within(painel).getByText('ERROR: function public.create_task(…) does not exist').className).toContain("[font-feature-settings:'calt'_0]");
        expect(within(painel).getByText('16/11 04:00 · falhou')).toBeTruthy();

        await user.keyboard('{Enter}');
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByRole('region', { name: `Detalhes de ${nome('daily-payment-tasks')}` })).toBeNull();
    });

    it('a região de detalhes é um bloco fixo à esquerda (§6.13) com a lista <dl> dentro, sem role na <dl>', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await botaoDetalhes('daily-payment-tasks'));
        const painel = detalhes('daily-payment-tasks');
        expect(painel.tagName).not.toBe('DL');
        expect(painel.className).toContain('sticky');
        const lista = painel.querySelector('dl');
        expect(lista).toBeTruthy();
        expect(lista!.getAttribute('role')).toBeNull();
    });

    // Medido no navegador (revisão, 16/11): com `max-w-[calc(100vw-…)]` o detalhe passava ~100 px
    // da área visível num notebook de 1280 (tabela de 830 px numa área de 680). O limite vem do
    // contêiner que rola, menos o `left-3` e a mesma folga à direita.
    for (const [visivel, esperado] of [[680, '656px'], [1200, '768px']] as const) {
        it(`o detalhe não passa da área visível da tabela (${visivel} px → ${esperado})`, async () => {
            const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
                configurable: true,
                get(this: HTMLElement) { return this.classList.contains('overflow-auto') ? visivel : 0; },
            });
            try {
                const user = userEvent.setup();
                montar();
                await user.click(await botaoDetalhes('daily-payment-tasks'));
                expect(detalhes('daily-payment-tasks').style.maxWidth).toBe(esperado);
            } finally {
                if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
            }
        });
    }

    it('toque: abre também sem falha; sem execução em 40 dias diz isso por escrito; uma linha aberta por vez', async () => {
        const user = userEvent.setup();
        listar.mockResolvedValue([
            rotina('process-sla-sweep', { execucoes7d: 0, falhas7d: 0, ultima: null }),
            rotina('asaas-status-sync', { execucoes7d: 672, falhas7d: 0 }),
        ]);
        montar();
        await user.click(await botaoDetalhes('process-sla-sweep'));
        const semExecucao = detalhes('process-sla-sweep');
        expect(within(semExecucao).getByText('Nenhuma nos últimos 40 dias')).toBeTruthy();
        expect(within(semExecucao).getByText('Nenhuma execução nos últimos 7 dias.')).toBeTruthy();

        await user.click(await botaoDetalhes('asaas-status-sync'));
        expect(within(detalhes('asaas-status-sync')).getByText('672 execuções nos últimos 7 dias, nenhuma falhou.')).toBeTruthy();
        expect(screen.queryByRole('region', { name: `Detalhes de ${nome('process-sla-sweep')}` })).toBeNull();
    });

    it('detalhes trazem o que faz por inteiro, o nome técnico e a expressão do horário', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await botaoDetalhes('daily-payment-tasks'));
        const painel = detalhes('daily-payment-tasks');
        expect(within(painel).getByText(rotinaMeta('daily-payment-tasks').oQueFaz)).toBeTruthy();
        expect(within(painel).getByText('daily-payment-tasks')).toBeTruthy();
        expect(within(painel).getByText(/0 7 \* \* \*/)).toBeTruthy();
    });

    it('"Religada fora desta tela": a explicação aparece por escrito nos detalhes', async () => {
        const user = userEvent.setup();
        listar.mockResolvedValue([rotina('process-sla-sweep', {
            ativa: true, ultimaAlteracao: { em: '2026-11-16T15:00:00Z', porEmail: 'chefe@alpa.com.br', ativaDepois: false },
        })]);
        montar();
        await user.click(await botaoDetalhes('process-sla-sweep'));
        expect(within(detalhes('process-sla-sweep')).getByText(/voltou a ligar por fora dela/)).toBeTruthy();
    });

    it('rotina desligada diz quem desligou e quando', async () => {
        montar();
        expect(await screen.findByText(/Desligada por chefe@alpa\.com\.br em 16\/11/)).toBeTruthy();
    });

    it('desligar rotina não sensível grava direto, sem diálogo', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        await waitFor(() => expect(definir).toHaveBeenCalledWith('process-sla-sweep', false, expect.any(Number)));
        expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
        await waitFor(() => expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(false));
    });

    it('desligar rotina sensível pede confirmação com o que para; cancelar não grava', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('asaas-status-sync'));
        await user.click(interruptor('asaas-status-sync'));
        expect(await screen.findByText(new RegExp(rotinaMeta('asaas-status-sync').aoDesligar!.slice(0, 30)))).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(definir).not.toHaveBeenCalled();
        expect((interruptor('asaas-status-sync') as HTMLInputElement).checked).toBe(true);

        await user.click(interruptor('asaas-status-sync'));
        await user.click(await screen.findByRole('button', { name: 'Desligar' }));
        await waitFor(() => expect(definir).toHaveBeenCalledWith('asaas-status-sync', false, expect.any(Number)));
    });

    it('ligar rotina sensível não pede confirmação', async () => {
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'asaas-status-sync' ? { ...r, ativa: false } : { ...r })));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('asaas-status-sync'));
        await user.click(interruptor('asaas-status-sync'));
        await waitFor(() => expect(definir).toHaveBeenCalledWith('asaas-status-sync', true, expect.any(Number)));
        expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
    });

    it('erro ao gravar: o interruptor volta e o erro aparece', async () => {
        definir.mockRejectedValue(new Error('apenas superadmin'));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        expect(await screen.findByText(/apenas superadmin/)).toBeTruthy();
        expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(true);
    });

    it('rotina desligada pela tela que voltou a ligar por fora avisa "Religada fora desta tela"', async () => {
        // ex.: uma migration fez unschedule + schedule do job, que renasce ligado
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'hourly-bi-report-check' ? { ...r, ativa: true } : { ...r })));
        montar();
        expect(await screen.findByText(/Religada fora desta tela/)).toBeTruthy();
        expect(screen.getByText(/desligada por chefe@alpa\.com\.br em 16\/11/)).toBeTruthy();
        expect(screen.queryByText(/^Desligada por/)).toBeNull();
    });

    it('erro ao gravar relê o banco: se a gravação passou e só a resposta se perdeu, a tela mostra o estado real', async () => {
        definir.mockRejectedValue(new Error('Failed to fetch'));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'process-sla-sweep' ? { ...r, ativa: false } : { ...r })));
        await user.click(interruptor('process-sla-sweep'));
        expect(await screen.findByText(/Failed to fetch/)).toBeTruthy();
        await waitFor(() => expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(false));
        expect(listar).toHaveBeenCalledTimes(2);
    });

    it('falha ao carregar mostra o erro com "Tentar de novo"', async () => {
        listar.mockRejectedValueOnce(new Error('apenas superadmin'));
        const user = userEvent.setup();
        montar();
        const alerta = await screen.findByRole('alert');
        expect(within(alerta).getByText(/apenas superadmin/)).toBeTruthy();
        await user.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
        expect(await screen.findByText(nome('process-sla-sweep'))).toBeTruthy();
    });
});
