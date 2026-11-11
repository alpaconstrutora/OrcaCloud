import React from 'react';
import { RefreshCw } from 'lucide-react';
import { SegmentedProgress } from '../ui/SegmentedProgress';
import type { ContagemDoDia, Saudacao as TextoSaudacao } from '../../utils/meuDia';
import { fraseResumo } from '../../utils/meuDia';

/**
 * Topo da tela "Bom dia": saudação, frase-resumo e a barra "Seu dia".
 *
 * Exceção ao §20 decidida com o usuário (10/11/2026, docs/ui_ux_guia_unificado.md
 * §20.3): o `<h1>` é maior (40px) e de peso médio — é uma saudação, não o rótulo
 * de uma lista —, mas continua SOLTO, sem card, banda ou "hero".
 *
 * A saudação não espera o banco (só precisa do nome e da hora); a frase e a
 * barra mostram esqueleto até a contagem chegar.
 */
interface Props {
    saudacao: TextoSaudacao;
    nome: string | null;
    contagem: ContagemDoDia | null;
    carregando: boolean;
    onAtualizar: () => void;
}

export function Saudacao({ saudacao, nome, contagem, carregando, onAtualizar }: Props) {
    const pct = contagem ? (contagem.total === 0 ? 100 : (contagem.feitos / contagem.total) * 100) : 0;
    return (
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 central-entra">
                <h1 className="text-[32px] md:text-[40px] leading-tight font-medium text-gray-900 tracking-[-0.02em] [text-wrap:balance]">
                    {saudacao}{nome ? `, ${nome}` : ''}
                </h1>
                {contagem ? (
                    <p className="text-gray-500 text-base mt-1.5 max-w-[60ch]" aria-live="polite">{fraseResumo(contagem)}</p>
                ) : (
                    <div className="h-5 w-72 max-w-full mt-2.5 rounded-[4px] bg-gray-100 motion-safe:animate-pulse" aria-hidden="true" />
                )}
            </div>

            <div className="flex items-end gap-3 shrink-0">
                <div className="w-[176px]">
                    <p className="text-xs text-gray-500 mb-1.5">Seu dia</p>
                    {contagem ? (
                        <SegmentedProgress
                            percent={pct}
                            tone="emerald"
                            // O segmento que o item resolvido acende chega em cor, não de estalo.
                            className="[&_span]:transition-colors [&_span]:duration-300"
                            hint={contagem.total === 0 ? 'Nada pendente' : `${contagem.feitos} de ${contagem.total} concluídos`}
                            title="Concluídos hoje: aprovações que você deu, tarefas que concluiu e contas pagas. Pendentes: o que está na sua fila."
                        />
                    ) : (
                        <div className="h-9 rounded-[4px] bg-gray-100 motion-safe:animate-pulse" aria-hidden="true" />
                    )}
                </div>
                <button
                    type="button"
                    onClick={onAtualizar}
                    disabled={carregando}
                    title={carregando ? 'Carregando…' : 'Atualizar'}
                    aria-label="Atualizar"
                    className="h-9 w-9 inline-flex items-center justify-center rounded-[6px] border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                    <RefreshCw className={`w-4 h-4 ${carregando ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

export default Saudacao;
