/**
 * Harness: as barras de rolagem do app (regra global de index.css) — pedido de
 * 11/10/2026, plano docs/planos/2026-10-11-barras-de-rolagem-e-altura-do-gantt.md.
 *
 * Uma área rolável nos dois eixos, com fundo BRANCO (o caso das tabelas e do Gantt), e
 * nada mais: o passeio lê os pixels da barra no print para medir o polegar.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ligarBarraDeRolagemProxima } from '../../../utils/barraDeRolagemProxima';

// Como em index.tsx: a barra alarga quando o cursor se aproxima.
ligarBarraDeRolagemProxima();

createRoot(document.getElementById('raiz')!).render(
    <div
        id="area"
        className="bg-white border border-gray-200"
        style={{ width: 600, height: 360, overflow: 'auto' }}
    >
        <div style={{ width: 2400, height: 2400, background: '#fff' }} />
    </div>
);
