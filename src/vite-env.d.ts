/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/* eslint-disable no-restricted-syntax -- ambient asset module mirrors Vite's ?url default export. */
declare module "*.midi?url" {
  const src: string;
  export default src;
}
