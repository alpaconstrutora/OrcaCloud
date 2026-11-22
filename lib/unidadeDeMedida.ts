/**
 * Identidade da unidade de medida — "qual unidade é esta?" (KG, M, BR…).
 *
 * PURO e sem imports: também roda no Deno (Edge Function `pedido-fast`, via
 * `lib/pedidoFast.ts`). Não confundir com `dimensaoDaUnidade`
 * (utils/blueprintBudget.ts), que responde "qual GRANDEZA" e junta PC com UN.
 *
 * Saiu de `lib/pedidoFast.ts` em 21/11/2026 para a equivalência de unidades
 * (docs/planos/2026-11-21-equivalencia-unidades.md) usar o mesmo mapa.
 */
const UNIDADES: Record<string, string> = {
    U: 'UN', UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
    PC: 'PC', 'PÇ': 'PC', PCS: 'PC', 'PÇS': 'PC', PCA: 'PC', PECA: 'PC', 'PEÇA': 'PC',
    KG: 'KG', KGS: 'KG', QUILO: 'KG', G: 'G', GR: 'G',
    M: 'M', MT: 'M', MTS: 'M', METRO: 'M', ML: 'ML',
    M2: 'M2', 'M²': 'M2', M3: 'M3', 'M³': 'M3', 'CM²': 'CM2', 'CM³': 'CM3', 'MÊS': 'MES',
    L: 'L', LT: 'L', LTS: 'L', LITRO: 'L',
    SC: 'SC', SACO: 'SC', CX: 'CX', CAIXA: 'CX', RL: 'RL', ROLO: 'RL',
    BD: 'BD', BALDE: 'BD', GL: 'GL', GALAO: 'GL', 'GALÃO': 'GL', LATA: 'LATA', TB: 'TB', BR: 'BR', BARRA: 'BR',
    JG: 'JG', JOGO: 'JG', KIT: 'KIT', PAR: 'PAR', CJ: 'CJ', MIL: 'MIL', MILHEIRO: 'MIL', MLH: 'MIL',
};

/** Unidade como o pedido grava: maiúscula, sem ponto; vazia vira UN. */
export function normalizarUnidade(unidade: string | null | undefined): string {
    const limpa = (unidade ?? '').toUpperCase().replace(/[.\s]/g, '');
    if (!limpa) return 'UN';
    return UNIDADES[limpa] ?? limpa.slice(0, 10);
}

/**
 * Para a equivalência: vazio NÃO vira UN (vira null — sem unidade não há
 * conversão), e o resultado cabe no CHECK `^[A-Z0-9]{1,10}$` da tabela.
 */
export function identidadeDaUnidade(unidade: string | null | undefined): string | null {
    if (!(unidade ?? '').trim()) return null;
    const u = normalizarUnidade(unidade);
    return /^[A-Z0-9]{1,10}$/.test(u) ? u : null;
}

/**
 * Unidades que o cadastro de equivalência oferece. ML fica de fora: é metro
 * linear para a planta e mililitro para o pedido — ambíguo.
 */
export const UNIDADES_DE_EQUIVALENCIA: readonly string[] = [
    'M', 'M2', 'M3', 'KG', 'T', 'UN', 'BR', 'PC', 'SC', 'CX', 'RL', 'L', 'CJ', 'PAR', 'JG', 'GL', 'MIL',
];

/**
 * Grandezas do cadastro mestre (`master_units_of_measure.category`). Só agrupa e
 * descreve — nenhuma conta usa; quem converte é a equivalência por item.
 */
export const CATEGORIAS_DE_UNIDADE: readonly { valor: string; rotulo: string }[] = [
    { valor: 'comprimento', rotulo: 'Comprimento' },
    { valor: 'area', rotulo: 'Área' },
    { valor: 'volume', rotulo: 'Volume' },
    { valor: 'massa', rotulo: 'Massa' },
    { valor: 'contagem', rotulo: 'Contagem' },
    { valor: 'embalagem', rotulo: 'Embalagem' },
    { valor: 'tempo', rotulo: 'Tempo' },
    { valor: 'energia', rotulo: 'Energia' },
    { valor: 'outro', rotulo: 'Outro' },
];

export interface UnidadeDoCatalogo {
    /** Identidade (KG, M2, TB…) — o que se grava (item e equivalência). */
    codigo: string;
    /** Símbolo como está no cadastro mestre (m², pç, kWh), quando houver. */
    simbolo?: string;
    /** Nome do cadastro mestre, quando houver. */
    nome?: string;
}

/**
 * Unidades que se pode escolher = o cadastro mestre (Sistema › Configurações ›
 * Cadastros › Unidades), na MESMA ordem e com as mesmas linhas (22/11/2026 — antes a
 * lista fixa vinha na frente e mês/cm²/cm³ sumiam). Cada linha vira o seu código
 * (m² → M2). Dois símbolos com o mesmo código aparecem uma vez só, com o do símbolo
 * exato (L = Litro ganha de "lt"). ML fica de fora: é ambíguo. Cadastro vazio (a
 * leitura falhou) cai na lista fixa, para o campo não ficar sem opção.
 */
export function catalogoDeUnidades(
    cadastradas: readonly { symbol: string; name: string }[],
): UnidadeDoCatalogo[] {
    const valida = cadastradas
        .map(u => ({ u, codigo: identidadeDaUnidade(u.symbol) }))
        .filter((x): x is { u: { symbol: string; name: string }; codigo: string } => !!x.codigo && x.codigo !== 'ML');
    if (valida.length === 0) return UNIDADES_DE_EQUIVALENCIA.map(codigo => ({ codigo }));
    const vencedora = new Map<string, { symbol: string; name: string }>();
    for (const { u, codigo } of valida) {
        const atual = vencedora.get(codigo);
        if (!atual || (atual.symbol.toUpperCase() !== codigo && u.symbol.toUpperCase() === codigo)) vencedora.set(codigo, u);
    }
    return valida
        .filter(({ u, codigo }) => vencedora.get(codigo) === u)
        .map(({ u, codigo }) => ({ codigo, simbolo: u.symbol, nome: u.name }));
}

/** O que a lista mostra ao lado do código: o nome, e o símbolo do cadastro quando difere (m²). */
export const dicaDaUnidade = (u: UnidadeDoCatalogo) =>
    u.simbolo && u.simbolo !== u.codigo ? `${u.nome ?? ''} (${u.simbolo})`.trim() : u.nome;

/** Símbolo como a unidade nova é gravada: sem espaço e sem ponto. */
export const simboloLimpo = (simbolo: string) => simbolo.trim().replace(/[.\s]/g, '');

/**
 * Por que a unidade nova não pode ser criada (null = pode). `existentes` são os
 * códigos de `catalogoDeUnidades` — o apelido conta: "Barra" é o BR que já existe.
 */
export function motivoNovaUnidadeInvalida(
    nova: { simbolo: string; nome: string; categoria: string },
    existentes: readonly string[],
): string | null {
    const limpo = simboloLimpo(nova.simbolo);
    if (!limpo) return 'Informe o símbolo.';
    if (limpo.length > 10) return 'O símbolo tem no máximo 10 caracteres.';
    const codigo = identidadeDaUnidade(limpo);
    if (!codigo) return 'Use só letras e números no símbolo.';
    if (codigo === 'ML') return 'ML é ambíguo (metro linear ou mililitro): use M ou L.';
    if (existentes.includes(codigo)) {
        return codigo === limpo.toUpperCase()
            ? `A unidade ${codigo} já existe.`
            : `"${limpo}" é a unidade ${codigo}, que já existe.`;
    }
    if (!nova.nome.trim()) return 'Informe o nome.';
    if (!nova.categoria) return 'Escolha a grandeza.';
    return null;
}
