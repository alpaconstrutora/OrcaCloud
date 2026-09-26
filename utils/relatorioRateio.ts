// utils/relatorioRateio.ts
// O RELATÓRIO DE RATEIO — a prestação de contas de uma competência.
//
// POR QUE ISTO É UM MÓDULO PURO, e não código dentro da tela: o mesmo
// documento é montado em DOIS lugares, a partir de dois formatos de dado
// diferentes:
//
//   admin   Condomínio › Financeiro  → `Rateio` + `DespesaRateio[]` + `CotaDoRateio[]`
//   portal  Portal do Cliente › Condomínio → `PortalRateioCondominio`
//
// Se cada lado montasse o seu, o condômino e o síndico acabariam com dois
// documentos que discordam — e é o mesmo rateio. Aqui a forma é uma só; cada
// tela só traduz o que tem para `EntradaRelatorio`.
//
// ⚠️ NÃO poda descrição de despesa. Os dois lados já entregam o rótulo tratado
// (`condominioRateioService.listarDespesas` poda na leitura; o portal aplica
// `rotuloDeDespesa` ao renderizar). Podar de novo aqui seria uma terceira
// definição do mesmo rótulo — ver `utils/despesaCondominio.ts`.

/** Uma linha de despesa do documento. */
export interface LinhaDespesaRelatorio {
    descricao: string;
    valor: number;
    /**
     * Quem recebeu. `null` = não há nome em lugar nenhum — a célula diz "—",
     * não some.
     *
     * A regra de qual nome usar (cadastrado antes do texto cru, e o cru
     * podado) é uma só, em `utils/despesaCondominio.rotuloDeFornecedor`: os
     * dois lados que montam este documento chamam ELA, senão o mesmo
     * fornecedor sai com dois nomes no mesmo relatório.
     */
    fornecedor?: string | null;
    /**
     * O COMPROVANTE, quando existe: `{ bucket, path, nome }` do arquivo que
     * originou a despesa. Só o lado de dentro do sistema preenche — o portal
     * não alcança o bucket dos boletos (ver `services/relatorioAnexos.ts`).
     */
    documento?: { bucket: string; path: string; nome: string } | null;
}

/** Uma linha de cota do documento. */
export interface LinhaCotaRelatorio {
    unidade: string;
    /** `null` = a cota foi calculada sem ninguém no papel de pagador. */
    pagador: string | null;
    valor: number;
    /** Observação gravada na cota (ajuste manual, motivo de peso zero). */
    observacao: string | null;
    /** A cota de quem está lendo — só o portal marca. */
    minha?: boolean;
}

/** O que cada tela entrega. Tudo já em português e já formatado como texto,
 *  exceto os valores, que seguem numéricos para o documento somar. */
export interface EntradaRelatorio {
    condominio: string;
    numero?: string | null;
    /** `YYYY-MM-DD` ou `YYYY-MM`. */
    competencia: string;
    tipo: string;
    criterio: string;
    status: string;
    fechadoEm?: string | null;
    observacoes?: string | null;
    despesas: LinhaDespesaRelatorio[];
    cotas: LinhaCotaRelatorio[];
    /** Totais GRAVADOS no rateio. Ver `totalDespesas` abaixo. */
    totalDespesas: number;
    totalRateado: number;
    /** Instante da geração. Injetável para o teste não depender do relógio. */
    agora?: Date;
}

export interface RelatorioRateio {
    /** "Rateio 0003 · 06/2020" — ou só a competência, quando não há número. */
    titulo: string;
    condominio: string;
    numero: string | null;
    /** "06/2020". */
    competencia: string;
    tipo: string;
    criterio: string;
    status: string;
    fechadoEm: string | null;
    observacoes: string | null;

    despesas: LinhaDespesaRelatorio[];
    /** Soma das linhas de despesa listadas. */
    somaDespesas: number;
    /** Total GRAVADO no rateio. Pode divergir da soma — ver `avisos`. */
    totalDespesas: number;

    cotas: LinhaCotaRelatorio[];
    somaCotas: number;
    totalRateado: number;
    unidades: number;

    /** `totalDespesas − totalRateado`. Zero é o caso normal. */
    diferenca: number;
    /** O que o documento precisa DIZER em vez de deixar o leitor descobrir. */
    avisos: string[];

    /** "25/09/2026 às 14:32". */
    geradoEm: string;
    /** Sem extensão: "rateio_0003_06-2020". */
    nomeDoArquivo: string;
}

/** `YYYY-MM-DD` ou `YYYY-MM` → `MM/AAAA`, sem passar por `Date`.
 *  `new Date('2020-06-01')` é UTC e pode voltar um dia no fuso local — a mesma
 *  armadilha que já mordeu o cronograma. */
export function competenciaBR(iso: string): string {
    const [ano, mes] = String(iso).slice(0, 10).split('-');
    return mes ? `${mes}/${ano}` : String(iso);
}

/** `YYYY-MM-DD…` → `DD/MM/AAAA`. String → string, idem. */
export function dataBR(iso?: string | null): string | null {
    if (!iso) return null;
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
    return dia ? `${dia}/${mes}/${ano}` : null;
}

const doisDecimais = (v: number) => Math.round(v * 100) / 100;

/** Monta o documento. Puro: não lê banco, não formata moeda, não conhece PDF. */
export function montarRelatorioRateio(entrada: EntradaRelatorio): RelatorioRateio {
    const competencia = competenciaBR(entrada.competencia);
    const numero = (entrada.numero ?? '').trim() || null;

    const despesas = entrada.despesas ?? [];
    const cotas = entrada.cotas ?? [];
    const somaDespesas = doisDecimais(despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0));
    const somaCotas = doisDecimais(cotas.reduce((s, c) => s + (Number(c.valor) || 0), 0));
    const totalDespesas = doisDecimais(Number(entrada.totalDespesas) || 0);
    const totalRateado = doisDecimais(Number(entrada.totalRateado) || 0);
    const diferenca = doisDecimais(totalDespesas - totalRateado);

    // Os avisos são o que separa um documento de uma tabela impressa: quem lê a
    // prestação de contas não tem como saber POR QUE a soma não fecha, e a
    // pergunta chega ao síndico como desconfiança.
    const avisos: string[] = [];
    if (entrada.status === 'Rascunho') {
        avisos.push('Este rateio ainda é um rascunho — os valores podem mudar até o fechamento.');
    }
    if (diferenca !== 0) {
        avisos.push(
            `A soma das cotas difere do total das despesas em ${Math.abs(diferenca).toFixed(2).replace('.', ',')}. `
            + 'Unidade sem o dado que o critério exige fica de fora do rateio.',
        );
    }
    // Divergência entre o que está listado e o total gravado: acontece quando
    // uma despesa é apagada do rateio sem recalcular. O documento não deve
    // escolher em silêncio qual dos dois números é o verdadeiro.
    if (despesas.length > 0 && somaDespesas !== totalDespesas) {
        avisos.push(
            'As despesas listadas somam um valor diferente do total gravado no rateio. '
            + 'Refaça o cálculo antes de distribuir este documento.',
        );
    }
    const semPagador = cotas.filter(c => !c.pagador).length;
    if (semPagador > 0) {
        avisos.push(
            `${semPagador} unidade(s) sem responsável financeiro definido: a cota foi calculada, `
            + 'mas não há de quem cobrar.',
        );
    }

    const agora = entrada.agora ?? new Date();
    const doisDigitos = (n: number) => String(n).padStart(2, '0');
    const geradoEm = `${doisDigitos(agora.getDate())}/${doisDigitos(agora.getMonth() + 1)}/`
        + `${agora.getFullYear()} às ${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}`;

    return {
        titulo: numero ? `Rateio ${numero} · ${competencia}` : `Rateio de ${competencia}`,
        condominio: entrada.condominio,
        numero,
        competencia,
        tipo: entrada.tipo,
        criterio: entrada.criterio,
        status: entrada.status,
        fechadoEm: dataBR(entrada.fechadoEm),
        observacoes: (entrada.observacoes ?? '').trim() || null,
        despesas,
        somaDespesas,
        totalDespesas,
        cotas,
        somaCotas,
        totalRateado,
        unidades: cotas.length,
        diferenca,
        avisos,
        geradoEm,
        // `/` e `:` da competência não podem ir para nome de arquivo.
        nomeDoArquivo: ['rateio', numero, competencia.replace('/', '-')]
            .filter(Boolean).join('_')
            .replace(/[^\w.-]+/g, '-'),
    };
}
