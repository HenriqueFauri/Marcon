// Página para liberar o microfone da extensão. O painel lateral do navegador não mostra o pedido de
// permissão; numa aba normal ele aparece. Depois de liberado aqui, o painel grava. Não grava nada.
const app = document.getElementById("app")!;

function mostrar(titulo: string, texto: string, erro = false) {
  const cartao = document.createElement("div");
  cartao.className = "cartao";
  const vazio = document.createElement("div");
  vazio.className = "vazio";
  const forte = document.createElement("strong");
  forte.textContent = titulo;
  vazio.append(forte, texto);
  if (erro) vazio.style.color = "var(--danger)";
  cartao.append(vazio);
  app.replaceChildren(cartao);
}

async function liberar() {
  mostrar("Liberar microfone", "Permita o uso do microfone no aviso do navegador.");
  try {
    const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    fluxo.getTracks().forEach((t) => t.stop());
    mostrar("Microfone liberado", "Pode fechar esta aba e voltar ao painel do Marcon para gravar.");
  } catch (e) {
    const nome = (e as DOMException)?.name;
    mostrar(
      "Microfone bloqueado",
      nome === "NotFoundError"
        ? "Nenhum microfone encontrado neste computador."
        : "Libere no ícone do cadeado da barra de endereço (Microfone: Permitir) e recarregue esta aba.",
      true,
    );
  }
}

liberar();
