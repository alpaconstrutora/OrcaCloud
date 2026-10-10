/**
 * Harness da aba Mapa Regulatório dentro da Planta Inteligente (10/10/2026).
 *
 * Monta o `BlueprintModule` REAL. Sem login, o `medir.mjs` intercepta o REST do
 * Supabase (só leitura; escrita é abortada) e devolve uma planta e um mapa.
 * A coluna da esquerda imita a sidebar (256 px) e o `<main>` repete o gutter do
 * Layout (`p-6`) — sem eles a largura útil mentiria (ver memória "harness sem
 * sidebar mente sobre largura").
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintModule from '../../../components/blueprint/BlueprintModule';
import RegulatoryZoneTable from '../../../components/RegulatoryZoneTable';
import { ConfirmProvider } from '../../../components/ui/confirm';

const params = new URLSearchParams(location.search);
const semPermissao = params.has('sem-permissao');

// `?zonas`: a tabela de zonas do detalhe do mapa, para medir o ajuste de largura.
const ZONAS = [
  { id: 'z1', macroarea: 'Urbanização Consolidada', zona: 'ZM 1', uso_permitido: 'Residencial multifamiliar, comércio de bairro e serviços', ca_basico: '2', ca_maximo: '4', recuo_frente: '5', lei_referencia: 'LC 208/2018, art. 41' },
  { id: 'z2', macroarea: 'Qualificação Urbana', zona: 'ZC', uso_permitido: 'Misto', ca_basico: '2,5', ca_maximo: '6', recuo_frente: '4', lei_referencia: 'LC 208/2018' },
];

createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <div className="flex h-screen">
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {params.has('zonas') ? (
          <RegulatoryZoneTable
            tableId="harnessZonas"
            title="Zonas" subtitle="Parâmetros por zona"
            zones={ZONAS} loading={false} adding={false} savingId={null}
            onAdd={() => {}} onUpdate={() => {}} onDelete={() => {}}
          />
        ) : (
          <BlueprintModule podeVerMapaRegulatorio={!semPermissao} />
        )}
      </main>
    </div>
  </ConfirmProvider>,
);
