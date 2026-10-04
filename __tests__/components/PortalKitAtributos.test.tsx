// @vitest-environment jsdom
/**
 * PortalKit repassa atributos HTML — é por aí que o tour guiado acha o
 * conteúdo das abas do Fornecedor (`data-tour` em PortalCard e KpiStrip).
 * Tour v2 (04/10/2026), docs/planos/2026-10-04-tour-guiado-v2-portais.md.
 *
 * Sem o repasse o TypeScript não reclama (atributo com hífen não é checado)
 * e a âncora some do DOM em silêncio: o passo do tour seria pulado.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PortalCard, KpiStrip } from '../../components/portal/PortalKit';

describe('PortalKit › atributos repassados', () => {
  it('PortalCard leva data-tour e mantém a própria classe', () => {
    const { container } = render(<PortalCard className="overflow-hidden" data-tour="pedidos-tabela">conteúdo</PortalCard>);
    const el = container.querySelector('[data-tour="pedidos-tabela"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.className).toContain('overflow-hidden');
    expect(el.className).toContain('rounded-2xl');
    expect(el.textContent).toBe('conteúdo');
  });

  it('KpiStrip leva data-tour no cartão de fora', () => {
    const { container } = render(<KpiStrip items={[{ label: 'A receber', value: 'R$ 10,00' }]} data-tour="financeiro-kpis" />);
    const el = container.querySelector('[data-tour="financeiro-kpis"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('A receber');
  });
});
