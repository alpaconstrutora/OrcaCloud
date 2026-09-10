// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortalMyData from '../../components/supplier/portal/PortalMyData';
import { Supplier } from '../../types';
import { SupplierBankAccount } from '../../types/supplierBankAccount';

/**
 * "Meus dados" do Portal do Fornecedor.
 *
 * Existe porque dois dos quatro blocos da tela dependem de dado que quase
 * nenhum fornecedor do banco tem ao mesmo tempo: o de dados oficiais só aparece
 * com consulta CNPJa feita, e o bancário só com conta cadastrada (em 09/09/2026,
 * UM fornecedor de 243 tinha conta, e ele é PF sem CNPJ). Dirigir o navegador
 * prova a ligação — menu, painel, RPC — mas não consegue provar esses dois
 * blocos com os dados que existem lá. É o que este teste cobre.
 */

const fornecedorPJ: Supplier = {
    id: 's1',
    code: '001',
    name: 'Construtora Alfa Materiais Ltda',
    nickname: 'Alfa Materiais',
    contact_name: 'Joana Ribeiro',
    email: 'contato@alfa.com.br',
    phone: '(35) 99999-0000',
    document: '12345678000199',
    type: 'PJ',
    category: 'Loja de Materiais de Construção',
    portal: 'Portal do Fornecedor',
    street: 'Rua das Acácias',
    number: '120',
    neighborhood: 'Centro',
    city: 'Cambuí',
    state: 'MG',
    zip_code: '37600000',
    created_at: '2026-02-14T10:00:00Z',
    cnpj_status: 'ATIVA',
    cnpj_status_date: '2020-05-10',
    cnpj_founded_at: '2015-03-02',
    cnpj_legal_nature: 'Sociedade Empresária Limitada',
    cnpj_company_size: 'ME',
    cnpj_main_activity_code: '4744-0/99',
    cnpj_main_activity_text: 'Comércio varejista de materiais de construção',
    cnpj_side_activities: [{ code: '4679-6/99', text: 'Comércio atacadista de materiais' }],
    cnpj_partners: [{ name: 'Joana Ribeiro', role: 'Sócia-Administradora' }],
    cnpj_simples_optant: true,
    cnpj_simples_since: '2016-01-01',
    cnpj_simei_optant: false,
    cnpj_state_registrations: [{ state: 'MG', number: '0011223344', enabled: true }],
};

const conta: SupplierBankAccount = {
    id: 'b1',
    supplier_id: 's1',
    bank_code: '341',
    bank_name: 'Itaú Unibanco',
    agency: '1234',
    agency_digit: '5',
    account: '98765',
    account_digit: '4',
    account_type: 'corrente',
    beneficiary_name: 'Construtora Alfa Materiais Ltda',
    beneficiary_document: '12.345.678/0001-99',
    pix_key: 'contato@alfa.com.br',
    pix_key_type: 'email',
    is_pix_primary: true,
    is_primary: true,
    status: 'ativo',
};

describe('Portal do Fornecedor · Meus dados', () => {
    it('mostra os quatro blocos do cadastro quando o dado existe', () => {
        render(<PortalMyData supplier={fornecedorPJ} bankAccounts={[conta]} loadingBankAccounts={false} />);

        expect(screen.getByText('Identificação')).toBeInTheDocument();
        expect(screen.getByText('Endereço e contato')).toBeInTheDocument();
        expect(screen.getByText('Dados oficiais')).toBeInTheDocument();
        expect(screen.getByText('Dados bancários')).toBeInTheDocument();
    });

    it('formata documento e CEP em vez de despejar os dígitos crus', () => {
        render(<PortalMyData supplier={fornecedorPJ} bankAccounts={[]} loadingBankAccounts={false} />);

        expect(screen.getByText('12.345.678/0001-99')).toBeInTheDocument();
        expect(screen.getByText('37600-000')).toBeInTheDocument();
        // O rótulo acompanha o tipo — CNPJ para PJ, CPF para PF.
        expect(screen.getByText('CNPJ')).toBeInTheDocument();
    });

    it('traz a conta bancária inteira: agência com dígito, conta, tipo e chave PIX', () => {
        render(<PortalMyData supplier={fornecedorPJ} bankAccounts={[conta]} loadingBankAccounts={false} />);

        expect(screen.getByText('341 — Itaú Unibanco')).toBeInTheDocument();
        expect(screen.getByText('1234-5')).toBeInTheDocument();
        expect(screen.getByText('98765-4')).toBeInTheDocument();
        expect(screen.getByText('Conta Corrente')).toBeInTheDocument();
        expect(screen.getByText('Chave PIX (E-mail)')).toBeInTheDocument();
        expect(screen.getByText('Principal')).toBeInTheDocument();
        expect(screen.getByText('PIX principal')).toBeInTheDocument();
    });

    it('sem conta cadastrada, o bloco bancário explica em vez de sumir', () => {
        render(<PortalMyData supplier={fornecedorPJ} bankAccounts={[]} loadingBankAccounts={false} />);

        expect(screen.getByText('Dados bancários')).toBeInTheDocument();
        expect(screen.getByText('Peça à construtora para registrar sua conta ou chave PIX.')).toBeInTheDocument();
    });

    it('fornecedor PF sem consulta à Receita não ganha um bloco "Dados oficiais" vazio', () => {
        const pf: Supplier = {
            id: 's2', name: 'Edson Francisco de Souza', type: 'PF',
            document: '12345678901', city: 'Cambuí', state: 'MG',
        };
        render(<PortalMyData supplier={pf} bankAccounts={[]} loadingBankAccounts={false} />);

        expect(screen.queryByText('Dados oficiais')).not.toBeInTheDocument();
        expect(screen.getByText('123.456.789-01')).toBeInTheDocument();
        expect(screen.getByText('CPF')).toBeInTheDocument();
    });

    it('campo vazio não vira linha com travessão', () => {
        const magro: Supplier = { id: 's3', name: 'Fornecedor Sem Dados', type: 'PJ' };
        render(<PortalMyData supplier={magro} bankAccounts={[]} loadingBankAccounts={false} />);

        // Sem telefone cadastrado, o rótulo "Telefone" não existe na tela — a
        // regra é o campo sumir, não aparecer como "Telefone —".
        expect(screen.queryByText('Telefone')).not.toBeInTheDocument();
        expect(screen.queryByText('Nome fantasia')).not.toBeInTheDocument();
        expect(screen.getByText('Fornecedor Sem Dados')).toBeInTheDocument();
    });

    /**
     * Desde 09/09/2026 este painel serve TAMBÉM o Portal do Parceiro, por uma
     * prop `accent` (§24, "Telas de detalhe compartilhadas" — reusar em vez de
     * duplicar). O que este caso trava é que o Portal do Fornecedor não pagou
     * nada por isso: sem passar `accent`, o coral continua sendo o acento.
     */
    it('sem `accent`, o acento segue sendo o coral do portal do fornecedor', () => {
        const { container } = render(
            <PortalMyData supplier={fornecedorPJ} bankAccounts={[]} loadingBankAccounts={false} />
        );
        expect(container.querySelectorAll('[class*="E1553C"]').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('.text-orange-500').length).toBe(0);
    });

    it('com accent="partner", troca para o laranja do portal do parceiro', () => {
        const { container } = render(
            <PortalMyData supplier={fornecedorPJ} bankAccounts={[]} loadingBankAccounts={false} accent="partner" />
        );
        expect(container.querySelectorAll('.text-orange-500').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('[class*="E1553C"]').length).toBe(0);
    });

    it('a tela diz que é leitura, e para quem pedir correção', () => {
        render(<PortalMyData supplier={fornecedorPJ} bankAccounts={[conta]} loadingBankAccounts={false} />);
        expect(
            screen.getByText(/somente leitura.*fale com a construtora/i),
        ).toBeInTheDocument();
    });
});
