import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { masterDataService, MasterCity, MasterState } from '../services/masterDataService';

/**
 * Seleção em cascata Estado → Cidade contra os dados mestres (master_states / master_cities).
 *
 * - Cidade é um combobox: digitar filtra; selecionar grava o nome canônico.
 * - Estado é um select dos 27 UFs (BR).
 * - Suporta CEP autofill via ViaCEP: ao informar CEP válido, popula UF e cidade automaticamente.
 *
 * Uso (controlled):
 *   <CityStateSelect
 *     cep={form.cep}
 *     stateCode={form.uf}
 *     cityName={form.cidade}
 *     onChange={({ cep, stateCode, cityName }) => setForm({ ...form, cep, uf: stateCode, cidade: cityName })}
 *   />
 */
export interface CityStateValue {
  cep?: string;
  stateCode?: string;   // 'SP'
  cityName?: string;    // 'São Paulo'
}

export interface ViaCepData {
  logradouro?: string;
  bairro?: string;
  uf?: string;
  localidade?: string;
}

interface Props extends CityStateValue {
  onChange: (next: CityStateValue) => void;
  /** Callback opcional para receber dados crus da ViaCEP (rua, bairro) e preencher campos extras. */
  onCepLookup?: (data: ViaCepData) => void;
  required?: boolean;
  showCep?: boolean;
  className?: string;
  labelCls?: string;
  inputCls?: string;
}

const DEFAULT_INPUT = 'w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white';
const DEFAULT_LABEL = 'block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1';

const CityStateSelect: React.FC<Props> = ({
  cep, stateCode, cityName,
  onChange, onCepLookup, required, showCep = true,
  className = '', labelCls = DEFAULT_LABEL, inputCls = DEFAULT_INPUT,
}) => {
  const [states, setStates] = useState<MasterState[]>([]);
  const [cities, setCities] = useState<MasterCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // Carrega UFs uma vez
  useEffect(() => { masterDataService.listStates('BR').then(setStates); }, []);

  // Carrega cidades quando UF muda
  const selectedState = useMemo(
    () => states.find(s => s.code === stateCode),
    [states, stateCode],
  );
  useEffect(() => {
    if (!selectedState) { setCities([]); return; }
    setLoadingCities(true);
    masterDataService.listCities(selectedState.id)
      .then(setCities)
      .finally(() => setLoadingCities(false));
  }, [selectedState]);

  // CEP autofill
  const handleCepChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    onChange({ cep: formatted, stateCode, cityName });

    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          // ViaCEP retorna 'uf' e 'localidade'
          onChange({
            cep: formatted,
            stateCode: data.uf,
            cityName: data.localidade,
          });
          onCepLookup?.(data);
        }
      } catch {
        // Ignora — usuário ainda pode preencher manualmente
      } finally {
        setCepLoading(false);
      }
    }
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-6 gap-3 ${className}`}>
      {showCep && (
        <div className="md:col-span-2">
          <label className={labelCls}>CEP</label>
          <div className="relative">
            <input
              value={cep ?? ''}
              onChange={e => handleCepChange(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              inputMode="numeric"
              className={inputCls}
            />
            {cepLoading && (
              <Loader2 className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>
        </div>
      )}

      <div className={showCep ? 'md:col-span-1' : 'md:col-span-1'}>
        <label className={labelCls}>UF{required && <span className="text-red-500 ml-1">*</span>}</label>
        <select
          value={stateCode ?? ''}
          onChange={e => onChange({ cep, stateCode: e.target.value || undefined, cityName: undefined })}
          required={required}
          className={inputCls}
        >
          <option value="">—</option>
          {states.map(s => (
            <option key={s.id} value={s.code}>{s.code}</option>
          ))}
        </select>
      </div>

      <div className={showCep ? 'md:col-span-3' : 'md:col-span-5'}>
        <label className={labelCls}>
          Cidade{required && <span className="text-red-500 ml-1">*</span>}
          {selectedState && !loadingCities && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              <MapPin className="inline w-3 h-3" /> {cities.length} disponíveis
            </span>
          )}
        </label>
        <input
          list={`cities-${stateCode || 'none'}`}
          value={cityName ?? ''}
          onChange={e => onChange({ cep, stateCode, cityName: e.target.value })}
          placeholder={selectedState ? 'Digite para buscar...' : 'Selecione a UF primeiro'}
          disabled={!selectedState || loadingCities}
          required={required}
          className={inputCls}
        />
        <datalist id={`cities-${stateCode || 'none'}`}>
          {cities.map(c => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </div>
    </div>
  );
};

export default CityStateSelect;
