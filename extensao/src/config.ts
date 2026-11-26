// Valores trocados pelo build.mjs (esbuild define). Só dado público: URL do projeto, chave anon
// (a mesma que o site entrega a qualquer navegador) e a base do link da loja. Chave de serviço nunca.
declare const __AMBIENTE__: "staging" | "producao";
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON__: string;
declare const __BASE_LOJA__: string;

export const AMBIENTE = __AMBIENTE__;
export const SUPABASE_URL = __SUPABASE_URL__;
export const SUPABASE_ANON = __SUPABASE_ANON__;
export const BASE_LOJA = __BASE_LOJA__;
