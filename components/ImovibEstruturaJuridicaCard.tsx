import React, { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { ImovibStudy } from '../types';
import { empreendimentoService } from '../services/empreendimentoService';
import { companyService } from '../services/companyService';
import { TIPO_SPE_LABELS, type CompanyIncorporacao, type TipoSPE } from '../types/company';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

type Veiculo = NonNullable<ImovibStudy['legal_vehicle']>;

const VEICULOS: { valor: Veiculo; rotulo: string }[] = [
    { valor: 'propria', rotulo: 'Própria incorporadora' },
    { valor: 'spe', rotulo: 'SPE (sociedade de propósito específico)' },
    { valor: 'scp', rotulo: 'SCP (sociedade em conta de participação)' },
];

/** O tipo cadastrado na empresa (Incorporação) → os dois campos do estudo. */
export const estruturaDoCadastro = (tipo: TipoSPE): { legal_vehicle: Veiculo; patrimonio_afetacao: boolean } =>
    tipo === 'patrimonio_afetacao' ? { legal_vehicle: 'propria', patrimonio_afetacao: true }
        : { legal_vehicle: tipo, patrimonio_afetacao: false };

const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');

interface Props {
    study: ImovibStudy;
    formData: Partial<ImovibStudy>;
    setCampo: (field: keyof ImovibStudy, valor: unknown) => void;
}

/**
 * Estrutura jurídica do estudo (item 9.1 do plano 2026-11-11): veículo e
 * patrimônio de afetação, no formulário de Premissas ("Salvar Premissas" grava).
 * Estudo vinculado a empreendimento com empresa mostra, só leitura, o cadastro de
 * incorporação dela e oferece preenchê-los a partir dele.
 */
const ImovibEstruturaJuridicaCard: React.FC<Props> = ({ study, formData, setCampo }) => {
    const { pode, motivo } = useImovibEdicao();
    const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const [cadastro, setCadastro] = useState<{ empresa: string | null; incorporacao: CompanyIncorporacao | null } | null>(null);
    const [carregando, setCarregando] = useState(!!empId);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        setCadastro(null);
        setErro(null);
        if (!empId) { setCarregando(false); return; }
        let vivo = true;
        setCarregando(true);
        (async () => {
            const emp = await empreendimentoService.getById(empId);
            if (!emp?.company_id) return { empresa: null, incorporacao: null };
            const [empresa, incorporacao] = await Promise.all([companyService.get(emp.company_id), companyService.getIncorporacao(emp.company_id)]);
            return { empresa: empresa?.nome_fantasia || empresa?.razao_social || 'A empresa do empreendimento', incorporacao };
        })()
            .then(c => { if (vivo) setCadastro(c); })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao ler o cadastro da empresa.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [empId]);

    const inc = cadastro?.incorporacao ?? null;
    const usarCadastro = () => {
        if (!inc?.tipo_spe) return;
        const e = estruturaDoCadastro(inc.tipo_spe);
        setCampo('legal_vehicle', e.legal_vehicle);
        setCampo('patrimonio_afetacao', e.patrimonio_afetacao);
    };
    const linhas: [string, string][] = inc ? ([
        ['Tipo', inc.tipo_spe ? TIPO_SPE_LABELS[inc.tipo_spe] : ''],
        ['Registro de incorporação', inc.registro_incorporacao ?? ''],
        ['Cartório', inc.cartorio ?? ''],
        ['Matrículas', (inc.matriculas ?? []).join(', ')],
        ['Alvará de construção', [inc.alvara_construcao, inc.alvara_validade ? `validade ${dataBR(inc.alvara_validade)}` : ''].filter(Boolean).join(' · ')],
        ['Habite-se', [inc.habite_se, inc.habite_se_data ? dataBR(inc.habite_se_data) : ''].filter(Boolean).join(' · ')],
    ] as [string, string][]).filter(([, v]) => v) : [];
    const motivoDoBotao = !pode ? motivo : !inc?.tipo_spe ? 'O cadastro de incorporação da empresa não diz o tipo (SPE, patrimônio de afetação ou SCP).' : undefined;

    let situacao: React.ReactNode = null;
    if (empId) {
        if (carregando) situacao = 'Lendo o cadastro da empresa…';
        else if (erro) situacao = erro;
        else if (cadastro && !cadastro.empresa) situacao = 'O empreendimento vinculado não tem empresa: defina a empresa (SPE) no cadastro do empreendimento para ver a incorporação dela aqui.';
        else if (cadastro && !inc) situacao = `${cadastro.empresa} não tem os dados de incorporação: preencha a aba Incorporação no cadastro da empresa.`;
    }

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-juridico-titulo">
            <div>
                <h2 id="imovib-juridico-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-indigo-500" />
                    Estrutura jurídica
                </h2>
                <p className="text-slate-500 text-sm mt-1">Veículo da incorporação e patrimônio de afetação. O RET só vale com afetação.</p>
            </div>

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="imovib-veiculo" className="block text-xs font-semibold text-slate-500 mb-1.5">Veículo da incorporação</label>
                    <select
                        id="imovib-veiculo"
                        value={formData.legal_vehicle ?? ''}
                        onChange={(e) => setCampo('legal_vehicle', e.target.value || null)}
                        className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                    >
                        <option value="">Não informado</option>
                        {VEICULOS.map(v => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
                    </select>
                </div>
                <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 h-9 text-sm text-slate-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!formData.patrimonio_afetacao}
                            onChange={(e) => setCampo('patrimonio_afetacao', e.target.checked)}
                            className="w-4 h-4 accent-indigo-600"
                        />
                        Patrimônio de afetação
                    </label>
                </div>
            </fieldset>
            {formData.patrimonio_afetacao && (
                <p className="text-xs text-slate-600">
                    Com afetação, a devolução padrão no distrato passa a {IMOVIB_DEFAULTS.cancellation_refund_percent_afetacao}% do pago (Lei 13.786/2018); valor já digitado em Receitas continua valendo.
                </p>
            )}

            {empId && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-700">Cadastro da empresa{cadastro?.empresa ? ` — ${cadastro.empresa}` : ''}</h3>
                        {inc && (
                            <button
                                type="button"
                                onClick={usarCadastro}
                                disabled={!!motivoDoBotao}
                                title={motivoDoBotao}
                                className="h-9 px-3.5 rounded-[6px] border border-indigo-200 text-indigo-700 text-[13px] font-medium hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                Usar o cadastro da empresa
                            </button>
                        )}
                    </div>
                    {situacao && <p className="text-xs text-slate-600">{situacao}</p>}
                    {linhas.length > 0 && (
                        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            {linhas.map(([r, v]) => (
                                <div key={r}>
                                    <dt className="text-xs font-semibold text-slate-500">{r}</dt>
                                    <dd className="text-slate-800">{v}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>
            )}
        </section>
    );
};

export default ImovibEstruturaJuridicaCard;
