"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./modal";
import { btnPrimary, btnSecondary, inputClass } from "./ui";

// BarcodeDetector ainda não está nos tipos do TypeScript
interface DetectorDeCodigo {
  detect(fonte: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type ConstrutorDetector = new (opcoes?: { formats?: string[] }) => DetectorDeCodigo;

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

function criarDetector(): DetectorDeCodigo | null {
  const Construtor = (globalThis as { BarcodeDetector?: ConstrutorDetector }).BarcodeDetector;
  if (!Construtor) return null;
  try {
    return new Construtor({ formats: FORMATOS });
  } catch {
    return null;
  }
}

// Câmera ao vivo procurando um código. Só monta com o leitor aberto, então liga e desliga a câmera sozinha.
function Camera({ onCodigo, onIndisponivel }: { onCodigo: (c: string) => void; onIndisponivel: (motivo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const aoLer = useRef(onCodigo);
  const aoFalhar = useRef(onIndisponivel);

  useEffect(() => {
    aoLer.current = onCodigo;
    aoFalhar.current = onIndisponivel;
  });

  useEffect(() => {
    const detector = criarDetector();
    if (!detector) {
      aoFalhar.current("Este navegador não lê código de barras pela câmera. Digite o código abaixo.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      aoFalhar.current("Não deu para abrir a câmera aqui. Digite o código abaixo.");
      return;
    }

    let parar = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function ciclo() {
      const video = videoRef.current;
      if (parar || !video) return;
      try {
        if (video.readyState >= 2) {
          const achados = await detector!.detect(video);
          const valor = achados[0]?.rawValue?.trim();
          if (valor && !parar) {
            parar = true;
            aoLer.current(valor);
            return;
          }
        }
      } catch {
        // um quadro ruim não derruba a leitura
      }
      if (!parar) timer = setTimeout(ciclo, 200);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (s) => {
        if (parar) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play().catch(() => {});
        ciclo();
      })
      .catch(() => {
        aoFalhar.current("A câmera não abriu. Libere o acesso no navegador ou digite o código abaixo.");
      });

    return () => {
      parar = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[28%] -translate-y-1/2 rounded-xl border-2 border-white/80" />
    </div>
  );
}

// Botão que abre a câmera e devolve o código lido. Sem câmera ou sem BarcodeDetector, sobra o campo de digitar.
export function BotaoLerCodigo({
  onCodigo,
  rotulo = "Ler código de barras",
  className = btnSecondary,
}: {
  onCodigo: (codigo: string) => void;
  rotulo?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [digitado, setDigitado] = useState("");

  function fechar() {
    setAberto(false);
    setAviso(null);
    setDigitado("");
  }

  function entregar(codigo: string) {
    const limpo = codigo.replace(/\s+/g, "");
    if (!limpo) return;
    fechar();
    onCodigo(limpo);
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M12 8v8M16 8v8" />
        </svg>
        {rotulo}
      </button>
      <Modal open={aberto} onClose={fechar} title="Ler código de barras" description="Aponte a câmera para o código." folha>
        <div className="flex flex-col gap-3">
          {aviso ? <p className="rounded-xl bg-fill p-3 text-sm text-ink-2">{aviso}</p> : <Camera onCodigo={entregar} onIndisponivel={setAviso} />}
          <div className="flex gap-2">
            <input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              onKeyDown={(e) => {
                // dentro do formulário de produto, Enter não pode enviar o cadastro
                if (e.key !== "Enter") return;
                e.preventDefault();
                entregar(digitado);
              }}
              inputMode="numeric"
              aria-label="Digitar o código"
              placeholder="Ou digite o código"
              className={inputClass}
            />
            <button type="button" onClick={() => entregar(digitado)} disabled={!digitado.trim()} className={btnPrimary}>
              Usar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
