// Stubs de TIPO para @react-three/fiber e @react-three/drei.
//
// Por quê: o @react-three/fiber v9 augmenta GLOBALMENTE
// `React.JSX.IntrinsicElements` com centenas de elementos three (mesh, group,
// boxGeometry…) que NÃO possuem `className`. Isso faz o `className` de qualquer
// componente tipado como `React.ElementType` (padrão largamente usado neste
// codebase, ex.: prop `icon: React.ElementType`) colapsar para `never`
// (interseção de props sobre todos os elementos intrínsecos), quebrando o tsc
// em ~100 arquivos não relacionados.
//
// Estes stubs são mapeados via tsconfig `paths` para que o TypeScript NÃO
// carregue os .d.ts reais (evitando a augmentation). O RUNTIME continua usando
// os pacotes reais do node_modules — o Vite resolve por node_modules e ignora
// os `paths` do tsconfig (só há alias manual para `@`). Ver Building3DViewer.tsx
// (marcado com @ts-nocheck, único arquivo que usa os elementos three intrínsecos).

declare module '@react-three/fiber' {
  export const Canvas: any;
  export const useFrame: any;
  export const useThree: any;
  export const extend: any;
  export const useLoader: any;
}

declare module '@react-three/drei' {
  export const OrbitControls: any;
  export const Grid: any;
  export const Edges: any;
  export const Environment: any;
  export const Html: any;
  export const Text: any;
  export const Bounds: any;
}
