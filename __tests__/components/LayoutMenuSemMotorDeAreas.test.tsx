// @vitest-environment jsdom
/**
 * Menu sem o Motor de Áreas NBR 12721 (14/10/2026, Fase 10 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): os quadros moram na
 * Planta Inteligente (Analisar › Áreas NBR 12721) e no botão do Empreendimento.
 * O item "Áreas NBR 12721" saía em DOIS grupos (Engenharia e Incorporação) —
 * este teste monta o Layout de verdade e confere que não sobra em nenhum,
 * nem no menu do computador nem no do celular. Molde: LayoutMenuMarket.test.tsx.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('../../components/NotificationPanel', () => ({ default: () => null }));
vi.mock('../../components/PreferencesSheet', () => ({ default: () => null }));
vi.mock('../../components/MyAccountSheet', () => ({ default: () => null }));
vi.mock('../../components/ContextSelector', () => ({ default: () => null }));
vi.mock('../../services/notificationService', () => ({
  notificationService: new Proxy({}, {
    get: (_alvo, nome) => (String(nome).startsWith('subscribe') ? vi.fn(() => () => {}) : vi.fn().mockResolvedValue([])),
  }),
}));
vi.mock('../../services/taskService', () => ({
  taskService: new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
}));
vi.mock('../../services/academyService', () => ({
  academyService: new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
}));

import Layout from '../../components/Layout';

function montar(activeView: string) {
  render(
    <Layout
      activeView={activeView}
      onChangeView={() => {}}
      projectName=""
      onEditProject={() => {}}
      onSaveProject={() => {}}
      onDeleteProject={() => {}}
      // Desenvolvedor: vê os grupos Engenharia e Incorporação sem depender da matriz de módulos da org (vazia no teste).
      profile={{ group: 'DESENVOLVEDOR', role: 'PERFIL_USUARIO', email: 'pessoa@exemplo.com.br' }}
    >
      <div />
    </Layout>,
  );
}

describe('menu sem o Motor de Áreas NBR 12721', () => {
  it('Engenharia e Incorporação abertos: os vizinhos estão lá, "Áreas NBR 12721" não', () => {
    // View fora de Engenharia e de Incorporação: os dois grupos começam fechados e o clique os abre.
    montar('opura-processos');
    // Os itens só entram no DOM com o grupo aberto — sem abrir, o "0" seria falso.
    for (const grupo of ['Engenharia', 'Incorporação']) {
      const botoes = screen.getAllByRole('button', { name: new RegExp(`^${grupo}$`) });
      fireEvent.click(botoes[0]);
    }
    expect(screen.queryAllByText('Tipos de Obra').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Laudo de Avaliação').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Áreas NBR 12721')).toHaveLength(0);
  });
});
