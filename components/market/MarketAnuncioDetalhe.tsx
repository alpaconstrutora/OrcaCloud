import React from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import type { OpuraMarketCity, OpuraMarketListing, OpuraMarketNeighborhood } from '../../types';
import { nomeDoBairro } from './MarketTabelaOcorrencias';

/** Detalhe de um anúncio de concorrência. Fase 6: passou para o Modal padrão. */
interface Props {
  anuncio: OpuraMarketListing | null;
  cities: OpuraMarketCity[];
  neighborhoods: OpuraMarketNeighborhood[];
  onClose: () => void;
}

const POSICAO: Record<string, string> = {
  fonte: 'Informada pela origem do anúncio',
  endereco: 'Localizada pelo endereço',
  rua: 'Aproximada: só a rua foi encontrada',
  bairro: 'Aproximada: só o bairro era conhecido',
  nao_encontrado: 'Endereço não encontrado: fora do mapa e da análise de raio',
};

function Ficha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{rotulo}</span>
      <span className="text-xs font-extrabold text-slate-800 mt-1">{valor}</span>
    </div>
  );
}

export default function MarketAnuncioDetalhe({ anuncio: a, cities, neighborhoods, onClose }: Props) {
  if (!a) return null;
  const cidade = cities.find(c => c.id === a.cityId);
  const posicao = a.geoPrecision ? POSICAO[a.geoPrecision] ?? 'Origem da posição não registrada'
    : a.latitude != null ? 'Origem da posição não registrada'
    : 'Ainda não localizado';

  return (
    <Modal open onClose={onClose} size="lg">
      <ModalHeader
        title={`${a.propertyType} em ${cidade?.name ?? 'cidade não informada'}`}
        description="Detalhes do anúncio"
        onClose={onClose}
      />
      <ModalBody className="space-y-5 max-h-[70vh] overflow-y-auto">
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
          <div>
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço de Venda</span>
            <span className="block font-black text-slate-900 text-lg">R$ {a.price.toLocaleString('pt-BR')}</span>
          </div>
          <div className="text-right">
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Fonte do Anúncio</span>
            <span className="block font-semibold text-indigo-700 text-sm mt-0.5">{a.source}</span>
          </div>
        </div>

        <div className="space-y-3">
          <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Localização</span>
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="block text-[9px] text-slate-400 font-bold uppercase">Cidade</span>
                <span className="block font-extrabold text-slate-700 mt-0.5">{cidade ? `${cidade.name} - ${cidade.state}` : 'Não informada'}</span>
              </div>
              <div>
                <span className="block text-[9px] text-slate-400 font-bold uppercase">Bairro</span>
                <span className="block font-extrabold text-slate-700 mt-0.5">{nomeDoBairro(a, neighborhoods)}</span>
              </div>
            </div>
            {a.address && (
              <div className="border-t border-slate-100/70 pt-2">
                <span className="block text-[9px] text-slate-400 font-bold uppercase">Endereço</span>
                <span className="block text-xs font-semibold text-slate-600 mt-0.5 leading-normal">📍 {a.address}</span>
              </div>
            )}
            <div className="border-t border-slate-100/70 pt-2">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Posição no mapa</span>
              <span className="block text-xs font-semibold text-slate-600 mt-0.5 leading-normal">{posicao}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Ficha Técnica</span>
          <div className="grid grid-cols-2 gap-3">
            {a.areaPrivate && <Ficha rotulo="Área Privativa" valor={`📐 ${a.areaPrivate} m²`} />}
            {a.constructionStandard && <Ficha rotulo="Padrão Construtivo" valor={`✨ ${a.constructionStandard}`} />}
            <Ficha rotulo="Dormitórios" valor={`🛏️ ${a.bedrooms || 0} Dormitório(s)`} />
            <Ficha rotulo="Banheiros" valor={`🚿 ${a.bathrooms || 0} Banheiro(s)`} />
            {a.suites != null && <Ficha rotulo="Suítes" valor={`🔑 ${a.suites} Suíte(s)`} />}
            {a.parkingSpaces != null && <Ficha rotulo="Vagas de Garagem" valor={`🚗 ${a.parkingSpaces} Vaga(s)`} />}
          </div>
        </div>

        {a.description && (
          <div className="space-y-1">
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição do Anúncio</span>
            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl max-h-[120px] overflow-y-auto">
              <p className="text-[11px] text-slate-600 font-semibold leading-relaxed whitespace-pre-line italic">"{a.description}"</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 font-bold bg-slate-50 p-3 rounded-xl border border-slate-100/60">
          <div>
            <span className="block text-[8px] uppercase tracking-wider">Capturado em</span>
            <span className="text-slate-600 font-extrabold">{a.capturedAt ? new Date(a.capturedAt).toLocaleString('pt-BR') : 'Sem data'}</span>
          </div>
          <div>
            <span className="block text-[8px] uppercase tracking-wider">Última Atualização</span>
            <span className="text-slate-600 font-extrabold">{a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('pt-BR') : 'Sem data'}</span>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          onClick={onClose}
          className="h-9 px-4 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-[6px] text-[13px] font-medium transition-all"
        >
          Fechar
        </button>
        {/* O link vem do feed de terceiros: só http(s), nunca javascript: ou data:. */}
        {a.sourceUrl && /^https?:\/\//i.test(a.sourceUrl) && (
          <a
            href={a.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[6px] text-[13px] font-medium transition-all inline-flex items-center gap-1.5"
          >
            🔗 Acessar link original
          </a>
        )}
      </ModalFooter>
    </Modal>
  );
}
