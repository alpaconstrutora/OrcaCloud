import React, { useEffect, useMemo, useState } from 'react';
import { Globe, MapPin, Building2, Ruler, Loader2, Plus, X, AlertCircle } from 'lucide-react';
import {
  masterDataService,
  MasterBank, MasterCity, MasterCountry, MasterState, MasterUnit,
} from '../services/masterDataService';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import TabsBar from './ui/TabsBar';
import { FilterPopover } from './ui/FilterPopover';
import { usePersistedState } from './ui/TableUtils';

type Tab = 'geo' | 'banks' | 'units';

// Título e subtítulo acompanham a aba ativa (§19.1 / §20).
const VIEW_HEADERS: Record<Tab, { title: string; subtitle: string }> = {
  geo:   { title: 'Dados Mestres · Geografia', subtitle: 'Países, estados e municípios reutilizados em todo o sistema (somente leitura nesta fase).' },
  banks: { title: 'Dados Mestres · Bancos',    subtitle: 'Bancos do cadastro BACEN, com código COMPE e ISPB do PIX (somente leitura nesta fase).' },
  units: { title: 'Dados Mestres · Unidades',  subtitle: 'Unidades de medida e fatores de conversão para a unidade base (somente leitura nesta fase).' },
};

const TABS = [
  { id: 'geo' as Tab,   label: 'Geografia', icon: <MapPin className="w-4 h-4" /> },
  { id: 'banks' as Tab, label: 'Bancos',    icon: <Building2 className="w-4 h-4" /> },
  { id: 'units' as Tab, label: 'Unidades',  icon: <Ruler className="w-4 h-4" /> },
];

// Tipografia de célula (§7): texto padrão e texto atenuado.
const TXT = 'text-sm font-normal text-gray-700';
const TXT_MUTED = 'text-sm font-normal text-gray-600';

const MasterDataBrowser: React.FC = () => {
  const [tab, setTab] = usePersistedState<Tab>('masterData:tab', 'geo');
  const header = VIEW_HEADERS[tab] ?? VIEW_HEADERS.geo;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.title}</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitle}</p>
      </div>

      <TabsBar tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'geo'   && <GeoPanel />}
      {tab === 'banks' && <BanksPanel />}
      {tab === 'units' && <UnitsPanel />}
    </div>
  );
};

// -----------------------------------------------------------------------------
// GEO — países, estados e cidades: três tabelas sob sub-abas acopladas (§19.1)
// -----------------------------------------------------------------------------
type GeoLevel = 'countries' | 'states' | 'cities';
type CityRow = MasterCity & { state_code?: string };

const COUNTRY_COLUMNS: StandardTableColumn[] = [
  { key: 'iso2',     label: 'ISO2',     sortable: true, width: 90 },
  { key: 'iso3',     label: 'ISO3',     sortable: true, width: 90 },
  { key: 'name_pt',  label: 'País',     sortable: true, width: 260 },
  { key: 'name',     label: 'Nome (EN)', sortable: true, width: 220 },
  { key: 'ddi',      label: 'DDI',      sortable: true, width: 90 },
  { key: 'currency', label: 'Moeda',    sortable: true, width: 100 },
];

const STATE_COLUMNS: StandardTableColumn[] = [
  { key: 'code',   label: 'UF',          sortable: true, width: 80 },
  { key: 'name',   label: 'Estado',      sortable: true, width: 240 },
  { key: 'region', label: 'Região',      sortable: true, width: 160 },
  { key: 'ibge',   label: 'Código IBGE', sortable: true, width: 130 },
];

const CITY_COLUMNS: StandardTableColumn[] = [
  { key: 'name',    label: 'Cidade',      sortable: true, width: 280 },
  { key: 'uf',      label: 'UF',          sortable: true, width: 80 },
  { key: 'ibge',    label: 'Código IBGE', sortable: true, width: 130 },
  { key: 'capital', label: 'Capital',     sortable: true, width: 100 },
];

const GeoPanel: React.FC = () => {
  const [countries, setCountries] = useState<MasterCountry[]>([]);
  const [states, setStates] = useState<MasterState[]>([]);
  const [cities, setCities] = useState<MasterCity[]>([]);
  const [cityMatches, setCityMatches] = useState<CityRow[]>([]);
  const [level, setLevel] = usePersistedState<GeoLevel>('masterData:geo:level', 'countries');
  const [selectedState, setSelectedState] = usePersistedState<string>('masterData:geo:state', '');
  const [query, setQuery] = usePersistedState<string>('masterData:geo:citySearch', '');
  const [loading, setLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    Promise.all([masterDataService.listCountries(), masterDataService.listStates('BR')])
      .then(([c, s]) => { setCountries(c); setStates(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedState) { setCities([]); return; }
    setCitiesLoading(true);
    masterDataService.listCities(selectedState).then(setCities).finally(() => setCitiesLoading(false));
  }, [selectedState]);

  // Sem estado escolhido, a busca vai ao servidor (o cadastro de cidades é grande demais para carregar inteiro).
  useEffect(() => {
    if (selectedState || query.trim().length < 2) { setCityMatches([]); return; }
    setCitiesLoading(true);
    const t = setTimeout(() => {
      masterDataService.searchCities(query).then(setCityMatches).finally(() => setCitiesLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, selectedState]);

  const stateById = useMemo(() => new Map(states.map(s => [s.id, s])), [states]);
  const cityRows: CityRow[] = useMemo(
    () => (selectedState
      ? cities.map(c => ({ ...c, state_code: stateById.get(c.state_id)?.code }))
      : cityMatches),
    [selectedState, cities, cityMatches, stateById],
  );

  const stateOptions = useMemo(
    () => [{ value: '', label: 'Todos' }, ...states.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))],
    [states],
  );

  const subTabs = (
    <TabsBar
      bare
      value={level}
      onChange={setLevel}
      tabs={[
        { id: 'countries' as GeoLevel, label: 'Países',  icon: <Globe className="w-4 h-4" />,  badge: countries.length },
        { id: 'states' as GeoLevel,    label: 'Estados', icon: <MapPin className="w-4 h-4" />, badge: states.length },
        { id: 'cities' as GeoLevel,    label: 'Cidades', icon: <Building2 className="w-4 h-4" /> },
      ]}
    />
  );

  return (
    <>
      {level === 'countries' && (
        <StandardTable<MasterCountry>
          storageKey="masterData:countries"
          columns={COUNTRY_COLUMNS}
          rows={countries}
          rowKey={c => c.id}
          loading={loading}
          toolbarTop={subTabs}
          searchPlaceholder="Buscar por país, ISO ou DDI..."
          searchText={c => `${c.iso2} ${c.iso3} ${c.name_pt} ${c.name} ${c.ddi ?? ''}`}
          sortValue={(key, c) => key === 'currency' ? c.currency_code : key === 'name' ? c.name : (c as unknown as Record<string, string | undefined>)[key]}
          renderCell={(key, c) => {
            switch (key) {
              case 'iso2': return <span className={TXT}>{c.iso2}</span>;
              case 'iso3': return <span className={TXT_MUTED}>{c.iso3}</span>;
              case 'name_pt': return <span className={`block truncate ${TXT}`} title={c.name_pt}>{c.name_pt}</span>;
              case 'name': return <span className={`block truncate ${TXT_MUTED}`} title={c.name}>{c.name}</span>;
              case 'ddi': return <span className={TXT_MUTED}>{c.ddi ? `+${c.ddi}` : '—'}</span>;
              default: return <span className={TXT_MUTED}>{c.currency_code || '—'}</span>;
            }
          }}
          empty={{ icon: <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum país encontrado' }}
        />
      )}

      {level === 'states' && (
        <StandardTable<MasterState>
          storageKey="masterData:states"
          columns={STATE_COLUMNS}
          rows={states}
          rowKey={s => s.id}
          loading={loading}
          toolbarTop={subTabs}
          searchPlaceholder="Buscar por UF, estado ou região..."
          searchText={s => `${s.code} ${s.name} ${s.region ?? ''} ${s.ibge_code ?? ''}`}
          sortValue={(key, s) => key === 'ibge' ? s.ibge_code : (s as unknown as Record<string, string | undefined>)[key]}
          renderCell={(key, s) => {
            switch (key) {
              case 'code': return <span className={TXT}>{s.code}</span>;
              case 'name': return <span className={TXT}>{s.name}</span>;
              case 'region': return <span className={TXT_MUTED}>{s.region || '—'}</span>;
              default: return <span className={TXT_MUTED}>{s.ibge_code ?? '—'}</span>;
            }
          }}
          onRowClick={s => { setSelectedState(s.id); setLevel('cities'); }}
          empty={{ icon: <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum estado encontrado' }}
        />
      )}

      {level === 'cities' && (
        <StandardTable<CityRow>
          storageKey="masterData:cities"
          columns={CITY_COLUMNS}
          rows={cityRows}
          rowKey={c => c.id}
          loading={loading || citiesLoading}
          toolbarTop={subTabs}
          searchPlaceholder={selectedState ? 'Buscar cidade neste estado...' : 'Digite ao menos 2 letras para buscar cidades...'}
          // Busca controlada (persistida acima): sem estado escolhida ela vai ao servidor, e só com
          // estado escolhido há lista local para filtrar — por isso `searchText` condicional.
          search={query}
          onSearchChange={setQuery}
          searchText={selectedState ? (c => `${c.name} ${c.ibge_code ?? ''}`) : undefined}
          sortValue={(key, c) => key === 'uf' ? c.state_code : key === 'ibge' ? c.ibge_code : key === 'capital' ? c.is_capital : c.name}
          filters={
            <FilterPopover<string> label="Estado" value={selectedState} onChange={setSelectedState} options={stateOptions} />
          }
          toolbarRight={
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
              title="Disponível apenas para administradores"
            >
              <Plus className="w-[15px] h-[15px]" />
              Adicionar cidade
            </button>
          }
          renderCell={(key, c) => {
            switch (key) {
              case 'name': return <span className={`block truncate ${TXT}`} title={c.name}>{c.name}</span>;
              case 'uf': return <span className={TXT_MUTED}>{c.state_code || '—'}</span>;
              case 'ibge': return <span className={TXT_MUTED}>{c.ibge_code ?? '—'}</span>;
              default: return <span className={TXT_MUTED}>{c.is_capital ? 'Sim' : '—'}</span>;
            }
          }}
          empty={
            selectedState
              ? { icon: <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma cidade neste estado', subtitle: 'Apenas a capital deste estado está semeada. Use a busca sem filtro de estado ou aguarde a carga IBGE completa.' }
              : query.trim().length >= 2
                ? { icon: <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Sem resultados', subtitle: 'Nenhuma cidade encontrada para essa busca.' }
                : { icon: <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Selecione um estado ou busque uma cidade', subtitle: 'Use o filtro Estado ou digite ao menos 2 letras na busca.' }
          }
        />
      )}

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
    </>
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
const BANK_COLUMNS: StandardTableColumn[] = [
  { key: 'code',       label: 'Código',     sortable: true, width: 100 },
  { key: 'name',       label: 'Nome',       sortable: true, width: 360 },
  { key: 'short_name', label: 'Apelido',    sortable: true, width: 200 },
  { key: 'ispb',       label: 'ISPB (PIX)', sortable: true, width: 130 },
  { key: 'pix',        label: 'PIX',        sortable: true, width: 80 },
];

const BanksPanel: React.FC = () => {
  const [banks, setBanks] = useState<MasterBank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterDataService.listBanks().then(setBanks).finally(() => setLoading(false));
  }, []);

  return (
    <StandardTable<MasterBank>
      storageKey="masterData:banks"
      columns={BANK_COLUMNS}
      rows={banks}
      rowKey={b => b.id}
      loading={loading}
      searchPlaceholder="Buscar por código, nome ou apelido..."
      searchText={b => `${b.code} ${b.name} ${b.short_name ?? ''} ${b.ispb ?? ''}`}
      sortValue={(key, b) => key === 'pix' ? b.pix_enabled : key === 'ispb' ? b.ispb : key === 'short_name' ? b.short_name : key === 'name' ? b.name : b.code}
      renderCell={(key, b) => {
        switch (key) {
          case 'code': return <span className={TXT}>{b.code}</span>;
          case 'name': return <span className={`block truncate ${TXT}`} title={b.name}>{b.name}</span>;
          case 'short_name': return <span className={`block truncate ${TXT_MUTED}`} title={b.short_name}>{b.short_name || '—'}</span>;
          case 'ispb': return <span className={TXT_MUTED}>{b.ispb || '—'}</span>;
          default: return <span className={TXT_MUTED}>{b.pix_enabled ? 'Sim' : 'Não'}</span>;
        }
      }}
      empty={{ icon: <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum banco encontrado' }}
    />
  );
};

// -----------------------------------------------------------------------------
// UNIDADES
// -----------------------------------------------------------------------------
const UNIT_COLUMNS: StandardTableColumn[] = [
  { key: 'symbol',   label: 'Símbolo',      sortable: true, width: 110 },
  { key: 'name',     label: 'Nome',         sortable: true, width: 240 },
  { key: 'category', label: 'Categoria',    sortable: true, width: 180 },
  { key: 'base',     label: 'Equivalência', sortable: true, width: 200 },
];

const UnitsPanel: React.FC = () => {
  const [units, setUnits] = useState<MasterUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = usePersistedState<string>('masterData:units:category', '');

  useEffect(() => {
    masterDataService.listUnits().then(setUnits).finally(() => setLoading(false));
  }, []);

  const categoryOptions = useMemo(
    () => [{ value: '', label: 'Todas' }, ...Array.from(new Set(units.map(u => u.category))).sort().map(c => ({ value: c, label: c }))],
    [units],
  );
  // Estável (useMemo): o corte por categoria é de escopo, a busca e a ordenação são da tabela.
  const rows = useMemo(() => (category ? units.filter(u => u.category === category) : units), [units, category]);

  return (
    <StandardTable<MasterUnit>
      storageKey="masterData:units"
      columns={UNIT_COLUMNS}
      rows={rows}
      rowKey={u => u.id}
      loading={loading}
      searchPlaceholder="Buscar por símbolo, nome ou categoria..."
      searchText={u => `${u.symbol} ${u.name} ${u.category}`}
      sortValue={(key, u) => key === 'base' ? u.base_factor : key === 'symbol' ? u.symbol : key === 'category' ? u.category : u.name}
      filters={<FilterPopover<string> label="Categoria" value={category} onChange={setCategory} options={categoryOptions} />}
      renderCell={(key, u) => {
        switch (key) {
          case 'symbol': return <span className={TXT}>{u.symbol}</span>;
          case 'name': return <span className={`block truncate ${TXT}`} title={u.name}>{u.name}</span>;
          case 'category': return <span className={TXT_MUTED}>{u.category}</span>;
          default: return <span className={TXT_MUTED}>{u.base_factor != null && u.base_symbol ? `= ${u.base_factor} ${u.base_symbol}` : '—'}</span>;
        }
      }}
      empty={{ icon: <Ruler className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma unidade encontrada' }}
    />
  );
};

export default MasterDataBrowser;
