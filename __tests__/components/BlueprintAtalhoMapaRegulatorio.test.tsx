// @vitest-environment jsdom
/**
 * Atalho "Abrir Mapa Regulatório" de dentro do editor da Planta (11/10/2026).
 * Plano: docs/planos/2026-10-11-planta-atalho-mapa-regulatorio.md, itens 3 e 4.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/blueprintService', () => ({
  listStudies: vi.fn(async () => [
    { id: 's1', name: 'Planta Torre A', status: 'RASCUNHO', updated_at: '2026-10-01T00:00:00Z' },
  ]),
  listBranches: vi.fn(async () => [{ id: 'r1', name: 'Principal', is_main: true }]),
  ramoPrincipal: vi.fn((b: { id: string }[]) => b[0]),
  createStudy: vi.fn(),
  duplicateStudy: vi.fn(),
  archiveStudy: vi.fn(),
}));
const MAPA = { id: 'm1', name: 'Plano Diretor Campinas', city_name: 'Campinas', state_code: 'SP', status: 'ATIVO', lei_referencia: 'LC 208/2018', organization_id: 'o1' };
// O módulo lista empreendimentos (coluna + drawer de vínculo): sem o mock, a chamada real falha depois do teste e derruba a suíte.
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/regulatoryMapService', () => ({
  regulatoryMapService: {
    list: vi.fn(async () => [MAPA]),
    getById: vi.fn(async () => MAPA),
    listZones: vi.fn(async () => []),
    remove: vi.fn(),
  },
}));
// O editor de verdade é Konva/Three; aqui basta um que exponha o atalho como o painel o expõe.
vi.mock('../../components/blueprint/BlueprintEditor', () => ({
  default: (p: { study: { name: string }; branchId: string; onAbrirMapaRegulatorio?: (id: string | null) => void }) => (
    <div>
      <p>editor de {p.study.name} no ramo {p.branchId}</p>
      {p.onAbrirMapaRegulatorio && <button onClick={() => p.onAbrirMapaRegulatorio!('m1')}>atalho com mapa</button>}
      {p.onAbrirMapaRegulatorio && <button onClick={() => p.onAbrirMapaRegulatorio!(null)}>atalho sem mapa</button>}
    </div>
  ),
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import BlueprintModule from '../../components/blueprint/BlueprintModule';
import PainelZonaUrbanistica from '../../components/blueprint/PainelZonaUrbanistica';

async function abrirAPlanta(podeVer = true) {
  render(<BlueprintModule podeVerMapaRegulatorio={podeVer} />);
  fireEvent.click(await screen.findByText('Planta Torre A'));
  await screen.findByText('editor de Planta Torre A no ramo r1');
}

describe('atalho do editor para o Mapa Regulatório', () => {
  beforeEach(() => localStorage.clear());

  it('com mapa escolhido: abre o detalhe dele, e "Voltar para a planta" reabre a mesma planta', async () => {
    await abrirAPlanta();
    fireEvent.click(screen.getByText('atalho com mapa'));

    // Detalhe do mapa (o h1 é o nome do mapa), com o voltar apontando à planta.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Plano Diretor Campinas'));
    fireEvent.click(screen.getByRole('button', { name: /Voltar para a planta/ }));

    expect(await screen.findByText('editor de Planta Torre A no ramo r1')).toBeTruthy();
    // Sair do editor depois cai na lista de PLANTAS, não no mapa.
    expect(localStorage.getItem('blueprintModule:aba')).toBe('"plantas"');
  });

  it('sem mapa escolhido: abre a lista de mapas, com o voltar para a planta', async () => {
    await abrirAPlanta();
    fireEvent.click(screen.getByText('atalho sem mapa'));
    expect(await screen.findByText('Plano Diretor Campinas')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mapa Regulatório');
    fireEvent.click(screen.getByRole('button', { name: /Voltar para a planta/ }));
    expect(await screen.findByText('editor de Planta Torre A no ramo r1')).toBeTruthy();
  });

  it('trocar de aba à mão encerra o ida e volta', async () => {
    await abrirAPlanta();
    fireEvent.click(screen.getByText('atalho sem mapa'));
    await screen.findByText('Plano Diretor Campinas');
    fireEvent.click(screen.getByRole('tab', { name: 'Plantas' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa Regulatório' }));
    await screen.findByText('Plano Diretor Campinas');
    expect(screen.queryByRole('button', { name: /Voltar para a planta/ })).toBeNull();
  });

  it('sem permissão ao Mapa Regulatório, o editor não recebe o atalho', async () => {
    await abrirAPlanta(false);
    expect(screen.queryByText('atalho com mapa')).toBeNull();
  });
});

describe('PainelZonaUrbanistica — botão do atalho', () => {
  const base = {
    onOrigemDaZona: () => {}, empreendimentos: [], empreendimentoId: '', onEmpreendimento: () => {},
    cidade: { id: 'c1', name: 'Campinas', state_code: 'SP' } as never, onCidade: () => {},
    mapas: [MAPA as never], onMapa: () => {}, zonas: [], zonaAplicadaId: null, zonaRotuloSalvo: null,
    ajustadoAMao: false, derivou: false, onAplicar: () => {}, onDesligar: () => {},
  };

  it('com mapa da cidade escolhido: "Abrir este mapa"; o aviso de mapa sem zona vira atalho', () => {
    const abrir = vi.fn();
    render(<PainelZonaUrbanistica {...base} origemDaZona="CATALOGO" mapaId="m1" onAbrirMapaRegulatorio={abrir} />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir este mapa/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar zona neste mapa' }));
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it('sem mapa escolhido: "Mapa Regulatório" (a lista)', () => {
    render(<PainelZonaUrbanistica {...base} origemDaZona="EMPREENDIMENTO" mapaId="" onAbrirMapaRegulatorio={() => {}} />);
    expect(screen.getByRole('button', { name: /^Mapa Regulatório/ }).getAttribute('title')).toMatch(/^Abrir o cadastro/);
  });

  it('sem a prop, não há atalho — e o aviso volta a ser texto', () => {
    render(<PainelZonaUrbanistica {...base} origemDaZona="CATALOGO" mapaId="m1" />);
    expect(screen.queryByRole('button', { name: /Abrir|^Mapa Regulatório/ })).toBeNull();
    expect(screen.getByText(/Cadastre na aba/)).toBeTruthy();
  });
});
