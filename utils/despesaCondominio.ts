// utils/despesaCondominio.ts
// Como uma despesa de rateio se chama na tela — do admin e do portal.
// Plano: docs/planos/2026-09-23-despesas-legiveis-e-portal-legado.md
//
// POR QUE ISTO EXISTE: desde 23/09/2026 o condômino vê a lista de despesas que
// formaram a cota dele (decisão de transparência do usuário). E o que estava
// gravado era isto, medido na base:
//
//     "download (98).pdf"
//     "BENEFICIÁRIO:ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A. 07.28…"
//     "MN CONSERVAÇÃO ELEVADORES COM PEÇAS LTDA   CNPJ:   07.604.526/0001-20  Av…"
//
// A descrição vem de `internal_transactions.description`, que na origem
// (`source_system = 'BOLETO'`) é o nome do arquivo ou o bloco de texto que o
// leitor de boleto extraiu da linha do beneficiário — com CNPJ, endereço e
// chamada publicitária junto. `category_id` é NULO em 100% dessas linhas, então
// não há campo limpo de onde derivar: o que dá para fazer é PODAR o lixo
// conhecido e, quando não sobra nada legível, dizer isso em vez de inventar.
//
// ⚠️ Isto NÃO substitui o síndico escrever a descrição certa — é o default até
// ele escrever. A edição vive em Condomínios › Financeiro, no detalhe do rateio
// em rascunho.

/** Marcadores a partir dos quais o resto da string é ruído de boleto. */
const CORTES = [
    'CNPJ', 'CPF', 'VENCIMENTO', 'VENC.', 'CADASTRE', 'BENEFICI',
    'PAGADOR', 'SACADO', 'NOSSO NUMERO', 'NOSSO NÚMERO', 'AGENCIA', 'AGÊNCIA',
];

/** Descrição que é só o arquivo de onde o boleto veio — não diz nada. */
const SO_ARQUIVO = /^(download|documento|doc|img|image|scan|arquivo|whatsapp)[\s_(-]*[\d\s()._-]*\.(pdf|jpe?g|png|xml|txt)$/i;

const ARQUIVO_QUALQUER = /\.(pdf|jpe?g|png|xml|txt)$/i;

/**
 * O NÚMERO do documento, sem o rótulo antes.
 *
 * ⚠️ Foi o que escapou da primeira versão e só apareceu na prova: a lista de
 * `CORTES` procura a palavra "CNPJ", mas o texto real é
 * "…ENERGIA S.A. 07.282.377/0001-20 47 61" — número puro, sem rótulo nenhum.
 * Cortar no primeiro CNPJ/CPF formatado resolve os dois casos, e leva junto o
 * lixo numérico que vem depois (agência, conta, dígitos do boleto).
 *
 * Específico de propósito: exige a pontuação de CNPJ (`00.000.000/0000`) ou de
 * CPF (`000.000.000-00`). Um `\d{6,}` genérico comeria "Energia 08/2026" e
 * qualquer descrição que o síndico escrever com número.
 */
const DOCUMENTO = /\d{2}\.\d{3}\.\d{3}\/\d{4}|\d{3}\.\d{3}\.\d{3}-\d{2}/;

/** Espaço duplo, quebra de linha e espaço nas pontas — o OCR produz todos. */
const normalizar = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Poda o ruído conhecido de uma linha de boleto e devolve o começo legível.
 * Exportada para teste: é onde um `indexOf` errado corta o nome no meio.
 */
export function podarRuidoDeBoleto(texto: string): string {
    let s = normalizar(texto);
    if (!s) return '';

    // "BENEFICIÁRIO:ENERGISA…" — o corte por marcador comeria o nome inteiro se
    // o marcador estiver no INÍCIO. Aí o que se tira é só o rótulo.
    for (const marcador of ['BENEFICIARIO', 'BENEFICIÁRIO', 'PAGADOR', 'SACADO']) {
        const semAcento = s.toUpperCase();
        if (semAcento.startsWith(marcador)) {
            s = normalizar(s.slice(marcador.length).replace(/^[:\-\s]+/, ''));
            break;
        }
    }

    const alvo = s.toUpperCase();
    let fim = s.length;
    for (const c of CORTES) {
        const i = alvo.indexOf(c);
        // `i > 0`: marcador no índice 0 significa que não sobrou nome nenhum
        // antes dele — cortar ali devolveria string vazia.
        if (i > 0 && i < fim) fim = i;
    }
    const doc = s.match(DOCUMENTO);
    if (doc && doc.index !== undefined && doc.index > 0 && doc.index < fim) fim = doc.index;

    // Apara a pontuação solta que sobra no corte — mas preserva o ponto de uma
    // abreviação ("…ENERGIA S.A."), que não é lixo, é o nome.
    return normalizar(s.slice(0, fim))
        .replace(/[\s\-–—:,]+$/, '')
        .replace(/(?<![A-ZÀ-Ý])\.$/, '');
}

/**
 * O rótulo que a despesa mostra.
 *
 * `descricao` é `condominio_rateio_despesas.descricao` (ou, na prévia, a
 * `description` da transação). `credor` é `party_name`/`entity_name`, que na
 * prática carrega o MESMO bloco de OCR — serve de segunda chance quando a
 * descrição é só o nome do arquivo.
 *
 * Devolve `null` quando não há nada legível, para quem chama decidir o texto do
 * vazio (o admin diz uma coisa, o portal diz outra).
 */
export function rotuloDeDespesa(
    descricao?: string | null,
    credor?: string | null,
): string | null {
    const bruta = normalizar(descricao || '');

    // Nome de arquivo não descreve despesa. Tenta o credor antes de desistir.
    if (bruta && !SO_ARQUIVO.test(bruta) && !ARQUIVO_QUALQUER.test(bruta)) {
        const podada = podarRuidoDeBoleto(bruta);
        if (podada.length >= 3) return podada;
    }

    const doCredor = podarRuidoDeBoleto(normalizar(credor || ''));
    if (doCredor.length >= 3) return doCredor;

    return null;
}
