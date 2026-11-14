import React from 'react';
import { useConfirm } from '../components/ui/confirm';
import { useStore } from '../store/useStore';
import { clientPropagacaoService, contagemDoPlano, type PlanoDePropagacao } from '../services/clientPropagacaoService';
import {
    camposAlterados,
    descreverCampos,
    descreverCamposComDe,
    linhasDoResumo,
    type CamposPropagaveis,
} from '../utils/clientPropagacao';

type Aviso = (mensagem: string, tipo: 'success' | 'error') => void;

interface Opcoes {
    /** "cliente" / "fornecedor": entra no texto da pergunta e dos avisos. */
    sujeito: string;
    /** Lê as cópias e monta o plano, sem gravar nada. */
    planejar: (id: string, campos: CamposPropagaveis) => Promise<PlanoDePropagacao>;
    /** Frase que diz o que fica de fora de propósito (documentos já emitidos). */
    foraDoEscopo: string;
    avisar: Aviso;
}

interface NomeEEmail { name?: string | null; email?: string | null }

/**
 * Depois de salvar a EDIÇÃO de um cadastro (cliente, fornecedor): se mudou um
 * campo que tem cópia de texto em outras tabelas (nome, e-mail), pergunta se
 * deve propagar. A tela sempre responde, e cada caso tem a sua resposta:
 *
 * - há cópia a corrigir: pergunta "Propagar … pelo app?", com a contagem;
 * - não há cópia: avisa "nada a propagar". Calada, a tela parecia ter
 *   esquecido a pergunta (relato de 14/11/2026, #432);
 * - a busca falhou: avisa o erro.
 *
 * Quem chama NÃO aguarda (`void oferecer(...)`): o formulário sai do
 * "Salvando..." antes da pergunta. Mapa dos destinos de cada cadastro:
 * `utils/clientPropagacao.ts` (clientes) e `services/supplierPropagacaoService.ts`
 * (fornecedores).
 */
export function useOferecerPropagacao({ sujeito, planejar, foraDoEscopo, avisar }: Opcoes) {
    const confirm = useConfirm();
    return React.useCallback(async (id: string, antes: NomeEEmail | undefined, depois: NomeEEmail) => {
        const campos = camposAlterados(antes, depois);
        if (!campos) return;
        let plano: PlanoDePropagacao;
        try {
            plano = await planejar(id, campos);
        } catch (err) {
            console.error(`Erro ao procurar cópias do ${sujeito} para propagar:`, err);
            avisar(`O cadastro foi salvo, mas não foi possível verificar onde mais ${descreverCampos(campos)} aparece no app.`, 'error');
            return;
        }
        const linhas = linhasDoResumo(contagemDoPlano(plano));
        const rascunhos = plano.rascunhosMantidos ?? 0;
        const notaRascunhos = rascunhos > 0
            ? `${rascunhos} conta(s) a pagar em rascunho ficam como estão: alterá-las mandaria o título para a aprovação.`
            : '';
        if (!linhas.length) {
            avisar(rascunhos > 0
                ? `Nada a propagar. ${notaRascunhos}`
                : `Nenhum outro registro do app guarda cópia ${descreverCamposComDe(campos)} deste ${sujeito} — nada a propagar.`,
            'success');
            return;
        }
        const ok = await confirm({
            title: `Propagar ${descreverCampos(campos)} pelo app?`,
            message: `O cadastro foi salvo. Estes registros guardam uma cópia ${descreverCamposComDe(campos)} do ${sujeito} e ainda mostram o valor antigo:\n\n${linhas.map(l => `• ${l}`).join('\n')}\n\n${[notaRascunhos, foraDoEscopo].filter(Boolean).join('\n')}`,
            confirmLabel: 'Propagar',
            cancelLabel: 'Só no cadastro',
        });
        if (!ok) return;
        try {
            const r = await clientPropagacaoService.aplicar(plano);
            if (r.obrasAlteradas) void useStore.getState().fetchProjects();
            if (r.recusados > 0) {
                avisar(
                    `${r.atualizados} registro(s) atualizado(s); ${r.recusados} não puderam ser alterados${r.motivo ? ` — ${r.motivo}` : ' (sem permissão de edição)'}.`,
                    'error',
                );
            } else {
                avisar(`Propagado: ${r.atualizados} registro(s) atualizado(s).`, 'success');
            }
        } catch (err) {
            console.error(`Erro ao propagar alteração do ${sujeito}:`, err);
            avisar('O cadastro foi salvo, mas não foi possível propagar a alteração.', 'error');
        }
    }, [confirm, planejar, sujeito, foraDoEscopo, avisar]);
}
