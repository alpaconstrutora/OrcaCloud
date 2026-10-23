import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import type { PayrollRubric, CalculationType } from '../services/payrollService';
import { motivoBloqueioRecorrente } from '../lib/payrollRubricaRecorrente';

/**
 * Colaborador › Folha de Pagamento › "Adicionar": drawer com TODAS as rubricas
 * ativas que ainda não entram na folha deste colaborador — busca + checkbox,
 * várias de uma vez. As que a folha já calcula (INSS, IRRF, FGTS, salário…)
 * aparecem travadas, com o motivo (`lib/payrollRubricaRecorrente`). Devolve só
 * os códigos: o valor do colaborador se informa na aba, e quem grava é o
 * "Salvar" do formulário.
 *
 * As colunas e as células moram aqui e são reaproveitadas pela tabela da aba
 * (`LaborEmployeeForm`), para as duas lerem igual.
 */

// §6.10 — só colunas de dado. Soma 800px: cabe no Sheet 4xl (com a coluna de
// checkbox) sem rolagem lateral.
export const RUBRIC_COLUMNS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 110 },
    { key: 'nome', label: 'Rubrica', sortable: true, width: 210 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 95 },
    { key: 'inss', label: 'INSS', sortable: true, width: 60 },
    { key: 'fgts', label: 'FGTS', sortable: true, width: 60 },
    { key: 'irrf', label: 'IRRF', sortable: true, width: 60 },
    { key: 'calculo', label: 'Cálculo', sortable: true, width: 95 },
    { key: 'categoria', label: 'Categoria', sortable: true, width: 110 },
];

// Mesmos rótulos/cores de Rubricas (LaborRubrics.tsx) — status em texto
// colorido, sem pílula (§8).
const RUBRIC_TYPE_LABELS: Record<string, string> = { provento: 'Provento', desconto: 'Desconto', encargo: 'Encargo', informativa: 'Informativa' };
const RUBRIC_TYPE_COLORS: Record<string, string> = { provento: 'text-emerald-700', desconto: 'text-rose-700', encargo: 'text-amber-700', informativa: 'text-slate-500' };
const CALC_TYPE_LABELS: Record<CalculationType, string> = { manual: 'Manual', fixed: 'Valor fixo', percentage: 'Percentual', formula: 'Fórmula' };
// `rubrics.category` é gravada em inglês (motor da folha); valor fora da lista aparece cru.
const RUBRIC_CATEGORY_LABELS: Record<string, string> = {
    base: 'Salário base', overtime: 'Horas extras', tax: 'Tributo', benefit: 'Benefício',
    vacation: 'Férias', thirteenth: '13º salário', variable: 'Variável', termination: 'Rescisão',
};
const categoriaDaRubrica = (c?: string | null) => (c ? RUBRIC_CATEGORY_LABELS[c] ?? c : '');

export const rubricSearchText = (r: PayrollRubric) =>
    `${r.code} ${r.name} ${categoriaDaRubrica(r.category)} ${RUBRIC_TYPE_LABELS[r.type] ?? r.type}`;

export const rubricSortValue = (key: string, r: PayrollRubric) => {
    switch (key) {
        case 'tipo': return RUBRIC_TYPE_LABELS[r.type] ?? r.type;
        case 'inss': return r.incidence_inss ? 1 : 0;
        case 'fgts': return r.incidence_fgts ? 1 : 0;
        case 'irrf': return r.incidence_irrf ? 1 : 0;
        case 'calculo': return CALC_TYPE_LABELS[r.calculation_type ?? 'manual'];
        case 'categoria': return categoriaDaRubrica(r.category);
        case 'codigo': return r.code;
        default: return r.name;
    }
};

export const renderRubricCell = (key: string, r: PayrollRubric): React.ReactNode => {
    switch (key) {
        case 'codigo': return <span className="block truncate text-sm font-normal text-gray-600" title={r.code}>{r.code}</span>;
        case 'tipo':
            return <span className={`text-sm font-normal ${RUBRIC_TYPE_COLORS[r.type] ?? 'text-gray-600'}`}>{RUBRIC_TYPE_LABELS[r.type] ?? r.type}</span>;
        case 'inss': case 'fgts': case 'irrf': {
            const on = key === 'inss' ? r.incidence_inss : key === 'fgts' ? r.incidence_fgts : r.incidence_irrf;
            return on
                ? <Check className="w-4 h-4 text-emerald-600" aria-label="Incide" />
                : <span className="text-sm font-normal text-gray-400" aria-label="Não incide">—</span>;
        }
        case 'calculo': return <span className="text-sm font-normal text-gray-600">{CALC_TYPE_LABELS[r.calculation_type ?? 'manual']}</span>;
        case 'categoria': return <span className="block truncate text-sm font-normal text-gray-600" title={categoriaDaRubrica(r.category)}>{categoriaDaRubrica(r.category) || '—'}</span>;
        default: return <span className="block truncate text-sm font-normal text-gray-700" title={r.name}>{r.name}</span>;
    }
};

interface Props {
    open: boolean;
    /** Rubricas ativas que ainda NÃO entram na folha deste colaborador (inclusive as travadas). */
    rubrics: PayrollRubric[];
    loading?: boolean;
    onClose: () => void;
    onAdd: (codes: string[]) => void;
}

const LaborEmployeeRubricPicker: React.FC<Props> = ({ open, rubrics, loading, onClose, onAdd }) => {
    // O formulário de criação é um overlay `z-50`: o drawer sai por portal em
    // `document.body` e monta só ao abrir, para entrar por último no DOM (mesmo
    // arranjo do `ClientSelect`). `shown` vira true um frame depois, para a
    // transição de entrada do `Sheet` acontecer.
    const [mounted, setMounted] = useState(false);
    const [shown, setShown] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    // §3.1: busca de seletor é transitória — zera a cada abertura.
    const [busca, setBusca] = useState('');

    useEffect(() => {
        if (open) {
            setSelected(new Set());
            setBusca('');
            setMounted(true);
            const r = requestAnimationFrame(() => setShown(true));
            return () => cancelAnimationFrame(r);
        }
        setShown(false);
        const t = window.setTimeout(() => setMounted(false), 300);
        return () => window.clearTimeout(t);
    }, [open]);

    const adicionar = () => {
        // Na ordem da lista, não na ordem dos cliques.
        onAdd(rubrics.filter(r => selected.has(r.code)).map(r => r.code));
        onClose();
    };

    if (!mounted) return null;

    return createPortal(
        <Sheet open={shown} onClose={onClose} size="4xl" zIndex={10000}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Adicionar rubricas recorrentes</SheetTitle>
                <SheetDescription>Marque as rubricas que devem entrar em todas as folhas deste colaborador. O valor (R$ ou % do salário) você informa na aba, depois de adicionar.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                <StandardTable<PayrollRubric>
                    storageKey="rh:colaborador:folha:rubricas-adicionar"
                    columns={RUBRIC_COLUMNS}
                    rows={rubrics}
                    rowKey={r => r.code}
                    dense
                    loading={loading}
                    search={busca}
                    onSearchChange={setBusca}
                    searchText={rubricSearchText}
                    searchPlaceholder="Buscar rubrica por código, nome ou categoria..."
                    selection={{ selected, onChange: setSelected, canSelect: r => !motivoBloqueioRecorrente(r) }}
                    sortValue={rubricSortValue}
                    renderCell={(key, r) => {
                        const motivo = key === 'nome' ? motivoBloqueioRecorrente(r) : null;
                        // Travada: o checkbox some (canSelect) e o motivo fica ao lado do nome (§8, texto).
                        return motivo
                            ? <span className="block truncate text-sm font-normal text-gray-700" title={`${r.name} — ${motivo}`}>{r.name} <span className="text-gray-500">· {motivo}</span></span>
                            : renderRubricCell(key, r);
                    }}
                    empty={{
                        icon: <Check className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Todas as rubricas já foram adicionadas',
                        subtitle: 'Cadastre uma rubrica nova em RH › Rubricas para ter outra opção aqui.',
                    }}
                />
            </SheetPanel>
            <SheetFooter>
                {selected.size === 0 && <span className="text-xs text-gray-500 mr-auto">Marque ao menos uma rubrica.</span>}
                <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                <button
                    onClick={adicionar}
                    disabled={selected.size === 0}
                    title={selected.size === 0 ? 'Marque ao menos uma rubrica.' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {selected.size ? `Adicionar ${selected.size} ${selected.size === 1 ? 'rubrica' : 'rubricas'}` : 'Adicionar rubricas'}
                </button>
            </SheetFooter>
        </Sheet>,
        document.body,
    );
};

export default LaborEmployeeRubricPicker;
