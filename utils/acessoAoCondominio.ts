// utils/acessoAoCondominio.ts
// Por qual caminho esta pessoa vê o condomínio — em um lugar só.
// Plano: docs/planos/2026-09-01b-conectar-condominio-portal-cliente.md
// Aposentadoria do portal legado: docs/planos/2026-09-23-despesas-legiveis-e-portal-legado.md
//
// POR QUE ISTO EXISTE: até 01/09/2026 havia um portal só (o "Portal do
// Condômino", link por OCUPAÇÃO em `condomino_portal_access`), e "acesso" era
// sinônimo de "tem linha viva lá". Essa definição estava escrita DUAS vezes
// (`OcupacoesTab.tsx` e `PortalCondominoAdmin.tsx`, cópias literais) e virou
// mentira quando a aba Condomínio entrou no Portal do Cliente.
//
// 23/09/2026 — O PORTAL LEGADO FOI APOSENTADO. Desde 01/09 não se emitia mais
// link de condômino, e em 23/09 a base tinha 2 linhas em
// `condomino_portal_access`, ZERO ativas, e ZERO leituras de aviso apontando
// para elas. Sumiram daqui, com o portal: `LINK_CONDOMINO`, `EXPIRADO` e
// `REVOGADO` — os três só descreviam aquele link.
//
// ⚠️ `AGUARDA_ABA` CONTINUA SENDO UM ESTADO PRÓPRIO, e é o mais importante
// daqui. Quem tem link de cliente ativo mas com a aba `condominio` desligada
// ENTRA no portal e **não vê o condomínio**. Não é "sem acesso" (o link
// funciona) nem "com acesso" (o prédio não aparece). Fundir esse caso com
// qualquer um dos dois recria exatamente o problema que este arquivo resolve.

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
    | 'SEM_ACESSO';

export interface EstadoDeAcesso {
    via: ViaDeAcesso;
    texto: string;
    /** Classe de cor §8 — texto colorido, sem pílula. */
    cor: string;
    /** Vê o condomínio AGORA. */
    ve: boolean;
    /** Tem alguma porta aberta, ainda que não mostre o condomínio.
     *  Serve para não oferecer "conceder" a quem só precisa da aba. */
    temPorta: boolean;
}

const diasAte = (iso?: string | null): number =>
    iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : 0;

const plural = (d: number) => `${d} dia${d === 1 ? '' : 's'}`;

/**
 * O único caminho vivo é o Portal do Cliente. A assinatura perdeu o segundo
 * parâmetro (o acesso de condômino) junto com o portal legado.
 */
export function estadoDeAcesso(cliente?: AcessoClienteLite | null): EstadoDeAcesso {
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

    return { via: 'SEM_ACESSO', texto: 'Sem acesso', cor: 'text-gray-400', ve: false, temPorta: false };
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
    /** Nenhuma porta: sem link nenhum. */
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
