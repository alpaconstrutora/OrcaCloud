import type { HierarchicalSelectItem } from '../components/HierarchicalSelect';
import { situacaoDaRetirada } from './formaEntrega';

/**
 * Regras puras da retirada de pedido FOB (quem pode retirar / quem retirou).
 * Serviço: services/retiradaPedidoService.ts.
 */

interface Colaborador { id: string; nome: string; cpf?: string }

const GRUPO_AUTORIZADOS = '__autorizados';
const GRUPO_OUTROS = '__outros';

/**
 * Itens do seletor "Retirado por": os autorizados primeiro, num grupo próprio;
 * depois os demais colaboradores — quem retirou pode não ser quem estava na
 * lista (o motorista mudou na última hora), e o registro tem de dizer a verdade.
 * O CPF vai DENTRO do nome ("Nome · CPF …"), não no `code`: o seletor ordena
 * por `code` quando há (a lista sairia em ordem de CPF) e busca no nome — assim
 * fica em ordem alfabética e o CPF continua achável. Os dois grupos também se
 * ordenam pelo nome: "Autorizados…" antes de "Outros…".
 */
export function itensRetiradoPor(autorizados: Colaborador[], colaboradores: Colaborador[]): HierarchicalSelectItem[] {
    const idsAutorizados = new Set(autorizados.map(a => a.id));
    const outros = colaboradores.filter(c => !idsAutorizados.has(c.id));
    const itens: HierarchicalSelectItem[] = [];
    if (autorizados.length > 0) {
        itens.push({ id: GRUPO_AUTORIZADOS, name: 'Autorizados a retirar', selecionavel: false });
        for (const a of autorizados) itens.push({ id: a.id, name: rotuloColaborador(a), parentId: GRUPO_AUTORIZADOS });
    }
    if (outros.length > 0) {
        itens.push({ id: GRUPO_OUTROS, name: 'Outros colaboradores', selecionavel: false });
        for (const c of outros) itens.push({ id: c.id, name: rotuloColaborador(c), parentId: GRUPO_OUTROS });
    }
    return itens;
}

/** Itens do seletor "Adicionar autorizado": colaboradores que ainda não estão na lista. */
export function itensParaAutorizar(autorizados: Colaborador[], colaboradores: Colaborador[]): HierarchicalSelectItem[] {
    const ja = new Set(autorizados.map(a => a.id));
    return colaboradores
        .filter(c => !ja.has(c.id))
        .map(c => ({ id: c.id, name: rotuloColaborador(c) }));
}

/**
 * Por que "Registrar retirada" está desligado — '' quando pode registrar.
 * Ordem: status do pedido → data → quem retirou (o registro só vale com as duas).
 */
export function motivoRetiradaDesligada(p: { status?: string | null; dataRetirada?: string; retiradoPorId?: string }): string {
    const situacao = situacaoDaRetirada(p.status);
    if (!situacao.pode) return situacao.motivo || 'Este pedido já não aceita registro de retirada.';
    if (!p.dataRetirada) return 'Informe a data da retirada.';
    if (!p.retiradoPorId) return 'Informe quem retirou.';
    return '';
}

/** "000.000.000-00" quando o CPF tem 11 dígitos; senão devolve como veio. */
export function formatarCpf(cpf?: string | null): string {
    const d = (cpf ?? '').replace(/\D/g, '');
    if (d.length !== 11) return cpf ?? '';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** "Nome · CPF 000.000.000-00" (só o nome quando não há CPF). */
export function rotuloColaborador(c: { nome: string; cpf?: string | null }): string {
    return c.cpf ? `${c.nome} · CPF ${formatarCpf(c.cpf)}` : c.nome;
}
