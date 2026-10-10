// utils/acessoAoMarket.ts
// Quem entra no ÒPURA Market Intelligence — em um lugar só.
// Plano: docs/planos/2026-10-07-opura-market-intelligence.md (decisão D5) e
// docs/planos/2026-10-10-opura-market-pendencias.md (item 4).
//
// POR QUE ISTO EXISTE: a regra "só administrador e usuário interno" estava
// escrita duas vezes, no guarda de rota (`AppRouter.tsx`) e no menu do celular
// (`Layout.tsx`), e só se provava lendo o código — a única conta de teste era do
// grupo USUARIO. Com a regra aqui, cada grupo de `ProfileGroup` tem teste.
//
// O administrador da organização é do grupo USUARIO (papel ADMINISTRADOR dentro
// dele, ver `store/useStore.ts`), por isso "administrador e usuário interno" é
// o grupo USUARIO. O e-mail de desenvolvedor passa em qualquer grupo, como no
// resto do guarda.
import { ProfileGroup } from '../types';

export function podeAcessarMarket(grupo: ProfileGroup | string | null | undefined, ehEmailDeDev: boolean): boolean {
  if (ehEmailDeDev) return true;
  return grupo === ProfileGroup.USER || grupo === ProfileGroup.DEVELOPER;
}
