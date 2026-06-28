import React from 'react';
import { OpuraMarketCityConfig, OpuraMarketRule } from '../types';

interface CityRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: OpuraMarketCityConfig) => Promise<void>;
  organizationId: string;
  cityId: string;
  cityName: string;
  initialConfig: OpuraMarketCityConfig | null;
}

const DEFAULT_RULES: OpuraMarketRule[] = [
  {
    standard: 'Econômico',
    minPrice: 0,
    maxPrice: 3200,
    tipologias: [
      { tipo: '2 Dorms (Minha Casa Minha Vida)', area: 52, mix: 75 },
      { tipo: '1 Dorm / Studio', area: 38, mix: 25 }
    ]
  },
  {
    standard: 'Médio',
    minPrice: 3200,
    maxPrice: 4300,
    tipologias: [
      { tipo: '2 Dorms c/ Suíte', area: 65, mix: 60 },
      { tipo: '3 Dorms c/ Suíte', area: 80, mix: 40 }
    ]
  },
  {
    standard: 'Médio-Alto',
    minPrice: 4300,
    maxPrice: 5500,
    tipologias: [
      { tipo: '2 Dorms c/ Varanda Gourmet', area: 70, mix: 50 },
      { tipo: '3 Dorms c/ Varanda Gourmet', area: 90, mix: 50 }
    ]
  },
  {
    standard: 'Alto Padrão',
    minPrice: 5500,
    maxPrice: 7500,
    tipologias: [
      { tipo: '3 Suítes Premium', area: 120, mix: 70 },
      { tipo: '4 Suítes Duplex', area: 180, mix: 30 }
    ]
  },
  {
    standard: 'Luxo',
    minPrice: 7500,
    maxPrice: null,
    tipologias: [
      { tipo: '4 Suítes Mansão Suspensa', area: 250, mix: 80 },
      { tipo: 'Cobertura Linear', area: 380, mix: 20 }
    ]
  }
];

export const CityRulesModal: React.FC<CityRulesModalProps> = ({
  isOpen,
  onClose,
  onSave,
  organizationId,
  cityId,
  cityName,
  initialConfig
}) => {
  // Estado para armazenar as regras atuais em edição
  const [rules, setRules] = React.useState<OpuraMarketRule[]>([]);
  const [selectedStandard, setSelectedStandard] = React.useState<OpuraMarketRule['standard']>('Médio');
  const [saving, setSaving] = React.useState(false);

  // Inicializa o estado quando abre o modal ou muda o config inicial
  React.useEffect(() => {
    if (isOpen) {
      if (initialConfig && initialConfig.rules && initialConfig.rules.length > 0) {
        // Clona as regras para evitar mutação direta
        setRules(JSON.parse(JSON.stringify(initialConfig.rules)));
      } else {
        setRules(JSON.parse(JSON.stringify(DEFAULT_RULES)));
      }
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  // Limites de preços
  const getLimits = () => {
    const ecoRule = rules.find(r => r.standard === 'Econômico');
    const medRule = rules.find(r => r.standard === 'Médio');
    const medAltRule = rules.find(r => r.standard === 'Médio-Alto');
    const altoRule = rules.find(r => r.standard === 'Alto Padrão');

    return {
      ecoToMed: ecoRule?.maxPrice || 3200,
      medToMedAlt: medRule?.maxPrice || 4300,
      medAltToAlto: medAltRule?.maxPrice || 5500,
      altoToLuxo: altoRule?.maxPrice || 7500
    };
  };

  const limits = getLimits();

  // Atualiza os limites e reconstrói as faixas de min/max dos padrões correspondentes
  const handleLimitChange = (limitKey: 'ecoToMed' | 'medToMedAlt' | 'medAltToAlto' | 'altoToLuxo', val: number) => {
    setRules(prevRules => {
      const copy = JSON.parse(JSON.stringify(prevRules)) as OpuraMarketRule[];
      const eco = copy.find(r => r.standard === 'Econômico');
      const med = copy.find(r => r.standard === 'Médio');
      const medAlt = copy.find(r => r.standard === 'Médio-Alto');
      const alto = copy.find(r => r.standard === 'Alto Padrão');
      const luxo = copy.find(r => r.standard === 'Luxo');

      if (limitKey === 'ecoToMed') {
        if (eco) eco.maxPrice = val;
        if (med) med.minPrice = val;
      } else if (limitKey === 'medToMedAlt') {
        if (med) med.maxPrice = val;
        if (medAlt) medAlt.minPrice = val;
      } else if (limitKey === 'medAltToAlto') {
        if (medAlt) medAlt.maxPrice = val;
        if (alto) alto.minPrice = val;
      } else if (limitKey === 'altoToLuxo') {
        if (alto) alto.maxPrice = val;
        if (luxo) luxo.minPrice = val;
      }

      return copy;
    });
  };

  // Funções para gerenciar tipologias de um padrão selecionado
  const activeRule = rules.find(r => r.standard === selectedStandard);
  const mixSum = activeRule ? activeRule.tipologias.reduce((sum, t) => sum + t.mix, 0) : 0;

  const handleUpdateTipologia = (index: number, key: 'tipo' | 'area' | 'mix', value: any) => {
    setRules(prevRules => {
      const copy = JSON.parse(JSON.stringify(prevRules)) as OpuraMarketRule[];
      const rule = copy.find(r => r.standard === selectedStandard);
      if (rule && rule.tipologias[index]) {
        if (key === 'tipo') {
          rule.tipologias[index].tipo = value;
        } else if (key === 'area') {
          rule.tipologias[index].area = Number(value);
        } else if (key === 'mix') {
          rule.tipologias[index].mix = Number(value);
        }
      }
      return copy;
    });
  };

  const handleAddTipologia = () => {
    setRules(prevRules => {
      const copy = JSON.parse(JSON.stringify(prevRules)) as OpuraMarketRule[];
      const rule = copy.find(r => r.standard === selectedStandard);
      if (rule) {
        rule.tipologias.push({ tipo: 'Nova Tipologia', area: 60, mix: 0 });
      }
      return copy;
    });
  };

  const handleRemoveTipologia = (index: number) => {
    setRules(prevRules => {
      const copy = JSON.parse(JSON.stringify(prevRules)) as OpuraMarketRule[];
      const rule = copy.find(r => r.standard === selectedStandard);
      if (rule) {
        rule.tipologias.splice(index, 1);
      }
      return copy;
    });
  };

  // Restaura regras padrão
  const handleRestoreDefaults = () => {
    if (window.confirm('Tem certeza que deseja restaurar as regras padrões desta cidade? Todas as suas alterações locais serão perdidas.')) {
      setRules(JSON.parse(JSON.stringify(DEFAULT_RULES)));
    }
  };

  // Salvar
  const handleSave = async () => {
    // 1. Validações de faixas de preço/m²
    if (limits.ecoToMed <= 0) {
      alert('A transição de Econômico para Médio deve ser maior que R$ 0.');
      return;
    }
    if (limits.medToMedAlt <= limits.ecoToMed) {
      alert('A transição de Médio para Médio-Alto deve ser maior que a transição anterior.');
      return;
    }
    if (limits.medAltToAlto <= limits.medToMedAlt) {
      alert('A transição de Médio-Alto para Alto Padrão deve ser maior que a transição anterior.');
      return;
    }
    if (limits.altoToLuxo <= limits.medAltToAlto) {
      alert('A transição de Alto Padrão para Luxo deve ser maior que a transição anterior.');
      return;
    }

    // 2. Validações de mix de tipologias por padrão construtivo
    for (const r of rules) {
      if (r.tipologias.length === 0) {
        alert(`O padrão "${r.standard}" deve conter pelo menos uma tipologia cadastrada.`);
        return;
      }

      const sum = r.tipologias.reduce((s, t) => s + t.mix, 0);
      if (sum !== 100) {
        alert(`A soma das porcentagens do Mix para o padrão "${r.standard}" deve ser exatamente igual a 100%. (Soma atual: ${sum}%)`);
        return;
      }

      for (const t of r.tipologias) {
        if (!t.tipo.trim()) {
          alert(`As tipologias do padrão "${r.standard}" não podem ter nomes vazios.`);
          return;
        }
        if (t.area <= 0) {
          alert(`A metragem da tipologia "${t.tipo}" no padrão "${r.standard}" deve ser maior que zero.`);
          return;
        }
        if (t.mix < 0 || t.mix > 100) {
          alert(`A porcentagem da tipologia "${t.tipo}" no padrão "${r.standard}" deve estar entre 0% e 100%.`);
          return;
        }
      }
    }

    try {
      setSaving(true);
      await onSave({
        organizationId,
        cityId,
        rules
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar configurações de vocação da praça: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider">
              ⚙️ Regras de Vocação Imobiliária
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              Cidade: <span className="text-white font-bold">{cityName}</span>
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Alerta explicativo */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl flex items-start gap-3 text-xs">
            <span className="text-base">💡</span>
            <div>
              <p className="font-bold text-indigo-900">Como funciona a inteligência de vocação?</p>
              <p className="text-indigo-700/80 leading-relaxed mt-0.5">
                Defina os limites de preço/m² que separam cada padrão construtivo na praça de <strong>{cityName}</strong>. 
                Quando você realizar análises de terrenos, o sistema irá classificar o padrão do produto com base no preço de oferta da concorrência mapeada e aplicar as tipologias de mix sugeridas por você para calcular o VGV Potencial.
              </p>
            </div>
          </div>

          {/* Seção de Limites de Preço/m² */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1.5">
              Limites de Transição por Padrão Construtivo (R$ / m²)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Econômico ➜ Médio
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 text-[11px]">R$</span>
                  </div>
                  <input
                    type="number"
                    value={limits.ecoToMed}
                    onChange={(e) => handleLimitChange('ecoToMed', Number(e.target.value))}
                    className="block w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="3200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Médio ➜ Médio-Alto
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 text-[11px]">R$</span>
                  </div>
                  <input
                    type="number"
                    value={limits.medToMedAlt}
                    onChange={(e) => handleLimitChange('medToMedAlt', Number(e.target.value))}
                    className="block w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="4300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Médio-Alto ➜ Alto Padrão
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 text-[11px]">R$</span>
                  </div>
                  <input
                    type="number"
                    value={limits.medAltToAlto}
                    onChange={(e) => handleLimitChange('medAltToAlto', Number(e.target.value))}
                    className="block w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="5500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Alto Padrão ➜ Luxo
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 text-[11px]">R$</span>
                  </div>
                  <input
                    type="number"
                    value={limits.altoToLuxo}
                    onChange={(e) => handleLimitChange('altoToLuxo', Number(e.target.value))}
                    className="block w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="7500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Abas e Mix de Tipologias */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1.5">
              Personalização do Mix de Tipologias Recomendadas
            </h4>

            {/* Abas dos Padrões */}
            <div className="flex flex-wrap gap-2">
              {rules.map((r) => {
                const sum = r.tipologias.reduce((s, t) => s + t.mix, 0);
                const isOk = sum === 100;
                
                let tabBorder = 'border-slate-200';
                let tabBg = 'bg-white text-slate-600 hover:bg-slate-50';
                if (selectedStandard === r.standard) {
                  tabBorder = 'border-indigo-600';
                  tabBg = 'bg-indigo-600 text-white';
                }

                // Faixa descritiva de preço
                let descPrice = '';
                if (r.standard === 'Econômico') descPrice = `Até R$ ${r.maxPrice}/m²`;
                else if (r.standard === 'Luxo') descPrice = `A partir de R$ ${r.minPrice}/m²`;
                else descPrice = `R$ ${r.minPrice} - ${r.maxPrice}/m²`;

                return (
                  <button
                    key={r.standard}
                    onClick={() => setSelectedStandard(r.standard)}
                    className={`px-4 py-2.5 rounded-2xl border text-button font-bold transition-all text-left flex items-center gap-2.5 ${tabBorder} ${tabBg}`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{r.standard}</span>
                        <span 
                          className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          title={isOk ? 'Soma do mix é 100%' : `Soma do mix incorreta (${sum}%)`}
                        />
                      </div>
                      <div className={`text-[9px] mt-0.5 ${selectedStandard === r.standard ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {descPrice}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Editor de Tipologias do Padrão Selecionado */}
            {activeRule && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Tipologias para o Padrão {activeRule.standard}
                    </span>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      Adicione as tipologias de venda e distribua a porcentagem que cada uma representa.
                    </p>
                  </div>

                  {/* Status da soma */}
                  <div className={`px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                    mixSum === 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    <span>{mixSum === 100 ? '✓' : '⚠️'}</span>
                    <span>Soma do Mix: {mixSum}%</span>
                  </div>
                </div>

                {/* Lista */}
                <div className="p-5 space-y-3">
                  {activeRule.tipologias.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                      Nenhuma tipologia cadastrada para este padrão. Clique abaixo para adicionar.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="hidden md:grid grid-cols-12 gap-3 text-[10px] font-black uppercase text-slate-400 tracking-wider px-3">
                        <div className="col-span-6">Nome da Tipologia / Descrição</div>
                        <div className="col-span-3">Área Privativa (m²)</div>
                        <div className="col-span-2">Mix Recomendado (%)</div>
                        <div className="col-span-1 text-center">Ações</div>
                      </div>

                      {activeRule.tipologias.map((t, index) => (
                        <div 
                          key={index}
                          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center p-3 border border-slate-100 rounded-xl hover:bg-slate-50/20 text-xs transition-colors"
                        >
                          {/* Nome */}
                          <div className="col-span-1 md:col-span-6">
                            <label className="block md:hidden text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                              Nome da Tipologia
                            </label>
                            <input
                              type="text"
                              value={t.tipo}
                              onChange={(e) => handleUpdateTipologia(index, 'tipo', e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              placeholder="Ex: 2 Dorms c/ Suíte"
                            />
                          </div>

                          {/* Área */}
                          <div className="col-span-1 md:col-span-3">
                            <label className="block md:hidden text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                              Área Privativa (m²)
                            </label>
                            <div className="relative rounded-lg shadow-sm">
                              <input
                                type="number"
                                value={t.area}
                                onChange={(e) => handleUpdateTipologia(index, 'area', e.target.value)}
                                className="w-full pr-8 pl-3 py-2 border border-slate-200 rounded-lg text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                placeholder="65"
                              />
                              <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                                <span className="text-[10px] text-slate-400 font-bold">m²</span>
                              </div>
                            </div>
                          </div>

                          {/* Mix */}
                          <div className="col-span-1 md:col-span-2">
                            <label className="block md:hidden text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                              Mix Recomendado (%)
                            </label>
                            <div className="relative rounded-lg shadow-sm">
                              <input
                                type="number"
                                value={t.mix}
                                onChange={(e) => handleUpdateTipologia(index, 'mix', e.target.value)}
                                className="w-full pr-6 pl-3 py-2 border border-slate-200 rounded-lg text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                placeholder="60"
                              />
                              <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                                <span className="text-[10px] text-slate-400 font-bold">%</span>
                              </div>
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="col-span-1 md:col-span-1 text-center mt-2 md:mt-0">
                            <button
                              onClick={() => handleRemoveTipologia(index)}
                              className="text-rose-500 hover:text-rose-600 font-black text-[10px] uppercase tracking-wider py-1.5 px-3 md:p-1 md:hover:bg-rose-50 rounded-lg transition-colors border border-rose-100 md:border-0"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botão de Adicionar */}
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={handleAddTipologia}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-indigo-600 rounded-xl text-button font-black uppercase tracking-wider transition-all"
                    >
                      ➕ Adicionar Tipologia
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between">
          <button
            onClick={handleRestoreDefaults}
            className="px-4 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-button font-black uppercase tracking-wider transition-all"
            disabled={saving}
          >
            🔄 Restaurar Padrões
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-button font-black uppercase tracking-wider transition-all"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all shadow-md active:scale-98 flex items-center gap-2"
              disabled={saving}
            >
              {saving ? 'Salvando...' : '💾 Salvar Regras da Praça'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
