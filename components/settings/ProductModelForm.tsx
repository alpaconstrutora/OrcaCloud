// components/settings/ProductModelForm.tsx — criar/editar um modelo DENTRO do painel da marca
//
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md (pedido posterior de 13/10:
// "modelo deve ser fundido com marca. no proprio cadastro de marca, habilite
// cadastro de modelo"). Todo modelo pertence a uma marca, então ele não tem
// tela própria: o painel da marca troca de conteúdo para este formulário e
// volta ao terminar. Não é um segundo `Sheet` — drawer dentro de drawer é
// proibido (UI_PATTERNS §4.4).
//
// Devolve corpo (`SheetPanel`) e rodapé (`SheetFooter`): o cabeçalho é o do
// painel da marca, que muda o título. A organização do modelo é a da marca
// (FK composta no banco), por isso aqui não se pergunta organização.
//
// Os padrões (categoria + vida útil) são o que o formulário do ativo
// autopreenche ao escolher o modelo, sem sobrescrever o que foi digitado.
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { SheetPanel, SheetFooter } from '../ui/sheet';
import { brandModelService } from '../../services/brandModelService';
import { errorMessage } from '../../hooks/useOrgContext';
import type { ProductBrand, ProductItemType, ProductModel, ProductModelInput } from '../../types/brandModel';
import { ITEM_TYPE_LABELS, ITEM_TYPES } from '../../types/brandModel';
import type { AssetCategory } from '../../types/assets';
import { ASSET_CATEGORY_LABELS } from '../../utils/assetToStockItemRow';
import { normalizarNome } from '../../utils/catalogoNome';

const LABEL = 'text-xs font-semibold text-slate-500';
const INPUT = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all';

interface Form {
    name: string;
    item_type: ProductItemType;
    manufacturer_code: string;
    default_asset_category: AssetCategory | '';
    default_useful_life_months: string;
    technical_spec: string;
    datasheet_url: string;
    is_active: boolean;
}

const formDe = (m: ProductModel | null): Form => ({
    name: m?.name ?? '',
    item_type: m?.item_type ?? 'equipamento',
    manufacturer_code: m?.manufacturer_code ?? '',
    default_asset_category: m?.default_asset_category ?? '',
    default_useful_life_months: m?.default_useful_life_months != null ? String(m.default_useful_life_months) : '',
    technical_spec: m?.technical_spec ?? '',
    datasheet_url: m?.datasheet_url ?? '',
    is_active: m?.is_active ?? true,
});

interface Props {
    brand: ProductBrand;
    /** null = novo modelo desta marca */
    model: ProductModel | null;
    /** Volta à marca sem salvar (quem chama pergunta se houver pendência). */
    onBack: () => void;
    onSaved: (m: ProductModel, criado: boolean) => void;
    /** Pendência do formulário — o painel usa na guarda de saída. */
    onDirtyChange: (dirty: boolean) => void;
}

export const ProductModelForm: React.FC<Props> = ({ brand, model, onBack, onSaved, onDirtyChange }) => {
    const [inicial] = React.useState<Form>(() => formDe(model));
    const [form, setForm] = React.useState<Form>(inicial);
    const [saving, setSaving] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(prev => ({ ...prev, [k]: v }));
    const dirty = JSON.stringify(form) !== JSON.stringify(inicial);
    React.useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

    const vida = form.default_useful_life_months.trim();
    const vidaInvalida = vida !== '' && !(Number.isInteger(Number(vida)) && Number(vida) >= 1 && Number(vida) <= 1200);
    const urlInvalida = form.datasheet_url.trim() !== '' && !/^https?:\/\//i.test(form.datasheet_url.trim());

    const motivoBloqueio = !normalizarNome(form.name) ? 'Informe o nome do modelo'
        : vidaInvalida ? 'Vida útil padrão: meses inteiros entre 1 e 1200'
        : urlInvalida ? 'A ficha técnica precisa ser um link http:// ou https://'
        : model && !dirty ? 'Nada foi alterado'
        : null;

    const salvar = async () => {
        if (motivoBloqueio) return;
        setSaving(true);
        setErro(null);
        const input: ProductModelInput = {
            brand_id: brand.id,
            name: form.name,
            item_type: form.item_type,
            manufacturer_code: form.manufacturer_code,
            default_asset_category: form.default_asset_category || null,
            default_useful_life_months: vida === '' ? null : Number(vida),
            technical_spec: form.technical_spec,
            datasheet_url: form.datasheet_url,
            is_active: form.is_active,
        };
        try {
            const salvo = model
                ? await brandModelService.updateModel(model.id, input)
                : await brandModelService.createModel(brand.organization_id, input);
            onDirtyChange(false);
            onSaved(salvo, !model);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível salvar o modelo.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <SheetPanel className="px-6 py-5">
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Identificação</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="modelo-nome" className={LABEL}>Modelo</label>
                                <input id="modelo-nome" autoFocus maxLength={100} value={form.name} onChange={e => set('name', e.target.value)}
                                    placeholder="Ex.: MSZ-HJ12, W22 5cv" className={INPUT} />
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="modelo-tipo" className={LABEL}>Tipo de item</label>
                                <select id="modelo-tipo" value={form.item_type} onChange={e => set('item_type', e.target.value as ProductItemType)} className={INPUT}>
                                    {ITEM_TYPES.map(t => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="modelo-codigo" className={LABEL}>Código do fabricante</label>
                                <input id="modelo-codigo" maxLength={100} value={form.manufacturer_code} onChange={e => set('manufacturer_code', e.target.value)}
                                    placeholder="Part number / referência" className={INPUT} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Padrões para o ativo</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Ao escolher este modelo num ativo, o formulário preenche estes campos — sem trocar o que já foi digitado.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="modelo-categoria" className={LABEL}>Categoria do ativo</label>
                                <select id="modelo-categoria" value={form.default_asset_category}
                                    onChange={e => set('default_asset_category', e.target.value as AssetCategory | '')} className={INPUT}>
                                    <option value="">Sem padrão</option>
                                    {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map(c => (
                                        <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="modelo-vida" className={LABEL}>Vida útil (meses)</label>
                                <input id="modelo-vida" type="number" min={1} max={1200} step={1} value={form.default_useful_life_months}
                                    onChange={e => set('default_useful_life_months', e.target.value)} placeholder="Sem padrão" className={INPUT} />
                                {vidaInvalida && <p className="text-xs text-red-600">Meses inteiros entre 1 e 1200.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Especificação</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5 col-span-2">
                                <label htmlFor="modelo-ficha" className={LABEL}>Ficha técnica (link)</label>
                                <div className="flex items-center gap-2">
                                    <input id="modelo-ficha" type="url" value={form.datasheet_url} onChange={e => set('datasheet_url', e.target.value)}
                                        placeholder="https://fabricante.com/ficha.pdf" className={INPUT} />
                                    {form.datasheet_url.trim() && !urlInvalida && (
                                        <a href={form.datasheet_url.trim()} target="_blank" rel="noopener noreferrer" title="Abrir ficha técnica"
                                            className="shrink-0 p-2 rounded-[6px] border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200">
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                                {urlInvalida && <p className="text-xs text-red-600">Use um link que comece com http:// ou https://.</p>}
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label htmlFor="modelo-spec" className={LABEL}>Especificação técnica</label>
                                <textarea id="modelo-spec" rows={5} maxLength={4000} value={form.technical_spec} onChange={e => set('technical_spec', e.target.value)}
                                    placeholder="Potência, tensão, capacidade, dimensões..."
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-y" />
                            </div>
                        </div>
                        {model && (
                            <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                <span>
                                    Modelo ativo
                                    <span className="block text-xs text-gray-400">Inativo some dos campos de escolha; o que já está vinculado continua.</span>
                                </span>
                            </label>
                        )}
                    </div>
                </div>
                {erro && <p className="mt-6 text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onBack} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    Voltar para a marca
                </button>
                <button
                    onClick={() => void salvar()}
                    disabled={saving || !!motivoBloqueio}
                    title={motivoBloqueio ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? 'Salvando...' : model ? 'Salvar modelo' : 'Criar modelo'}
                </button>
            </SheetFooter>
        </>
    );
};

export default ProductModelForm;
