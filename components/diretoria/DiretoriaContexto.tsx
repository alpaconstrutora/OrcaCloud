/**
 * Diretoria (ÒPURA CEO) — o que as três visões, a linha do grupo e o cartão da determinação
 * compartilham: o painel já lido, quem pode gravar em qual organização e as ações.
 *
 * Quem monta é a casca (`DiretoriaModule`): ela é a única que conhece o topo (REGRA #5),
 * o serviço e o toast. As peças de baixo só pedem — nenhuma decide organização sozinha.
 */
import React from 'react';
import type { Determinacao, GrupoExcecao, PainelDiretoria, TipoExcecao } from '../../utils/diretoria';

/** Determinação a gravar. `orgId` null = "Todas" no topo: a casca pergunta a organização. */
export interface NovaDeterminacao {
    orgId: string | null;
    titulo: string;
    responsavelId: string;
    prazo: string;
    origem: string | null;
    excecaoChave: string | null;
}

export interface Diretoria {
    painel: PainelDiretoria;
    /** As exceções do painel SEM os tipos silenciados ("É barulho"). */
    excecoes: GrupoExcecao[];
    silenciados: TipoExcecao[];
    /** Organização do topo; null = "Todas". */
    orgDoTopo: string | null;
    /** Chefe efetivo de cada pessoa (`chefesEfetivos`). */
    chefes: Map<string, string>;
    /** `pode_editar` da organização, vindo do banco. */
    podeEditarOrg: (orgId: string) => boolean;
    /** Alguma organização do painel aceita gravação (para o que ainda não tem organização). */
    podeEditarAlguma: boolean;
    nomeDaOrg: (orgId: string) => string;
    /** O painel tem mais de uma organização: as linhas dizem de qual são. */
    mostrarOrg: boolean;
    cobrar: (g: GrupoExcecao) => Promise<void>;
    /** Vários grupos de uma vez ("Cobrar tudo" da visão por responsável) — um aviso só no fim. */
    cobrarTodos: (gs: GrupoExcecao[]) => Promise<void>;
    virarDeterminacao: (g: GrupoExcecao) => void;
    silenciar: (tipo: TipoExcecao) => void;
    abrirCadastro: () => void;
    navegar: (tela: string) => void;
    determinar: (d: NovaDeterminacao) => Promise<boolean>;
    atualizar: (d: Determinacao, texto: string) => Promise<boolean>;
    concluir: (d: Determinacao) => Promise<void>;
    /** A pessoa recebe o resumo por e-mail toda segunda (preferência diretoria.resumo_semanal). */
    resumoSemanal: boolean;
    alternarResumoSemanal: (ligado: boolean) => void;
    /** Manda agora uma prévia do resumo só para quem pediu (Edge Function). */
    enviarPrevia: () => Promise<void>;
}

const Contexto = React.createContext<Diretoria | null>(null);

export const DiretoriaProvider = Contexto.Provider;

export function useDiretoria(): Diretoria {
    const c = React.useContext(Contexto);
    if (!c) throw new Error('useDiretoria precisa de <DiretoriaProvider> (montado pelo DiretoriaModule)');
    return c;
}
