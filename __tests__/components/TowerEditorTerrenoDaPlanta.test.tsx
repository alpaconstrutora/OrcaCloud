// @vitest-environment jsdom
/**
 * Empreendimento › Torres & Unidades › Terreno mostra a planta vinculada (plano
 * docs/planos/2026-10-21-terreno-ficha-planta.md, item 3): "Planta: …" sob cada campo, o vazio da
 * ficha já vem no FORMULÁRIO (sem gravar), "Usar valores da Planta" copia tudo e o motivo aparece
 * quando não há planta para comparar.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TerrenoDaPlanta } from '../../services/blueprintTerrenoDaPlanta';

const svc = vi.hoisted(() => ({
  update: vi.fn(async () => ({})),
  daPlanta: { current: null as null | TerrenoDaPlanta },
}));
vi.mock('../../services/empreendimentoService', () => ({
  empreendimentoService: { listTowers: vi.fn(async () => []), update: svc.update },
}));
vi.mock('../../services/blueprintTerrenoDaPlanta', () => ({
  terrenoDaPlantaVinculada: vi.fn(async () => svc.daPlanta.current),
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { TowerEditor } from '../../components/empreendimento/TowerEditor';

const GARDEN = {
  id: 'emp-1',
  organization_id: 'org-1',
  name: '011 - Garden Cambuhy',
  blueprint_study_id: 'planta-1',
  terreno_tipo: 'Irregular (Geometria complexa)',
  terreno_area: 1229,
  terreno_frente: 18,
  terreno_fundos: 11,
  terreno_profundidade: null,
};
const PLANTA_OK: TerrenoDaPlanta = {
  ok: true,
  plantaNome: 'Garden',
  medidas: { areaM2: 1229, frenteM: 18, fundosM: 12, lateralDireitaM: 70, lateralEsquerdaM: 72, profundidadeM: 71, tipo: 'Irregular (Geometria complexa)' },
};

const montar = (emp = GARDEN) =>
  render(<TowerEditor empreendimentoId={emp.id} organizationId={emp.organization_id} empreendimento={emp as never} />);
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;

describe('Torres & Unidades › Terreno × Planta vinculada', () => {
  beforeEach(() => {
    svc.update.mockClear();
    svc.daPlanta.current = PLANTA_OK;
  });

  it('mostra "Planta: …" por campo, marca a diferença e preenche no formulário só o que a ficha tem vazio — sem gravar', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('terreno-da-planta')).toHaveTextContent('Planta vinculada: Garden'));
    expect(screen.getByTestId('planta-terreno_area')).toHaveTextContent('Planta: 1.229,00 m²');
    // Tipo deduzido do desenho (22/10/2026): igual ao da ficha.
    expect(screen.getByTestId('planta-terreno_tipo')).toHaveTextContent('Planta: Irregular (Geometria complexa)');
    expect(screen.getByTestId('planta-terreno_fundos')).toHaveTextContent('Planta: 12,00 m · diferente');
    // Fundos tem valor na ficha: não é trocado sozinho.
    expect(campo('Fundos (m)').value).toBe('11');
    // Profundidade estava vazia: vem da Planta, avisando — e nada foi gravado. O preenchimento é um
    // efeito que roda DEPOIS de a mensagem aparecer: esperar o campo, não supor a ordem (a CI da #84,
    // mais lenta, leu o campo nesse intervalo).
    await waitFor(() => expect(campo('Profundidade (m)').value).toBe('71'));
    expect(screen.getByTestId('planta-terreno_profundidade')).toHaveTextContent('Da Planta — confira e salve');
    expect(svc.update).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Salvar terreno/ })).not.toBeDisabled();
  });

  it('"Usar valores da Planta" copia os quatro para o formulário; salvar grava', async () => {
    montar();
    const usar = await screen.findByRole('button', { name: 'Usar valores da Planta' });
    fireEvent.click(usar);
    expect(campo('Fundos (m)').value).toBe('12');
    expect(usar).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Salvar terreno/ }));
    await waitFor(() => expect(svc.update).toHaveBeenCalledTimes(1));
    expect(svc.update).toHaveBeenCalledWith('emp-1', expect.objectContaining({ terreno_area: 1229, terreno_fundos: 12, terreno_profundidade: 71 }));
  });

  it('sem planta para comparar: diz o motivo e não mexe em nada', async () => {
    svc.daPlanta.current = { ok: false, motivo: 'A planta Garden ainda não tem lote fechado.' };
    montar();
    await waitFor(() => expect(screen.getByTestId('terreno-da-planta')).toHaveTextContent('ainda não tem lote fechado'));
    expect(screen.queryByRole('button', { name: 'Usar valores da Planta' })).toBeNull();
    expect(campo('Profundidade (m)').value).toBe('');
  });
});

describe('Torres & Unidades › seções em blocos (28/10/2026, "separe as sessões Terreno e torres")', () => {
  it('Terreno e Torres são blocos separados, um não contém o outro', async () => {
    svc.daPlanta.current = PLANTA_OK;
    montar();
    const terreno = await screen.findByTestId('secao-terreno');
    const torres = screen.getByTestId('secao-torres');
    expect(terreno).toHaveAttribute('aria-label', 'Terreno');
    expect(torres).toHaveAttribute('aria-label', 'Torres');
    expect(terreno.contains(torres)).toBe(false);
    expect(torres.contains(terreno)).toBe(false);
    expect(terreno.className).toContain('border');
    expect(torres.className).toContain('border');
  });
});
