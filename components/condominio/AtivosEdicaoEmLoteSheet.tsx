// components/condominio/AtivosEdicaoEmLoteSheet.tsx
// Edição em lote dos equipamentos selecionados na aba Ativos do edifício.
// Plano: docs/planos/2026-10-13-condominio-ativos-edicao-em-lote.md
//
// Guia §10 (modal dedicado, nunca selects empilhados na barra) + REGRA #4
// (painel lateral). Modelo: `TaskBulkEditSheet.tsx`. Cada campo nasce em
// "Não alterar"; só o que o usuário mexer entra no patch.
//
// Nome e nº de série ficam FORA de propósito: são a identidade de cada
// aparelho. Gravar o mesmo valor em vários deles é sempre engano.
import React from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import type { BuildingAsset, BuildingAssetRow } from '../../services/buildingAssetService';
import type { BuildingSystem } from '../../types/condominio';

/** Campos que o lote pode gravar. Ausente = não alterar; `null` = limpar. */
export type AtivoLotePatch = Partial<Pick<BuildingAsset,
    'building_system_id' | 'location' | 'brand' | 'model' | 'purchase_date' | 'supplier_warranty_until' | 'notes'
>>;

type Modo = '' | 'set' | 'clear';
const SEM_SISTEMA = '__sem_sistema__';

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none disabled:opacity-50';
const ROTULO = 'text-xs font-semibold text-slate-500';

/** "Não alterar / Definir / Limpar" + o campo, que só aparece em "Definir". */
const CampoComModo: React.FC<{
    id: string;
    rotulo: string;
    tipo: 'text' | 'date';
    modo: Modo;
    valor: string;
    placeholder?: string;
    disabled: boolean;
    onModo: (m: Modo) => void;
    onValor: (v: string) => void;
    larga?: boolean;
}> = ({ id, rotulo, tipo, modo, valor, placeholder, disabled, onModo, onValor, larga }) => (
    <div className={`space-y-1.5 ${larga ? 'col-span-2' : ''}`}>
        <label htmlFor={id} className={ROTULO}>{rotulo}</label>
        {/* Empilhado, não lado a lado: em meia coluna o par seletor+campo não
            cabia — a data aparecia cortada ("dd/m") e a marca truncada. */}
        <div className="space-y-2">
            <select
                id={id} value={modo} disabled={disabled}
                onChange={e => onModo(e.target.value as Modo)}
                className={CAMPO}
            >
                <option value="">Não alterar</option>
                <option value="set">Definir</option>
                <option value="clear">Limpar</option>
            </select>
            {modo === 'set' && (
                <input
                    type={tipo} value={valor} placeholder={placeholder} disabled={disabled} autoFocus
                    onChange={e => onValor(e.target.value)}
                    className={CAMPO}
                />
            )}
        </div>
    </div>
);

interface Props {
    open: boolean;
    ativos: BuildingAssetRow[];
    sistemas: BuildingSystem[];
    onClose: () => void;
    /** Grava o patch; rejeita com Error para o painel mostrar a mensagem. */
    onApply: (patch: AtivoLotePatch) => Promise<void>;
}

const AtivosEdicaoEmLoteSheet: React.FC<Props> = ({ open, ativos, sistemas, onClose, onApply }) => {
    const [sistema, setSistema] = React.useState('');
    const [campos, setCampos] = React.useState<Record<string, { modo: Modo; valor: string }>>({});
    const [saving, setSaving] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    // Reabrir começa do zero — o lote anterior não pode vazar para o próximo.
    React.useEffect(() => {
        if (open) { setSistema(''); setCampos({}); setErro(null); }
    }, [open]);

    const campo = (k: string) => campos[k] ?? { modo: '' as Modo, valor: '' };
    const setModo = (k: string, modo: Modo) => setCampos(c => ({ ...c, [k]: { ...campo(k), modo } }));
    const setValor = (k: string, valor: string) => setCampos(c => ({ ...c, [k]: { ...campo(k), valor } }));

    const patch = React.useMemo<AtivoLotePatch>(() => {
        const p: AtivoLotePatch = {};
        if (sistema) p.building_system_id = sistema === SEM_SISTEMA ? null : sistema;
        const texto = (k: keyof AtivoLotePatch) => {
            const c = campos[k];
            if (!c || !c.modo) return;
            if (c.modo === 'clear') (p as any)[k] = null;
            else if (c.valor.trim()) (p as any)[k] = c.valor.trim();
        };
        (['location', 'brand', 'model', 'purchase_date', 'supplier_warranty_until', 'notes'] as const).forEach(texto);
        return p;
    }, [sistema, campos]);

    const nadaMudou = Object.keys(patch).length === 0;
    const n = ativos.length;
    const plural = n !== 1 ? 's' : '';

    const aplicar = async () => {
        if (nadaMudou) return;
        setSaving(true); setErro(null);
        try {
            await onApply(patch);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const comModo = (k: keyof AtivoLotePatch, rotulo: string, tipo: 'text' | 'date', extra?: { placeholder?: string; larga?: boolean }) => (
        <CampoComModo
            id={`lote-${k}`} rotulo={rotulo} tipo={tipo}
            modo={campo(k).modo} valor={campo(k).valor}
            placeholder={extra?.placeholder} larga={extra?.larga} disabled={saving}
            onModo={m => setModo(k, m)} onValor={v => setValor(k, v)}
        />
    );

    return (
        <Sheet open={open} onClose={onClose} size="lg" dirty={!nadaMudou && !saving}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Editar em lote</SheetTitle>
                <SheetDescription>
                    {n} equipamento{plural} selecionado{plural} · deixe em "Não alterar" o que deve ficar como está.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-6">
                {/* Resumo do lote */}
                <div className="rounded-[10px] border border-gray-100 bg-gray-50 divide-y divide-gray-100 max-h-36 overflow-y-auto">
                    {ativos.map(a => (
                        <p key={a.id} title={a.name} className="px-3 py-1.5 text-sm text-gray-700 truncate">
                            <span className="text-gray-500">{a.code}</span> · {a.name}
                        </p>
                    ))}
                </div>

                {erro && (
                    <div className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{erro}</span>
                    </div>
                )}

                {/* Malha §30: rótulo 6px, campos 16/24px */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <Pencil className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Alterar campos</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="col-span-2 space-y-1.5">
                            <label htmlFor="lote-sistema" className={ROTULO}>Sistema predial</label>
                            <select
                                id="lote-sistema" value={sistema} disabled={saving}
                                onChange={e => setSistema(e.target.value)}
                                className={CAMPO}
                            >
                                <option value="">Não alterar</option>
                                <option value={SEM_SISTEMA}>Sem sistema definido</option>
                                {sistemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        {comModo('location', 'Localização', 'text', { placeholder: 'Ex: Casa de máquinas — cobertura', larga: true })}
                        {comModo('brand', 'Marca', 'text')}
                        {comModo('model', 'Modelo', 'text')}
                        {comModo('purchase_date', 'Instalação', 'date')}
                        {comModo('supplier_warranty_until', 'Garantia do fornecedor até', 'date')}
                        {comModo('notes', 'Observações', 'text', { larga: true })}
                    </div>
                    <p className="text-xs text-gray-400">
                        Nome e nº de série não entram no lote: são a identidade de cada aparelho.
                    </p>
                </div>
            </SheetPanel>

            <SheetFooter>
                <button
                    onClick={onClose} disabled={saving}
                    className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={aplicar}
                    disabled={saving || nadaMudou}
                    title={nadaMudou ? 'Escolha ao menos um campo para alterar' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    {saving ? 'Aplicando...' : `Aplicar em ${n} equipamento${plural}`}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AtivosEdicaoEmLoteSheet;
