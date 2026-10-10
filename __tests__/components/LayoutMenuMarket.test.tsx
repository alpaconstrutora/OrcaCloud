// @vitest-environment jsdom
/**
 * Menu do celular × ÒPURA Market (decisão D5: só administrador e usuário interno).
 *
 * Até a Fase 6 (07/10/2026) o item "ÒPURA Market" do menu do celular aparecia
 * para qualquer perfil; o do computador já ficava dentro do bloco de usuário
 * interno. A regra passou para `utils/acessoAoMarket.ts` e este teste monta o
 * Layout de verdade, abre o menu do celular e confere o item por grupo.
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
    // `subscribe*` devolve a função de cancelar; o resto é leitura assíncrona.
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

function montar(group: string, email = 'pessoa@exemplo.com.br') {
  render(
    <Layout
      activeView="dashboard"
      onChangeView={() => {}}
      projectName=""
      onEditProject={() => {}}
      onSaveProject={() => {}}
      onDeleteProject={() => {}}
      profile={{ group, role: 'PERFIL_USUARIO', email }}
    >
      <div />
    </Layout>,
  );
  fireEvent.click(screen.getByTitle('Abrir menu'));
}

describe('menu do celular — item ÒPURA Market', () => {
  it('usuário interno vê', () => {
    montar('USUARIO');
    expect(screen.queryAllByText('ÒPURA Market').length).toBeGreaterThan(0);
  });

  it.each(['CORRETOR', 'CLIENTE', 'INVESTIDOR', 'FORNECEDOR', 'PARCEIRO', 'CREDOR'])('%s não vê', (grupo) => {
    montar(grupo);
    expect(screen.queryAllByText('ÒPURA Market')).toHaveLength(0);
  });
});
