// @vitest-environment jsdom
/**
 * Dados da REURB e do CAR no banco (26/09/2026): o que está gravado vence; o
 * que a A5 deixou no navegador é ADOTADO (gravado e só então apagado); editar
 * grava com respiro, cada gaveta na sua coluna; sem a tabela, fica na aba e
 * o estado diz.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  get: vi.fn(),
  salvarReurb: vi.fn(async () => undefined),
  salvarCar: vi.fn(async () => undefined),
}));
vi.mock('../../services/blueprintRegularizacaoService', () => ({ blueprintRegularizacaoService: svc }));

import { chaveAntigaDaReurb, chaveAntigaDoBioma, useBlueprintRegularizacao } from '../../hooks/useBlueprintRegularizacao';

describe('useBlueprintRegularizacao', () => {
  beforeEach(() => {
    localStorage.clear();
    svc.get.mockReset();
    svc.salvarReurb.mockClear();
    svc.salvarCar.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('o gravado vence o navegador, e nada é regravado', async () => {
    svc.get.mockResolvedValue({ reurb: { nome: 'Vila Nova', modalidade: 'REURB-E' }, car: { bioma: 'AMAZONIA_CERRADO' } });
    localStorage.setItem(chaveAntigaDaReurb('s'), JSON.stringify({ nome: 'Velho', modalidade: 'REURB-S' }));
    const { result } = renderHook(() => useBlueprintRegularizacao('s', 'o', 'Estudo'));
    await waitFor(() => expect(result.current.estado).toBe('SALVO'));
    expect(result.current.reurb).toMatchObject({ nome: 'Vila Nova', modalidade: 'REURB-E' });
    expect(result.current.bioma).toBe('AMAZONIA_CERRADO');
    expect(svc.salvarReurb).not.toHaveBeenCalled();
    expect(svc.salvarCar).not.toHaveBeenCalled();
  });

  it('⭐ adoção: sem linha no banco, o navegador é gravado e só então apagado', async () => {
    svc.get.mockResolvedValue(null);
    localStorage.setItem(chaveAntigaDaReurb('s'), JSON.stringify({ nome: 'Núcleo Esperança', modalidade: 'REURB-S', matricula: '123' }));
    localStorage.setItem(chaveAntigaDoBioma('s'), JSON.stringify('AMAZONIA_FLORESTA'));
    const { result } = renderHook(() => useBlueprintRegularizacao('s', 'o', 'Estudo'));
    await waitFor(() => expect(result.current.estado).toBe('SALVO'));
    expect(svc.salvarReurb).toHaveBeenCalledWith('s', 'o', expect.objectContaining({ nome: 'Núcleo Esperança', matricula: '123' }));
    expect(svc.salvarCar).toHaveBeenCalledWith('s', 'o', { bioma: 'AMAZONIA_FLORESTA' });
    expect(result.current.bioma).toBe('AMAZONIA_FLORESTA');
    expect(localStorage.getItem(chaveAntigaDaReurb('s'))).toBeNull();
    expect(localStorage.getItem(chaveAntigaDoBioma('s'))).toBeNull();
  });

  it('adoção que falha NÃO apaga o navegador', async () => {
    svc.get.mockResolvedValue(null);
    svc.salvarReurb.mockRejectedValueOnce(new Error('rede'));
    localStorage.setItem(chaveAntigaDaReurb('s'), JSON.stringify({ nome: 'Guardado', modalidade: 'REURB-S' }));
    const { result } = renderHook(() => useBlueprintRegularizacao('s', 'o', 'Estudo'));
    await waitFor(() => expect(result.current.estado).toBe('INDISPONIVEL'));
    expect(result.current.reurb.nome).toBe('Guardado');
    expect(localStorage.getItem(chaveAntigaDaReurb('s'))).not.toBeNull();
  });

  it('nada em lugar nenhum: o nome do estudo e REURB-S, sem gravar', async () => {
    svc.get.mockResolvedValue(null);
    const { result } = renderHook(() => useBlueprintRegularizacao('s', 'o', 'Estudo X'));
    await waitFor(() => expect(result.current.estado).toBe('SALVO'));
    expect(result.current.reurb).toEqual({ nome: 'Estudo X', modalidade: 'REURB-S' });
    expect(result.current.bioma).toBe('DEMAIS_REGIOES');
    expect(svc.salvarReurb).not.toHaveBeenCalled();
  });

  it('editar o núcleo grava UMA vez depois do respiro; o bioma grava na hora, na coluna dele', async () => {
    svc.get.mockResolvedValue({ reurb: { nome: 'A', modalidade: 'REURB-S' }, car: {} });
    const { result } = renderHook(() => useBlueprintRegularizacao('s', 'o', 'Estudo'));
    await waitFor(() => expect(result.current.estado).toBe('SALVO'));
    vi.useFakeTimers();
    act(() => result.current.alterarReurb({ matricula: '1' }));
    act(() => result.current.alterarReurb({ matricula: '12' }));
    expect(result.current.estado).toBe('SALVANDO');
    expect(svc.salvarReurb).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(svc.salvarReurb).toHaveBeenCalledTimes(1);
    expect(svc.salvarReurb).toHaveBeenCalledWith('s', 'o', { nome: 'A', modalidade: 'REURB-S', matricula: '12' });
    act(() => result.current.alterarBioma('AMAZONIA_CAMPOS'));
    expect(svc.salvarCar).toHaveBeenCalledWith('s', 'o', { bioma: 'AMAZONIA_CAMPOS' });
  });

  it('sem a tabela: fica na aba, o estado diz, e editar não tenta gravar', async () => {
    svc.get.mockRejectedValue(new Error('relation "blueprint_study_regularizacao" does not exist'));
    const { result } = renderHook(() => useBlueprintRegularizacao('s', 'o', 'Estudo'));
    await waitFor(() => expect(result.current.estado).toBe('INDISPONIVEL'));
    act(() => result.current.alterarBioma('AMAZONIA_FLORESTA'));
    expect(result.current.bioma).toBe('AMAZONIA_FLORESTA');
    expect(svc.salvarCar).not.toHaveBeenCalled();
  });
});
