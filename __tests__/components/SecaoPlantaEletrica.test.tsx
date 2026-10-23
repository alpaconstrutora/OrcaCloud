// @vitest-environment jsdom
/**
 * Seção "Planta › Elétrica" da gaveta Preferências — plano
 * docs/planos/2026-10-22-preferencias-planta-eletrica.md, seção 3.
 * O hook de preferências, o contexto de organização e o store são simulados. Confere: cada chave
 * grava no escopo certo (Tela = USUARIO, Prancha = ORGANIZACAO); a coluna Prancha trava com o motivo
 * quando não é gestor / topo em "Todas" / membros não carregados; dependentes de "Fios" e itens que
 * só a tela escreve travam com o motivo VISÍVEL; trocar a organização do topo recarrega a prancha.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chaveDoItem, ITENS_ELETRICOS } from '../../utils/preferencias/catalogo';
import { EXIBICAO_ELETRICA_PADRAO, type ExibicaoEletrica, type LinhaDePreferencia } from '../../utils/preferencias/resolver';
import { MOTIVO_PRANCHA_SO_GESTOR, MOTIVO_PRANCHA_TODAS } from '../../utils/preferencias/podeGerirPrancha';

const m = vi.hoisted(() => ({
  alterar: vi.fn(),
  usePreferencias: vi.fn(),
  org: { orgId: 'org-a' as string | null, isAllOrgs: false },
  store: {
    session: { user: { email: 'Eu@Empresa.com' } } as { user: { email: string } } | null,
    organizations: [] as unknown[],
  },
  // O que o hook devolve, por organização.
  tela: null as unknown,
  linhasDaTela: [] as unknown[],
  linhasDaPrancha: [] as unknown[],
  pranchaPorOrg: {} as Record<string, unknown>,
  carregando: false,
  erro: null as string | null,
}));

vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => m.org }));
vi.mock('../../store/useStore', () => ({
  useStore: (sel: (s: unknown) => unknown) => sel(m.store),
}));
vi.mock('../../hooks/usePreferenciasEletricas', () => ({
  usePreferenciasEletricas: (args: { organizationId: string | null }) => {
    m.usePreferencias(args);
    return {
      tela: m.tela ?? EXIBICAO_ELETRICA_PADRAO,
      prancha: (args.organizationId && m.pranchaPorOrg[args.organizationId]) || EXIBICAO_ELETRICA_PADRAO,
      linhasDaTela: m.linhasDaTela,
      linhasDaPrancha: m.linhasDaPrancha,
      carregando: m.carregando,
      erro: m.erro,
      alterar: m.alterar,
    };
  },
}));

import SecaoPlantaEletrica from '../../components/preferencias/SecaoPlantaEletrica';
import { MOTIVO_SEM_FIOS, MOTIVO_SO_NA_TELA } from '../../components/preferencias/ListaDePreferenciasEletricas';

const membro = (role: string, email = 'eu@empresa.com') => ({ id: 'mb', name: 'Eu', email, role });
const orgComMembros = (id: string, members: unknown[] | undefined) => ({ id, name: id, members });

const com = (parcial: Partial<Record<(typeof ITENS_ELETRICOS)[number]['item'], boolean>>): ExibicaoEletrica =>
  ({ ...EXIBICAO_ELETRICA_PADRAO, ...parcial }) as ExibicaoEletrica;

const chave = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement;

beforeEach(() => {
  m.alterar.mockReset().mockResolvedValue(undefined);
  m.usePreferencias.mockReset();
  m.org = { orgId: 'org-a', isAllOrgs: false };
  m.store = { session: { user: { email: 'Eu@Empresa.com' } }, organizations: [orgComMembros('org-a', [membro('owner')])] };
  m.tela = null;
  m.linhasDaTela = [];
  m.linhasDaPrancha = [];
  m.pranchaPorOrg = {};
  m.carregando = false;
  m.erro = null;
});
afterEach(cleanup);

describe('SecaoPlantaEletrica', () => {
  it('lista os 9 itens, com nome e explicação, e duas chaves por linha', () => {
    render(<SecaoPlantaEletrica />);
    for (const def of ITENS_ELETRICOS) {
      expect(screen.getByText(def.rotulo)).toBeTruthy();
      expect(screen.getByText(def.explicacao)).toBeTruthy();
      expect(chave(`${def.rotulo} · Tela`)).toBeTruthy();
      expect(chave(`${def.rotulo} · Prancha`)).toBeTruthy();
    }
  });

  it('chama o hook com a organização do topo, sem estudo', () => {
    render(<SecaoPlantaEletrica />);
    expect(m.usePreferencias).toHaveBeenCalledWith({ organizationId: 'org-a' });
  });

  it('⚠️ 23/10/2026 — dentro da Planta: usa a organização e o estudo ABERTOS, não o topo (mesmo com o topo em "Todas")', () => {
    m.org = { orgId: null, isAllOrgs: true };
    m.store = { session: { user: { email: 'Eu@Empresa.com' } }, organizations: [orgComMembros('org-estudo', [membro('admin')])] };
    render(<SecaoPlantaEletrica organizationId="org-estudo" studyId="est-1" />);
    expect(m.usePreferencias).toHaveBeenCalledWith({ organizationId: 'org-estudo', studyId: 'est-1' });
    expect(chave('Bitola dos fios · Prancha').disabled).toBe(false);
    expect(screen.queryByText(MOTIVO_PRANCHA_TODAS)).toBeNull();
    fireEvent.click(chave('Bitola dos fios · Prancha'));
    expect(m.alterar).toHaveBeenCalledWith('prancha', 'bitola', false, 'ORGANIZACAO');
  });

  it('dentro da Planta, quem não administra a organização DO ESTUDO vê a Prancha travada', () => {
    m.store = { session: { user: { email: 'Eu@Empresa.com' } }, organizations: [orgComMembros('org-estudo', [membro('member')])] };
    render(<SecaoPlantaEletrica organizationId="org-estudo" studyId="est-1" />);
    expect(chave('Bitola dos fios · Prancha').disabled).toBe(true);
    expect(screen.getAllByText(MOTIVO_PRANCHA_SO_GESTOR).length).toBeGreaterThan(0);
  });

  it('topo em "Todas": o hook recebe organizationId null (a tela segue funcionando)', () => {
    m.org = { orgId: null, isAllOrgs: true };
    render(<SecaoPlantaEletrica />);
    expect(m.usePreferencias).toHaveBeenCalledWith({ organizationId: null });
  });

  it('"Potência do ponto · Tela" grava no escopo USUARIO', () => {
    render(<SecaoPlantaEletrica />);
    fireEvent.click(chave('Potência do ponto · Tela'));
    expect(m.alterar).toHaveBeenCalledWith('tela', 'potencia', false, 'USUARIO');
  });

  it('gestor em "Bitola dos fios · Prancha" grava no escopo ORGANIZACAO', () => {
    render(<SecaoPlantaEletrica />);
    fireEvent.click(chave('Bitola dos fios · Prancha'));
    expect(m.alterar).toHaveBeenCalledWith('prancha', 'bitola', false, 'ORGANIZACAO');
  });

  it('item desligado liga ao clicar (valor true)', () => {
    m.tela = com({ potencia: false });
    render(<SecaoPlantaEletrica />);
    expect(chave('Potência do ponto · Tela').checked).toBe(false);
    fireEvent.click(chave('Potência do ponto · Tela'));
    expect(m.alterar).toHaveBeenCalledWith('tela', 'potencia', true, 'USUARIO');
  });

  describe('coluna Prancha travada', () => {
    function expectPranchaTravada(motivo: string) {
      for (const def of ITENS_ELETRICOS) expect(chave(`${def.rotulo} · Prancha`).disabled).toBe(true);
      expect(screen.getAllByText(motivo).length).toBeGreaterThan(0);
      // a coluna Tela continua livre
      expect(chave('Potência do ponto · Tela').disabled).toBe(false);
    }

    it('quem não é gestor: travada com o motivo visível', () => {
      m.store.organizations = [orgComMembros('org-a', [membro('member')])];
      render(<SecaoPlantaEletrica />);
      expectPranchaTravada(MOTIVO_PRANCHA_SO_GESTOR);
      fireEvent.click(chave('Bitola dos fios · Prancha'));
      expect(m.alterar).not.toHaveBeenCalled();
    });

    it('admin libera a coluna', () => {
      m.store.organizations = [orgComMembros('org-a', [membro('admin')])];
      render(<SecaoPlantaEletrica />);
      expect(chave('Bitola dos fios · Prancha').disabled).toBe(false);
    });

    it('o e-mail do membro casa sem diferenciar maiúsculas', () => {
      m.store.organizations = [orgComMembros('org-a', [membro('owner', 'EU@EMPRESA.COM')])];
      render(<SecaoPlantaEletrica />);
      expect(chave('Bitola dos fios · Prancha').disabled).toBe(false);
    });

    it('topo em "Todas as organizações": travada com o motivo da organização única', () => {
      m.org = { orgId: null, isAllOrgs: true };
      render(<SecaoPlantaEletrica />);
      expectPranchaTravada(MOTIVO_PRANCHA_TODAS);
    });

    it('membros ainda não carregados no store: travada (foco 5)', () => {
      m.store.organizations = [orgComMembros('org-a', undefined)];
      render(<SecaoPlantaEletrica />);
      expectPranchaTravada(MOTIVO_PRANCHA_SO_GESTOR);
    });

    it('organização do topo fora da lista do store: travada', () => {
      m.store.organizations = [];
      render(<SecaoPlantaEletrica />);
      expectPranchaTravada(MOTIVO_PRANCHA_SO_GESTOR);
    });

    it('usa a organização do topo, nunca a primeira da lista (REGRA #5)', () => {
      // org-x (primeira) tem o usuário como owner; org-a (a do topo) como member
      m.store.organizations = [orgComMembros('org-x', [membro('owner')]), orgComMembros('org-a', [membro('member')])];
      render(<SecaoPlantaEletrica />);
      expectPranchaTravada(MOTIVO_PRANCHA_SO_GESTOR);
    });
  });

  describe('itens com dependência e itens só da tela', () => {
    it('"Fios" desligado na TELA trava os dependentes da Tela com o motivo visível; a Prancha segue livre', () => {
      m.tela = com({ fios: false, circuitoNosFios: false, bitola: false, condutoresDoTrecho: false });
      render(<SecaoPlantaEletrica />);
      for (const rotulo of ['Circuito nos fios', 'Bitola dos fios', 'Condutores do trecho']) {
        expect(chave(`${rotulo} · Tela`).disabled).toBe(true);
      }
      expect(screen.getAllByText(MOTIVO_SEM_FIOS)).toHaveLength(3);
      expect(chave('Bitola dos fios · Prancha').disabled).toBe(false);
      // "Fios" em si continua livre (é ele que destrava os outros)
      expect(chave('Fios no eletroduto · Tela').disabled).toBe(false);
    });

    it('"Fios" desligado na PRANCHA trava só os dependentes da Prancha', () => {
      m.pranchaPorOrg = { 'org-a': com({ fios: false, circuitoNosFios: false, bitola: false }) };
      render(<SecaoPlantaEletrica />);
      expect(chave('Bitola dos fios · Prancha').disabled).toBe(true);
      expect(chave('Circuito nos fios · Prancha').disabled).toBe(true);
      expect(chave('Bitola dos fios · Tela').disabled).toBe(false);
      expect(screen.getAllByText(MOTIVO_SEM_FIOS).length).toBeGreaterThanOrEqual(2);
    });

    it('travado mostra ligado/desligado de verdade (não só esmaecido)', () => {
      m.tela = com({ fios: false, circuitoNosFios: false, bitola: false, condutoresDoTrecho: false });
      render(<SecaoPlantaEletrica />);
      expect(chave('Bitola dos fios · Tela').checked).toBe(false);
      expect(chave('Fios no eletroduto · Tela').checked).toBe(false);
      expect(chave('Potência do ponto · Tela').checked).toBe(true);
    });

    it('itens que a prancha não escreve: célula Prancha travada com MOTIVO_SO_NA_TELA, mesmo para gestor', () => {
      render(<SecaoPlantaEletrica />);
      for (const rotulo of ['Instrução da tomada sugerida', 'Condutores do trecho']) {
        expect(chave(`${rotulo} · Prancha`).disabled).toBe(true);
        expect(chave(`${rotulo} · Tela`).disabled).toBe(false);
      }
      expect(screen.getAllByText(MOTIVO_SO_NA_TELA)).toHaveLength(2);
    });

    it('os textos de motivo são os do plano', () => {
      expect(MOTIVO_SEM_FIOS).toBe('Depende de "Fios" — ligue "Fios" para escolher este item.');
      expect(MOTIVO_SO_NA_TELA).toBe('A prancha não escreve este item.');
    });
  });

  describe('trocar a organização do topo (foco 1)', () => {
    it('re-renderiza com a prancha da outra organização', () => {
      m.store.organizations = [orgComMembros('org-a', [membro('owner')]), orgComMembros('org-b', [membro('owner')])];
      m.pranchaPorOrg = { 'org-a': com({ potencia: true }), 'org-b': com({ potencia: false }) };
      const { rerender } = render(<SecaoPlantaEletrica />);
      expect(chave('Potência do ponto · Prancha').checked).toBe(true);

      m.org = { orgId: 'org-b', isAllOrgs: false };
      rerender(<SecaoPlantaEletrica />);
      expect(m.usePreferencias).toHaveBeenLastCalledWith({ organizationId: 'org-b' });
      expect(chave('Potência do ponto · Prancha').checked).toBe(false);
    });

    it('trocar para uma organização onde não administra trava a coluna', () => {
      m.store.organizations = [orgComMembros('org-a', [membro('owner')]), orgComMembros('org-b', [membro('member')])];
      const { rerender } = render(<SecaoPlantaEletrica />);
      expect(chave('Bitola dos fios · Prancha').disabled).toBe(false);
      m.org = { orgId: 'org-b', isAllOrgs: false };
      rerender(<SecaoPlantaEletrica />);
      expect(chave('Bitola dos fios · Prancha').disabled).toBe(true);
      expect(screen.getAllByText(MOTIVO_PRANCHA_SO_GESTOR).length).toBeGreaterThan(0);
    });
  });

  describe('Voltar ao padrão do sistema', () => {
    const linhaTela = (item: Parameters<typeof chaveDoItem>[1], valor: boolean): LinhaDePreferencia => ({
      escopo: 'USUARIO',
      chave: chaveDoItem('tela', item),
      valor,
    });
    const linhaOrg = (item: Parameters<typeof chaveDoItem>[1], valor: boolean): LinhaDePreferencia => ({
      escopo: 'ORGANIZACAO',
      chave: chaveDoItem('prancha', item),
      valor,
    });
    const botoes = () => screen.getAllByRole('button', { name: /Voltar ao padrão do sistema/ }) as HTMLButtonElement[];

    it('na Tela: apaga (valor null) só os itens com linha própria do usuário', () => {
      m.linhasDaTela = [linhaTela('potencia', false), linhaTela('bitola', false)];
      render(<SecaoPlantaEletrica />);
      fireEvent.click(botoes()[0]);
      expect(m.alterar).toHaveBeenCalledTimes(2);
      expect(m.alterar).toHaveBeenCalledWith('tela', 'potencia', null, 'USUARIO');
      expect(m.alterar).toHaveBeenCalledWith('tela', 'bitola', null, 'USUARIO');
    });

    it('na Prancha: apaga as linhas da ORGANIZACAO', () => {
      m.linhasDaPrancha = [linhaOrg('diametro', false)];
      render(<SecaoPlantaEletrica />);
      fireEvent.click(botoes()[1]);
      expect(m.alterar).toHaveBeenCalledTimes(1);
      expect(m.alterar).toHaveBeenCalledWith('prancha', 'diametro', null, 'ORGANIZACAO');
    });

    it('sem nada a voltar: o botão fica desligado e o motivo aparece escrito', () => {
      render(<SecaoPlantaEletrica />);
      expect(botoes()[0].disabled).toBe(true);
      expect(screen.getAllByText(/já está no padrão do sistema/).length).toBeGreaterThan(0);
    });

    it('Prancha travada: o botão fica desligado (o motivo da trava já está na coluna)', () => {
      m.store.organizations = [orgComMembros('org-a', [membro('member')])];
      m.linhasDaPrancha = [linhaOrg('diametro', false)];
      render(<SecaoPlantaEletrica />);
      expect(botoes()[1].disabled).toBe(true);
      fireEvent.click(botoes()[1]);
      expect(m.alterar).not.toHaveBeenCalled();
    });
  });

  describe('estados da leitura', () => {
    it('carregando: mostra o estado de carregamento em vez de chaves com padrão enganoso', () => {
      m.carregando = true;
      render(<SecaoPlantaEletrica />);
      expect(screen.getByText(/Carregando/)).toBeTruthy();
      expect(screen.queryByLabelText('Potência do ponto · Tela')).toBeNull();
    });

    it('leitura falhou: avisa que está mostrando os padrões e mantém a lista', () => {
      m.erro = 'sem rede';
      render(<SecaoPlantaEletrica />);
      expect(screen.getByRole('alert').textContent).toMatch(/padrões/);
      expect(chave('Potência do ponto · Tela')).toBeTruthy();
    });
  });

  it('cabeçalho de cada coluna existe (Tela e Prancha)', () => {
    render(<SecaoPlantaEletrica />);
    const regiao = screen.getByRole('region', { name: /Elétrica/ });
    expect(within(regiao).getByRole('heading', { name: 'Tela' })).toBeTruthy();
    expect(within(regiao).getByRole('heading', { name: 'Prancha' })).toBeTruthy();
  });
});
