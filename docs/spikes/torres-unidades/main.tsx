/**
 * Harness: monta o `TowerEditor` DE PRODUÇÃO (aba Comercial › Empreendimentos ›
 * Torres & Unidades) para conferir na tela a reorganização de 14/10/2026
 * (docs/planos/2026-10-14-torres-unidades-reorganizacao.md).
 *
 * As leituras e escritas do PostgREST são servidas pelo `passeio.mjs` (page.route,
 * banco em memória) — nada chega ao Supabase. A casca reproduz o card da aba em
 * `EmpreendimentoDetail.tsx` (`bg-white p-6 rounded-[10px] …`) dentro do gutter do
 * Layout (§20.2: 24px no desktop, 16px no mobile).
 *
 *   ?modo=empreendimento  (padrão) — como no módulo Empreendimentos, com Terreno
 *   ?modo=estudo          — como na Viabilidade/Planta IA: sem `empreendimento`
 *   ?modo=leitura         — Viabilidade sem permissão (`somenteLeitura`)
 *   ?modo=caracteristicas — aba Características Adicionais (painel de unidade que
 *                           passou a usar os mesmos UnitFormFields)
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import TowerEditor from '../../../components/empreendimento/TowerEditor';
import CaracteristicasAdicionaisTab from '../../../components/empreendimento/CaracteristicasAdicionaisTab';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { ToastProvider } from '../../../components/ui/toast';
import type { Empreendimento } from '../../../types';

const modo = new URLSearchParams(location.search).get('modo') ?? 'empreendimento';

const empreendimento = {
  id: 'emp-1',
  organization_id: 'org-1',
  name: 'Residencial Harness',
  status: 'PLANEJAMENTO',
  terreno_tipo: 'Regular (Retangular)',
  terreno_area: 1200,
  terreno_frente: 30,
  terreno_fundos: 30,
  terreno_profundidade: 40,
} as unknown as Empreendimento;

function Harness() {
  return (
    <ConfirmProvider>
      <ToastProvider>
        <div className="p-4 md:p-6">
          {modo === 'caracteristicas' ? (
            <CaracteristicasAdicionaisTab empreendimento={empreendimento} organizationId="org-1" caracteristicas={[]} />
          ) : (
          <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm" data-el="aba">
            <TowerEditor
              empreendimentoId="emp-1"
              organizationId="org-1"
              empreendimento={modo === 'empreendimento' ? empreendimento : undefined}
              onTerrenoSaved={() => { (window as any).__terrenoSalvo = ((window as any).__terrenoSalvo ?? 0) + 1; }}
              somenteLeitura={modo === 'leitura' ? 'Sem permissão para editar a Viabilidade.' : undefined}
            />
          </div>
          )}
        </div>
      </ToastProvider>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
