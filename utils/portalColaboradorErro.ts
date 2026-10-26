/**
 * Erro de leitura do Portal do Colaborador → frase para quem está no canteiro.
 *
 * Quem lê é o colaborador, no celular, sem acesso ao sistema: o texto técnico
 * ("getRun: JSON object requested…", "Failed to fetch") não ajuda e assusta. O
 * detalhe técnico continua no console; aqui só sai o que a pessoa pode fazer.
 *
 * Os códigos vêm dos RAISE das RPCs `fn_colab_portal_*`
 * (migrations 20270918000005 e 20271026900000).
 */
export function mensagemDoPortalColaborador(erro: unknown): string {
    const texto = textoDoErro(erro);

    if (texto.includes('PORTAL_TOKEN_INVALIDO')) {
        return 'Seu link do portal expirou ou foi cancelado. Peça um link novo ao RH.';
    }
    if (texto.includes('PORTAL_HOLERITE_INDISPONIVEL')) {
        return 'Este holerite não está disponível para você. Se acha que é um engano, fale com o RH.';
    }
    if (/failed to fetch|networkerror|network request failed|load failed|abort|timeout/i.test(texto)) {
        return 'Sem conexão com a internet no momento. Confira o sinal e tente de novo.';
    }
    return 'Não foi possível carregar agora. Tente de novo em instantes.';
}

function textoDoErro(erro: unknown): string {
    if (!erro) return '';
    if (typeof erro === 'string') return erro;
    if (typeof erro === 'object') {
        const e = erro as { message?: unknown; hint?: unknown; name?: unknown };
        return [e.name, e.message, e.hint].filter(v => typeof v === 'string').join(' ');
    }
    return String(erro);
}
