// Mensagens do Supabase Auth vêm em inglês; traduz as mais comuns.
const TRADUCOES: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar. Veja a mensagem que enviamos."],
  [/user already registered/i, "Já existe uma conta com esse e-mail. Tente entrar."],
  [/password should be at least/i, "A senha precisa ter pelo menos 6 caracteres."],
  [/rate limit|too many requests|security purposes/i, "Muitas tentativas seguidas. Aguarde um minuto e tente de novo."],
  [/unable to validate email|invalid email/i, "E-mail inválido."],
  [/same password|different from the old/i, "A nova senha precisa ser diferente da atual."],
  [/fetch|network/i, "Sem conexão. Verifique sua internet."],
];

export function traduzirErroAuth(mensagem: string) {
  for (const [padrao, traducao] of TRADUCOES) {
    if (padrao.test(mensagem)) return traducao;
  }
  return mensagem;
}
