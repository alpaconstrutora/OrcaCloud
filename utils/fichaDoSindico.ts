// utils/fichaDoSindico.ts
//
// Portal do Síndico › Visão geral › Ficha do condomínio (G7, 26/11/2026). A parte pura.
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (`sindico_portal_ficha_salvar`, migration aplicar_20271126950500); isto
// existe para o botão desligado dizer o motivo ANTES do clique, com as mesmas frases.

export interface FichaDoCondominio {
    razaoSocial: string | null;
    cnpj: string | null;
    instaladoEm: string | null;
    multaPercent: number | null;
    jurosMesPercent: number | null;
    /** Só leitura no portal: são da administradora. */
    mandatoInicio: string | null;
    mandatoFim: string | null;
    exigeAprovacao: boolean;
}

export interface FormFicha { razaoSocial: string; cnpj: string; instaladoEm: string; multa: string; juros: string }

/** Mesmas frases e limites de `sindico_portal_ficha_salvar`. */
export function motivoDaFicha(f: FormFicha, hoje: string): string | null {
    const cnpj = f.cnpj.replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) return 'O CNPJ tem 14 dígitos.';
    if (f.instaladoEm && f.instaladoEm > hoje) return 'A data de instalação não pode ser futura.';
    const multa = Number(f.multa.replace(',', '.'));
    if (f.multa.trim() === '' || !Number.isFinite(multa) || multa < 0 || multa > 2) {
        return 'A multa por atraso vai de 0 a 2% (Código Civil, art. 1.336, § 1º).';
    }
    const juros = Number(f.juros.replace(',', '.'));
    if (f.juros.trim() === '' || !Number.isFinite(juros) || juros < 0 || juros > 10) return 'Os juros vão de 0 a 10% ao mês.';
    return null;
}

export function formDaFicha(f: FichaDoCondominio | null): FormFicha {
    const pct = (v: number | null) => (v == null ? '' : String(Number(v)).replace('.', ','));
    return {
        razaoSocial: f?.razaoSocial ?? '', cnpj: f?.cnpj ?? '', instaladoEm: f?.instaladoEm ?? '',
        multa: pct(f?.multaPercent ?? null), juros: pct(f?.jurosMesPercent ?? null),
    };
}

/** No formato de `sindico_portal_ficha_salvar` (percentuais com vírgula viram número). */
export function camposDaFicha(f: FormFicha) {
    return {
        condominio_razao_social: f.razaoSocial.trim(), condominio_cnpj: f.cnpj.trim(),
        condominio_instalado_em: f.instaladoEm || null,
        cobranca_multa_percent: Number(f.multa.replace(',', '.')), cobranca_juros_mes_percent: Number(f.juros.replace(',', '.')),
    };
}
