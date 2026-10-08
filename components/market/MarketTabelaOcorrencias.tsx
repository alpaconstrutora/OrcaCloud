import React from 'react';
import type { OpuraMarketListing, OpuraMarketNeighborhood } from '../../types';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';

/**
 * Tabela de ocorrências (anúncios de concorrência da praça) do ÒPURA Market.
 * Fase 6 do plano 2026-10-07-opura-market-intelligence.md: saiu do módulo e
 * passou para o StandardTable (§5.2 + §6.1 do guia), com a busca acoplada.
 */
const COLUNAS: StandardTableColumn[] = [
  { key: 'propertyType', label: 'Tipo', sortable: true, width: 130 },
  { key: 'neighborhood', label: 'Bairro', sortable: true, width: 150 },
  { key: 'price', label: 'Preço', sortable: true, width: 130, align: 'right' },
  { key: 'pricePerM2', label: 'R$/m²', sortable: true, width: 110, align: 'right' },
  { key: 'areaPrivate', label: 'Área priv.', sortable: true, width: 110, align: 'right' },
  { key: 'bedrooms', label: 'Dormitórios', sortable: true, width: 110, align: 'right' },
  // Escondidas por padrão: com todas visíveis a tabela não cabe na largura da tela
  // e as células estreitas quebravam o valor em duas linhas. A engrenagem mostra.
  { key: 'suites', label: 'Suítes', sortable: true, width: 80, align: 'right', defaultHidden: true },
  { key: 'bathrooms', label: 'Banheiros', sortable: true, width: 100, align: 'right', defaultHidden: true },
  { key: 'parkingSpaces', label: 'Vagas', sortable: true, width: 80, align: 'right' },
  { key: 'source', label: 'Fonte', sortable: true, width: 140 },
  { key: 'constructionStandard', label: 'Padrão', sortable: true, width: 140 },
];

export const nomeDoBairro = (l: OpuraMarketListing, bairros: OpuraMarketNeighborhood[]): string =>
  bairros.find(n => n.id === l.neighborhoodId)?.name || l.neighborhoodNameRaw || 'Não informado';

/** Texto em que a busca procura (tabela e painel de ofertas usam o mesmo). */
export const textoDeBusca = (l: OpuraMarketListing): string =>
  [l.address, l.propertyType, l.description, l.source].filter(Boolean).join(' ');

interface Props {
  rows: OpuraMarketListing[];
  neighborhoods: OpuraMarketNeighborhood[];
  search: string;
  onSearchChange: (v: string) => void;
  filtroFonte: React.ReactNode;
  onVerNoMapa: (l: OpuraMarketListing) => void;
}

export default function MarketTabelaOcorrencias({ rows, neighborhoods, search, onSearchChange, filtroFonte, onVerNoMapa }: Props) {
  const celula = (key: string, l: OpuraMarketListing): React.ReactNode => {
    const n = (v: number | null | undefined) => <span className="text-sm font-normal text-gray-600">{v || '-'}</span>;
    switch (key) {
      case 'propertyType': return <span className="block text-sm font-normal text-gray-700 truncate" title={l.propertyType}>{l.propertyType}</span>;
      case 'neighborhood': return <span className="block text-sm font-normal text-gray-700 truncate" title={nomeDoBairro(l, neighborhoods)}>{nomeDoBairro(l, neighborhoods)}</span>;
      case 'price': return <span className="text-sm font-medium text-gray-800">R$ {l.price.toLocaleString('pt-BR')}</span>;
      case 'pricePerM2': return <span className="text-sm font-medium text-gray-800">{l.pricePerM2 ? `R$ ${Math.round(l.pricePerM2).toLocaleString('pt-BR')}` : '-'}</span>;
      case 'areaPrivate': return <span className="text-sm font-normal text-gray-600">{l.areaPrivate ? `${l.areaPrivate} m²` : '-'}</span>;
      case 'bedrooms': return n(l.bedrooms);
      case 'suites': return n(l.suites);
      case 'bathrooms': return n(l.bathrooms);
      case 'parkingSpaces': return n(l.parkingSpaces);
      case 'source': return <span className="block text-sm font-normal text-slate-500 truncate" title={l.source}>{l.source}</span>;
      case 'constructionStandard':
        return <span title={l.constructionStandard || undefined} className={`block text-sm font-medium truncate ${l.constructionStandard ? 'text-indigo-700' : 'text-gray-600'}`}>{l.constructionStandard || '-'}</span>;
      default: return null;
    }
  };

  return (
    <StandardTable<OpuraMarketListing>
      columns={COLUNAS}
      storageKey="opuraMarketOcorrencias"
      rows={rows}
      rowKey={l => l.id}
      renderCell={celula}
      sortValue={(key, l) => key === 'neighborhood' ? nomeDoBairro(l, neighborhoods) : (l[key as keyof OpuraMarketListing] as string | number | null)}
      searchText={textoDeBusca}
      searchPlaceholder="Buscar por endereço, tipo, descrição ou fonte..."
      search={search}
      onSearchChange={onSearchChange}
      filters={filtroFonte}
      onRowClick={onVerNoMapa}
      actions={{
        width: 120,
        render: l => (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onVerNoMapa(l); }}
            disabled={l.latitude == null || l.longitude == null}
            title={l.latitude == null || l.longitude == null ? 'Anúncio sem coordenada: não aparece no mapa.' : undefined}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap disabled:text-slate-300 disabled:cursor-not-allowed"
          >
            Ver no mapa
          </button>
        ),
      }}
      empty={{ icon: <span className="text-3xl">📂</span>, title: 'Nenhum anúncio encontrado', subtitle: 'Tente ajustar a busca ou a fonte.' }}
    />
  );
}
