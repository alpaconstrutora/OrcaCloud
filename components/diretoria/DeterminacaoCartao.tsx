/**
 * Diretoria (ÒPURA CEO) — o cartão de uma determinação: título, responsável, prazo, a última
 * atualização ("o que andou?") e as ações Atualizar e Concluir. Usado na fila (ao lado), na visão
 * por responsável e no quadro da reunião. Plano: docs/planos/2026-11-17-opura-ceo.md (decisão 7).
 *
 * Atualizar registra um texto curto (não se apaga — é o ritual da reunião) e põe a determinação
 * "em andamento". Concluir pede confirmação (`useConfirm`, §14) e fecha também a tarefa da agenda.
 * Sem `pode_editar` na organização da determinação, os dois desligam com o motivo (§9.2).
 */
import React from 'react';
import { CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { dataBr, diasAte, nomeDe, type Determinacao } from '../../utils/diretoria';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';
import { useConfirm } from '../ui/confirm';
import { useDiretoria } from './DiretoriaContexto';
import { BOTAO_SECUNDARIO, CAMPO, LINK_ACAO, dataCurta, plural } from './diretoriaUi';

/** Prazo como texto colorido (§8 — sem pílula): vencida em vermelho, até 3 dias em âmbar. */
function prazoDe(d: Determinacao, hoje: string): { texto: string; cor: string } {
    if (d.status === 'concluida') {
        return { texto: d.concluida_em ? `concluída em ${dataCurta(d.concluida_em)}` : 'concluída', cor: 'text-emerald-700' };
    }
    const n = diasAte(d.prazo, hoje);
    if (n < 0) return { texto: `venceu em ${dataBr(d.prazo)} (há ${plural(-n, 'dia', 'dias')})`, cor: 'text-red-700 font-medium' };
    if (n === 0) return { texto: `vence hoje (${dataBr(d.prazo)})`, cor: 'text-amber-700 font-medium' };
    if (n <= 3) return { texto: `prazo ${dataBr(d.prazo)} (em ${plural(n, 'dia', 'dias')})`, cor: 'text-amber-700' };
    return { texto: `prazo ${dataBr(d.prazo)}`, cor: 'text-gray-600' };
}

interface Props {
    d: Determinacao;
    /** Esconde o responsável quando a lista já é de uma pessoa só. */
    semResponsavel?: boolean;
}

export const DeterminacaoCartao: React.FC<Props> = ({ d, semResponsavel }) => {
    const ctx = useDiretoria();
    const confirm = useConfirm();
    const id = React.useId();
    const [nota, setNota] = React.useState<string | null>(null);
    const [gravando, setGravando] = React.useState(false);

    const prazo = prazoDe(d, ctx.painel.hoje);
    const ultima = d.atualizacoes.reduce<Determinacao['atualizacoes'][number] | null>(
        (u, a) => (!u || a.criada_em > u.criada_em ? a : u), null);
    const motivo = ctx.podeEditarOrg(d.organization_id) ? null : MOTIVO_SEM_EDICAO_DIRETORIA;
    const responsavel = nomeDe(d.responsavel_user_id, ctx.painel.pessoas);
    const contexto = [
        semResponsavel ? null : responsavel,
        d.origem,
        ctx.mostrarOrg ? ctx.nomeDaOrg(d.organization_id) : null,
    ].filter(Boolean).join(' · ');

    const gravarNota = async (e: React.FormEvent) => {
        e.preventDefault();
        const texto = (nota ?? '').trim();
        if (!texto) return;
        setGravando(true);
        try {
            if (await ctx.atualizar(d, texto.slice(0, 1000))) setNota(null);
        } finally {
            setGravando(false);
        }
    };

    const concluir = async () => {
        const ok = await confirm({
            title: 'Concluir a determinação?',
            message: `"${d.titulo}" sai das abertas, e a tarefa na agenda de ${responsavel} é concluída junto.`,
            variant: 'default',
            confirmLabel: 'Concluir',
        });
        if (ok) await ctx.concluir(d);
    };

    return (
        <article aria-labelledby={id} className="bg-white border border-gray-200 rounded-[10px] p-3 space-y-1.5 min-w-0">
            <p id={id} className={`text-sm font-medium [overflow-wrap:anywhere] ${d.status === 'concluida' ? 'text-gray-600' : 'text-gray-900'}`}>{d.titulo}</p>
            {contexto && <p className="text-xs text-gray-500">{contexto}</p>}
            <p className={`text-xs ${prazo.cor}`}>{prazo.texto}</p>
            {ultima ? (
                <p className="text-xs text-gray-700 bg-gray-50 rounded-[6px] px-2 py-1 [overflow-wrap:anywhere]">
                    <span className="text-gray-500">{dataCurta(ultima.criada_em)}:</span> {ultima.texto}
                </p>
            ) : d.status !== 'concluida' && (
                <p className="text-xs text-amber-700">sem atualização desde {dataCurta(d.criada_em)}</p>
            )}

            {d.status !== 'concluida' && (nota === null ? (
                <div className="flex flex-wrap items-center gap-1 -ml-2 pt-0.5">
                    <span className="inline-flex" title={motivo ?? 'Registrar o que andou'}>
                        <button type="button" onClick={() => setNota('')} disabled={!!motivo} className={LINK_ACAO}>
                            <MessageSquarePlus className="w-4 h-4" aria-hidden="true" /> Atualizar
                        </button>
                    </span>
                    <span className="inline-flex" title={motivo ?? undefined}>
                        <button type="button" onClick={() => void concluir()} disabled={!!motivo} className={LINK_ACAO}>
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Concluir
                        </button>
                    </span>
                </div>
            ) : (
                <form onSubmit={e => void gravarNota(e)} className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <label htmlFor={`${id}-nota`} className="sr-only">O que andou em "{d.titulo}"?</label>
                    <input id={`${id}-nota`} autoFocus value={nota} maxLength={1000} onChange={e => setNota(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setNota(null); } }}
                        placeholder="O que andou?" className={`${CAMPO} flex-1 min-w-[10rem]`} />
                    <span className="inline-flex" title={nota.trim() ? undefined : 'Escreva o que andou antes de gravar.'}>
                        <button type="submit" disabled={!nota.trim() || gravando} className={BOTAO_SECUNDARIO}>
                            {gravando ? 'Gravando…' : 'Gravar'}
                        </button>
                    </span>
                    <button type="button" onClick={() => setNota(null)} className={LINK_ACAO}>Cancelar</button>
                </form>
            ))}
        </article>
    );
};

export default DeterminacaoCartao;
