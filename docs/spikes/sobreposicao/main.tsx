/**
 * Harness do aviso de sobreposição.
 *
 * O teste de componente prova que os quatro botões existem e chamam o que
 * prometem. Ele não prova que a caixa CABE, que o rodapé com quatro ações não
 * transborda, nem que o bloco âmbar se lê — jsdom não faz layout. É a mesma
 * razão do harness do painel Componentes.
 *
 * `?semParede=1` mostra a variante sem a opção da alvenaria (peça sobre peça).
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ModalSobreposicao from '../../../components/blueprint/ModalSobreposicao';

const semParede = new URLSearchParams(location.search).has('semParede');

createRoot(document.getElementById('raiz')!).render(
  <ModalSobreposicao
    aberto
    nomeDaPeca="Pilar"
    quantos={semParede ? 1 : 2}
    volumeM3={0.084}
    temParede={!semParede}
    onEscolher={(e) => console.log('escolha', e)}
  />,
);
