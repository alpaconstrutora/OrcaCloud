// utils/acessoAoCondominio.ts
// Por qual caminho esta pessoa vê o condomínio — em um lugar só.
// Plano: docs/planos/2026-09-01b-conectar-condominio-portal-cliente.md
//
// POR QUE ISTO EXISTE: até 01/09 havia um portal só, e "acesso" era sinônimo de
// "tem linha viva em `condomino_portal_access`". Essa definição estava escrita
// DUAS vezes (`OcupacoesTab.tsx` e `PortalCondominoAdmin.tsx`, cópias literais)
// e virou mentira quando a aba Condomínio entrou no Portal do Cliente.
//
// O tamanho da mentira, medido na base em 01/09: ZERO links de condômino
// ativos, 3 pessoas com link do Portal do Cliente. A tela dizia "Sem acesso"
// em cinza para as três — o mesmo rótulo de quem não tem nada.
//
// ⚠️ `AGUARDA_ABA` É UM ESTADO PRÓPRIO, e é o mais importante daqui. Quem tem
// link de cliente ativo mas com a aba `condominio` desligada ENTRA no portal e
// **não vê o condomínio**. Não é "sem acesso" (o link funciona) nem "com
// acesso" (o prédio não aparece). Fundir esse caso com qualquer um dos dois
// recria exatamente o problema que este arquivo resolve.

/** O que a tela precisa saber de `condomino_portal_access`. */
export interface AcessoCondominoLite {
    is_active: boolean;
    expires_at: string;
}

/** O que a tela precisa saber do lado do Portal do Cliente. */
export interface AcessoClienteLite {
    /** Token ativo e dentro da validade. */
    ativo: boolean;
    expiraEm?: string | null;
    /** `condominio` está em `clients.portal_tabs`. */
    abaLigada: boolean;
}

export type ViaDeAcesso =
    | 'PORTAL_CLIENTE'   // entra e vê o condomínio
    | 'AGUARDA_ABA'      // entra, mas o condomínio não aparece
    | 'LINK_CONDOMINO'   // portal antigo, ainda válido
    | 'EXPIRADO'         // link de condômino venceu sozinho
    | 'REVOGADO'         // alguém tirou
    | 'SEM_ACESSO';

export interface EstadoDeAcesso {
    via: ViaDeAcesso;
    texto: string;
    /** Classe de cor §8 — texto colorido, sem pílula. */
    cor: string;
    /** Vê o condomínio AGORA. Só `PORTAL_CLIENTE` e `LINK_CONDOMINO`. */
    ve: boolean;
    /** Tem alguma porta aberta, ainda que não mostre o condomínio.
     *  Serve para não oferecer "conceder" a quem só precisa da aba. */
    temPorta: boolean;
}

const diasAte = (iso?: string | null): number =>
    iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : 0;

const plural = (d: number) => `${d} dia${d === 1 ? '' : 's'}`;

/**
 * A precedência é o coração da função: **quem tem Portal do Cliente usa esse**.
 * O link de condômino só decide quando não existe o outro — ele é o legado, e
 * desde 01/09 não é mais o que se emite.
 */
export function estadoDeAcesso(
    cliente?: AcessoClienteLite | null,
    condomino?: AcessoCondominoLite | null,
): EstadoDeAcesso {
    if (cliente?.ativo) {
        if (cliente.abaLigada) {
            const d = diasAte(cliente.expiraEm);
            return {
                via: 'PORTAL_CLIENTE',
                texto: d > 0 ? `Portal do Cliente · ${plural(d)}` : 'Portal do Cliente',
                cor: 'text-emerald-600', ve: true, temPorta: true,
            };
        }
        return {
            via: 'AGUARDA_ABA',
            texto: 'Link ativo · aba desligada',
            cor: 'text-amber-600', ve: false, temPorta: true,
        };
    }

    if (!condomino) {
        return { via: 'SEM_ACESSO', texto: 'Sem acesso', cor: 'text-gray-400', ve: false, temPorta: false };
    }
    // Revogado é decisão de alguém; expirado é o prazo vencendo sozinho. A
    // diferença muda o que o síndico faz, então os dois não se fundem.
    if (!condomino.is_active) {
        return { via: 'REVOGADO', texto: 'Revogado', cor: 'text-gray-500', ve: false, temPorta: false };
    }
    const d = diasAte(condomino.expires_at);
    if (d <= 0) {
        return { via: 'EXPIRADO', texto: 'Expirado', cor: 'text-amber-600', ve: false, temPorta: false };
    }
    return {
        via: 'LINK_CONDOMINO',
        texto: `Link de condômino · ${plural(d)}`,
        cor: 'text-emerald-600', ve: true, temPorta: true,
    };
}

/** Contagem para os KPIs.
 *
 *  ⚠️ `sem` deixa de ser resíduo aritmético. Em `PortalCondominoAdmin` ele era
 *  `total - ativos`, então revogado, expirado e "já entra pelo Portal do
 *  Cliente" caíam todos no mesmo balde de "SEM ACESSO". */
export interface ResumoDeAcesso {
    total: number;
    /** Vê o condomínio agora. */
    ve: number;
    /** Entra no portal, mas a aba está desligada — um clique de resolver. */
    aguardaAba: number;
    /** Nenhuma porta: sem link nenhum, revogado ou expirado. */
    sem: number;
}

export function resumirAcessos(estados: EstadoDeAcesso[]): ResumoDeAcesso {
    let ve = 0, aguardaAba = 0, sem = 0;
    for (const e of estados) {
        if (e.ve) ve++;
        else if (e.via === 'AGUARDA_ABA') aguardaAba++;
        else sem++;
    }
    return { total: estados.length, ve, aguardaAba, sem };
}
