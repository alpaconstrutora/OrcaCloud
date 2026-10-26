// @vitest-environment jsdom
/**
 * Torres & Unidades › Terreno: para onde a frente está voltada e as coordenadas (26/10/2026, etapa 3 de
 * docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md). A Planta cria o lote da ficha virado e georreferenciado.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock('../../services/empreendimentoService', () => ({
  empreendimentoService: { listTowers: vi.fn(async () => []), update: svc.update },
}));
vi.mock('../../services/blueprintTerrenoDaPlanta', () => ({ terrenoDaPlantaVinculada: vi.fn(async () => null) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { problemaDaLocalizacao, TowerEditor } from '../../components/empreendimento/TowerEditor';

const EMP = { id: 'emp-1', organization_id: 'org-1', name: 'Garden', terreno_frente: 12, terreno_profundidade: 30, terreno_frente_azimute: 90, terreno_latitude: null, terreno_longitude: null };
const montar = (emp: Record<string, unknown> = EMP) => render(<TowerEditor empreendimentoId="emp-1" organizationId="org-1" empreendimento={emp as never} />);
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;

describe('Torres & Unidades › Terreno — orientação e coordenadas', () => {
  beforeEach(() => svc.update.mockClear());

  it('mostra o azimute gravado com o ponto cardeal', () => {
    montar();
    expect(campo('Frente voltada para (°)').value).toBe('90');
    expect(screen.getByTestId('terreno-ponto-cardeal')).toHaveTextContent('Frente voltada para o Leste');
  });

  it('grava azimute, latitude e longitude (vírgula decimal aceita)', async () => {
    montar();
    fireEvent.change(campo('Frente voltada para (°)'), { target: { value: '225' } });
    fireEvent.change(campo('Latitude (graus decimais)'), { target: { value: '-19.92' } });
    fireEvent.change(campo('Longitude (graus decimais)'), { target: { value: '-43.94' } });
    expect(screen.getByTestId('terreno-ponto-cardeal')).toHaveTextContent('Sudoeste');
    fireEvent.click(screen.getByRole('button', { name: /Salvar terreno/ }));
    await waitFor(() => expect(svc.update).toHaveBeenCalledTimes(1));
    expect(svc.update).toHaveBeenCalledWith('emp-1', expect.objectContaining({ terreno_frente_azimute: 225, terreno_latitude: -19.92, terreno_longitude: -43.94 }));
  });

  it('fora da faixa ou só uma das coordenadas: não grava', async () => {
    montar();
    fireEvent.change(campo('Latitude (graus decimais)'), { target: { value: '-19.92' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar terreno/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(svc.update).not.toHaveBeenCalled();
  });
});

describe('problemaDaLocalizacao', () => {
  const f = (a: string, la: string, lo: string) => ({ terreno_frente_azimute: a, terreno_latitude: la, terreno_longitude: lo });
  it('aceita vazio, faixa e vírgula; recusa fora da faixa e coordenada sozinha', () => {
    expect(problemaDaLocalizacao(f('', '', ''))).toBeNull();
    expect(problemaDaLocalizacao(f('360', '-19,9', '-43,9'))).toBeNull();
    expect(problemaDaLocalizacao(f('400', '', ''))).toMatch(/entre 0 e 360/);
    expect(problemaDaLocalizacao(f('', '-95', '10'))).toMatch(/Latitude/);
    expect(problemaDaLocalizacao(f('', '', '10'))).toMatch(/juntas/);
  });
});
