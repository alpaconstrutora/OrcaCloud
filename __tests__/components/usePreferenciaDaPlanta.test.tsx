// @vitest-environment jsdom
/**
 * usePreferenciaDaPlanta / useMigracaoDaExibicaoDaPlanta — o que a Planta exibe (menu Vista › Exibir)
 * passa a ser preferência do USUÁRIO no banco. Serviço, sessão e aviso simulados; o "banco falso"
 * devolve na leitura o que foi gravado (o hook relê a chave ao fim de cada gravação).
 * Foco: banco vence navegador; leitura que falha cai no navegador/padrão; clique rápido termina igual
 * ao banco; sem sessão só muda local; a migração do navegador roda UMA vez e só leva o que difere do padrão.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinhaDePreferencia } from '../../utils/preferencias/resolver';

const m = vi.hoisted(() => ({
    listarDoUsuario: vi.fn(),
    gravar: vi.fn(),
    gravarVarios: vi.fn(),
    showToast: vi.fn(),
    userId: 'u1' as string | null,
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ session: m.userId ? { user: { id: m.userId } } : null }),
}));
vi.mock('../../services/preferenciasService', () => ({
    preferenciasService: {
        listarDoUsuario: m.listarDoUsuario,
        gravar: m.gravar,
        gravarVarios: m.gravarVarios,
    },
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: m.showToast }) }));

import { usePreferenciaDaPlanta, useMigracaoDaExibicaoDaPlanta } from '../../hooks/usePreferenciaDaPlanta';

const CHAVE_GRADE = 'planta.exibir.mostrarGrade';

function montar<R>(hook: () => R) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, ...renderHook(hook, { wrapper }) };
}

let banco: LinhaDePreferencia[] = [];
function gravarNoBanco(chave: string, valor: boolean | string | null, apagar = true) {
    banco = banco.filter((l) => l.chave !== chave);
    if (valor !== null || !apagar) banco.push({ escopo: 'USUARIO', chave, valor: valor as never });
}
const linha = (chave: string, valor: unknown): LinhaDePreferencia => ({ escopo: 'USUARIO', chave, valor } as LinhaDePreferencia);
const noNavegador = (chaveAntiga: string, valor: unknown) => localStorage.setItem(chaveAntiga, JSON.stringify(valor));
const doNavegador = (chaveAntiga: string) => {
    const s = localStorage.getItem(chaveAntiga);
    return s === null ? undefined : JSON.parse(s);
};

describe('usePreferenciaDaPlanta', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        banco = [];
        m.userId = 'u1';
        m.listarDoUsuario.mockImplementation(async () => [...banco]);
        m.gravar.mockImplementation(async (_e: unknown, _d: unknown, chave: string, valor: boolean | string | null, opcoes?: { apagarQuandoNull?: boolean }) => {
            gravarNoBanco(chave, valor, opcoes?.apagarQuandoNull !== false);
        });
        m.gravarVarios.mockImplementation(async (linhas: { chave: string; valor: boolean | string | null }[]) => {
            for (const l of linhas) gravarNoBanco(l.chave, l.valor, false);
        });
    });

    it('sem nada no banco nem no navegador devolve o padrão do catálogo', async () => {
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            medidas: usePreferenciaDaPlanta<boolean>('mostrarMedidas'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
            terreno: usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        expect(result.current.grade[0]).toBe(true);
        expect(result.current.medidas[0]).toBe(false);
        expect(result.current.estilo[0]).toBe('TECNICA');
        expect(result.current.terreno[0]).toBeNull();
    });

    it('sem linha no banco vale o que está no navegador (chave antiga, JSON)', async () => {
        noNavegador('blueprint:mostrarGrade', false);
        noNavegador('blueprint:estiloPlanta', 'HUMANIZADA');
        noNavegador('blueprint:vista3dTerreno:v2', true);
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
            terreno: usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        expect(result.current.grade[0]).toBe(false);
        expect(result.current.estilo[0]).toBe('HUMANIZADA');
        expect(result.current.terreno[0]).toBe(true);
    });

    it('navegador com lixo (não é JSON, tipo errado, opção que não existe) cai no padrão sem lançar', async () => {
        localStorage.setItem('blueprint:mostrarGrade', '{não é json');
        noNavegador('blueprint:estiloPlanta', 'NAO_EXISTE');
        noNavegador('blueprint:mostrarMedidas', 'sim');
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
            medidas: usePreferenciaDaPlanta<boolean>('mostrarMedidas'),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        expect(result.current.grade[0]).toBe(true);
        expect(result.current.estilo[0]).toBe('TECNICA');
        expect(result.current.medidas[0]).toBe(false);
    });

    it('com linha no banco, o BANCO vence o navegador', async () => {
        banco = [linha(CHAVE_GRADE, false), linha('planta.exibir.estiloPlanta', 'HUMANIZADA')];
        noNavegador('blueprint:mostrarGrade', true);
        noNavegador('blueprint:estiloPlanta', 'TECNICA');
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
        }));
        await waitFor(() => expect(result.current.grade[0]).toBe(false));
        expect(result.current.estilo[0]).toBe('HUMANIZADA');
    });

    it('linha do banco com valor inválido é ignorada: vale o navegador/padrão', async () => {
        banco = [linha(CHAVE_GRADE, 'ligado'), linha('planta.exibir.estiloPlanta', 'NAO_EXISTE')];
        noNavegador('blueprint:estiloPlanta', 'HUMANIZADA');
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await waitFor(() => expect(result.current.estilo[0]).toBe('HUMANIZADA'));
        expect(result.current.grade[0]).toBe(true);
    });

    it('espelha o valor no navegador (chave antiga, JSON) — a escolha vale sem sessão/offline', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        act(() => result.current[1](false));
        expect(doNavegador('blueprint:mostrarGrade')).toBe(false);
    });

    it('espelho do terreno 3D usa a chave antiga com :v2', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        act(() => result.current[1](true));
        expect(doNavegador('blueprint:vista3dTerreno:v2')).toBe(true);
    });

    it('o setter muda NA HORA, antes de o serviço responder, e grava planta.exibir.<item>', async () => {
        let terminar!: () => void;
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean) => new Promise<void>((ok) => {
            terminar = () => { gravarNoBanco(chave, valor); ok(); };
        }));
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current[0]).toBe(true));

        act(() => result.current[1](false));
        await waitFor(() => expect(result.current[0]).toBe(false));
        expect(m.gravar).toHaveBeenCalledTimes(1);
        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, CHAVE_GRADE, false);

        await act(async () => { terminar(); });
        await waitFor(() => expect(result.current[0]).toBe(false));
        expect(m.showToast).not.toHaveBeenCalled();
    });

    it('o setter também aceita função (como useState)', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await act(async () => { result.current[1]((v) => !v); });
        await waitFor(() => expect(result.current[0]).toBe(false));
        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, CHAVE_GRADE, false);
    });

    it('estilo em texto grava o texto', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<string>('estiloPlanta'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await act(async () => { result.current[1]('HUMANIZADA'); });
        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.exibir.estiloPlanta', 'HUMANIZADA');
        await waitFor(() => expect(result.current[0]).toBe('HUMANIZADA'));
    });

    it('não grava ao montar, nem ao re-renderizar, nem ao "escolher" o valor que já vale', async () => {
        const { result, rerender } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        rerender();
        rerender();
        act(() => result.current[1](true)); // já é true
        expect(m.gravar).not.toHaveBeenCalled();
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('valor fora do tipo/opções do item é ignorado (não muda, não grava, não lança)', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<string>('estiloPlanta'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        act(() => result.current[1]('NAO_EXISTE'));
        expect(result.current[0]).toBe('TECNICA');
        expect(m.gravar).not.toHaveBeenCalled();
    });

    it('terreno 3D: automático (null) é gravado DE VERDADE — gravar(..., null, { apagarQuandoNull: false })', async () => {
        banco = [linha('planta.exibir.vista3dTerreno', true)];
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(result.current[0]).toBe(true));

        await act(async () => { result.current[1](null); });

        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.exibir.vista3dTerreno', null, { apagarQuandoNull: false });
        await waitFor(() => expect(result.current[0]).toBeNull());
        expect(doNavegador('blueprint:vista3dTerreno:v2')).toBeNull();
    });

    it('serviço rejeitando: muda na hora, depois volta ao valor anterior e avisa com o motivo', async () => {
        banco = [linha(CHAVE_GRADE, false)];
        let recusar!: (e: Error) => void;
        m.gravar.mockImplementation(() => new Promise<void>((_ok, ko) => { recusar = ko; }));
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(result.current[0]).toBe(false));

        act(() => result.current[1](true));
        await waitFor(() => expect(result.current[0]).toBe(true));

        await act(async () => { recusar(new Error('sem permissão')); });
        await waitFor(() => expect(result.current[0]).toBe(false));
        expect(m.showToast).toHaveBeenCalledWith('Não foi possível salvar a preferência: sem permissão', 'error');
        expect(doNavegador('blueprint:mostrarGrade')).toBe(false);
    });

    it('falha ao gravar uma escolha NOVA (sem linha antes) volta ao que valia', async () => {
        m.gravar.mockRejectedValue(new Error('rede'));
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await waitFor(() => expect(result.current[0]).toBe(true));

        await act(async () => { result.current[1](false); });

        await waitFor(() => expect(result.current[0]).toBe(true));
        expect(m.showToast).toHaveBeenCalledWith('Não foi possível salvar a preferência: rede', 'error');
    });

    it('⚠️ depois de gravar (sucesso ou falha) a chave do usuário é relida', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await act(async () => { result.current[1](false); });
        await waitFor(() => expect(m.listarDoUsuario.mock.calls.length).toBeGreaterThan(1));
    });

    it('⚠️ leitura do banco falha: a planta abre com o navegador/padrão (não em branco) e avisa UMA vez', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('rede caiu'));
        noNavegador('blueprint:mostrarGrade', false);
        const { result } = montar(() => [
            usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            usePreferenciaDaPlanta<boolean>('mostrarEixos'),
            usePreferenciaDaPlanta<string>('estiloPlanta'),
        ] as const);
        await waitFor(() => expect(m.showToast).toHaveBeenCalled());
        expect(result.current[0][0]).toBe(false); // do navegador
        expect(result.current[1][0]).toBe(true); // padrão
        expect(result.current[2][0]).toBe('TECNICA'); // padrão
        expect(m.showToast.mock.calls.filter(([msg]) => String(msg).includes('rede caiu'))).toHaveLength(1);
        expect(m.showToast).toHaveBeenCalledWith(expect.stringContaining('rede caiu'), 'error');
    });

    it('mesmo com a leitura falhando o setter continua mudando (e espelhando no navegador)', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('outra queda'));
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.showToast).toHaveBeenCalled());
        await act(async () => { result.current[1](false); });
        expect(result.current[0]).toBe(false);
        expect(doNavegador('blueprint:mostrarGrade')).toBe(false);
    });

    it('⚠️ dois cliques rápidos na MESMA chave: termina igual ao banco (o último a gravar vale)', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current[0]).toBe(true));
        // A primeira gravação demora mais que a segunda: o banco acaba com a PRIMEIRA (false).
        let n = 0;
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean) => {
            const espera = n++ === 0 ? 40 : 5;
            return new Promise<void>((ok) => setTimeout(() => { gravarNoBanco(chave, valor); ok(); }, espera));
        });

        act(() => { result.current[1](false); });
        act(() => { result.current[1](true); });

        const valorNoBanco = () => banco.find((l) => l.chave === CHAVE_GRADE)?.valor;
        await waitFor(() => expect(valorNoBanco()).toBe(false));
        await waitFor(() => expect(result.current[0]).toBe(false));
        expect(m.gravar).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(doNavegador('blueprint:mostrarGrade')).toBe(false));
    });

    it('⚠️ sem sessão: muda local (estado + navegador) e NÃO chama o serviço', async () => {
        m.userId = null;
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(result.current[0]).toBe(true));

        await act(async () => { result.current[1](false); });

        expect(result.current[0]).toBe(false);
        expect(doNavegador('blueprint:mostrarGrade')).toBe(false);
        expect(m.listarDoUsuario).not.toHaveBeenCalled();
        expect(m.gravar).not.toHaveBeenCalled();
        expect(m.showToast).not.toHaveBeenCalled();
    });

    it('⚠️ sessão perdida no meio: o valor local continua mandando e nada é gravado', async () => {
        const { result, rerender } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await act(async () => { result.current[1](false); });
        expect(m.gravar).toHaveBeenCalledTimes(1);

        m.userId = null;
        rerender();
        await act(async () => { result.current[1](true); });
        expect(result.current[0]).toBe(true);
        expect(m.gravar).toHaveBeenCalledTimes(1);
    });

    it('dois consumidores da MESMA chave (dois menus) andam juntos', async () => {
        const { result } = montar(() => [
            usePreferenciaDaPlanta<boolean>('mostrarEixos'),
            usePreferenciaDaPlanta<boolean>('mostrarEixos'),
        ] as const);
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current[0][0]).toBe(true));

        await act(async () => { result.current[0][1](false); });

        await waitFor(() => expect(result.current[1][0]).toBe(false));
        expect(result.current[0][0]).toBe(false);
    });

    it('item que não existe no catálogo lança erro claro (é erro de quem programou)', () => {
        expect(() => montar(() => usePreferenciaDaPlanta<boolean>('naoExiste'))).toThrow(/naoExiste/);
    });
});

describe('useMigracaoDaExibicaoDaPlanta', () => {
    let seq = 0;
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        banco = [];
        // A guarda é do módulo ("uma vez por usuário por carga"): cada teste usa um usuário novo.
        m.userId = `u-mig-${++seq}`;
        m.listarDoUsuario.mockImplementation(async () => [...banco]);
        m.gravar.mockResolvedValue(undefined);
        m.gravarVarios.mockImplementation(async (linhas: { chave: string; valor: boolean | string | null }[]) => {
            for (const l of linhas) gravarNoBanco(l.chave, l.valor, false);
        });
    });

    it('depois da 1ª leitura, UMA chamada de gravarVarios só com o que difere do padrão e falta no banco', async () => {
        noNavegador('blueprint:mostrarGrade', true); // = padrão → NÃO migra (o usePersistedState grava o padrão ao montar)
        noNavegador('blueprint:mostrarEixos', false); // difere → migra
        noNavegador('blueprint:estiloPlanta', 'HUMANIZADA'); // difere → migra
        noNavegador('blueprint:modoDeCor', 'NENHUM'); // = padrão → NÃO migra
        noNavegador('blueprint:mostrarMedidas', true); // difere, mas já está no banco → NÃO migra
        banco = [linha('planta.exibir.mostrarMedidas', false)];

        montar(() => useMigracaoDaExibicaoDaPlanta());

        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
        const [linhas] = m.gravarVarios.mock.calls[0] as [{ chave: string; valor: unknown }[]];
        expect([...linhas].sort((a, b) => a.chave.localeCompare(b.chave))).toEqual([
            { chave: 'planta.exibir.estiloPlanta', valor: 'HUMANIZADA' },
            { chave: 'planta.exibir.mostrarEixos', valor: false },
        ]);
    });

    it('depois de migrar relê a chave do usuário (a planta passa a ler do banco)', async () => {
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(m.listarDoUsuario.mock.calls.length).toBeGreaterThan(1));
    });

    it('⚠️ NENHUMA gravação na 2ª montagem (nem em re-renderização, nem em outra aba/instância)', async () => {
        // O banco NÃO guarda o que foi gravado: só a guarda do módulo impede a 2ª gravação.
        m.gravarVarios.mockResolvedValue(undefined);
        noNavegador('blueprint:mostrarEixos', false);
        const a = montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
        a.rerender();
        a.unmount();

        const b = montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await waitFor(() => expect(b.result.current).toBeUndefined());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.gravarVarios).toHaveBeenCalledTimes(1);
    });

    it('navegador sem nada diferente do padrão: não grava nada', async () => {
        noNavegador('blueprint:mostrarGrade', true);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('⚠️ leitura que falha: não migra (não dá para saber o que já está no banco)', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('rede caiu'));
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('sem sessão: não migra', async () => {
        m.userId = null;
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('gravarVarios que falha não lança (o navegador continua com a escolha; a próxima carga tenta de novo)', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        m.gravarVarios.mockRejectedValue(new Error('negado'));
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(aviso).toHaveBeenCalled());
        expect(doNavegador('blueprint:mostrarEixos')).toBe(false);
        aviso.mockRestore();
    });
});
