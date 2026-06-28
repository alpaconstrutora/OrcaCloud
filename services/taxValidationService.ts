import type { NfeInvoiceWithItems, NfeInvoiceItem } from '../types/fiscal';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface TaxAlert {
  severity: AlertSeverity;
  code: string;
  title: string;
  message: string;
  lineNumber?: number;
  itemDescription?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CFOP_ENTRADA = /^[123]/;

const NCM_8_DIGITS = /^\d{8}$/;

const NCM_GENERICOS = new Set([
  '00000000', '99999999', '00000001',
  '0', '99', '9999', '000', '9999999',
]);

// CFOPs de operações de saída (emissão de NF) que não deveriam aparecer numa NF-e de entrada
const CFOP_SAIDA_PREFIXES = ['5', '6', '7'];

// ── Validações por item ───────────────────────────────────────────────────────

function validateItem(item: NfeInvoiceItem): TaxAlert[] {
  const alerts: TaxAlert[] = [];
  const desc = `"${item.description}" (linha ${item.line_number})`;

  // 1. CFOP de saída em nota de entrada
  if (item.cfop) {
    const prefix = item.cfop.charAt(0);
    if (CFOP_SAIDA_PREFIXES.includes(prefix)) {
      alerts.push({
        severity: 'critical',
        code: 'CFOP_SAIDA_EM_ENTRADA',
        title: 'CFOP de saída em NF-e de entrada',
        message: `Item ${desc} tem CFOP ${item.cfop}. CFOPs iniciados em 5, 6 ou 7 são operações de saída/venda. Em nota de compra, use 1xxx (intra-estado), 2xxx (interestadual) ou 3xxx (importação).`,
        lineNumber: item.line_number,
        itemDescription: item.description,
      });
    } else if (!CFOP_ENTRADA.test(item.cfop)) {
      alerts.push({
        severity: 'warning',
        code: 'CFOP_FORMATO_INVALIDO',
        title: 'CFOP com formato inesperado',
        message: `Item ${desc}: CFOP "${item.cfop}" fora do padrão esperado (4 dígitos começando com 1, 2 ou 3).`,
        lineNumber: item.line_number,
        itemDescription: item.description,
      });
    }
  } else {
    alerts.push({
      severity: 'warning',
      code: 'CFOP_AUSENTE',
      title: 'CFOP não informado',
      message: `Item ${desc} não possui CFOP. O código é obrigatório pela legislação fiscal.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  }

  // 2. NCM ausente
  if (!item.ncm) {
    alerts.push({
      severity: 'warning',
      code: 'NCM_AUSENTE',
      title: 'NCM não informado',
      message: `Item ${desc} não possui NCM. O código é obrigatório para mercadorias.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  } else if (!NCM_8_DIGITS.test(item.ncm.replace(/[.\-]/g, ''))) {
    alerts.push({
      severity: 'warning',
      code: 'NCM_FORMATO_INVALIDO',
      title: 'NCM com formato inválido',
      message: `Item ${desc}: NCM "${item.ncm}" deveria ter exatamente 8 dígitos numéricos.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  } else if (NCM_GENERICOS.has(item.ncm.replace(/[.\-]/g, ''))) {
    alerts.push({
      severity: 'warning',
      code: 'NCM_GENERICO',
      title: 'NCM genérico / placeholder',
      message: `Item ${desc}: NCM ${item.ncm} é um código genérico e não identifica o produto corretamente. Solicite ao fornecedor a NCM real.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  }

  // 3. Imposto maior que valor do item (fisicamente impossível)
  if (item.tax_value !== null && item.total_value > 0 && item.tax_value > item.total_value) {
    alerts.push({
      severity: 'critical',
      code: 'IMPOSTO_MAIOR_QUE_VALOR',
      title: 'Imposto maior que valor do item',
      message: `Item ${desc}: imposto declarado ${fmtBRL(item.tax_value)} é maior que o valor total ${fmtBRL(item.total_value)}. Verifique erro de digitação ou soma incorreta de tributos.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  }

  // 4. Alíquota implícita muito elevada (> 50%)
  if (
    item.tax_value !== null &&
    item.total_value > 0 &&
    item.tax_value > 0 &&
    item.tax_value <= item.total_value
  ) {
    const rate = item.tax_value / item.total_value;
    if (rate > 0.50) {
      alerts.push({
        severity: 'warning',
        code: 'ALIQUOTA_ALTA',
        title: 'Alíquota implícita elevada',
        message: `Item ${desc}: alíquota implícita de ${(rate * 100).toFixed(1)}% (imposto ${fmtBRL(item.tax_value)} / valor ${fmtBRL(item.total_value)}). Verifique se os valores estão corretos — alíquotas acima de 50% são incomuns.`,
        lineNumber: item.line_number,
        itemDescription: item.description,
      });
    }
  }

  // 5. Quantidade zero ou negativa
  if (item.quantity <= 0) {
    alerts.push({
      severity: 'warning',
      code: 'QUANTIDADE_ZERO',
      title: 'Quantidade zero ou negativa',
      message: `Item ${desc} tem quantidade ${item.quantity}. Verifique se é nota de devolução ou erro de preenchimento.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  }

  // 6. Preço unitário zero com total não zero
  if (item.unit_value === 0 && item.total_value > 0) {
    alerts.push({
      severity: 'info',
      code: 'PRECO_UNITARIO_ZERO',
      title: 'Preço unitário zero com total não nulo',
      message: `Item ${desc}: preço unitário = R$ 0,00 mas total = ${fmtBRL(item.total_value)}. Pode indicar uso de valor unitário tributável diferente do comercial.`,
      lineNumber: item.line_number,
      itemDescription: item.description,
    });
  }

  return alerts;
}

// ── Validações de nível de nota ───────────────────────────────────────────────

function validateInvoiceLevel(invoice: NfeInvoiceWithItems): TaxAlert[] {
  const alerts: TaxAlert[] = [];
  const { items, total_value } = invoice;

  if (items.length === 0) return alerts;

  // Divergência soma dos itens vs. total da nota
  const sumItems = items.reduce((s, i) => s + i.total_value, 0);
  const diff = Math.abs(sumItems - total_value);

  if (diff > 0.10 && total_value > 0) {
    const pct = (diff / total_value * 100).toFixed(2);
    const severity: AlertSeverity = diff / total_value > 0.01 ? 'warning' : 'info';
    alerts.push({
      severity,
      code: 'SOMA_ITENS_DIVERGE',
      title: 'Soma dos itens difere do total da nota',
      message: `Soma dos itens: ${fmtBRL(sumItems)} — Total declarado: ${fmtBRL(total_value)} (diferença de ${pct}%). Pode ser frete, seguro, desconto comercial ou erro no XML.`,
    });
  }

  // Notas com muitos itens sem NCM
  const semNcm = items.filter(i => !i.ncm).length;
  if (semNcm > 0 && semNcm === items.length) {
    alerts.push({
      severity: 'warning',
      code: 'TODOS_SEM_NCM',
      title: 'Todos os itens sem NCM',
      message: `Nenhum dos ${items.length} itens possui NCM. A NF-e pode estar incompleta ou o parser não extraiu o campo corretamente.`,
    });
  }

  return alerts;
}

// ── Ponto de entrada público ──────────────────────────────────────────────────

export function validateNfe(invoice: NfeInvoiceWithItems): TaxAlert[] {
  const itemAlerts = invoice.items.flatMap(validateItem);
  const invoiceAlerts = validateInvoiceLevel(invoice);
  return [...itemAlerts, ...invoiceAlerts];
}

export function summarizeAlerts(alerts: TaxAlert[]) {
  return {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning:  alerts.filter(a => a.severity === 'warning').length,
    info:     alerts.filter(a => a.severity === 'info').length,
    total:    alerts.length,
    hasIssues: alerts.some(a => a.severity !== 'info'),
  };
}
