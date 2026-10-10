import React from 'react';
import { Type } from 'lucide-react';
import type { DocGenFonte, LayoutModelo } from '../../types/docGen';
import { docGenFonteService } from '../../services/docGenFonteService';
import FontesSheet from './FontesSheet';

/**
 * Página do modelo: logo, fonte, margens, cabeçalho e rodapé. Segue a malha do
 * formulário (§30): rótulo→campo `space-y-1.5`, campos `gap-x-6 gap-y-4`, campo
 * curto nunca em coluna única.
 */
interface Props {
    value: LayoutModelo;
    onChange: (next: LayoutModelo) => void;
    /** F9: organização do modelo — de onde vêm as fontes. Sem ela, só a Roboto. */
    organizationId?: string | null;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';
const TEXTAREA = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export default function LayoutModeloForm({ value, onChange, organizationId }: Props) {
    const set = <K extends keyof LayoutModelo>(k: K, v: LayoutModelo[K]) => onChange({ ...value, [k]: v });
    const [fontes, setFontes] = React.useState<DocGenFonte[]>([]);
    const [fontesAberto, setFontesAberto] = React.useState(false);
    React.useEffect(() => {
        if (!organizationId) { setFontes([]); return; }
        let vivo = true;
        docGenFonteService.list(organizationId).then(l => { if (vivo) setFontes(l); }).catch(() => { if (vivo) setFontes([]); });
        return () => { vivo = false; };
    }, [organizationId]);
    const escolherFonte = (id: string) => {
        const f = fontes.find(x => x.id === id);
        onChange({ ...value, fonte: f ? f.id : 'Roboto', fonteNome: f ? f.nome : null });
    };
    // Fonte gravada no modelo que não existe mais: aparece como opção, para a pessoa ver e trocar.
    const fonteSumiu = value.fonte !== 'Roboto' && !fontes.some(f => f.id === value.fonte);
    const setMargem = (k: keyof LayoutModelo['margens'], v: number) => onChange({ ...value, margens: { ...value.margens, [k]: v } });
    const setCab = <K extends keyof LayoutModelo['cabecalho']>(k: K, v: LayoutModelo['cabecalho'][K]) => onChange({ ...value, cabecalho: { ...value.cabecalho, [k]: v } });
    const setRod = <K extends keyof LayoutModelo['rodape']>(k: K, v: LayoutModelo['rodape'][K]) => onChange({ ...value, rodape: { ...value.rodape, [k]: v } });
    const num = (s: string, fallback: number) => { const n = Number(s); return isNaN(n) ? fallback : n; };

    return (
        <div className="space-y-8">
            {organizationId && (
                <FontesSheet
                    aberto={fontesAberto}
                    onClose={() => setFontesAberto(false)}
                    organizationId={organizationId}
                    fontes={fontes}
                    emUso={value.fonte !== 'Roboto' ? value.fonte : null}
                    onCriada={f => { setFontes(l => [...l, f].sort((a, b) => a.nome.localeCompare(b.nome))); onChange({ ...value, fonte: f.id, fonteNome: f.nome }); }}
                    onExcluida={id => setFontes(l => l.filter(x => x.id !== id))}
                />
            )}
            <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Texto e margens</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <label className={LABEL} htmlFor="layout-fonte">Fonte</label>
                            {organizationId && (
                                <button type="button" onClick={() => setFontesAberto(true)} className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" title="Enviar ou excluir fontes da organização">
                                    <Type className="w-3.5 h-3.5" /> Fontes…
                                </button>
                            )}
                        </div>
                        <select id="layout-fonte" value={value.fonte} onChange={e => escolherFonte(e.target.value)} className={INPUT}>
                            <option value="Roboto">Roboto (padrão)</option>
                            {fontes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            {fonteSumiu && <option value={value.fonte}>{value.fonteNome ? `${value.fonteNome} (excluída)` : 'Fonte excluída'}</option>}
                        </select>
                        {fonteSumiu && <p className="text-[11px] text-red-600">A fonte deste modelo foi excluída — escolha outra, senão a prévia e a emissão param.</p>}
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Tamanho (pt)</label>
                        <input type="number" min={8} max={16} step={0.5} value={value.tamanhoFonte} onChange={e => set('tamanhoFonte', num(e.target.value, 11))} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Entrelinha</label>
                        <select value={String(value.entrelinha)} onChange={e => set('entrelinha', num(e.target.value, 1.15))} className={INPUT}>
                            <option value="1">Simples (1,0)</option>
                            <option value="1.15">1,15</option>
                            <option value="1.5">1,5</option>
                            <option value="2">Dupla (2,0)</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Espaço entre parágrafos (pt)</label>
                        <input type="number" min={0} max={24} value={value.espacoParagrafo} onChange={e => set('espacoParagrafo', num(e.target.value, 6))} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Margem superior (mm)</label>
                        <input type="number" min={5} max={60} value={value.margens.superior} onChange={e => setMargem('superior', num(e.target.value, 20))} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Margem inferior (mm)</label>
                        <input type="number" min={5} max={60} value={value.margens.inferior} onChange={e => setMargem('inferior', num(e.target.value, 20))} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Margem esquerda (mm)</label>
                        <input type="number" min={5} max={60} value={value.margens.esquerda} onChange={e => setMargem('esquerda', num(e.target.value, 25))} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Margem direita (mm)</label>
                        <input type="number" min={5} max={60} value={value.margens.direita} onChange={e => setMargem('direita', num(e.target.value, 20))} className={INPUT} />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Cabeçalho</h3>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={value.cabecalho.mostrar} onChange={e => setCab('mostrar', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        Mostrar em todas as páginas
                    </label>
                </div>
                {value.cabecalho.mostrar && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Logomarca</label>
                            <select value={value.cabecalho.logo} onChange={e => setCab('logo', e.target.value as LayoutModelo['cabecalho']['logo'])} className={INPUT}>
                                <option value="organizacao">Logo da organização (Minha Organização)</option>
                                <option value="nenhuma">Sem logo</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Alinhamento do texto</label>
                            <select value={value.cabecalho.alinhamento} onChange={e => setCab('alinhamento', e.target.value as LayoutModelo['cabecalho']['alinhamento'])} className={INPUT}>
                                <option value="left">Esquerda</option>
                                <option value="center">Centro</option>
                                <option value="right">Direita</option>
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL}>Texto do cabeçalho (aceita variáveis, uma linha por quebra)</label>
                            <textarea rows={3} value={value.cabecalho.texto} onChange={e => setCab('texto', e.target.value)} className={TEXTAREA}
                                placeholder={'{{empresa.razao_social}}\n{{empresa.endereco_completo}}'} />
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Rodapé</h3>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={value.rodape.mostrar} onChange={e => setRod('mostrar', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        Mostrar em todas as páginas
                    </label>
                </div>
                {value.rodape.mostrar && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Alinhamento do texto</label>
                            <select value={value.rodape.alinhamento} onChange={e => setRod('alinhamento', e.target.value as LayoutModelo['rodape']['alinhamento'])} className={INPUT}>
                                <option value="left">Esquerda</option>
                                <option value="center">Centro</option>
                                <option value="right">Direita</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Paginação</label>
                            <label className="flex items-center gap-2 h-9 text-sm text-gray-700">
                                <input type="checkbox" checked={value.rodape.paginacao} onChange={e => setRod('paginacao', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                "Página X de Y" à direita
                            </label>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL}>Texto do rodapé (aceita variáveis)</label>
                            <textarea rows={2} value={value.rodape.texto} onChange={e => setRod('texto', e.target.value)} className={TEXTAREA}
                                placeholder="{{empresa.telefone}} · {{empresa.email}} · {{empresa.site}}" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
