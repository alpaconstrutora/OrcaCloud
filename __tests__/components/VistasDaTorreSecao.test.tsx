// @vitest-environment jsdom
/**
 * VISTA DA JANELA (Espelho de Vendas 3D, F6 — 10/11/2026): o cadastro, dentro do card da torre. Uma foto por faixa de
 * andares (e face, se quiser). Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VistaDaTorre } from '../../utils/espelhoVistaDaJanela';

const servico = vi.hoisted(() => ({ listar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() }));
vi.mock('../../services/empreendimentoTowerVistasService', () => ({ empreendimentoTowerVistasService: servico }));
const confirmar = vi.hoisted(() => vi.fn());
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast, localToast: null }) }));

import VistasDaTorreSecao, { faixaSugerida } from '../../components/empreendimento/VistasDaTorreSecao';

const BAIXOS: VistaDaTorre = { id: 'v1', tower_id: 't1', andar_de: 0, andar_ate: 3, orientacao: null, imagem_url: 'https://x/baixos.jpg', imagem_path: 'o1/e1/vistas/baixos.jpg', legenda: 'Vista para a praça' };
const arquivo = () => new File(['x'], 'vista.jpg', { type: 'image/jpeg' });

const montar = (over: Partial<React.ComponentProps<typeof VistasDaTorreSecao>> = {}) =>
    render(<VistasDaTorreSecao towerId="t1" towerName="Torre A" empreendimentoId="e1" organizationId="o1" {...over} />);
const preencher = (de: string, ate: string) => {
    fireEvent.change(screen.getByLabelText('Do andar'), { target: { value: de } });
    fireEvent.change(screen.getByLabelText('Até o andar'), { target: { value: ate } });
};
const escolherFoto = (f = arquivo()) => {
    fireEvent.change(screen.getByTestId('nova-vista').querySelector('input[type=file]')!, { target: { files: [f] } });
    return f;
};

beforeEach(() => {
    for (const f of Object.values(servico)) f.mockReset();
    confirmar.mockReset();
    showToast.mockReset();
    servico.listar.mockResolvedValue([BAIXOS]);
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:previa');
    globalThis.URL.revokeObjectURL = vi.fn();
});

describe('VistasDaTorreSecao', () => {
    it('lista as vistas gravadas dizendo o que cada uma cobre', async () => {
        montar();
        const linha = await screen.findByTestId('vista-gravada');
        expect(servico.listar).toHaveBeenCalledWith('t1');
        expect(within(linha).getByText('Térreo ao 3º pavimento · qualquer face')).toBeTruthy();
        expect(within(linha).getByText('Vista para a praça')).toBeTruthy();
        expect(screen.getByText('1 foto(s)')).toBeTruthy();
    });

    it('"Salvar vista" fica desligado dizendo o que falta: a foto, depois a faixa', async () => {
        montar();
        await screen.findByTestId('vista-gravada');
        const botao = screen.getByRole('button', { name: 'Salvar vista' });
        expect(botao).toBeDisabled();
        expect(screen.getByTestId('nova-vista-motivo').textContent).toBe('Escolha a foto da vista.');
        escolherFoto();
        expect(screen.getByTestId('nova-vista-motivo').textContent).toMatch(/andar inicial/);
        preencher('5', '2');
        expect(screen.getByTestId('nova-vista-motivo').textContent).toMatch(/não pode ser menor/);
        expect(botao).toBeDisabled();
        preencher('4', '12');
        expect(screen.queryByTestId('nova-vista-motivo')).toBeNull();
        expect(botao).not.toBeDisabled();
    });

    it('adicionar grava a faixa, a face e a legenda; a vista entra na lista em ordem e o formulário limpa', async () => {
        servico.adicionar.mockResolvedValue({ id: 'v2', tower_id: 't1', andar_de: 4, andar_ate: 12, orientacao: 'NORTE', imagem_url: 'https://x/altos.jpg', imagem_path: 'p', legenda: 'Serra ao fundo' });
        montar();
        await screen.findByTestId('vista-gravada');
        const f = escolherFoto();
        preencher('4', '12');
        fireEvent.change(screen.getByLabelText('Face da torre'), { target: { value: 'NORTE' } });
        fireEvent.change(screen.getByLabelText('Legenda (opcional)'), { target: { value: ' Serra ao fundo ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar vista' }));
        await waitFor(() => expect(screen.getAllByTestId('vista-gravada')).toHaveLength(2));
        expect(servico.adicionar).toHaveBeenCalledWith({ organizationId: 'o1', empreendimentoId: 'e1', towerId: 't1', andar_de: 4, andar_ate: 12, orientacao: 'NORTE', legenda: 'Serra ao fundo', arquivo: f });
        expect(within(screen.getAllByTestId('vista-gravada')[1]).getByText('4º ao 12º pavimento · face Norte')).toBeTruthy();
        expect(showToast).toHaveBeenCalledWith('Vista da Torre A gravada: 4º ao 12º pavimento · face Norte.');
        expect((screen.getByLabelText('Do andar') as HTMLInputElement).value).toBe('');
        expect(screen.getByRole('button', { name: 'Salvar vista' })).toBeDisabled();
    });

    // 10/11/2026, o usuário: "carreguei as imagens mas nao tem botão salvar ou algo do tipo e as imagens nao permanecem".
    it('com os andares da torre, a faixa já nasce preenchida: escolher a foto liga o "Salvar vista" e avisa que falta salvar', async () => {
        servico.adicionar.mockResolvedValue({ ...BAIXOS, id: 'v9', andar_de: 0, andar_ate: 3 });
        montar({ andaresDaTorre: [-2, -1, 0, 0, 1, 2, 3, null] });
        await screen.findByTestId('vista-gravada');
        // Do térreo (garagem não tem janela) ao último andar.
        expect((screen.getByLabelText('Do andar') as HTMLInputElement).value).toBe('0');
        expect((screen.getByLabelText('Até o andar') as HTMLInputElement).value).toBe('3');
        expect(screen.getByRole('button', { name: 'Salvar vista' })).toBeDisabled();
        expect(screen.queryByTestId('nova-vista-por-salvar')).toBeNull();
        const f = escolherFoto();
        expect(screen.getByRole('button', { name: 'Salvar vista' })).not.toBeDisabled();
        expect(screen.getByTestId('nova-vista-por-salvar').textContent).toMatch(/ainda não foi gravada/);
        fireEvent.click(screen.getByRole('button', { name: 'Salvar vista' }));
        await waitFor(() => expect(servico.adicionar).toHaveBeenCalledWith(expect.objectContaining({ andar_de: 0, andar_ate: 3, arquivo: f })));
    });

    it('as unidades chegam depois de o card abrir: a sugestão entra, mas não passa por cima do que foi digitado', async () => {
        const { rerender } = montar();
        await screen.findByTestId('vista-gravada');
        expect((screen.getByLabelText('Do andar') as HTMLInputElement).value).toBe('');
        rerender(<VistasDaTorreSecao towerId="t1" towerName="Torre A" empreendimentoId="e1" organizationId="o1" andaresDaTorre={[1, 5]} />);
        expect((screen.getByLabelText('Até o andar') as HTMLInputElement).value).toBe('5');
        preencher('2', '4');
        rerender(<VistasDaTorreSecao towerId="t1" towerName="Torre A" empreendimentoId="e1" organizationId="o1" andaresDaTorre={[1, 9]} />);
        expect((screen.getByLabelText('Até o andar') as HTMLInputElement).value).toBe('4');
    });

    it('torre só com subsolo usa os andares que tem; sem unidade com andar, a faixa fica vazia', () => {
        expect(faixaSugerida([-2, -1])).toEqual({ de: '-2', ate: '-1' });
        expect(faixaSugerida([null, undefined])).toEqual({ de: '', ate: '' });
        expect(faixaSugerida(undefined)).toEqual({ de: '', ate: '' });
    });

    it('subsolo e térreo valem como andar (-1, 0)', async () => {
        servico.adicionar.mockResolvedValue({ ...BAIXOS, id: 'v3', andar_de: -1, andar_ate: 0 });
        montar();
        await screen.findByTestId('vista-gravada');
        escolherFoto();
        preencher('-1', '0');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar vista' }));
        await waitFor(() => expect(servico.adicionar).toHaveBeenCalledWith(expect.objectContaining({ andar_de: -1, andar_ate: 0, orientacao: null, legenda: null })));
    });

    it('falhou ao gravar: o motivo aparece como erro, nada entra na lista e o que foi digitado fica', async () => {
        servico.adicionar.mockRejectedValue(new Error('A vista não foi gravada — você não tem permissão para alterar esta torre.'));
        montar();
        await screen.findByTestId('vista-gravada');
        escolherFoto();
        preencher('4', '12');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar vista' }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('não foi gravada'), 'error'));
        expect(screen.getAllByTestId('vista-gravada')).toHaveLength(1);
        expect((screen.getByLabelText('Do andar') as HTMLInputElement).value).toBe('4');
    });

    it('remover pede confirmação dizendo a faixa e o efeito nos portais; confirmada, a vista sai', async () => {
        confirmar.mockResolvedValue(true);
        servico.remover.mockResolvedValue(undefined);
        montar();
        fireEvent.click(within(await screen.findByTestId('vista-gravada')).getByTitle('Remover vista'));
        await waitFor(() => expect(servico.remover).toHaveBeenCalledWith(BAIXOS));
        expect(confirmar.mock.calls[0][0]).toMatchObject({ title: 'Remover esta vista?', variant: 'danger' });
        expect(String(confirmar.mock.calls[0][0].message)).toMatch(/Térreo ao 3º pavimento/);
        await waitFor(() => expect(screen.queryByTestId('vista-gravada')).toBeNull());
        expect(screen.getByText('Nenhuma vista cadastrada nesta torre.')).toBeTruthy();
    });

    it('confirmação recusada: nada sai', async () => {
        confirmar.mockResolvedValue(false);
        montar();
        fireEvent.click(within(await screen.findByTestId('vista-gravada')).getByTitle('Remover vista'));
        await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
        expect(servico.remover).not.toHaveBeenCalled();
    });

    it('banco sem a tabela (migration por aplicar): o motivo aparece e o formulário não', async () => {
        servico.listar.mockRejectedValue(new Error('O banco ainda não tem o cadastro de vistas da janela — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110600000).'));
        montar();
        expect((await screen.findByRole('alert')).textContent).toMatch(/falta aplicar a migration/);
        expect(screen.queryByTestId('nova-vista')).toBeNull();
    });

    it('só leitura: as vistas aparecem, sem remover nem adicionar', async () => {
        montar({ somenteLeitura: 'Sem permissão para editar a viabilidade.' });
        const linha = await screen.findByTestId('vista-gravada');
        expect(within(linha).queryByTitle('Remover vista')).toBeNull();
        expect(screen.queryByTestId('nova-vista')).toBeNull();
    });
});
