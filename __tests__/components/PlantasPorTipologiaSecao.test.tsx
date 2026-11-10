// @vitest-environment jsdom
/**
 * PLANTA BAIXA POR TIPOLOGIA (Espelho de Vendas 3D, F5 — 10/11/2026): o cadastro, em Torres & Unidades. As tipologias
 * vêm do que já está cadastrado; aqui só se sobe, troca e remove a imagem. Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlantaDaTipologia } from '../../utils/espelhoPlantaDaTipologia';

const servico = vi.hoisted(() => ({
    tipologiasNoCadastro: vi.fn(),
    listar: vi.fn(),
    salvar: vi.fn(),
    remover: vi.fn(),
}));
vi.mock('../../services/empreendimentoTipologiaPlantasService', () => ({ empreendimentoTipologiaPlantasService: servico }));
const confirmar = vi.hoisted(() => vi.fn());
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast, localToast: null }) }));

import PlantasPorTipologiaSecao from '../../components/empreendimento/PlantasPorTipologiaSecao';

const TIPO2: PlantaDaTipologia = { id: 'p2', empreendimento_id: 'e1', tipologia: 'Tipo 2', tipologia_chave: 'tipo 2', imagem_url: 'https://x/tipo2.png', imagem_path: 'o1/e1/plantas/tipo2.png' };
const arquivo = () => new File(['x'], 'planta tipo 1.png', { type: 'image/png' });

const montar = (over: Partial<React.ComponentProps<typeof PlantasPorTipologiaSecao>> = {}) =>
    render(<PlantasPorTipologiaSecao empreendimentoId="e1" organizationId="o1" buildingId="b1" {...over} />);

beforeEach(() => {
    for (const f of Object.values(servico)) f.mockReset();
    confirmar.mockReset();
    showToast.mockReset();
    servico.tipologiasNoCadastro.mockResolvedValue({ unidades: ['Tipo 1', 'Tipo 1', 'Tipo 2'], imoveis: ['Tipo 1', 'Tipo 5'] });
    servico.listar.mockResolvedValue([TIPO2]);
});

describe('PlantasPorTipologiaSecao', () => {
    it('lista as tipologias do cadastro (unidades e imóveis do prédio), com quantas unidades e quantas já têm planta', async () => {
        montar();
        expect(await screen.findByTestId('planta-tipo 1')).toBeTruthy();
        expect(servico.tipologiasNoCadastro).toHaveBeenCalledWith('e1', 'b1');
        expect(within(screen.getByTestId('planta-tipo 1')).getByText('2 unidades')).toBeTruthy();
        expect(within(screen.getByTestId('planta-tipo 5')).getByText('1 unidade')).toBeTruthy();
        expect(within(screen.getByTestId('planta-tipo 2')).getByAltText('Prévia da imagem').getAttribute('src')).toBe('https://x/tipo2.png');
        expect(screen.getByText('1 de 3 tipologia(s) com planta')).toBeTruthy();
    });

    it('subir a imagem grava a planta da tipologia, com o nome como está no cadastro, e a prévia aparece', async () => {
        servico.salvar.mockResolvedValue({ id: 'p1', tipologia: 'Tipo 1', tipologia_chave: 'tipo 1', imagem_url: 'https://x/tipo1.png', imagem_path: 'o1/e1/plantas/a.png' });
        montar();
        const cartao = await screen.findByTestId('planta-tipo 1');
        const f = arquivo();
        fireEvent.change(cartao.querySelector('input[type=file]')!, { target: { files: [f] } });
        await waitFor(() => expect(within(screen.getByTestId('planta-tipo 1')).getByAltText('Prévia da imagem').getAttribute('src')).toBe('https://x/tipo1.png'));
        expect(servico.salvar).toHaveBeenCalledWith({ organizationId: 'o1', empreendimentoId: 'e1', tipologia: 'Tipo 1', arquivo: f, anterior: null });
        expect(showToast).toHaveBeenCalledWith('Planta da tipologia Tipo 1 gravada.');
        expect(screen.getByText('2 de 3 tipologia(s) com planta')).toBeTruthy();
    });

    it('falhou ao gravar: o motivo aparece como erro e a tipologia segue sem planta (não um "gravada" falso)', async () => {
        servico.salvar.mockRejectedValue(new Error('A planta da tipologia Tipo 1 não foi gravada — você não tem permissão para alterar este empreendimento.'));
        montar();
        const cartao = await screen.findByTestId('planta-tipo 1');
        fireEvent.change(cartao.querySelector('input[type=file]')!, { target: { files: [arquivo()] } });
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('não foi gravada'), 'error'));
        expect(within(screen.getByTestId('planta-tipo 1')).queryByAltText('Prévia da imagem')).toBeNull();
    });

    it('remover pede confirmação dizendo o efeito nos portais; recusada, nada sai', async () => {
        confirmar.mockResolvedValue(false);
        montar();
        const cartao = await screen.findByTestId('planta-tipo 2');
        fireEvent.click(within(cartao).getByTitle('Remover imagem'));
        await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
        expect(confirmar.mock.calls[0][0]).toMatchObject({ title: 'Remover a planta da tipologia Tipo 2?', variant: 'danger' });
        expect(servico.remover).not.toHaveBeenCalled();
    });

    it('remoção confirmada: a planta sai da lista', async () => {
        confirmar.mockResolvedValue(true);
        servico.remover.mockResolvedValue(undefined);
        montar();
        const cartao = await screen.findByTestId('planta-tipo 2');
        fireEvent.click(within(cartao).getByTitle('Remover imagem'));
        await waitFor(() => expect(servico.remover).toHaveBeenCalledWith(TIPO2));
        await waitFor(() => expect(within(screen.getByTestId('planta-tipo 2')).queryByAltText('Prévia da imagem')).toBeNull());
        expect(screen.getByText('0 de 3 tipologia(s) com planta')).toBeTruthy();
    });

    it('nenhuma unidade com tipologia: diz onde preencher, em vez de uma grade vazia', async () => {
        servico.tipologiasNoCadastro.mockResolvedValue({ unidades: [null], imoveis: [] });
        servico.listar.mockResolvedValue([]);
        montar();
        expect(await screen.findByText(/Nenhuma unidade deste empreendimento tem tipologia/)).toBeTruthy();
    });

    it('banco sem a tabela (migration por aplicar): o motivo aparece na tela', async () => {
        servico.listar.mockRejectedValue(new Error('O banco ainda não tem o cadastro de plantas por tipologia — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110500000).'));
        montar();
        expect((await screen.findByRole('alert')).textContent).toMatch(/falta aplicar a migration/);
    });

    it('só leitura: a planta aparece, sem trocar nem remover', async () => {
        montar({ somenteLeitura: 'Sem permissão para editar a viabilidade.' });
        const cartao = await screen.findByTestId('planta-tipo 2');
        expect(within(cartao).getByAltText('Prévia da imagem')).toBeTruthy();
        expect(within(cartao).queryByTitle('Remover imagem')).toBeNull();
        expect(within(cartao).queryByText('Trocar')).toBeNull();
    });
});
