/**
 * A4 — harness de NAVEGADOR da gaveta SIGEF.
 *
 * Monta o `PainelSigef` REAL sobre um imóvel de 200 × 300 m em Minas, com os
 * comandos indo para um modelo de verdade (o kernel aplica, a tabela redesenha).
 * O botão "Planilha ODS" faz o que o editor faz: busca o MODELO OFICIAL do
 * INCRA servido em `/sigef/…`, preenche no navegador (DOMParser/XMLSerializer
 * de verdade) e baixa — `medir-sigef.mjs` pega o download e o Python o lê.
 *
 * `?incompleto=1`: sem tipos, sigmas e limites (o caso das pendências).
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainelSigef from '../../../components/blueprint/PainelSigef';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { IDENTIFICACAO_VAZIA, perimetroSigef, planilhaOdsSigef, type IdentificacaoSigef } from '../../../utils/geo/sigef';

const incompleto = new URLSearchParams(location.search).get('incompleto') === '1';
const CANTOS = [
  { x: 0, y: 0 },
  { x: 200_000, y: 0 },
  { x: 200_000, y: 300_000 },
  { x: 0, y: 300_000 },
];
const CONFRONTANTES = ['Fazenda Boa Vista', 'Estrada Municipal MG-10', 'Córrego do Meio', 'Sítio Esperança'];

function inicial(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  m = applyBatch(m, CANTOS.map((a, i) => ({ type: 'AddBoundary' as const, levelId: lv, a, b: CANTOS[(i + 1) % 4], kind: 'TERRENO' as const }))).model;
  m = applyCommand(m, { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9, longitude: -43.95, elevacaoM: 850, projetada: { lesteM: 0, norteM: 0, crs: 'EPSG:31983' } } } as never).model;
  if (incompleto) return m;
  const porCanto = CANTOS.map((c) => m.boundaries.find((b) => b.a.x === c.x && b.a.y === c.y)!);
  m = applyBatch(m, [
    ...CANTOS.map((c, i) => ({ type: 'SetVerticeDoTerreno' as const, ponto: c, nome: 'x', tipo: (i % 2 ? 'P' : 'M') as 'M' | 'P', sigmaEMm: 20, sigmaNMm: 25, sigmaHMm: 40, altitudeM: 850 + i * 1.5, metodo: 'PG6' })),
    ...porCanto.map((b, i) => ({ type: 'SetBoundaryEscritura' as const, boundaryId: b.id, medidaMm: null, confrontante: CONFRONTANTES[i] })),
    ...porCanto.map((b, i) => ({ type: 'SetBoundarySigef' as const, boundaryId: b.id, tipoDeLimite: (['LA1', 'LA3', 'LN1', 'LA2'] as const)[i], confrontanteMatricula: `${1000 + i}`, confrontanteCns: '04.567-8' })),
  ]).model;
  return applyCommand(m, { type: 'NomearVerticesDoTerreno', pontos: CANTOS, sigef: { credenciado: 'ABC1' } }).model;
}

const ID: IdentificacaoSigef = {
  ...IDENTIFICACAO_VAZIA,
  nome: 'João da Silva',
  cpfCnpj: '123.456.789-09',
  denominacao: 'Fazenda Santa Luzia',
  cns: '04.567-8',
  matricula: '12.345',
  municipio: 'Belo Horizonte-MG',
  credenciado: 'ABC1',
  responsavelTecnico: 'Eng. Maria Souza (CREA-MG 123456)',
};

function baixar(nome: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
}

function App() {
  const [model, setModel] = useState(inicial);
  const [id, setId] = useState<IdentificacaoSigef>(incompleto ? IDENTIFICACAO_VAZIA : ID);
  (window as unknown as { __sigef: unknown }).__sigef = { linhas: perimetroSigef(model)?.linhas.map((l) => ({ codigo: l.codigo, lon: l.longitudeTexto, lat: l.latitudeTexto, limite: l.tipoDeLimite })) ?? null };
  return (
    <PainelSigef
      model={model}
      sigef={{ identificacao: id, alterar: (p) => setId((x) => ({ ...x, ...p })), estado: 'SALVO' }}
      onComandos={(cmds: Command[]) => setModel((m) => applyBatch(m, cmds).model)}
      meridianoCentral={-45}
      onBaixarTexto={(nome, texto, tipo) => baixar(nome, new Blob([texto], { type: tipo }))}
      onPlanilha={() =>
        void (async () => {
          const perimetro = perimetroSigef(model)!;
          const r = await fetch('/sigef/sigef_planilha_modelo_1.4_rc5.ods');
          const ods = await planilhaOdsSigef(new Uint8Array(await r.arrayBuffer()), id, perimetro, -45);
          baixar('Fazenda Santa Luzia - SIGEF.ods', new Blob([ods as BlobPart], { type: 'application/vnd.oasis.opendocument.spreadsheet' }));
        })()
      }
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
