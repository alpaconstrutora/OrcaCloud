// @vitest-environment jsdom
/**
 * "VER DECORADO" POR TIPOLOGIA (Espelho de Vendas 3D, F8 — 10/11/2026): o cadastro, em Torres & Unidades. As
 * tipologias vêm do que já está cadastrado; por tipologia, o corte 3D (grava ao escolher) e os ambientes (imagem +
 * nome + "Salvar ambiente"). Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImagemDoDecorado } from '../../utils/espelhoDecoradoDaTipologia';

const plantas = vi.hoisted(() => ({ tipologiasNoCadastro: vi.fn() }));
vi.mock('../../services/empreendimentoTipologiaPlantasService', () => ({ empreendimentoTipologiaPlantasService: plantas }));
const servico = vi.hoisted(() => ({
    listar: vi.fn(),
    salvarCorte: vi.fn(),
    adicionarAmbiente: vi.fn(),
    reordenar: vi.fn(),
    remover: vi.fn(),
}));
vi.mock('../../services/empreendimentoTipologiaDecoradoService', () => ({ empreendimentoTipologiaDecoradoService: servico }));
const confirmar = vi.hoisted(() => vi.fn());
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast, localToast: null }) }));

import DecoradoPorTipologiaSecao from '../../components/empreendimento/DecoradoPorTipologiaSecao';

const imagem = (over: Partial<ImagemDoDecorado>): ImagemDoDecorado => ({
    id: over.legenda ?? 'corte', empreendimento_id: 'e1', tipologia: 'Tipo 1', tipologia_chave: 'tipo 1', papel: 'AMBIENTE', legenda: 'Sala', ordem: 0,
    imagem_url: `https://x/${over.legenda ?? 'corte'}.jpg`, imagem_path: `o1/e1/decorado/${over.legenda ?? 'corte'}.jpg`, origem: 'ENVIADA', ...over,
});
const SALA = imagem({ legenda: 'Sala', ordem: 0 });
const SUITE = imagem({ legenda: 'Suíte', ordem: 1 });
const arquivo = () => new File(['x'], 'suite.jpg', { type: 'image/jpeg' });

const montar = (over: Partial<React.ComponentProps<typeof DecoradoPorTipologiaSecao>> = {}) =>
    render(<DecoradoPorTipologiaSecao empreendimentoId="e1" organizationId="o1" buildingId="b1" {...over} />);

beforeEach(() => {
    for (const f of [...Object.values(servico), plantas.tipologiasNoCadastro]) f.mockReset();
    confirmar.mockReset();
    showToast.mockReset();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:previa');
    globalThis.URL.revokeObjectURL = vi.fn();
    plantas.tipologiasNoCadastro.mockResolvedValue({ unidades: ['Tipo 1', 'Tipo 1', 'Tipo 2'], imoveis: ['Tipo 1'] });
    servico.listar.mockResolvedValue([SUITE, SALA]);
});

describe('DecoradoPorTipologiaSecao', () => {
    it('lista as tipologias do cadastro com o resumo do decorado, e abre a primeira com os ambientes em ordem', async () => {
        montar();
        const tipo1 = await screen.findByTestId('decorado-tipologia-tipo 1');
        expect(tipo1.textContent).toContain('2 ambientes');
        expect(screen.getByTestId('decorado-tipologia-tipo 2').textContent).toContain('sem decorado');
        expect(screen.getByText('1 de 2 tipologia(s) com decorado')).toBeTruthy();
        expect(tipo1.getAttribute('aria-checked')).toBe('true');
        expect(screen.getAllByTestId('decorado-ambiente').map((li) => li.textContent)).toEqual(['Sala', 'Suíte']);
        // O aviso do selo está escrito no cadastro.
        expect(screen.getByTestId('decorado-aviso-selo').textContent).toContain('Imagem ilustrativa');
    });

    it('"Salvar ambiente" desligado dizendo o que falta: primeiro a imagem, depois o nome', async () => {
        montar();
        await screen.findByTestId('decorado-editor');
        const botao = screen.getByRole('button', { name: 'Salvar ambiente' });
        expect(botao).toBeDisabled();
        expect(screen.getByTestId('novo-ambiente-motivo').textContent).toBe('Escolha a imagem do ambiente.');
        fireEvent.change(screen.getByTestId('novo-ambiente').querySelector('input[type=file]')!, { target: { files: [arquivo()] } });
        expect(screen.getByTestId('novo-ambiente-motivo').textContent).toBe('Dê o nome do ambiente (ex: Sala, Suíte).');
        expect(botao.parentElement!.getAttribute('title')).toBe('Dê o nome do ambiente (ex: Sala, Suíte).');
    });

    it('com imagem e nome, avisa que ainda não foi gravada; salvar grava no fim da lista e limpa o formulário', async () => {
        const VARANDA = imagem({ legenda: 'Varanda', ordem: 2 });
        servico.adicionarAmbiente.mockResolvedValue(VARANDA);
        montar();
        await screen.findByTestId('decorado-editor');
        const f = arquivo();
        fireEvent.change(screen.getByTestId('novo-ambiente').querySelector('input[type=file]')!, { target: { files: [f] } });
        fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Varanda' } });
        expect(screen.getByTestId('novo-ambiente-por-salvar').textContent).toContain('ainda não foi gravada');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar ambiente' }));
        await waitFor(() => expect(screen.getAllByTestId('decorado-ambiente').map((li) => li.textContent)).toEqual(['Sala', 'Suíte', 'Varanda']));
        expect(servico.adicionarAmbiente).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'o1', empreendimentoId: 'e1', tipologia: 'Tipo 1', nome: 'Varanda', arquivo: f }));
        expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('');
        expect(screen.getByTestId('novo-ambiente-motivo').textContent).toBe('Escolha a imagem do ambiente.');
    });

    it('trocar de tipologia descarta o ambiente que estava sendo montado', async () => {
        montar();
        await screen.findByTestId('decorado-editor');
        fireEvent.change(screen.getByTestId('novo-ambiente').querySelector('input[type=file]')!, { target: { files: [arquivo()] } });
        fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Varanda' } });
        expect(screen.getByTestId('novo-ambiente-por-salvar')).toBeTruthy();
        fireEvent.click(screen.getByTestId('decorado-tipologia-tipo 2'));
        expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('');
        expect(screen.getByTestId('novo-ambiente-motivo').textContent).toBe('Escolha a imagem do ambiente.');
    });

    it('subir o corte grava na hora, para a tipologia escolhida', async () => {
        servico.salvarCorte.mockResolvedValue(imagem({ id: 'c2', papel: 'CORTE', legenda: null, tipologia: 'Tipo 2', tipologia_chave: 'tipo 2', imagem_url: 'https://x/corte2.jpg' }));
        montar();
        fireEvent.click(await screen.findByTestId('decorado-tipologia-tipo 2'));
        const editor = screen.getByTestId('decorado-editor');
        const f = new File(['x'], 'corte.png', { type: 'image/png' });
        fireEvent.change(editor.querySelector('input[type=file]')!, { target: { files: [f] } });
        await waitFor(() => expect(servico.salvarCorte).toHaveBeenCalledWith({ organizationId: 'o1', empreendimentoId: 'e1', tipologia: 'Tipo 2', arquivo: f, anterior: null }));
        await waitFor(() => expect(screen.getByTestId('decorado-tipologia-tipo 2').textContent).toContain('corte'));
        expect(showToast).toHaveBeenCalledWith('Corte 3D da tipologia Tipo 2 gravado.');
    });

    it('F9: o corte gerado pela Planta diz de onde veio, e trocar por imagem pede confirmação', async () => {
        servico.listar.mockResolvedValue([SALA, imagem({ id: 'cp', papel: 'CORTE', legenda: null, origem: 'PLANTA', updated_at: '2026-11-10T12:00:00Z' })]);
        confirmar.mockResolvedValue(false);
        montar();
        const editor = await screen.findByTestId('decorado-editor');
        expect(screen.getByTestId('decorado-origem-do-corte').textContent).toBe('Gerado da Planta em 10/11/2026');
        fireEvent.change(editor.querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'c.png', { type: 'image/png' })] } });
        await waitFor(() => expect(confirmar).toHaveBeenCalled());
        expect(confirmar.mock.calls[0][0].title).toBe('Trocar o corte gerado pela Planta da tipologia Tipo 1?');
        // Recusou: nada gravado.
        expect(servico.salvarCorte).not.toHaveBeenCalled();
    });

    it('descer um ambiente troca a ordem na tela e grava a nova ordem; o primeiro não sobe, dizendo por quê', async () => {
        servico.reordenar.mockResolvedValue(undefined);
        montar();
        const linhas = await screen.findAllByTestId('decorado-ambiente');
        const subirSala = within(linhas[0]).getByRole('button', { name: 'Subir o ambiente' });
        expect(subirSala).toBeDisabled();
        expect(subirSala.parentElement!.getAttribute('title')).toBe('Já é o primeiro ambiente');
        fireEvent.click(within(linhas[0]).getByRole('button', { name: 'Descer o ambiente' }));
        expect(screen.getAllByTestId('decorado-ambiente').map((li) => li.textContent)).toEqual(['Suíte', 'Sala']);
        await waitFor(() => expect(servico.reordenar).toHaveBeenCalled());
        expect(servico.reordenar.mock.calls[0][0].map((a: ImagemDoDecorado) => a.legenda)).toEqual(['Suíte', 'Sala']);
    });

    it('a ordem que não gravou volta como estava, com o erro', async () => {
        servico.reordenar.mockRejectedValue(new Error('A ordem dos ambientes não foi gravada — você não tem permissão para alterar este empreendimento.'));
        montar();
        const linhas = await screen.findAllByTestId('decorado-ambiente');
        fireEvent.click(within(linhas[0]).getByRole('button', { name: 'Descer o ambiente' }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('não foi gravada'), 'error'));
        expect(screen.getAllByTestId('decorado-ambiente').map((li) => li.textContent)).toEqual(['Sala', 'Suíte']);
    });

    it('remover pede confirmação e tira o ambiente da lista', async () => {
        confirmar.mockResolvedValue(true);
        servico.remover.mockResolvedValue(undefined);
        montar();
        const linhas = await screen.findAllByTestId('decorado-ambiente');
        fireEvent.click(within(linhas[1]).getByRole('button', { name: 'Remover o ambiente' }));
        await waitFor(() => expect(screen.getAllByTestId('decorado-ambiente').map((li) => li.textContent)).toEqual(['Sala']));
        expect(servico.remover).toHaveBeenCalledWith(SUITE);
        expect(confirmar.mock.calls[0][0].title).toBe('Remover o ambiente Suíte da tipologia Tipo 1?');
    });

    it('só leitura: sem formulário de ambiente nem botões de mudar', async () => {
        montar({ somenteLeitura: 'Você não tem permissão para editar este empreendimento.' });
        await screen.findAllByTestId('decorado-ambiente');
        expect(screen.queryByTestId('novo-ambiente')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Remover o ambiente' })).toBeNull();
    });

    it('sem a migration: o motivo escrito, sem lista', async () => {
        servico.listar.mockRejectedValue(new Error('O banco ainda não tem o cadastro do decorado por tipologia — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110990000).'));
        montar();
        expect((await screen.findByRole('alert')).textContent).toContain('falta aplicar a migration');
        expect(screen.queryByTestId('decorado-editor')).toBeNull();
    });
});
