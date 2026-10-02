// Guarda uma preferência de tela (período, vista) por um ano, para o servidor já abrir
// a página do jeito que a pessoa deixou. Só chamar no navegador, em resposta a um clique.
export function lembrarPreferencia(nome: string, valor: string) {
  document.cookie = `${nome}=${valor}; path=/; max-age=31536000; samesite=lax`;
}
