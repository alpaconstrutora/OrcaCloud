// components/catalog/BrandModelPicker.tsx — campos "Marca" e "Modelo" do catálogo
//
// Configurações › Marcas e Modelos (docs/planos/2026-10-13-marcas-e-modelos.md),
// usado por Gestão de Ativos, Condomínio › Ativos do edifício e Almoxarifado.
// Guia §7.1.2.
//
// - A ORGANIZAÇÃO é a do registro (ativo/item), nunca perguntada aqui (REGRA #5):
//   o ativo do edifício usa a do empreendimento; a Gestão de Ativos, a org do
//   formulário. Sem org conhecida, os campos ficam desligados dizendo por quê.
// - Cadastrar na hora cria no catálogo e já seleciona; texto digitado sem
//   cadastrar também vale — o salvar resolve (brandModelService.resolverMarcaModelo).
// - `onChange(valor, modelo)`: o modelo vai junto para a tela autopreencher
//   categoria/vida útil (utils/catalogoAutopreencher).
//
// Renderiza DOIS blocos rótulo+campo como fragmento — quem usa decide a grade.
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CreatableCombobox } from '../ui/CreatableCombobox';
import { brandModelService } from '../../services/brandModelService';
import type { BrandModelValue, ProductBrand, ProductItemType, ProductModel } from '../../types/brandModel';
import { ITEM_TYPE_LABELS } from '../../types/brandModel';

interface Props {
    /** Org do REGISTRO. null = ainda não escolhida (campos desligados, com o motivo). */
    organizationId: string | null;
    value: BrandModelValue;
    onChange: (valor: BrandModelValue, modelo?: ProductModel | null) => void;
    /** Tipos de item oferecidos no Modelo (ex.: Almoxarifado = material/componente…). Sem ele, todos. */
    itemTypes?: ProductItemType[];
    /** Tipo com que nasce um modelo cadastrado daqui. */
    defaultItemType: ProductItemType;
    disabled?: boolean;
    labelClassName?: string;
    inputClassName?: string;
    /** Classe de cada bloco rótulo+campo (default §30: `space-y-1.5`). */
    fieldClassName?: string;
    /** Mostrar só a Marca (sem o campo Modelo). */
    somenteMarca?: boolean;
    idPrefix?: string;
}

const LABEL_PADRAO = 'text-xs font-semibold text-slate-500';

export const BrandModelPicker: React.FC<Props> = ({
    organizationId, value, onChange, itemTypes, defaultItemType, disabled,
    labelClassName = LABEL_PADRAO, inputClassName, fieldClassName = 'space-y-1.5', somenteMarca, idPrefix = 'bm',
}) => {
    const [marcas, setMarcas] = React.useState<ProductBrand[]>([]);
    const [modelos, setModelos] = React.useState<ProductModel[]>([]);
    const [erroCarga, setErroCarga] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivo = true;
        setMarcas([]);
        setModelos([]);
        setErroCarga(null);
        if (organizationId) {
            Promise.all([brandModelService.listBrands(organizationId), brandModelService.listModels(organizationId)])
                .then(([b, m]) => { if (vivo) { setMarcas(b); setModelos(m); } })
                .catch(e => { if (vivo) setErroCarga(e instanceof Error ? e.message : String(e)); });
        }
        return () => { vivo = false; };
    }, [organizationId]);

    const marcasAtivas = React.useMemo(
        () => marcas.filter(b => b.is_active || b.id === value.brandId),
        [marcas, value.brandId],
    );
    const modelosDaMarca = React.useMemo(
        () => modelos.filter(m =>
            m.brand_id === value.brandId
            && (m.is_active || m.id === value.modelId)
            && (!itemTypes || itemTypes.includes(m.item_type) || m.id === value.modelId)),
        [modelos, value.brandId, value.modelId, itemTypes],
    );
    const modeloEscolhido = value.modelId ? modelos.find(m => m.id === value.modelId) ?? null : null;

    const semOrg = !organizationId;
    const motivoSemOrg = 'Escolha a organização proprietária';

    // ── Marca ──────────────────────────────────────────────────────────────
    const escolherMarca = (b: ProductBrand) => {
        const trocou = b.id !== value.brandId;
        onChange({ brandId: b.id, brandName: b.name, modelId: trocou ? null : value.modelId, modelName: value.modelName }, trocou ? null : undefined);
    };
    const cadastrarMarca = async (org: string, nome: string) => {
        const b = await brandModelService.findOrCreateBrand(org, nome);
        setMarcas(prev => (prev.some(x => x.id === b.id) ? prev : [...prev, b].sort((x, y) => x.name.localeCompare(y.name))));
        escolherMarca(b);
    };

    // ── Modelo ─────────────────────────────────────────────────────────────
    const escolherModelo = (m: ProductModel) => {
        const marca = marcas.find(b => b.id === m.brand_id);
        onChange({ brandId: m.brand_id, brandName: marca?.name ?? value.brandName, modelId: m.id, modelName: m.name }, m);
    };
    const cadastrarModelo = async (org: string, nome: string) => {
        // Marca só digitada: cadastra junto — o modelo precisa de uma marca para morar.
        let marcaId = value.brandId;
        let marcaNome = value.brandName;
        if (!marcaId) {
            const b = await brandModelService.findOrCreateBrand(org, value.brandName);
            setMarcas(prev => (prev.some(x => x.id === b.id) ? prev : [...prev, b].sort((x, y) => x.name.localeCompare(y.name))));
            marcaId = b.id;
            marcaNome = b.name;
        }
        const m = await brandModelService.findOrCreateModel(org, marcaId, nome, defaultItemType);
        setModelos(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
        onChange({ brandId: marcaId, brandName: marcaNome, modelId: m.id, modelName: m.name }, m);
    };

    const semMarca = !value.brandId && !value.brandName.trim();

    return (
        <>
            <div className={fieldClassName}>
                <label htmlFor={`${idPrefix}-marca`} className={labelClassName}>Marca</label>
                <CreatableCombobox<ProductBrand>
                    id={`${idPrefix}-marca`}
                    ariaLabel="Marca"
                    value={value.brandName}
                    selectedId={value.brandId}
                    options={marcasAtivas}
                    onSelect={escolherMarca}
                    onTextChange={texto => onChange({ brandId: null, brandName: texto, modelId: null, modelName: value.modelName }, null)}
                    onCreate={organizationId ? nome => cadastrarMarca(organizationId, nome) : undefined}
                    placeholder="Buscar ou cadastrar marca..."
                    disabled={disabled || semOrg}
                    disabledReason={semOrg ? motivoSemOrg : undefined}
                    inputClassName={inputClassName}
                    avisoNovo="Marca nova — será cadastrada ao salvar."
                />
                {erroCarga && <p className="text-xs text-red-600">Catálogo indisponível: {erroCarga}</p>}
            </div>

            {!somenteMarca && (
                <div className={fieldClassName}>
                    <label htmlFor={`${idPrefix}-modelo`} className={labelClassName}>Modelo</label>
                    <CreatableCombobox<ProductModel>
                        id={`${idPrefix}-modelo`}
                        ariaLabel="Modelo"
                        value={value.modelName}
                        selectedId={value.modelId}
                        options={modelosDaMarca}
                        onSelect={escolherModelo}
                        onTextChange={texto => onChange({ ...value, modelId: null, modelName: texto }, null)}
                        onCreate={organizationId ? nome => cadastrarModelo(organizationId, nome) : undefined}
                        getHint={m => [ITEM_TYPE_LABELS[m.item_type], m.manufacturer_code].filter(Boolean).join(' · ') || undefined}
                        placeholder={semMarca ? 'Escolha a marca primeiro' : 'Buscar ou cadastrar modelo...'}
                        disabled={disabled || semOrg || semMarca}
                        disabledReason={semOrg ? motivoSemOrg : semMarca ? 'Escolha a marca primeiro' : undefined}
                        inputClassName={inputClassName}
                        avisoNovo="Modelo novo — será cadastrado ao salvar."
                    />
                    {modeloEscolhido && (modeloEscolhido.manufacturer_code || modeloEscolhido.datasheet_url) && (
                        <p className="flex items-center gap-2 text-xs text-gray-400">
                            {modeloEscolhido.manufacturer_code && <span title="Código do fabricante">{modeloEscolhido.manufacturer_code}</span>}
                            {modeloEscolhido.datasheet_url && (
                                <a href={modeloEscolhido.datasheet_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800">
                                    Ficha técnica <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </p>
                    )}
                </div>
            )}
        </>
    );
};

export default BrandModelPicker;
