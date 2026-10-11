/**
 * Harness do atalho "Abrir Mapa Regulatório" no painel de zona (11/10/2026).
 * O painel REAL em duas larguras de lateral (320 e 448 px), nos três estados:
 * mapa escolhido sem zona, sem mapa (empreendimento) e sem a prop (sem atalho).
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PainelZonaUrbanistica from '../../../components/blueprint/PainelZonaUrbanistica';

const MAPA = { id: 'm1', name: 'Plano Diretor Campinas', city_name: 'Campinas', state_code: 'SP', status: 'ATIVO' } as never;
const base = {
  onOrigemDaZona: () => {}, empreendimentos: [{ id: 'e1', nome: 'Residencial Jardim' }], empreendimentoId: '', onEmpreendimento: () => {},
  cidade: { id: 'c1', name: 'Campinas', state_code: 'SP' } as never, onCidade: () => {},
  mapas: [MAPA], onMapa: () => {}, zonas: [], zonaAplicadaId: null, zonaRotuloSalvo: null,
  ajustadoAMao: false, derivou: false, onAplicar: () => {}, onDesligar: () => {},
};
(window as any).__cliques = 0;
const abrir = () => { (window as any).__cliques++; };

function Caixa({ largura, children, id }: { largura: number; children: React.ReactNode; id: string }) {
  return <div data-caixa={id} style={{ width: largura }} className="bg-white border border-gray-200 rounded-[10px] px-6 py-4">{children}</div>;
}

createRoot(document.getElementById('raiz')!).render(
  <div className="flex flex-wrap gap-6 p-6 items-start">
    {[320, 448].map((l) => (
      <React.Fragment key={l}>
        <Caixa largura={l} id={`catalogo-${l}`}><PainelZonaUrbanistica {...base} origemDaZona="CATALOGO" mapaId="m1" onAbrirMapaRegulatorio={abrir} /></Caixa>
        <Caixa largura={l} id={`empreend-${l}`}><PainelZonaUrbanistica {...base} origemDaZona="EMPREENDIMENTO" mapaId="" onAbrirMapaRegulatorio={abrir} /></Caixa>
        <Caixa largura={l} id={`sem-${l}`}><PainelZonaUrbanistica {...base} origemDaZona="CATALOGO" mapaId="m1" /></Caixa>
      </React.Fragment>
    ))}
  </div>,
);
