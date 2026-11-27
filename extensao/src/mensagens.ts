import type { ProdutoBusca } from "./formatar.ts";
import type { VendaRapida } from "../../src/lib/venda-rapida.ts";
import type { ArquivoAnexo } from "./base64.ts";

// Pedidos que o painel faz ao service worker. Tudo que fala com o Supabase fica no service worker.
export type Pedido =
  | { tipo: "sessao" }
  | { tipo: "entrar"; email: string; senha: string }
  | { tipo: "entrarGoogle" }
  | { tipo: "trocarCodigo"; code: string }
  | { tipo: "sair" }
  | { tipo: "buscar"; termo: string }
  | { tipo: "respostas" }
  | { tipo: "inserir"; texto: string }
  | { tipo: "dadosVenda" }
  | { tipo: "vender"; venda: VendaRapida }
  | { tipo: "fecharPainel" }
  // parte 3: fotos do produto e biblioteca de mídia. Anexar só abre a prévia do WhatsApp.
  | { tipo: "fotosProduto"; produtoId: string }
  | { tipo: "anexarFoto"; path: string; nome: string }
  | { tipo: "midias" }
  | { tipo: "anexarMidia"; id: string }
  | { tipo: "urlMidia"; id: string }
  | { tipo: "anexarArquivo"; arquivo: ArquivoAnexo }
  | { tipo: "salvarGravacao"; base64: string; ext: string; titulo: string; duracao: number }
  | { tipo: "abrirMicrofone" };

export type Resposta<T = unknown> = { ok: true; dados: T } | { ok: false; erro: string };

export interface Sessao {
  email: string;
  ambiente: "staging" | "producao";
}

export type RespostaBusca = Resposta<ProdutoBusca[]>;

// Resultado de Anexar. Sem a prévia aberta, o arquivo volta para o painel oferecer Baixar.
export interface ResultadoAnexar {
  anexou: boolean;
  mensagem: string;
  arquivo?: ArquivoAnexo;
}

// Pedidos do service worker ao script da aba do WhatsApp.
export type PedidoAba = { tipo: "inserir"; texto: string } | { tipo: "anexar"; arquivo: ArquivoAnexo } | { tipo: "alternarPainel" };

export function pedir<T>(p: Pedido): Promise<Resposta<T>> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(p, (r: Resposta<T> | undefined) => {
        if (chrome.runtime.lastError || !r) {
          resolve({ ok: false, erro: "A extensão não respondeu. Feche e abra o painel." });
        } else resolve(r);
      });
    } catch {
      resolve({ ok: false, erro: "A extensão foi atualizada. Recarregue a página." });
    }
  });
}
