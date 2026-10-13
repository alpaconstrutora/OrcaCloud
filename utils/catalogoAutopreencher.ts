// utils/catalogoAutopreencher.ts — o modelo escolhido preenche o formulário
//
// Regra do usuário (10/10/2026): "o app já tem a informação → o formulário
// preenche sozinho, sem sobrescrever o manual". O modelo traz categoria e vida
// útil padrão; o ativo recebe esses valores só onde a pessoa ainda não digitou.
//
// Cada campo carrega a ORIGEM do valor, porque o valor sozinho não diz quem o
// pôs ali — a vida útil nasce com 60 no formulário novo, e 60 também pode ser o
// que a pessoa digitou:
//   'vazio'  — sem valor
//   'padrao' — valor de fábrica do formulário (ex.: 60 meses no ativo novo)
//   'auto'   — veio de um modelo; trocar de modelo pode trocá-lo
//   'manual' — digitado pela pessoa, ou já salvo no banco: nunca muda sozinho

export type OrigemCampo = 'vazio' | 'padrao' | 'auto' | 'manual';

export interface CampoComOrigem<T> {
    valor: T;
    origem: OrigemCampo;
}

export interface PadroesDoModelo {
    default_asset_category?: string | null;
    default_useful_life_months?: number | null;
}

export interface CamposAutopreenchiveis {
    category: CampoComOrigem<string>;
    useful_life_months: CampoComOrigem<number | null>;
}

const podeSobrescrever = (o: OrigemCampo) => o !== 'manual';

/**
 * Aplica os padrões do modelo onde a origem permite. Modelo sem um padrão não
 * mexe naquele campo. Devolve objeto novo (os campos não tocados mantêm a
 * mesma referência).
 */
export function aplicarPadroesDoModelo(
    campos: CamposAutopreenchiveis,
    modelo: PadroesDoModelo | null | undefined,
): CamposAutopreenchiveis {
    if (!modelo) return campos;
    const out = { ...campos };
    if (modelo.default_asset_category && podeSobrescrever(campos.category.origem)) {
        out.category = { valor: modelo.default_asset_category, origem: 'auto' };
    }
    if (modelo.default_useful_life_months != null && podeSobrescrever(campos.useful_life_months.origem)) {
        out.useful_life_months = { valor: modelo.default_useful_life_months, origem: 'auto' };
    }
    return out;
}

/** Origem inicial ao abrir um registro: o que veio do banco é da pessoa. */
export function origemInicial(valorDoBanco: unknown, ehNovo: boolean): OrigemCampo {
    if (ehNovo) return 'padrao';
    return valorDoBanco === null || valorDoBanco === undefined || valorDoBanco === '' ? 'vazio' : 'manual';
}

/** Nomes dos campos que vieram do modelo — para o aviso "Preenchido pelo modelo X". */
export function camposAutomaticos(campos: CamposAutopreenchiveis): (keyof CamposAutopreenchiveis)[] {
    return (Object.keys(campos) as (keyof CamposAutopreenchiveis)[]).filter(k => campos[k].origem === 'auto');
}
