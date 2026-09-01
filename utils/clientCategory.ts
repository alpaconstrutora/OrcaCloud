// utils/clientCategory.ts
// O que a categoria do cliente (`clients.category`) DIZ sobre ele — em um lugar só.
//
// POR QUE ISTO EXISTE: em 01/09/2026 foram criadas duas categorias novas,
// "Locação e Condominio" e "Síndico". O Portal do Cliente decidia tudo por
// comparação literal (`clientCategory === 'Locação'`) em 11 pontos, e uma
// categoria nova falha em TODOS eles de uma vez, calada:
//
//   - cai no dashboard genérico em vez do de Locação;
//   - perde o Financeiro de Locação — a tabela "Cobranças do Imóvel", que é
//     justamente onde a cota condominial aparece;
//   - não carrega os chamados no dashboard;
//   - e, sem preset, herda TODAS as abas: Diário de Obra, Visual e
//     Personalização num portal de locatário.
//
// Nada disso quebra a tela. Ela abre bonita mostrando a coisa errada — o
// defeito mais caro que este repositório coleciona.
//
// ⚠️ COMPARAÇÃO SEM ACENTO E SEM CAIXA, de propósito. A categoria é digitada
// pelo usuário no catálogo (`client_categories`) e a que existe hoje está
// gravada "Locação e Condominio", sem o acento em "Condomínio". Casar por
// string exata quebraria no dia em que alguém corrigir o acento — e quebraria
// em silêncio. O banco já faz assim: `fn_portal_get_contracts` recorta
// locação com `category ILIKE 'loca%'`.

/** Sem acento, sem caixa, sem espaço nas pontas.
 *  `NFD` separa a letra do acento e a classe remove os combining marks
 *  (U+0300–U+036F) — coberto por `__tests__/clientCategory.test.ts`, que casa
 *  "Condominio" com "Condomínio" nos dois sentidos. */
const normalizar = (s?: string | null): string =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** 'Locação' e 'Locação e Condominio'. Mesmo recorte que a RPC de contratos. */
export const ehLocacao = (category?: string | null): boolean =>
    normalizar(category).startsWith('loca');

/** 'Condomínio', 'Locação e Condominio' e 'Síndico' — quem tem assunto de prédio. */
export const ehCondominio = (category?: string | null): boolean => {
    const n = normalizar(category);
    return n.includes('condomin') || n.includes('sindico');
};

/** O síndico é condômino com papel a mais; por ora vê o mesmo que o condômino. */
export const ehSindico = (category?: string | null): boolean =>
    normalizar(category).includes('sindico');

export const ehServicos = (category?: string | null): boolean =>
    normalizar(category).startsWith('servico');

export const ehVendas = (category?: string | null): boolean =>
    normalizar(category).startsWith('venda');

// ── Presets de abas do portal ────────────────────────────────────────────────
// Isto é FALLBACK: vale só quando `clients.portal_tabs` está vazio. Quem
// configurou as abas à mão manda, sempre.

const VENDAS = ['dashboard', 'jornada', 'obra', 'visual', 'personalizacao',
                'diario', 'documentos', 'contratos', 'financeiro', 'suporte'];
const LOCACAO = ['dashboard', 'obra', 'financeiro', 'contratos', 'documentos', 'manutencao'];
const SERVICOS = ['dashboard', 'obra', 'cronograma-ff', 'financeiro', 'contratos', 'documentos'];
/** Só de condomínio: nada de obra, jornada ou personalização — o prédio está
 *  entregue. Contratos entra porque a convenção e o contrato de locação da
 *  unidade continuam sendo dele. */
const CONDOMINIO = ['dashboard', 'condominio', 'financeiro', 'documentos', 'manutencao'];

/**
 * Abas que este tipo de cliente vê quando ninguém configurou nada.
 * `undefined` = categoria desconhecida; quem chama decide o que fazer
 * (hoje o portal mostra todas, que é o comportamento antigo).
 *
 * A ORDEM DOS TESTES IMPORTA: "Locação e Condominio" satisfaz `ehLocacao` E
 * `ehCondominio`, e tem de cair no caso combinado, não no primeiro que passar.
 */
export function presetDeAbas(category?: string | null): string[] | undefined {
    if (!normalizar(category)) return undefined;
    // Síndico primeiro: ele é condômino, mas o rótulo é mais específico.
    if (ehSindico(category)) return CONDOMINIO;
    if (ehLocacao(category) && ehCondominio(category)) return [...LOCACAO, 'condominio'];
    if (ehLocacao(category)) return LOCACAO;
    if (ehCondominio(category)) return CONDOMINIO;
    if (ehServicos(category)) return SERVICOS;
    if (ehVendas(category)) return VENDAS;
    return undefined;
}

/** Rótulo curto para o hero do portal. `null` = usar a saudação genérica. */
export function rotuloDaCategoria(category?: string | null): string | null {
    if (!normalizar(category)) return null;
    if (ehLocacao(category) || ehCondominio(category) || ehServicos(category)) {
        return (category || '').trim();
    }
    return null;
}
