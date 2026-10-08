import type { DocTipTap, NoTipTap } from '../../types/docGen';
import { camposLivresDoModelo, chavesDoModelo, modeloTem } from './motorRender';
import { rotuloDaChave } from './catalogoCampos';
import type { LayoutModelo } from '../../types/docGen';

/**
 * Validador do documento antes de emitir (F2 mostra; F3 trava "Emitir").
 * Puro: recebe o modelo, o que o usuário preencheu e os valores já
 * resolvidos (cadastro + overrides) — não consulta nada.
 *
 * Bloqueante = impede a emissão. Aviso = a variável está no texto e sairá
 * como `[[chave]]`, mas o modelo não a marcou como obrigatória.
 */
export type Severidade = 'bloqueante' | 'aviso';

export interface Pendencia {
    /** Chave estável: a variável (`destinatario.cpf_cnpj`), ou `assunto`, `destinatario`, `signatarios`, `campo:<nome>`. */
    chave: string;
    rotulo: string;
    mensagem: string;
    severidade: Severidade;
    /** Variável do catálogo — a tela oferece "preencher só neste documento". */
    variavel?: boolean;
}

export interface EntradaValidacao {
    modelo: { conteudo: DocTipTap; layout: LayoutModelo; campos_obrigatorios: string[] };
    assunto: string;
    temDestinatario: boolean;
    quantidadeSignatarios: number;
    /** Campos livres digitados (nome → doc). */
    conteudo: Record<string, DocTipTap | null | undefined>;
    /** Valores finais: cadastro resolvido + overrides. */
    valores: Record<string, string | undefined>;
}

/**
 * Chaves que nunca são pendência no rascunho: o número só nasce na emissão,
 * e as do documento vêm do próprio formulário (validadas à parte).
 */
const NUNCA_PENDENTES = new Set(['documento.numero']);

function textoDoDoc(doc: DocTipTap | null | undefined): string {
    const partes: string[] = [];
    const visitar = (n: NoTipTap) => {
        if (n.type === 'text' && n.text) partes.push(n.text);
        if (n.type === 'variavel') partes.push('x');
        n.content?.forEach(visitar);
    };
    doc?.content?.forEach(visitar);
    return partes.join('').trim();
}

export function campoLivreVazio(doc: DocTipTap | null | undefined): boolean {
    return textoDoDoc(doc) === '';
}

export function validarDocumento(e: EntradaValidacao): Pendencia[] {
    const out: Pendencia[] = [];

    if (!e.temDestinatario) {
        out.push({ chave: 'destinatario', rotulo: 'Destinatário', mensagem: 'Escolha o destinatário do documento.', severidade: 'bloqueante' });
    }
    if (!e.assunto.trim()) {
        out.push({ chave: 'assunto', rotulo: 'Assunto', mensagem: 'O assunto é obrigatório — é por ele que o documento é encontrado no GED.', severidade: 'bloqueante' });
    }
    if (modeloTem(e.modelo.conteudo, 'assinaturas') && e.quantidadeSignatarios === 0) {
        out.push({ chave: 'signatarios', rotulo: 'Signatários', mensagem: 'O modelo tem bloco de assinaturas: escolha ao menos um signatário.', severidade: 'bloqueante' });
    }
    for (const c of camposLivresDoModelo(e.modelo.conteudo)) {
        if (campoLivreVazio(e.conteudo[c.nome])) {
            out.push({ chave: `campo:${c.nome}`, rotulo: c.rotulo, mensagem: `O campo "${c.rotulo}" ainda não foi redigido.`, severidade: 'bloqueante' });
        }
    }

    const obrigatorias = new Set(e.modelo.campos_obrigatorios);
    for (const chave of chavesDoModelo(e.modelo.conteudo, e.modelo.layout)) {
        if (NUNCA_PENDENTES.has(chave)) continue;
        const v = e.valores[chave];
        if (v && v.trim()) continue;
        const rotulo = rotuloDaChave(chave);
        const obrigatoria = obrigatorias.has(chave);
        out.push({
            chave,
            rotulo,
            variavel: true,
            severidade: obrigatoria ? 'bloqueante' : 'aviso',
            mensagem: obrigatoria
                ? `${rotulo} não está preenchido — campo obrigatório do modelo.`
                : `${rotulo} está vazio e sairá como [[${chave}]] no documento.`,
        });
    }

    // Bloqueantes primeiro, na ordem em que aparecem.
    return [...out.filter(p => p.severidade === 'bloqueante'), ...out.filter(p => p.severidade === 'aviso')];
}

export const temBloqueante = (p: Pendencia[]) => p.some(x => x.severidade === 'bloqueante');
