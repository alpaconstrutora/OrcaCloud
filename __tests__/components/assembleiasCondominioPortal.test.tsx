// @vitest-environment jsdom
/**
 * Portal do Cliente › Condomínio › Assembleias — a cédula renderizada (Task A8).
 * Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R2, R3, R5, R9).
 *
 * As regras puras (motivo, opções, voto local, percentual) estão em
 * `__tests__/condominioPortalCliente.test.ts`. Aqui fica o que só aparece
 * clicando: o motivo VISÍVEL ao lado do botão desligado (não só no `title`),
 * uma cédula por unidade, a confirmação ao trocar o voto, e a encerrada com
 * resultado e "Baixar ata" — que abre pelo MESMO resolvedor dos Documentos.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PainelAssembleias } from '../../components/client/AssembleiasCondominio';
import CondominioTab from '../../components/client/CondominioTab';
import { ConfirmProvider } from '../../components/ui/confirm';
import { CONDOMINIO_VAZIO, type PortalAssembleia, type PortalCondominio } from '../../services/clientPortalService';

const base = (over: Partial<PortalAssembleia> = {}): PortalAssembleia => ({
    id: 'a1', condominioNome: 'Bella Vista', tipo: 'AGO', titulo: 'AGO 2026',
    local: 'Salão de festas', linkTransmissao: 'https://meet.exemplo/ago',
    primeiraConvocacaoEm: '2026-12-10T22:00:00Z', segundaConvocacaoEm: '2026-12-10T22:30:00Z',
    status: 'CONVOCADA',
    itens: [
        { id: 'i1', ordem: 1, titulo: 'Aprovar contas de 2026', descricao: 'Balanço anexo ao edital.', tipo: 'APROVACAO', opcoes: null, quorum: 'MAIORIA_PRESENTES' },
        { id: 'i2', ordem: 2, titulo: 'Eleger síndico', descricao: null, tipo: 'ESCOLHA', opcoes: ['Ana', 'Bruno'], quorum: 'MAIORIA_PRESENTES' },
    ],
    sessaoValida: true,
    minhasUnidades: [{ unitId: 'u1', rotulo: 'Apto 101', impedida: null, votos: {} }],
    resultado: null, ataDocumentoId: null, ...over,
});

const montar = (ui: React.ReactElement) => render(<ConfirmProvider>{ui}</ConfirmProvider>);

/** Abre a assembleia da lista (a lista é a primeira tela do painel). */
const abrirAssembleia = (titulo = 'AGO 2026') =>
    fireEvent.click(screen.getByRole('button', { name: new RegExp(titulo) }));

const botaoOpcao = (cedula: HTMLElement, item: string, opcao: string) =>
    within(within(cedula).getByTestId(`item-${item}`)).getByRole('button', { name: new RegExp(`^${opcao}`) });

describe('PainelAssembleias — cédula', () => {
    it('cédula sem sessão desligada com o motivo', () => {
        montar(<PainelAssembleias assembleias={[base({ sessaoValida: false })]} multi={false} onVotar={vi.fn()} />);
        abrirAssembleia();
        const cedula = screen.getByTestId('cedula-u1');
        expect(within(cedula).getByText('Entre com e-mail e senha para votar.')).toBeInTheDocument();
        expect(botaoOpcao(cedula, 'i1', 'Sim')).toBeDisabled();
        expect(botaoOpcao(cedula, 'i2', 'Ana')).toBeDisabled();
    });

    it('impedida mostra o motivo do banco', () => {
        montar(<PainelAssembleias
            assembleias={[base({ minhasUnidades: [{ unitId: 'u1', rotulo: 'Apto 101', impedida: 'cota de 10/2026 vencida', votos: {} }] })]}
            multi={false} onVotar={vi.fn()} />);
        abrirAssembleia();
        const cedula = screen.getByTestId('cedula-u1');
        expect(within(cedula).getByText(/cota de 10\/2026 vencida/)).toBeInTheDocument();
        expect(botaoOpcao(cedula, 'i1', 'Sim')).toBeDisabled();
    });

    it('uma cédula por unidade do cliente', async () => {
        const onVotar = vi.fn().mockResolvedValue(undefined);
        montar(<PainelAssembleias
            assembleias={[base({
                minhasUnidades: [
                    { unitId: 'u1', rotulo: 'Apto 101', impedida: null, votos: {} },
                    { unitId: 'u2', rotulo: 'Apto 102', impedida: null, votos: {} },
                ],
            })]}
            multi={false} onVotar={onVotar} />);
        abrirAssembleia();
        const c1 = screen.getByTestId('cedula-u1');
        const c2 = screen.getByTestId('cedula-u2');
        expect(within(c1).getByText(/Apto 101/)).toBeInTheDocument();
        expect(within(c2).getByText(/Apto 102/)).toBeInTheDocument();
        // o voto sai pela unidade da cédula clicada, não pela primeira
        fireEvent.click(botaoOpcao(c2, 'i1', 'Não'));
        await waitFor(() => expect(onVotar).toHaveBeenCalledWith('i1', 'u2', 'NAO'));
    });

    it('voto já dado aparece marcado com a data e a origem; trocar pede confirmação', async () => {
        const onVotar = vi.fn().mockResolvedValue(undefined);
        montar(<PainelAssembleias
            assembleias={[base({
                minhasUnidades: [{
                    unitId: 'u1', rotulo: 'Apto 101', impedida: null,
                    votos: { i1: { opcao: 'SIM', origem: 'PRESENCIAL', votadoEm: '2026-12-10T22:40:00Z' } },
                }],
            })]}
            multi={false} onVotar={onVotar} />);
        abrirAssembleia();
        const cedula = screen.getByTestId('cedula-u1');
        // 22:40Z = 19:40 em Brasília
        expect(within(cedula).getByText('votado em 10/12/2026 às 19:40 (na reunião)')).toBeInTheDocument();
        expect(botaoOpcao(cedula, 'i1', 'Sim')).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(botaoOpcao(cedula, 'i1', 'Não'));
        // confirmação aberta, e nada gravado antes do "sim"
        expect(await screen.findByText('Trocar o voto?')).toBeInTheDocument();
        expect(onVotar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Trocar voto' }));
        await waitFor(() => expect(onVotar).toHaveBeenCalledWith('i1', 'u1', 'NAO'));
    });

    it('erro do voto aparece traduzido na cédula', async () => {
        const onVotar = vi.fn().mockRejectedValue(new Error('Unidade impedida de votar: cota de 11/2026 vencida'));
        montar(<PainelAssembleias assembleias={[base()]} multi={false} onVotar={onVotar} />);
        abrirAssembleia();
        fireEvent.click(botaoOpcao(screen.getByTestId('cedula-u1'), 'i1', 'Sim'));
        expect(await screen.findByText('Unidade impedida de votar: cota de 11/2026 vencida')).toBeInTheDocument();
    });

    it('inquilino (sem unidade própria na assembleia) vê a pauta e o porquê de não haver cédula', () => {
        montar(<PainelAssembleias assembleias={[base({ minhasUnidades: [] })]} multi={false} onVotar={vi.fn()} />);
        abrirAssembleia();
        expect(screen.getByText(/Aprovar contas de 2026/)).toBeInTheDocument();
        expect(screen.queryByTestId('cedula-u1')).toBeNull();
        expect(screen.getByText(/só o proprietário/i)).toBeInTheDocument();
    });
});

describe('PainelAssembleias — encerrada', () => {
    const encerrada = (ata: string | null) => base({
        status: 'ENCERRADA', ataDocumentoId: ata,
        minhasUnidades: [{
            unitId: 'u1', rotulo: 'Apto 101', impedida: null,
            votos: { i1: { opcao: 'SIM', origem: 'PORTAL', votadoEm: '2026-12-05T15:00:00Z' } },
        }],
        resultado: [
            {
                itemId: 'i1', ordem: 1, titulo: 'Aprovar contas de 2026', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES',
                porOpcao: { SIM: { fracao: 0.00375, unidades: 3 }, NAO: { fracao: 0.00125, unidades: 1 }, ABSTENCAO: { fracao: 0, unidades: 0 } },
                resultado: 'APROVADO', vencedora: null,
            },
            {
                itemId: 'i2', ordem: 2, titulo: 'Eleger síndico', tipo: 'ESCOLHA', quorum: 'MAIORIA_PRESENTES',
                porOpcao: { Ana: { fracao: 0.0025, unidades: 2 }, Bruno: { fracao: 0.00125, unidades: 1 }, ABSTENCAO: { fracao: 0.00125, unidades: 1 } },
                resultado: 'APROVADO', vencedora: 'Ana',
            },
        ],
    });

    it('encerrada mostra resultado e Baixar ata', async () => {
        const onResolverDocumento = vi.fn().mockResolvedValue('https://assinado/ata.pdf');
        const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
        montar(<PainelAssembleias assembleias={[encerrada('doc-ata')]} multi={false} onVotar={vi.fn()} onResolverDocumento={onResolverDocumento} />);
        abrirAssembleia();

        const r1 = screen.getByTestId('resultado-i1');
        expect(within(r1).getByText('Aprovado')).toBeInTheDocument();
        expect(within(r1).getByText(/75,00%/)).toBeInTheDocument();
        expect(within(screen.getByTestId('resultado-i2')).getByText('Vencedora: Ana')).toBeInTheDocument();

        // o voto da unidade continua visível, e a cédula diz por que não vota mais
        const cedula = screen.getByTestId('cedula-u1');
        expect(within(cedula).getByText('Votação encerrada.')).toBeInTheDocument();
        expect(botaoOpcao(cedula, 'i1', 'Sim')).toHaveAttribute('aria-pressed', 'true');
        expect(botaoOpcao(cedula, 'i1', 'Sim')).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /Baixar ata/ }));
        await waitFor(() => expect(onResolverDocumento).toHaveBeenCalledWith('doc-ata'));
        abrir.mockRestore();
    });

    it('sem ata publicada, "Baixar ata" fica desligado dizendo por quê', () => {
        montar(<PainelAssembleias assembleias={[encerrada(null)]} multi={false} onVotar={vi.fn()} />);
        abrirAssembleia();
        expect(screen.getByRole('button', { name: /Baixar ata/ })).toBeDisabled();
        expect(screen.getByText('A ata ainda não foi publicada.')).toBeInTheDocument();
    });
});

describe('CondominioTab — sub-aba Assembleias', () => {
    const dados: PortalCondominio = {
        ...CONDOMINIO_VAZIO,
        unidades: [{
            unitId: 'u1', unidade: 'Apto 101', torre: 'Torre Única', pavimento: 1,
            tipologia: 'Apartamento', areaPrivativa: 60, fracaoIdeal: 0.00125,
            fracaoOrigem: 'CONVENCAO', papeis: ['PROPRIETARIO'],
            condominioId: 'c-007', condominioCode: '007',
            condominioNome: '007 - Bella Vista', condominioCnpj: null, ocupacoes: [],
        }],
    };

    it('fica entre Avisos e Documentos e abre as assembleias recebidas', () => {
        montar(<CondominioTab dados={dados} loading={false} assembleias={[base()]} onVotar={vi.fn()} />);
        const rotulos = screen.getAllByRole('button').map(b => b.textContent ?? '');
        const iAvisos = rotulos.findIndex(t => t.startsWith('Avisos'));
        const iAssembleias = rotulos.findIndex(t => t.startsWith('Assembleias'));
        const iDocumentos = rotulos.findIndex(t => t.startsWith('Documentos do condomínio'));
        expect(iAvisos).toBeGreaterThan(-1);
        expect(iAssembleias).toBe(iAvisos + 1);
        expect(iDocumentos).toBe(iAssembleias + 1);

        fireEvent.click(screen.getByRole('button', { name: /^Assembleias/ }));
        expect(screen.getByRole('button', { name: /AGO 2026/ })).toBeInTheDocument();
    });
});
