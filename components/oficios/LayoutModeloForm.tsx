import React from 'react';
import type { LayoutModelo } from '../../types/docGen';

/**
 * Página do modelo: logo, fonte, margens, cabeçalho e rodapé. Segue a malha do
 * formulário (§30): rótulo→campo `space-y-1.5`, campos `gap-x-6 gap-y-4`, campo
 * curto nunca em coluna única.
 */
interface Props {
    value: LayoutModelo;
    onChange: (next: LayoutModelo) => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';
const TEXTAREA = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export default function LayoutModeloForm({ value, onChange }: Props) {
    const set = <K extends keyof LayoutModelo>(k: K, v: LayoutModelo[K]) => onChange({ ...value, [k]: v });
    const setMargem = (k: keyof LayoutModelo['margens'], v: number) => onChange({ ...value, margens: { ...value.margens, [k]: v } });
    const setCab = <K extends keyof LayoutModelo['cabecalho']>(k: K, v: LayoutModelo['cabecalho'][K]) => onChange({ ...value, cabecalho: { ...value.cabecalho, [k]: v } });
    const setRod = <K extends keyof LayoutModelo['rodape']>(k: K, v: LayoutModelo['rodape'][K]) => onChange({ ...value, rodape: { ...value.rodape, [k]: v } });
    const num = (s: string, fallback: number) => { const n = Number(s); return isNaN(n) ? fallback : n; };

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Texto e margens</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label className={LABEL}>Fonte</label>
                        <select value={value.fonte} onChange={e => set('fonte', e.target.value as LayoutModelo['fonte'])} className={INPUT}>
                            <option value="Roboto">Roboto</option>
                        </select>
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
