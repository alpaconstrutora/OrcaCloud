/**
 * Portal do Cliente abria na aba `dashboard` mesmo quando ela não está liberada
 * para o cliente (26/11/2026): o condômino de teste, com só `['condominio']`,
 * caía no painel genérico "Acompanhamento de Obra". Medido no banco no mesmo dia:
 * 3 clientes reais com `portal_tabs` sem `dashboard`.
 */
import { describe, expect, it } from 'vitest';
import { abaVisivelDoPortal } from '../utils/clientPortalTabs';

describe('abaVisivelDoPortal', () => {
  it('aba atual liberada: fica nela', () => {
    expect(abaVisivelDoPortal('financeiro', ['dashboard', 'financeiro'], false)).toBe('financeiro');
  });
  it('dashboard não liberado: vai para a primeira aba liberada', () => {
    expect(abaVisivelDoPortal('dashboard', ['condominio'], false)).toBe('condominio');
    expect(abaVisivelDoPortal('dashboard', ['financeiro', 'condominio', 'manutencao'], false)).toBe('financeiro');
  });
  it('aba pedida por link (initialTab) que não está liberada também cai na primeira liberada', () => {
    expect(abaVisivelDoPortal('obra', ['condominio', 'documentos'], false)).toBe('condominio');
  });
  it('administrador vê todas as abas para configurar: não troca', () => {
    expect(abaVisivelDoPortal('dashboard', ['condominio'], true)).toBe('dashboard');
  });
  it('sem nenhuma aba liberada: não inventa outra', () => {
    expect(abaVisivelDoPortal('dashboard', [], false)).toBe('dashboard');
  });
});
