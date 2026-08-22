// Ambient declaration for plain (non-module) CSS side-effect imports.
// Vite supplied this via `vite/client`; Next only declares `*.module.css`, and
// this project's tsconfig keeps `noUncheckedSideEffectImports: true`.
declare module "*.css";
