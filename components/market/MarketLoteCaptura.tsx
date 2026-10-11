import React from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import {
  opuraMarketService,
  type ItemDoLote,
  type LeituraDoLote,
  type ResultadoImportacaoMercado,
} from '../../services/opuraMarketService';

/**
 * Revisão de uma página de BUSCA enviada pelo favorito "Enviar ao ÒPURA" — Fase C2
 * do plano docs/planos/2026-10-10-opura-market-fontes.md.
 *
 * Um clique na página de resultados do ZAP/VivaReal (30 anúncios) ou da OLX
 * (~50) traz a lista inteira. Vem marcado só o que a gravação aceita (preço,
 * área e a cidade da praça — `situacaoNoLote` em logica.ts); o resto diz por quê.
 *
 * É um cartão na aba Fontes, não gaveta: 30 a 50 linhas com 7 colunas não cabem
 * nos 672 px de um Sheet.
 */

const COLUNAS: StandardTableColumn[] = [
  { key: 'titulo', label: 'Anúncio', sortable: true, width: 320 },
  { key: 'tipo', label: 'Tipo', sortable: true, width: 120 },
  { key: 'preco', label: 'Preço', sortable: true, width: 130, align: 'right' },
  { key: 'area', label: 'Área', sortable: true, width: 110, align: 'right' },
  { key: 'quartos', label: 'Quartos', sortable: true, width: 90, align: 'right' },
  { key: 'bairro', label: 'Bairro', sortable: true, width: 170 },
  { key: 'situacao', label: 'Situação', sortable: true, width: 240 },
];

const SEM_ORG = 'Selecione uma organização no topo da tela: os anúncios são gravados nela.';

const chave = (i: ItemDoLote) => i.anuncio.url as string;

interface Props {
  lote: LeituraDoLote;
  organizationId: string;
  cityId: string;
  onDescartar: () => void;
  onGravado: (r: ResultadoImportacaoMercado, site: string) => void | Promise<void>;
}

export default function MarketLoteCaptura({ lote, organizationId, cityId, onDescartar, onGravado }: Props) {
  const [selecionados, setSelecionados] = React.useState<Set<string>>(
    () => new Set(lote.itens.filter((i) => i.situacao.gravavel).map(chave))
  );
  const [gravando, setGravando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelecionados(new Set(lote.itens.filter((i) => i.situacao.gravavel).map(chave)));
    setErro(null);
  }, [lote]);

  const gravaveis = lote.itens.filter((i) => i.situacao.gravavel).length;
  const motivo = !organizationId ? SEM_ORG
    : !cityId ? 'Selecione a cidade da praça.'
    : selecionados.size === 0 ? 'Marque ao menos um anúncio.'
    : undefined;

  const gravar = async () => {
    if (motivo) return;
    setGravando(true);
    setErro(null);
    try {
      const anuncios = lote.itens.filter((i) => selecionados.has(chave(i))).map((i) => i.anuncio);
      const r = await opuraMarketService.gravarLote(organizationId, cityId, anuncios, lote.site);
      await onGravado(r, lote.site);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gravar os anúncios.');
    } finally {
      setGravando(false);
    }
  };

  const celula = (key: string, i: ItemDoLote): React.ReactNode => {
    const a = i.anuncio;
    switch (key) {
      case 'titulo':
        return (
          <span className="flex items-start gap-1.5 text-sm font-normal text-gray-700 whitespace-normal break-words">
            <span>{a.titulo || a.url}</span>
            {/^https?:\/\//i.test(a.url ?? '') && (
              <a href={a.url as string} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5 text-blue-600 hover:text-blue-700" title="Abrir o anúncio no site" onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </span>
        );
      case 'tipo': return <span className="text-sm font-normal text-gray-700">{a.tipo}</span>;
      case 'preco': return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{a.preco > 0 ? `R$ ${a.preco.toLocaleString('pt-BR')}` : '-'}</span>;
      case 'area': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{a.area ? `${a.area.toLocaleString('pt-BR')} m²` : '-'}</span>;
      case 'quartos': return <span className="text-sm font-normal text-gray-600">{a.quartos || '-'}</span>;
      case 'bairro':
        return (
          <span className="text-sm font-normal text-gray-700 whitespace-normal break-words" title={a.bairro && !i.bairroCadastrado ? 'Bairro ainda não cadastrado na praça' : undefined}>
            {a.bairro || '-'}{a.bairro && !i.bairroCadastrado ? ' *' : ''}
          </span>
        );
      case 'situacao':
        return (
          <span className={`text-sm font-normal whitespace-normal ${!i.situacao.gravavel ? 'text-amber-700' : i.jaGravado ? 'text-blue-700' : 'text-emerald-700'}`}>
            {i.situacao.texto}
          </span>
        );
      default: return null;
    }
  };

  const valorParaOrdenar = (key: string, i: ItemDoLote) => {
    const a = i.anuncio;
    switch (key) {
      case 'titulo': return a.titulo ?? '';
      case 'tipo': return a.tipo;
      case 'preco': return a.preco;
      case 'area': return a.area ?? 0;
      case 'quartos': return a.quartos;
      case 'bairro': return a.bairro ?? '';
      case 'situacao': return i.situacao.texto;
      default: return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs text-blue-900 font-semibold">
          Página de busca recebida do navegador ({lote.site}): {lote.itens.length} anúncios, {gravaveis} podem ser gravados.
          <span className="block font-normal text-blue-800 mt-0.5">
            Os marcados entram na base; anúncio que já estava tem o preço atualizado. Sem preço, área ou de outra cidade, o anúncio fica de fora e a coluna Situação diz por quê.
            Bairro com * ainda não está cadastrado na praça.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onDescartar}
            disabled={gravando}
            className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Descartar
          </button>
          <button
            onClick={gravar}
            disabled={gravando || !!motivo}
            title={motivo}
            className="flex items-center gap-1.5 h-9 px-4 rounded-[6px] text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {gravando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
            {gravando ? 'Gravando…' : `Gravar ${selecionados.size} anúncio${selecionados.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {erro && <div className="p-3 rounded-[8px] bg-rose-50 border border-rose-100 text-xs text-rose-700">{erro}</div>}

      <StandardTable<ItemDoLote>
        columns={COLUNAS}
        storageKey="opuraMarketLoteCaptura"
        rows={lote.itens}
        rowKey={chave}
        renderCell={celula}
        sortValue={valorParaOrdenar}
        searchText={(i) => [i.anuncio.titulo, i.anuncio.bairro, i.anuncio.tipo, i.situacao.texto].filter(Boolean).join(' ')}
        searchPlaceholder="Buscar por título, bairro, tipo ou situação..."
        selection={{ selected: selecionados, onChange: setSelecionados, canSelect: (i) => i.situacao.gravavel }}
        maxHeight="560px"
      />
    </div>
  );
}
