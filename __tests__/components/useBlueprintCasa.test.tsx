// @vitest-environment jsdom
/**
 * F10 da casa automática (15/10/2026): as premissas da casa sobrevivem a recarregar (vêm da linha do estudo,
 * completadas), gravam com respiro de 500 ms (uma gravação por rajada) e a gravação pendente não se perde ao sair
 * da tela antes do respiro. Sem a tabela, valem só na sessão e a tela é avisada.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const save = vi.fn();
vi.mock('../../services/blueprintCasaService', () => ({ blueprintCasaService: { get: (...a: unknown[]) => get(...a), save: (...a: unknown[]) => save(...a) } }));

import { useBlueprintCasa } from '../../hooks/useBlueprintCasa';
import { PREMISSAS_DA_CASA_PADRAO } from '../../utils/blueprintPremissasDaCasa';

afterEach(() => {
  vi.useRealTimers();
  get.mockReset();
  save.mockReset();
});

describe('useBlueprintCasa', () => {
  it('com linha no estudo: as premissas dela, completadas; vazio = falso', async () => {
    get.mockResolvedValue({ hipoteses: { curto: { dormitorios: 2, padrao: 'R1-B' } } });
    const { result } = renderHook(() => useBlueprintCasa('std_1', 'org_1'));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.premissas.curto).toEqual({ ...PREMISSAS_DA_CASA_PADRAO.curto, dormitorios: 2, padrao: 'R1-B' });
    expect(result.current.vazio).toBe(false);
  });

  it('sem linha: o padrão, e vazio = verdadeiro (a tela pode pré-preencher pela unidade)', async () => {
    get.mockResolvedValue(null);
    const { result } = renderHook(() => useBlueprintCasa('std_1', 'org_1'));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.premissas).toEqual(PREMISSAS_DA_CASA_PADRAO);
    expect(result.current.vazio).toBe(true);
  });

  it('a rajada de mudanças grava UMA vez, 500 ms depois da última; sair antes do respiro grava na hora', async () => {
    get.mockResolvedValue(null);
    save.mockResolvedValue({});
    const { result, unmount } = renderHook(() => useBlueprintCasa('std_1', 'org_1'));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    vi.useFakeTimers();
    act(() => result.current.setPremissas({ ...PREMISSAS_DA_CASA_PADRAO, sementes: 3 }));
    act(() => result.current.setPremissas({ ...PREMISSAS_DA_CASA_PADRAO, sementes: 4 }));
    expect(save).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][2].sementes).toBe(4);
    act(() => result.current.setPremissas({ ...PREMISSAS_DA_CASA_PADRAO, sementes: 5 }));
    unmount();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][2].sementes).toBe(5);
  });

  it('sem a tabela: vale só na sessão, não tenta gravar, e avisa', async () => {
    get.mockRejectedValue(new Error('relation "blueprint_study_casa" does not exist'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useBlueprintCasa('std_1', 'org_1'));
    await waitFor(() => expect(result.current.persistenciaIndisponivel).toBe(true));
    act(() => result.current.setPremissas({ ...PREMISSAS_DA_CASA_PADRAO, sementes: 2 }));
    expect(result.current.premissas.sementes).toBe(2);
    expect(save).not.toHaveBeenCalled();
  });
});
