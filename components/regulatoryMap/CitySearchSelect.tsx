// components/regulatoryMap/CitySearchSelect.tsx
//
// Busca de cidade por nome direto em master_cities (masterDataService.searchCities, usa
// pg_trgm) — sem precisar escolher a UF antes, diferente de CityStateSelect (que é
// cascata UF→cidade por texto livre, pensado para campos de endereço). Aqui precisamos do
// city_id (FK real de regulatory_maps.city_id), não só do nome.
import React from 'react';
import { Loader2, Search, MapPin } from 'lucide-react';
import { masterDataService, MasterCity } from '../../services/masterDataService';

export interface CitySearchValue {
    id: string;
    name: string;
    state_code?: string;
}

interface Props {
    value: CitySearchValue | null;
    onChange: (city: CitySearchValue | null) => void;
    className?: string;
}

const CitySearchSelect: React.FC<Props> = ({ value, onChange, className = '' }) => {
    const [query, setQuery] = React.useState(value ? `${value.name} - ${value.state_code || ''}` : '');
    const [results, setResults] = React.useState<(MasterCity & { state_code?: string })[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) { setResults([]); return; }
        setLoading(true);
        const handle = setTimeout(() => {
            masterDataService.searchCities(q)
                .then(setResults)
                .catch(() => setResults([]))
                .finally(() => setLoading(false));
        }, 300);
        return () => clearTimeout(handle);
    }, [query, open]);

    const handleSelect = (city: MasterCity & { state_code?: string }) => {
        onChange({ id: city.id, name: city.name, state_code: city.state_code });
        setQuery(`${city.name} - ${city.state_code || ''}`);
        setOpen(false);
    };

    return (
        <div className={`relative ${className}`}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Buscar cidade..."
                    className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
            </div>
            {open && results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-[6px] shadow-lg max-h-56 overflow-y-auto">
                    {results.map(c => (
                        <button
                            type="button"
                            key={c.id}
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(c); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                        >
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-800">{c.name}</span>
                            {c.state_code && <span className="text-gray-400">- {c.state_code}</span>}
                        </button>
                    ))}
                </div>
            )}
            {open && !loading && query.trim().length >= 2 && results.length === 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-[6px] shadow-lg px-3 py-2 text-sm text-gray-400">
                    Nenhuma cidade encontrada
                </div>
            )}
        </div>
    );
};

export default CitySearchSelect;
