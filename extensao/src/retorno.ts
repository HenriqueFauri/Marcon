// Volta do login com Google pela aba (plano B, quando o navegador não tem launchWebAuthFlow).
// Entrega só o código ao service worker, que confere se o login foi começado por esta extensão
// e troca o código pela sessão com o verificador PKCE guardado nela.
import { pedir, type Sessao } from "./mensagens.ts";

const msg = document.getElementById("msg")!;
const code = new URLSearchParams(location.search).get("code");
history.replaceState(null, "", location.pathname); // tira o código da barra de endereço

if (!code) {
  msg.textContent = "Login cancelado. Pode fechar esta aba.";
} else {
  pedir<Sessao>({ tipo: "trocarCodigo", code }).then((r) => {
    msg.textContent = r.ok ? "Pronto. Pode fechar esta aba e voltar ao WhatsApp." : r.erro;
    if (r.ok) setTimeout(() => window.close(), 1200);
  });
}
