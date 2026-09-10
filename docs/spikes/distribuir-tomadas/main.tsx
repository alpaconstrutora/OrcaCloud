/**
 * HARNESS VISUAL da linha do ambiente (fatia 2, 10/09/2026): o painel direito
 * do editor não sobe em jsdom, e a lista de ambientes ganhou três controles
 * numa linha só — tipo, conferência da norma e "N tomadas". Isto renderiza a
 * linha com os MESMOS componentes e o CSS do app, para olhar.
 *
 *   npx vite --port 3132 → http://localhost:3132/docs/spikes/distribuir-tomadas/index.html
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, Pencil } from 'lucide-react';
import DistribuirTomadas, {
  ConferenciaDoAmbiente,
} from '../../../components/blueprint/DistribuirTomadas';
import PainelConferenciaNbr from '../../../components/blueprint/PainelConferenciaNbr';
import { ROTULO_DO_TIPO_DE_AMBIENTE } from '../../../utils/blueprintDistribuicao';
import { TIPOS_DE_AMBIENTE } from '../../../utils/blueprintKernel';
import type { ConferenciaNbr5410 } from '../../../utils/blueprintNbr5410';

/** Fatia 3: o painel da conferência, com os três estados por regra. */
const conferencia: ConferenciaNbr5410 = {
  faltas: 3,
  avisos: 1,
  regras: [
    { codigo: '9.5.2.2.1', titulo: 'Número mínimo de pontos de tomada por ambiente',
      achados: [{ nivel: 'FALTA', mensagem: 'Sala: mín. 4 (1 a cada 5 m de 15,4 m), há 1 · faltam 3', ids: [] }],
      naoAvaliado: ['1 ambiente sem tipo: Ambiente 2'], avaliados: 1 },
    { codigo: '9.5.2.2.2', titulo: 'Potência mínima por ponto de tomada',
      achados: [{ nivel: 'AVISO', mensagem: 'Cozinha: 2 tomadas sem potência declarada', ids: ['a', 'b'] }],
      naoAvaliado: [], avaliados: 4 },
    { codigo: '9.5.2.3', titulo: 'Aquecedor elétrico de água: conexão direta, sem tomada',
      achados: [{ nivel: 'FALTA', mensagem: '1 aquecedor de água ligado por tomada: Chuveiro — a conexão deve ser direta', ids: ['c'],
        acao: { tipo: 'CONVERTER_LIGACAO_DIRETA', terminalIds: ['c'] } }],
      naoAvaliado: ['reconhecido pelo nome do ponto (chuveiro, aquecedor, boiler, ducha, torneira elétrica)'], avaliados: 3 },
    { codigo: '9.5.3.1', titulo: 'Equipamento acima de 10 A em circuito independente',
      achados: [{ nivel: 'FALTA', mensagem: 'Chuveiro (25,0 A) divide o circuito C2 com 1 outro ponto — deve ser circuito independente', ids: ['c', 'd'] }],
      naoAvaliado: [], avaliados: 1 },
    { codigo: '9.5.3.2', titulo: 'Tomadas de cozinha/área de serviço em circuito exclusivo', achados: [], naoAvaliado: [], avaliados: 1 },
    { codigo: '9.5.3.3', titulo: 'Circuito comum (iluminação + tomadas): 16 A e repartição', achados: [],
      naoAvaliado: ['circuito C1: sem tensão, corrente não calculável'], avaliados: 1 },
    { codigo: 'SUGERIDAS', titulo: 'Tomadas sugeridas pelo sistema, ainda sem posição confirmada', achados: [], naoAvaliado: [], avaliados: 0 },
  ],
};

const casos = [
  { nome: 'Sala', conf: null },
  {
    nome: 'Cozinha',
    conf: {
      minimo: 6, medias: 2, regra: '1 a cada 3,5 m de 19,4 m, 2 delas sobre a bancada',
      ondeAMedia: 'sobre a bancada da pia', existentes: 6, existentesMedias: 0,
      deficit: 0, deficitMedias: 2, semTipo: 0,
    },
  },
  {
    nome: 'Dormitório 1',
    conf: {
      minimo: 3, medias: 0, regra: '1 a cada 5 m de 14,2 m', ondeAMedia: null,
      existentes: 3, existentesMedias: 0, deficit: 0, deficitMedias: 0, semTipo: 1,
    },
  },
];

function Linha({ nome, conf }: (typeof casos)[number]) {
  return (
    <li>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="truncate text-sm font-medium text-slate-700">{nome}</span>
          <button type="button" className="ml-auto shrink-0 rounded p-1 text-slate-400">
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
          Tipo
          <select defaultValue={conf ? 'COZINHA_SERVICO' : ''} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
            <option value="">A classificar</option>
            {TIPOS_DE_AMBIENTE.map((t) => (
              <option key={t} value={t}>{ROTULO_DO_TIPO_DE_AMBIENTE[t]}</option>
            ))}
          </select>
        </label>
        <ConferenciaDoAmbiente conferencia={conf} onCompletar={() => 2} />
        <DistribuirTomadas escopo="neste ambiente" onDistribuir={(n) => n} />
        <dl className="mt-1 flex gap-4 text-xs text-slate-500">
          <div><dt className="inline">Área </dt><dd className="inline font-medium text-slate-700">22,52 m²</dd></div>
          <div><dt className="inline">Perímetro </dt><dd className="inline font-medium text-slate-700">20,00 m</dd></div>
        </dl>
      </div>
    </li>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <>
    <div className="border-b border-slate-200 px-4 py-3" id="conferencia">
      <PainelConferenciaNbr conferencia={conferencia} onSelecionar={() => {}} onConverterLigacaoDireta={() => {}} />
    </div>
    <ul className="divide-y divide-slate-100">
      {casos.map((c) => <Linha key={c.nome} {...c} />)}
    </ul>
  </>,
);
