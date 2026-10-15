/**
 * Harness da TELA da casa automática (F10, 15/10/2026) — a `TelaCasaAutomatica` de verdade, com o hook de
 * verdade (`useCasaAutomatica`: o Web Worker do navegador, que o jsdom dos testes não exercita), numa casca com a
 * largura do editor (barra lateral de 256 px + o gutter do conteúdo) e o mesmo cabeçalho de tela do editor.
 * Sem Supabase: as premissas ficam no estado da página; o lote é o de prova (12 × 30, frente ao sul).
 *
 *   npx vite --port 3192 → http://127.0.0.1:3192/docs/spikes/casa-automatica/tela.html
 *   window.__tela: { gerou, etapas, erro } para o portão.
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Home } from 'lucide-react';
import TelaCasaAutomatica from '../../../components/blueprint/TelaCasaAutomatica';
import { useCasaAutomatica } from '../../../hooks/useCasaAutomatica';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { medirTerreno } from '../../../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA } from '../../../utils/blueprintMassa';
import { conferirPlanoDaCasa, motivoParaNaoGerar } from '../../../utils/blueprintCasaAutomatica';
import { PREMISSAS_DA_CASA_PADRAO, hipotesesDasPremissas, type PremissasDaCasa } from '../../../utils/blueprintPremissasDaCasa';
import { HIPOTESES_HIDRO_PADRAO } from '../../../utils/blueprintMemorialHidro';
import { modelosDoCatalogo } from '../../../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../../../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../../../utils/blueprintClimatizacao';

declare global {
  interface Window {
    __tela: { gerou: boolean; etapas: number; erro: string | null; progressoVisto: boolean };
  }
}
window.__tela = { gerou: false, etapas: 0, erro: null, progressoVisto: false };

function loteDeProva(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const L = base.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: string): Command => ({ type: 'AddBoundary', levelId: L, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel }) as Command;
  return applyBatch(base, [d(0, 0, 12000, 0, 'FRENTE'), d(12000, 0, 12000, 30000, 'LATERAL_DIREITA'), d(12000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
}
const lote = loteDeProva();
const levelId = lote.levels[0].id;
const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));

function App() {
  const casa = useCasaAutomatica();
  const [premissas, setPremissas] = useState<PremissasDaCasa>(PREMISSAS_DA_CASA_PADRAO);
  const [lancado, setLancado] = useState<string | null>(null);
  if (casa.progresso) window.__tela.progressoVisto = true;
  if (casa.plano) window.__tela = { ...window.__tela, gerou: true, etapas: casa.plano.etapas.length };
  if (casa.erro) window.__tela.erro = casa.erro;
  const gerar = () =>
    casa.gerar({
      original: lote,
      entrada: {
        levelId,
        ctx: { terreno: medirTerreno(lote.boundaries), limites: lote.boundaries, recuosBase: { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 }, zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 } },
        curto: premissas.curto,
        rotacaoNorteDeg: null,
        latitudeGraus: -19.9,
        hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
        modelosDeClimatizacao: modelos,
        climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
      },
      terreno: null,
      hip: hipotesesDasPremissas(premissas),
    });
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* A barra lateral do app (256 px) — a largura do conteúdo é a do editor de verdade. */}
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-white" />
      <main className="min-w-0 flex-1 p-8">
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="casa">
          <div className="flex items-center gap-4">
            <button type="button" className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 shadow-sm" aria-label="Voltar ao editor">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-blue-600">Casa de prova</span>
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
                <span className="text-xs font-medium text-gray-400">Planta Inteligente · Analisar</span>
              </div>
              <h1 className="flex items-center gap-2 text-2xl font-black text-gray-900 tracking-tight">
                <Home className="h-6 w-6 text-blue-700" />
                Casa automática
              </h1>
              <p className="mt-1 text-sm text-gray-500">Do terreno e da lei, a casa térrea inteira: implantação, arquitetura, estrutura, telhado, louças, água, esgoto, pluvial, elétrica e climatização — uma prévia, e um lote só para lançar (um Ctrl+Z desfaz tudo).</p>
            </div>
          </div>
          <TelaCasaAutomatica
            casa={casa}
            premissas={premissas}
            onPremissas={setPremissas}
            persistenciaIndisponivel={false}
            motivoParaNaoGerar={motivoParaNaoGerar(lote, levelId)}
            onGerar={gerar}
            prova={casa.plano ? conferirPlanoDaCasa(lote, casa.plano) : null}
            lancado={lancado}
            onLancar={async () => setLancado(`${casa.plano?.comandos.length ?? 0} comando(s) lançados num lote só — Ctrl+Z desfaz tudo.`)}
            onCriarAlternativa={async () => setLancado('Alternativa criada (harness).')}
            cub={{ valorM2: 2650, estimado: false, referencia: 'MG · 09/2026' }}
            unidades={[{ id: 'u1', rotulo: 'Quadra A · Casa 01 (3Q)' }]}
            onPreencherPelaUnidade={() => setPremissas({ ...premissas, curto: { ...premissas.curto, dormitorios: 3, suites: 1 } })}
          />
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
