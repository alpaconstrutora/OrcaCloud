// @vitest-environment jsdom
/**
 * usePreferenciaDaPlanta / useMigracaoDaExibicaoDaPlanta — o que a Planta exibe (menu Vista › Exibir)
 * passa a ser preferência do USUÁRIO no banco. Serviço, sessão e aviso simulados; o "banco falso"
 * devolve na leitura o que foi gravado (o hook relê a chave ao fim de cada gravação).
 * Foco: banco vence navegador; leitura que falha cai no navegador/padrão; clique rápido termina igual
 * ao banco; rajada de gravações = UMA releitura no fim; sem sessão só muda local (e só ele espelha no
 * navegador); terreno 3D "Automático" = texto 'AUTOMATICO' no banco; a migração do navegador roda UMA
 * vez por usuário (marcador no navegador) e só leva o que difere do padrão.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinhaDePreferencia } from '../../utils/preferencias/resolver';

const m = vi.hoisted(() => ({
    listarDoUsuario: vi.fn(),
    listarDaPrancha: vi.fn(),
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
        listarDaPrancha: m.listarDaPrancha,
        gravar: m.gravar,
        gravarVarios: m.gravarVarios,
    },
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: m.showToast }) }));

import {
    usePreferenciaDaPlanta,
    useMigracaoDaExibicaoDaPlanta,
    chaveDoMarcadorDeMigracao,
} from '../../hooks/usePreferenciaDaPlanta';
import { usePreferenciasEletricas } from '../../hooks/usePreferenciasEletricas';
import { CATALOGO_DE_LANCAMENTO } from '../../utils/preferencias/catalogoLancamento';

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
        m.listarDaPrancha.mockResolvedValue([]);
        m.gravar.mockImplementation(async (_e: unknown, _d: unknown, chave: string, valor: boolean | string | null) => {
            gravarNoBanco(chave, valor); // null apaga a linha, como o serviço
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
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        expect(result.current.grade[0]).toBe(false);
        expect(result.current.estilo[0]).toBe('HUMANIZADA');
    });

    it('terreno 3D: SEM linha no banco vale o navegador (true/false explícito), como os demais itens', async () => {
        noNavegador('blueprint:vista3dTerreno:v2', true);
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(result.current[0]).toBe(true);
    });

    it('⚠️ terreno 3D: linha "AUTOMATICO" no banco → o editor vê null, mesmo com true no navegador', async () => {
        banco = [linha('planta.exibir.vista3dTerreno', 'AUTOMATICO')];
        noNavegador('blueprint:vista3dTerreno:v2', true);
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        expect(result.current[0]).toBe(true); // leitura ainda não chegou: segue o navegador
        await waitFor(() => expect(result.current[0]).toBeNull());
    });

    it('terreno 3D: leitura FALHOU → segue o navegador', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('terreno sem rede'));
        noNavegador('blueprint:vista3dTerreno:v2', true);
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(m.showToast).toHaveBeenCalled());
        expect(result.current[0]).toBe(true);
    });

    it('terreno 3D: com linha no banco, a linha vale', async () => {
        banco = [linha('planta.exibir.vista3dTerreno', false)];
        noNavegador('blueprint:vista3dTerreno:v2', true);
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(result.current[0]).toBe(false));
    });

    it('terreno 3D: o texto "AUTOMATICO" não é aceito pelo setter (o editor entrega null)', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        act(() => result.current[1]('AUTOMATICO' as never));
        aviso.mockRestore();
        expect(m.gravar).not.toHaveBeenCalled();
        expect(result.current[0]).toBeNull();
    });

    it('terreno 3D sem sessão: continua valendo o local (não há leitura do banco)', async () => {
        m.userId = null;
        noNavegador('blueprint:vista3dTerreno:v2', true);
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(result.current[0]).toBe(true));
        await act(async () => { result.current[1](false); });
        expect(result.current[0]).toBe(false);
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

    it('SEM sessão espelha o valor no navegador (chave antiga, JSON) — a escolha vale deslogado/offline', async () => {
        m.userId = null;
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        act(() => result.current[1](false));
        expect(doNavegador('blueprint:mostrarGrade')).toBe(false);
    });

    it('espelho do terreno 3D (sem sessão) usa a chave antiga com :v2', async () => {
        m.userId = null;
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        act(() => result.current[1](true));
        expect(doNavegador('blueprint:vista3dTerreno:v2')).toBe(true);
    });

    it('⚠️ COM sessão o espelho NÃO escreve no navegador: a fonte é o banco (outro usuário não herda a escolha)', async () => {
        banco = [linha(CHAVE_GRADE, false), linha('planta.exibir.estiloPlanta', 'HUMANIZADA')];
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            estilo: usePreferenciaDaPlanta<string>('estiloPlanta'),
            eixos: usePreferenciaDaPlanta<boolean>('mostrarEixos'),
        }));
        await waitFor(() => expect(result.current.grade[0]).toBe(false)); // veio do banco
        await act(async () => { result.current.eixos[1](false); }); // escolha local, com gravação
        await waitFor(() => expect(m.gravar).toHaveBeenCalled());
        expect(result.current.estilo[0]).toBe('HUMANIZADA');
        expect(localStorage.length).toBe(0);
    });

    it('setter ESTÁVEL entre renders (a chave da query é memorizada)', async () => {
        const { result, rerender } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        const antes = result.current[1];
        rerender();
        rerender();
        expect(result.current[1]).toBe(antes);
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

    it('⚠️ terreno 3D: "Automático" (null) é gravado como o texto "AUTOMATICO" e o cache otimista ganha essa linha', async () => {
        banco = [linha('planta.exibir.vista3dTerreno', true)];
        let terminar!: () => void;
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: string) => new Promise<void>((ok) => {
            terminar = () => { gravarNoBanco(chave, valor); ok(); };
        }));
        const { result, client } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(result.current[0]).toBe(true));

        act(() => result.current[1](null));

        await waitFor(() => expect(result.current[0]).toBeNull());
        const noCache = client.getQueryData<LinhaDePreferencia[]>(['preferencias', 'usuario', 'u1']);
        expect(noCache?.find((l) => l.chave === 'planta.exibir.vista3dTerreno')?.valor).toBe('AUTOMATICO');
        await act(async () => { terminar(); });
    });

    it('terreno 3D: "Automático" (null) GRAVA o texto "AUTOMATICO" (nunca null); a tela mostra null', async () => {
        banco = [linha('planta.exibir.vista3dTerreno', true)];
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(result.current[0]).toBe(true));

        await act(async () => { result.current[1](null); });

        expect(m.gravar).toHaveBeenCalledTimes(1);
        expect(m.gravar.mock.calls[0]).toEqual(['USUARIO', {}, 'planta.exibir.vista3dTerreno', 'AUTOMATICO']);
        await waitFor(() => expect(result.current[0]).toBeNull());
        expect(banco).toEqual([linha('planta.exibir.vista3dTerreno', 'AUTOMATICO')]);
    });

    it('terreno 3D: de "Automático" para Ligado grava true', async () => {
        banco = [linha('planta.exibir.vista3dTerreno', 'AUTOMATICO')];
        const { result } = montar(() => usePreferenciaDaPlanta<boolean | null>('vista3dTerreno'));
        await waitFor(() => expect(result.current[0]).toBeNull());
        await act(async () => { result.current[1](true); });
        expect(m.gravar.mock.calls[0]).toEqual(['USUARIO', {}, 'planta.exibir.vista3dTerreno', true]);
        await waitFor(() => expect(result.current[0]).toBe(true));
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

    it('mesmo com a leitura falhando o setter continua mudando', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('outra queda'));
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(m.showToast).toHaveBeenCalled());
        await act(async () => { result.current[1](false); });
        expect(result.current[0]).toBe(false);
    });

    it('⚠️ o aviso de falha de leitura é ÚNICO entre usePreferenciasEletricas e usePreferenciaDaPlanta (mesma query)', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('queda compartilhada'));
        montar(() => ({
            eletrica: usePreferenciasEletricas({ organizationId: null }),
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            eixos: usePreferenciaDaPlanta<boolean>('mostrarEixos'),
        }));
        await waitFor(() => expect(m.showToast).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.showToast.mock.calls.filter(([msg]) => String(msg).includes('queda compartilhada'))).toHaveLength(1);
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
    });

    it('⚠️ RAJADA (template de vista): 5 setters com latências diferentes → UMA releitura no fim e nenhum item volta ao valor antigo no meio', async () => {
        const itens = [
            ['mostrarGrade', false, 50],
            ['mostrarMedidas', true, 10],
            ['mostrarEixos', false, 30],
            ['mostrarCircuitos', false, 5],
            ['mostrarRotulos', true, 20],
        ] as const;
        const { result } = montar(() => itens.map(([item]) => usePreferenciaDaPlanta<boolean>(item)));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current[0][0]).toBe(true)); // lista no cache (o otimista só age com ela)

        const instantaneos: boolean[][] = [];
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean) => {
            const espera = itens.find(([item]) => `planta.exibir.${item}` === chave)![2];
            return new Promise<void>((ok) => setTimeout(() => {
                gravarNoBanco(chave, valor);
                // No momento em que ESTA gravação termina, o que a tela mostra ainda é tudo o que foi escolhido.
                instantaneos.push(result.current.map(([v]) => v));
                ok();
            }, espera));
        });
        const leiturasAntes = m.listarDoUsuario.mock.calls.length;

        act(() => { itens.forEach(([, novo], i) => result.current[i][1](novo)); });

        const escolhido = itens.map(([, novo]) => novo);
        expect(result.current.map(([v]) => v)).toEqual(escolhido);
        await waitFor(() => expect(m.gravar).toHaveBeenCalledTimes(5));
        // Enquanto há gravação em voo, nenhuma releitura (ela traria o valor antigo dos itens ainda pendentes).
        await new Promise((r) => setTimeout(r, 25));
        expect(m.listarDoUsuario.mock.calls.length).toBe(leiturasAntes);
        expect(result.current.map(([v]) => v)).toEqual(escolhido);

        await waitFor(() => expect(m.listarDoUsuario.mock.calls.length).toBe(leiturasAntes + 1));
        await new Promise((r) => setTimeout(r, 60));
        expect(m.listarDoUsuario.mock.calls.length).toBe(leiturasAntes + 1); // UMA releitura só
        expect(instantaneos).toHaveLength(5);
        for (const foto of instantaneos) expect(foto).toEqual(escolhido);
        expect(result.current.map(([v]) => v)).toEqual(escolhido);
        expect(m.showToast).not.toHaveBeenCalled();
    });

    it('rajada com uma gravação que FALHA: só ela volta ao valor anterior, avisa, e ainda há UMA releitura no fim', async () => {
        const { result } = montar(() => [
            usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            usePreferenciaDaPlanta<boolean>('mostrarEixos'),
        ] as const);
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current[0][0]).toBe(true));
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean) =>
            new Promise<void>((ok, ko) => setTimeout(() => {
                if (chave === CHAVE_GRADE) ko(new Error('negado'));
                else { gravarNoBanco(chave, valor); ok(); }
            }, chave === CHAVE_GRADE ? 10 : 30)));

        act(() => { result.current[0][1](false); result.current[1][1](false); });

        await waitFor(() => expect(m.listarDoUsuario.mock.calls.length).toBe(2));
        await new Promise((r) => setTimeout(r, 40));
        expect(m.listarDoUsuario.mock.calls.length).toBe(2);
        expect(result.current[0][0]).toBe(true); // falhou: voltou
        expect(result.current[1][0]).toBe(false); // gravou
        expect(m.showToast).toHaveBeenCalledWith('Não foi possível salvar a preferência: negado', 'error');
    });

    it('⚠️ sem sessão: muda local (estado + navegador) e NÃO chama o serviço', async () => {
        m.userId = null;
        const { result } = montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade'));
        await waitFor(() => expect(result.current[0]).toBe(true));

        await act(async () => { result.current[1](false); });

        expect(result.current[0]).toBe(false);
        expect(doNavegador('blueprint:mostrarGrade')).toBe(false); // sem sessão o navegador é a fonte
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
        // A guarda em módulo é "uma vez por usuário por carga": cada teste usa um usuário novo.
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

    it('terreno 3D (automatico) migra quando o navegador tem true/false EXPLÍCITO; null não migra', async () => {
        noNavegador('blueprint:vista3dTerreno:v2', true);
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
        const [linhas] = m.gravarVarios.mock.calls[0] as [{ chave: string }[]];
        expect(linhas.map((l) => l.chave).sort()).toEqual(['planta.exibir.mostrarEixos', 'planta.exibir.vista3dTerreno']);
    });

    it('terreno 3D com null (automático) no navegador não migra', async () => {
        noNavegador('blueprint:vista3dTerreno:v2', null);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.gravarVarios).not.toHaveBeenCalled();
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

    it('navegador sem nada diferente do padrão: não grava nada, mas deixa o marcador do usuário', async () => {
        noNavegador('blueprint:mostrarGrade', true);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await waitFor(() => expect(localStorage.getItem(chaveDoMarcadorDeMigracao(m.userId!))).toBe('1'));
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('⚠️ marcador POR USUÁRIO: gravado só depois do gravarVarios bem-sucedido', async () => {
        let concluir!: () => void;
        m.gravarVarios.mockImplementation(() => new Promise<void>((ok) => { concluir = ok; }));
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
        expect(localStorage.getItem(chaveDoMarcadorDeMigracao(m.userId!))).toBeNull(); // ainda em voo
        await act(async () => { concluir(); });
        await waitFor(() => expect(localStorage.getItem(chaveDoMarcadorDeMigracao(m.userId!))).toBe('1'));
    });

    it('⚠️ com o marcador presente (carga seguinte) NÃO migra, mesmo havendo o que migrar', async () => {
        localStorage.setItem(chaveDoMarcadorDeMigracao(m.userId!), '1');
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('o marcador de OUTRO usuário no mesmo navegador não vale para este', async () => {
        localStorage.setItem(chaveDoMarcadorDeMigracao('outro-usuario'), '1');
        noNavegador('blueprint:mostrarEixos', false);
        montar(() => useMigracaoDaExibicaoDaPlanta());
        await waitFor(() => expect(m.gravarVarios).toHaveBeenCalledTimes(1));
    });

    it('⚠️ usuário logado não deixa o espelho no navegador: o 2º usuário do mesmo navegador não herda as escolhas do 1º', async () => {
        // 1º usuário: escolhas vêm do banco e uma é feita agora.
        banco = [linha(CHAVE_GRADE, false)];
        m.userId = 'primeiro-usuario';
        const a = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            eixos: usePreferenciaDaPlanta<boolean>('mostrarEixos'),
            migracao: useMigracaoDaExibicaoDaPlanta(),
        }));
        await waitFor(() => expect(a.result.current.grade[0]).toBe(false));
        await act(async () => { a.result.current.eixos[1](false); });
        await waitFor(() => expect(m.gravar).toHaveBeenCalled());
        a.unmount();
        // 2º usuário no mesmo navegador, sem nada no banco: nada a migrar.
        banco = [];
        m.userId = 'segundo-usuario';
        m.gravarVarios.mockClear();
        const b = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            eixos: usePreferenciaDaPlanta<boolean>('mostrarEixos'),
            migracao: useMigracaoDaExibicaoDaPlanta(),
        }));
        await waitFor(() => expect(localStorage.getItem(chaveDoMarcadorDeMigracao('segundo-usuario'))).toBe('1'));
        expect(m.gravarVarios).not.toHaveBeenCalled();
        expect(b.result.current.grade[0]).toBe(true); // padrão
        expect(b.result.current.eixos[0]).toBe(true); // padrão
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
        expect(localStorage.getItem(chaveDoMarcadorDeMigracao(m.userId!))).toBeNull(); // falhou: a próxima carga tenta de novo
        aviso.mockRestore();
    });
});

/**
 * 24/10/2026 — o MESMO hook, com o catálogo do LANÇAMENTO (plano 2026-10-24-preferencia-caixas-de-passagem.md):
 * `planta.lancamento.caixasDePassagem`, escopo USUARIO, padrão `PELA_LUZ`. Mesma query, mesmo contador de
 * gravações, mesmo aviso de leitura; sem sessão fica no navegador em `blueprint:lancamento:caixasDePassagem`.
 */
describe('usePreferenciaDaPlanta — catálogo do lançamento (caixas de passagem)', () => {
    const CHAVE_CAIXAS = 'planta.lancamento.caixasDePassagem';

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        banco = [];
        m.userId = 'u1';
        m.listarDoUsuario.mockImplementation(async () => [...banco]);
        m.gravar.mockImplementation(async (_e: unknown, _d: unknown, chave: string, valor: boolean | string | null) => {
            gravarNoBanco(chave, valor);
        });
    });

    it('sem nada no banco nem no navegador o padrão é PELA_LUZ', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        expect(result.current[0]).toBe('PELA_LUZ');
    });

    it('⚠️ NÃO migra o valor antigo do navegador (blueprint:eletrodutosCaixas = true): o padrão mudou por decisão do usuário', async () => {
        noNavegador('blueprint:eletrodutosCaixas', true);
        const { result } = montar(() => ({
            caixas: usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO),
            migracao: useMigracaoDaExibicaoDaPlanta(),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(result.current.caixas[0]).toBe('PELA_LUZ');
        expect(m.gravar).not.toHaveBeenCalled();
        expect(m.gravarVarios).not.toHaveBeenCalled();
    });

    it('gravar CAIXAS chama o serviço com a chave e o valor certos, e a releitura mostra o valor', async () => {
        const { result } = montar(() => usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await act(async () => { result.current[1]('CAIXAS'); });
        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, CHAVE_CAIXAS, 'CAIXAS');
        // A gravação termina relendo a lista (o banco é a verdade).
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(2));
        expect(banco).toEqual([linha(CHAVE_CAIXAS, 'CAIXAS')]);
        expect(result.current[0]).toBe('CAIXAS');
    });

    it('com linha no banco vale a linha; valor fora das opções é ignorado (não grava)', async () => {
        banco = [linha(CHAVE_CAIXAS, 'CAIXAS')];
        const { result } = montar(() => usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO));
        await waitFor(() => expect(result.current[0]).toBe('CAIXAS'));
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        act(() => result.current[1]('TALVEZ'));
        aviso.mockRestore();
        expect(m.gravar).not.toHaveBeenCalled();
        expect(result.current[0]).toBe('CAIXAS');
    });

    it('⚠️ UMA leitura só: exibição e lançamento leem a MESMA query do usuário', async () => {
        banco = [linha(CHAVE_GRADE, false), linha(CHAVE_CAIXAS, 'CAIXAS')];
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            caixas: usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO),
        }));
        await waitFor(() => expect(result.current.caixas[0]).toBe('CAIXAS'));
        expect(result.current.grade[0]).toBe(false);
        expect(m.listarDoUsuario).toHaveBeenCalledTimes(1);
    });

    it('⚠️ o aviso de falha de leitura é o MESMO (um só) para exibição e lançamento', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('queda do lançamento'));
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            caixas: usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO),
        }));
        await waitFor(() => expect(m.showToast).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(m.showToast.mock.calls.filter(([msg]) => String(msg).includes('queda do lançamento'))).toHaveLength(1);
        expect(result.current.caixas[0]).toBe('PELA_LUZ'); // leitura falhou: vale o padrão
    });

    it('⚠️ rajada exibição + lançamento: UMA releitura no fim (mesmo contador de gravações da query)', async () => {
        const { result } = montar(() => ({
            grade: usePreferenciaDaPlanta<boolean>('mostrarGrade'),
            caixas: usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO),
        }));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        let n = 0;
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean | string) => {
            const espera = n++ === 0 ? 40 : 5;
            return new Promise<void>((ok) => setTimeout(() => { gravarNoBanco(chave, valor); ok(); }, espera));
        });
        act(() => { result.current.grade[1](false); });
        act(() => { result.current.caixas[1]('CAIXAS'); });
        await waitFor(() => expect(banco).toHaveLength(2));
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(2));
        await new Promise((r) => setTimeout(r, 30));
        expect(m.listarDoUsuario).toHaveBeenCalledTimes(2);
        expect(result.current.grade[0]).toBe(false);
        expect(result.current.caixas[0]).toBe('CAIXAS');
    });

    it('SEM sessão fica no navegador, em blueprint:lancamento:caixasDePassagem, e não chama o serviço', async () => {
        m.userId = null;
        const { result } = montar(() => usePreferenciaDaPlanta<string>('caixasDePassagem', CATALOGO_DE_LANCAMENTO));
        act(() => result.current[1]('CAIXAS'));
        expect(result.current[0]).toBe('CAIXAS');
        expect(doNavegador('blueprint:lancamento:caixasDePassagem')).toBe('CAIXAS');
        expect(m.gravar).not.toHaveBeenCalled();
    });

    it('item que não existe no catálogo do lançamento lança erro claro (o de exibição não vale aqui)', () => {
        expect(() => montar(() => usePreferenciaDaPlanta<boolean>('mostrarGrade', CATALOGO_DE_LANCAMENTO))).toThrow(/mostrarGrade/);
    });
});
