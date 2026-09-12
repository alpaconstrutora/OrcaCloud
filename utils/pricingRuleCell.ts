// utils/pricingRuleCell.ts
// O que a coluna "Regras da Inteligência" (Tabela de aluguéis / de preços) mostra
// numa linha — decidido fora do componente porque a escolha entre as duas fontes
// tem regra de negócio, e regra de negócio dentro de JSX não se testa.
//
// Duas fontes, nesta ordem:
//
//  1. **Registro da aplicação** (`pricing_rule_applications`) — o que REALMENTE
//     gerou o preço: regras congeladas com nome e percentual do dia do Aplicar,
//     R$ de cada uma e o preço contrafactual sem regra nenhuma. É exato nos dois
//     modos, inclusive no de alvo total, onde o motor redistribui um bolo fixo.
//  2. **Estimativa ao vivo** — só quando não há registro (unidade que nunca
//     passou pelo Aplicar, ou aplicação anterior a esta tabela existir). Avalia
//     as regras ATIVAS HOJE contra os atributos ATUAIS e reparte o preço por
//     `1 + total%`. Exato no modo R$/m²; aproximado nos modos de alvo total.
//
// Quando as duas discordam — regra editada/desativada depois do Aplicar, ou o
// preço desta versão não é mais o preço aplicado — a célula avisa em vez de
// escolher calada. Era exatamente esse silêncio o problema que o registro veio
// resolver.
import { AdjustmentBreakdown, splitPriceByRules } from '../services/rentalPricingRuleService';
import { PricingApplicationMode, PricingRuleApplication } from '../types';
import { formatMoney } from '../components/ui/Format';

export interface LinhaRegraCelula {
    /** `rule_id` — chave de render, não precisa existir mais no catálogo. */
    id: string;
    nome: string;
    pct: number;
    valor: number;
}

export interface AvisoCelula {
    /** 'alerta' = o que está na tela não explica mais o preço; 'neutro' = leitura estimada. */
    tom: 'alerta' | 'neutro';
    texto: string;
}

export interface CelulaRegras {
    entradas: LinhaRegraCelula[];
    totalPct: number;
    totalAmount: number;
    fonte: 'registro' | 'estimativa';
    aviso?: AvisoCelula;
    /** Texto do `title` da célula — explica fonte, modo e divergências. */
    titulo: string;
}

const MODO_LABEL: Record<PricingApplicationMode, string> = {
    PER_SQM: 'R$/m²',
    TARGET_TOTAL: 'aluguel-alvo total',
    TARGET_VGV: 'VGV-alvo',
};

/** Modos que repartem um bolo fixo — regra numa unidade mexe no preço das outras. */
const MODO_REDISTRIBUI: Record<PricingApplicationMode, boolean> = {
    PER_SQM: false,
    TARGET_TOTAL: true,
    TARGET_VGV: true,
};

const fmtData = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

/** Assinatura de um conjunto de regras: id + percentual, ordenados. */
function assinatura(pares: { id: string; pct: number }[]): string {
    return pares.map(p => `${p.id}:${p.pct}`).sort().join('|');
}

export function describeRuleCell(
    unidade: { propertyId: string; price: number },
    aplicacoes: Record<string, PricingRuleApplication> | null | undefined,
    aoVivo: Record<string, AdjustmentBreakdown> | null | undefined,
): CelulaRegras | null {
    const registro = aplicacoes?.[unidade.propertyId];
    const vivo = aoVivo?.[unidade.propertyId];

    if (registro) {
        const entradas: LinhaRegraCelula[] = registro.rules.map(r => ({
            id: r.rule_id,
            nome: r.name || r.attribute_label,
            pct: r.pct,
            valor: r.amount,
        }));

        // Divergência 1 — as regras mudaram desde o Aplicar. `aoVivo` nulo com
        // regras no registro conta: quer dizer que todas foram desativadas ou
        // apagadas, e o preço continua sendo filho delas.
        const doRegistro = assinatura(registro.rules.map(r => ({ id: r.rule_id, pct: r.pct })));
        const deHoje = vivo
            ? assinatura(vivo.applied.map(a => ({ id: a.rule.id, pct: a.pct })))
            : '';
        const regrasMudaram = doRegistro !== deHoje;

        // Divergência 2 — o preço mostrado nesta versão não é o preço aplicado
        // (reajuste em massa, edição manual da célula, ou versão mais antiga).
        const precoMudou = Math.round(unidade.price) !== Math.round(registro.price);

        const partes = [
            `Aplicado em ${fmtData(registro.applied_at)} · modo ${MODO_LABEL[registro.mode] ?? registro.mode}`,
            `Preço sem regras: ${formatMoney(registro.base_price)} → aplicado ${formatMoney(registro.price)}`,
        ];
        if (MODO_REDISTRIBUI[registro.mode] && registro.rules.length === 0 && registro.total_amount !== 0) {
            partes.push('Sem regra própria: a diferença vem da redistribuição — regra em outra unidade mudou a participação desta no total-alvo.');
        }
        if (registro.rules.length > 0 && registro.total_pct === 0 && registro.total_amount !== 0) {
            partes.push('As regras desta unidade se anulam (0%); o valor do Total vem da redistribuição do total-alvo.');
        }
        if (regrasMudaram) partes.push('⚠ As regras da aba Inteligência mudaram depois desta aplicação — o preço continua sendo o que as regras acima geraram.');
        if (precoMudou) partes.push(`⚠ O preço desta versão (${formatMoney(unidade.price)}) não é o preço aplicado — reajuste ou edição posterior.`);

        return {
            entradas,
            totalPct: registro.total_pct,
            totalAmount: registro.total_amount,
            fonte: 'registro',
            aviso: regrasMudaram || precoMudou
                ? { tom: 'alerta', texto: [regrasMudaram && 'regras mudaram desde a aplicação', precoMudou && 'preço alterado depois da aplicação'].filter(Boolean).join('; ') }
                : undefined,
            titulo: partes.join('\n'),
        };
    }

    if (!vivo) return null;

    const split = splitPriceByRules(unidade.price, vivo);
    return {
        entradas: vivo.applied.map((a, i) => ({
            id: a.rule.id,
            nome: (a.rule.name ?? '').trim() || a.rule.attribute_label,
            pct: a.pct,
            valor: split.perRule[i] ?? 0,
        })),
        totalPct: vivo.totalPct,
        totalAmount: split.total,
        fonte: 'estimativa',
        aviso: { tom: 'neutro', texto: 'estimativa — sem registro de aplicação para esta unidade' },
        titulo: [
            'Estimativa: esta unidade não tem registro de aplicação da Inteligência.',
            'Os valores vêm das regras ativas HOJE, repartindo o preço por (1 + total%).',
            `Preço sem regras (estimado): ${formatMoney(split.base)}`,
            'No modo de alvo total essa conta é aproximada — rode a Inteligência para gravar os valores exatos.',
        ].join('\n'),
    };
}
