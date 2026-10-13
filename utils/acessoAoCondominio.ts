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

/** Ordem de exibição dos papéis — do vínculo com o imóvel para o financeiro.
 *  Papel fora da lista vai para o fim, na ordem em que apareceu. */
const ORDEM_DOS_PAPEIS = ['PROPRIETARIO', 'INQUILINO', 'MORADOR', 'RESPONSAVEL_FINANCEIRO'];

export interface PapeisDaPessoaNaUnidade<T> {
    /** `${unit_id}:${client_id}` para o grupo vigente; `enc:${id}` para
     *  ocupação encerrada. Estável entre carregamentos. */
    key: string;
    /** A primeira ocupação do grupo, na ordem de entrada: carrega nome da
     *  pessoa e da unidade, que são iguais em todo o grupo. */
    ocupacao: T;
    /** Todas as ocupações do grupo, em `ORDEM_DOS_PAPEIS` — é sobre elas que
     *  encerrar/excluir agem, porque cada uma continua sendo um registro. */
    ocupacoes: T[];
    /** Sem repetição, em `ORDEM_DOS_PAPEIS`. */
    papeis: string[];
}

/**
 * Uma linha por PESSOA × UNIDADE, não por ocupação.
 *
 * 13/10/2026: quem é proprietário E responsável financeiro da mesma unidade
 * tem duas ocupações, e Portais › Portal do Condômino e Comercial ›
 * Condomínios › Ocupações mostravam duas linhas idênticas — mesmo acesso,
 * mesma pessoa — e contavam a pessoa duas vezes nos KPIs. Cada papel continua
 * sendo um registro no banco; o agrupamento é só de leitura.
 *
 * Só ocupações VIGENTES se juntam. Encerrada é histórico — cada uma tem a sua
 * data de saída e fica na sua própria linha.
 */
export function agruparPapeisPorPessoa<T extends {
    id: string; unit_id: string; client_id: string; role: string; ended_at?: string | null;
}>(ocupacoes: T[]): PapeisDaPessoaNaUnidade<T>[] {
    const grupos = new Map<string, PapeisDaPessoaNaUnidade<T>>();
    for (const o of ocupacoes) {
        const key = o.ended_at ? `enc:${o.id}` : `${o.unit_id}:${o.client_id}`;
        const g = grupos.get(key);
        if (!g) grupos.set(key, { key, ocupacao: o, ocupacoes: [o], papeis: [o.role] });
        else {
            g.ocupacoes.push(o);
            if (!g.papeis.includes(o.role)) g.papeis.push(o.role);
        }
    }
    const posicao = (r: string) => {
        const i = ORDEM_DOS_PAPEIS.indexOf(r);
        return i === -1 ? ORDEM_DOS_PAPEIS.length : i;
    };
    for (const g of grupos.values()) {
        // sort estável: papéis desconhecidos mantêm a ordem de chegada
        g.papeis.sort((a, b) => posicao(a) - posicao(b));
        g.ocupacoes.sort((a, b) => posicao(a.role) - posicao(b.role));
    }
    return [...grupos.values()];
}
