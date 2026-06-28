import React, { useEffect, useMemo, useState } from 'react';
import { Search, Globe, MapPin, Building2, Ruler, Loader2, Plus, X, AlertCircle } from 'lucide-react';
import {
  masterDataService,
  MasterBank, MasterCity, MasterCountry, MasterState, MasterUnit,
} from '../services/masterDataService';

type Tab = 'geo' | 'banks' | 'units';

const MasterDataBrowser: React.FC = () => {
  const [tab, setTab] = useState<Tab>('geo');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-slate-800">Dados Mestres</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cadastros globais reutilizados em todo o sistema (somente leitura nesta fase).
        </p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 mb-6">
        <TabButton active={tab === 'geo'}   onClick={() => setTab('geo')}   icon={<MapPin className="w-4 h-4" />}     label="Geografia" />
        <TabButton active={tab === 'banks'} onClick={() => setTab('banks')} icon={<Building2 className="w-4 h-4" />}  label="Bancos" />
        <TabButton active={tab === 'units'} onClick={() => setTab('units')} icon={<Ruler className="w-4 h-4" />}      label="Unidades" />
      </nav>

      {tab === 'geo'   && <GeoPanel />}
      {tab === 'banks' && <BanksPanel />}
      {tab === 'units' && <UnitsPanel />}
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> =
  ({ active, onClick, icon, label }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {icon}{label}
    </button>
  );

// -----------------------------------------------------------------------------
// GEO
// -----------------------------------------------------------------------------
const GeoPanel: React.FC = () => {
  const [countries, setCountries] = useState<MasterCountry[]>([]);
  const [states, setStates] = useState<MasterState[]>([]);
  const [cities, setCities] = useState<MasterCity[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(MasterCity & { state_code?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    Promise.all([masterDataService.listCountries(), masterDataService.listStates('BR')])
      .then(([c, s]) => { setCountries(c); setStates(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedState) { setCities([]); return; }
    masterDataService.listCities(selectedState).then(setCities);
  }, [selectedState]);

  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      masterDataService.searchCities(query).then(setSearchResults);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <Section title={`Países (${countries.length})`} icon={<Globe className="w-4 h-4" />}>
        <div className="flex flex-wrap gap-2">
          {countries.map(c => (
            <span key={c.id} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
              <strong>{c.iso2}</strong> · {c.name_pt} {c.ddi && `(+${c.ddi})`}
            </span>
          ))}
        </div>
      </Section>

      <Section title={`Estados BR (${states.length})`} icon={<MapPin className="w-4 h-4" />}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {states.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedState(s.id)}
              className={`text-left px-3 py-2 rounded text-button font-semibold border transition ${
                selectedState === s.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400'
              }`}
            >
              <div className="font-black">{s.code}</div>
              <div className="opacity-75">{s.name}</div>
              <div className="text-xs opacity-60">{s.region}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Busca de cidades"
        icon={<Search className="w-4 h-4" />}
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Digite ao menos 2 letras..."
                className="w-64 pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded"
              />
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-button font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700"
              title="Disponível apenas para administradores"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          </div>
        }
      >
        {query.trim().length >= 2 ? (
          <ul className="text-sm divide-y divide-slate-100">
            {searchResults.length === 0 && (
              <li className="text-slate-400 italic py-2">Sem resultados.</li>
            )}
            {searchResults.map(c => (
              <li key={c.id} className="py-1.5 flex justify-between">
                <span>{c.name} <span className="text-slate-400">/{c.state_code}</span></span>
                <span className="text-xs text-slate-400">IBGE {c.ibge_code}</span>
              </li>
            ))}
          </ul>
        ) : selectedState ? (
          <ul className="text-sm divide-y divide-slate-100">
            {cities.length === 0 && (
              <li className="text-slate-400 italic py-2">Apenas a capital deste estado está semeada. Use a busca acima ou aguarde a carga IBGE completa.</li>
            )}
            {cities.map(c => (
              <li key={c.id} className="py-1.5 flex justify-between">
                <span>{c.name} {c.is_capital && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded ml-1">capital</span>}</span>
                <span className="text-xs text-slate-400">IBGE {c.ibge_code}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic">Selecione um estado acima ou use a busca.</p>
        )}
      </Section>

      {showAddModal && (
        <AddCityModal
          states={states}
          defaultStateId={selectedState}
          onClose={() => setShowAddModal(false)}
          onAdded={city => {
            setShowAddModal(false);
            if (city.state_id === selectedState) {
              setCities(prev => [...prev, city].sort((a, b) => a.name.localeCompare(b.name)));
            }
          }}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Modal: adicionar cidade (RPC valida admin server-side)
// -----------------------------------------------------------------------------
const AddCityModal: React.FC<{
  states: MasterState[];
  defaultStateId?: string;
  onClose: () => void;
  onAdded: (city: MasterCity) => void;
}> = ({ states, defaultStateId, onClose, onAdded }) => {
  const [stateId, setStateId] = useState(defaultStateId || '');
  const [name, setName] = useState('');
  const [ibgeCode, setIbgeCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!stateId) { setError('Selecione o estado.'); return; }
    if (name.trim().length < 2) { setError('Nome inválido.'); return; }
    setSaving(true);
    try {
      const city = await masterDataService.addCity({
        state_id: stateId,
        name: name.trim(),
        ibge_code: ibgeCode ? parseInt(ibgeCode, 10) : null,
      });
      onAdded(city);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao adicionar cidade.';
      setError(msg.includes('administradores') ? 'Apenas administradores podem adicionar cidades.' : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800">Adicionar cidade</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 -mt-2">
          Use para distritos/povoados que o IBGE não cobre. Para municípios oficiais, rode a carga IBGE.
        </p>

        <div>
          <label className="block text-form-label font-bold uppercase tracking-wider text-slate-500 mb-1">Estado *</label>
          <select
            value={stateId}
            onChange={e => setStateId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            required
          >
            <option value="">— selecione —</option>
            {states.map(s => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-form-label font-bold uppercase tracking-wider text-slate-500 mb-1">Nome *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ex: Distrito de Cocais"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            required
            minLength={2}
          />
        </div>

        <div>
          <label className="block text-form-label font-bold uppercase tracking-wider text-slate-500 mb-1">
            Código IBGE (opcional)
          </label>
          <input
            value={ibgeCode}
            onChange={e => setIbgeCode(e.target.value.replace(/\D/g, ''))}
            placeholder="ex: 3550308"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono"
            maxLength={7}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Adicionar
          </button>
        </div>
      </form>
    </div>
  );
};

// -----------------------------------------------------------------------------
// BANCOS
// -----------------------------------------------------------------------------
const BanksPanel: React.FC = () => {
  const [banks, setBanks] = useState<MasterBank[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterDataService.listBanks().then(setBanks).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return banks;
    const q = query.toLowerCase();
    return banks.filter(b =>
      b.code.includes(q) ||
      b.name.toLowerCase().includes(q) ||
      (b.short_name || '').toLowerCase().includes(q)
    );
  }, [banks, query]);

  if (loading) return <Spinner />;

  return (
    <Section
      title={`Bancos BACEN (${filtered.length}/${banks.length})`}
      icon={<Building2 className="w-4 h-4" />}
      right={
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar código ou nome..."
          className="w-64 px-3 py-1.5 text-sm border border-slate-300 rounded"
        />
      }
    >
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
          <tr>
            <th className="text-left py-2 font-bold">Código</th>
            <th className="text-left py-2 font-bold">Nome</th>
            <th className="text-left py-2 font-bold">Apelido</th>
            <th className="text-left py-2 font-bold">ISPB (PIX)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.map(b => (
            <tr key={b.id}>
              <td className="py-1.5 font-mono font-bold">{b.code}</td>
              <td className="py-1.5">{b.name}</td>
              <td className="py-1.5 text-slate-500">{b.short_name}</td>
              <td className="py-1.5 font-mono text-table-body text-slate-400">{b.ispb}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
};

// -----------------------------------------------------------------------------
// UNIDADES
// -----------------------------------------------------------------------------
const UnitsPanel: React.FC = () => {
  const [units, setUnits] = useState<MasterUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterDataService.listUnits().then(setUnits).finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, MasterUnit[]>();
    for (const u of units) {
      if (!map.has(u.category)) map.set(u.category, []);
      map.get(u.category)!.push(u);
    }
    return Array.from(map.entries());
  }, [units]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {grouped.map(([cat, list]) => (
        <Section key={cat} title={`${cat} (${list.length})`} icon={<Ruler className="w-4 h-4" />}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {list.map(u => (
              <div key={u.id} className="px-3 py-2 rounded border border-slate-200 bg-white text-sm">
                <div className="font-black text-indigo-700">{u.symbol}</div>
                <div className="text-xs text-slate-600">{u.name}</div>
                {u.base_factor != null && u.base_symbol && (
                  <div className="text-xs text-slate-400 mt-1">
                    = {u.base_factor} {u.base_symbol}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
};

// -----------------------------------------------------------------------------
const Section: React.FC<{ title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> =
  ({ title, icon, right, children }) => (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
          {icon}{title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );

const Spinner: React.FC = () => (
  <div className="flex justify-center py-12">
    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
  </div>
);

export default MasterDataBrowser;
