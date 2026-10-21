/**
 * Estado do acesso do síndico ao Portal do Síndico, como o admin vê no card
 * "Síndico" de Portais › Portal do Condomínio. Entrada = o retorno da RPC
 * `sindico_portal_estado`. Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * A ordem das verificações é a ordem do que IMPEDE o acesso: sem síndico não há
 * a quem dar acesso; mandato fora da vigência derruba qualquer link (o banco
 * recusa a cada chamada); só então importa o estado do link.
 */
import { mandatoVigente } from './mandatoSindico';

export type SituacaoDoAcessoDoSindico =
    | 'SEM_SINDICO' | 'MANDATO_FORA' | 'SEM_ACESSO' | 'REVOGADO' | 'EXPIRADO' | 'ATIVO';

export interface EstadoDoSindico {
    sindico: {
        clientId: string;
        nome: string;
        email: string | null;
        telefone?: string | null;
        mandatoInicio: string | null;
        mandatoFim: string | null;
    } | null;
    acesso: {
        ativo: boolean;
        expiraEm: string;
        ultimoUso: string | null;
        convidadoEm: string | null;
        token?: string | null;
    } | null;
}

export interface AcessoDoSindico {
    situacao: SituacaoDoAcessoDoSindico;
    rotulo: string;
    /** Dias até o link expirar (só ATIVO). */
    dias?: number;
}

export function acessoDoSindico(estado: EstadoDoSindico, hoje: string, agora: Date = new Date()): AcessoDoSindico {
    const s = estado.sindico;
    if (!s) return { situacao: 'SEM_SINDICO', rotulo: 'Sem síndico definido' };
    if (!mandatoVigente(s.mandatoInicio, s.mandatoFim, hoje)) {
        return { situacao: 'MANDATO_FORA', rotulo: 'Mandato fora da vigência' };
    }
    const a = estado.acesso;
    if (!a) return { situacao: 'SEM_ACESSO', rotulo: 'Sem acesso gerado' };
    if (!a.ativo) return { situacao: 'REVOGADO', rotulo: 'Revogado' };
    const ms = new Date(a.expiraEm).getTime() - agora.getTime();
    if (ms <= 0) return { situacao: 'EXPIRADO', rotulo: 'Link expirado' };
    const dias = Math.ceil(ms / 86_400_000);
    return { situacao: 'ATIVO', rotulo: `Ativo · ${dias} ${dias === 1 ? 'dia' : 'dias'}`, dias };
}
