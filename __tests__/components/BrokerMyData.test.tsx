// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrokerMyData, { formatarComissao, formatarCpf } from '../../components/broker/BrokerMyData';
import type { BrokerProfile } from '../../types';

/**
 * "Meus dados" do Portal do Corretor.
 *
 * Em 14/10/2026 nenhum corretor com link ativo tinha CPF nem CRECI cadastrados,
 * então o navegador prova a ligação (menu → painel) mas não prova a formatação
 * do CPF nem que linha sem valor some. É o que este teste cobre.
 */

const corretor: BrokerProfile = {
    id: 'b1',
    organization_id: 'o1',
    name: 'Álvaro Esteves Junior',
    email: 'alvaroestevesjr@gmail.com',
    phone: '35987062185',
    cpf: '12345678901',
    creci: '12345-F',
    agency_name: 'Esteves Imóveis',
    commission_rate: 5,
    is_active: true,
    created_at: '2026-07-14T10:00:00Z',
};

describe('Portal do Corretor · Meus dados', () => {
    it('mostra os três blocos do cadastro quando o dado existe', () => {
        render(<BrokerMyData broker={corretor} />);

        expect(screen.getByText('Identificação')).toBeInTheDocument();
        expect(screen.getByText('Contato')).toBeInTheDocument();
        expect(screen.getByText('Comissão')).toBeInTheDocument();
        expect(screen.getByText('Álvaro Esteves Junior')).toBeInTheDocument();
        expect(screen.getByText('12345-F')).toBeInTheDocument();
        expect(screen.getByText('Esteves Imóveis')).toBeInTheDocument();
        expect(screen.getByText('alvaroestevesjr@gmail.com')).toBeInTheDocument();
        expect(screen.getByText('Ativo')).toBeInTheDocument();
    });

    it('formata CPF e comissão em vez de despejar o valor cru', () => {
        render(<BrokerMyData broker={corretor} />);

        expect(screen.getByText('123.456.789-01')).toBeInTheDocument();
        expect(screen.getByText('5,00%')).toBeInTheDocument();
        expect(formatarCpf('123')).toBe('123');
        expect(formatarComissao(null)).toBe('');
        expect(formatarComissao(2.5)).toBe('2,50%');
    });

    it('campo sem valor some em vez de virar linha "—"', () => {
        const semCreci: BrokerProfile = { ...corretor, cpf: undefined, creci: '', agency_name: undefined, phone: undefined };
        render(<BrokerMyData broker={semCreci} />);

        expect(screen.queryByText('CPF')).not.toBeInTheDocument();
        expect(screen.queryByText('CRECI')).not.toBeInTheDocument();
        expect(screen.queryByText('Imobiliária / Agência')).not.toBeInTheDocument();
        expect(screen.queryByText('Telefone')).not.toBeInTheDocument();
        // O e-mail sozinho ainda sustenta o bloco de contato.
        expect(screen.getByText('Contato')).toBeInTheDocument();
    });

    it('corretor inativo aparece como inativo, não some', () => {
        render(<BrokerMyData broker={{ ...corretor, is_active: false }} />);
        expect(screen.getByText('Inativo')).toBeInTheDocument();
    });

    it('sem cadastro em mãos, explica em vez de quebrar', () => {
        render(<BrokerMyData broker={null} />);
        expect(screen.getByText('Cadastro indisponível')).toBeInTheDocument();
    });
});
