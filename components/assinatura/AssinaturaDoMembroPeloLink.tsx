import React from 'react';
import { FluxoDeAssinatura } from './FluxoDeAssinatura';
import { esquecerSignatarioDaUrl, signatarioDaUrl, type AcessoDoSignatario } from '../../services/assinaturaInternaService';

/**
 * O e-mail do representante da empresa leva a `/?assinar=<id>`: dentro do app
 * logado, abre o fluxo de assinatura (canal MEMBRO — quem prova é o JWT; o banco
 * confere que o signatário é este usuário e membro da org do documento).
 */
export function AssinaturaDoMembroPeloLink() {
    const [acesso, setAcesso] = React.useState<AcessoDoSignatario | null>(null);

    React.useEffect(() => {
        const id = signatarioDaUrl();
        if (!id) return;
        setAcesso({ signatarioId: id, canal: 'MEMBRO', credencial: null });
        esquecerSignatarioDaUrl();
    }, []);

    if (!acesso) return null;
    return <FluxoDeAssinatura aberto onFechar={() => setAcesso(null)} acesso={acesso} />;
}

export default AssinaturaDoMembroPeloLink;
