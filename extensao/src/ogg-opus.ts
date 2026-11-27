// Áudio em OGG/Opus, o formato da mensagem de voz do WhatsApp. O painel decodifica o áudio (gravado
// ou da biblioteca), passa para 48 kHz mono, codifica em Opus com o WebCodecs do navegador e
// embrulha os pacotes em páginas Ogg (RFC 7845). A parte de embrulhar é pura e testada em Node.

export const TAXA = 48000;
export const PRE_SKIP = 312; // atraso padrão do codificador Opus a 48 kHz

// CRC do Ogg: polinômio 0x04c11db7, sem reflexão, começa em 0
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

export function crcOgg(dados: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < dados.length; i++) crc = ((crc << 8) ^ TABELA[((crc >>> 24) ^ dados[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

function pagina(pacotes: Uint8Array[], granulo: bigint, serial: number, sequencia: number, tipo: number): Uint8Array {
  const segmentos: number[] = [];
  for (const p of pacotes) {
    let resto = p.length;
    while (resto >= 255) {
      segmentos.push(255);
      resto -= 255;
    }
    segmentos.push(resto);
  }
  if (segmentos.length > 255) throw new Error("página com segmentos demais");
  const corpo = pacotes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(27 + segmentos.length + corpo);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53]); // "OggS"
  v.setUint8(4, 0);
  v.setUint8(5, tipo);
  v.setBigInt64(6, granulo, true);
  v.setUint32(14, serial, true);
  v.setUint32(18, sequencia, true);
  v.setUint32(22, 0, true);
  v.setUint8(26, segmentos.length);
  out.set(segmentos, 27);
  let pos = 27 + segmentos.length;
  for (const p of pacotes) {
    out.set(p, pos);
    pos += p.length;
  }
  v.setUint32(22, crcOgg(out), true);
  return out;
}

function cabecalhoOpus(canais: number, taxaOriginal: number): Uint8Array {
  const out = new Uint8Array(19);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusHead"));
  v.setUint8(8, 1);
  v.setUint8(9, canais);
  v.setUint16(10, PRE_SKIP, true);
  v.setUint32(12, taxaOriginal, true);
  v.setInt16(16, 0, true);
  v.setUint8(18, 0);
  return out;
}

function tagsOpus(): Uint8Array {
  const fornecedor = new TextEncoder().encode("Marcon");
  const out = new Uint8Array(8 + 4 + fornecedor.length + 4);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusTags"));
  v.setUint32(8, fornecedor.length, true);
  out.set(fornecedor, 12);
  v.setUint32(12 + fornecedor.length, 0, true);
  return out;
}

// Embrulha pacotes Opus (cada um com quantas amostras a 48 kHz ele decodifica) num arquivo Ogg.
// totalAmostras: tamanho do áudio original a 48 kHz, para cortar o enchimento do último pacote.
export function embrulharOgg(pacotes: { dados: Uint8Array; amostras: number }[], totalAmostras: number, canais = 1): Uint8Array {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const paginas: Uint8Array[] = [];
  let seq = 0;
  paginas.push(pagina([cabecalhoOpus(canais, TAXA)], 0n, serial, seq++, 0x02));
  paginas.push(pagina([tagsOpus()], 0n, serial, seq++, 0x00));
  const fim = BigInt(PRE_SKIP + totalAmostras);
  let granulo = 0n;
  let lote: Uint8Array[] = [];
  let segmentos = 0;
  pacotes.forEach((p, i) => {
    const seg = Math.floor(p.dados.length / 255) + 1;
    if (lote.length > 0 && (segmentos + seg > 255 || lote.length >= 50)) {
      paginas.push(pagina(lote, granulo < fim ? granulo : fim, serial, seq++, 0x00));
      lote = [];
      segmentos = 0;
    }
    lote.push(p.dados);
    segmentos += seg;
    granulo += BigInt(p.amostras);
    if (i === pacotes.length - 1) paginas.push(pagina(lote, granulo < fim ? granulo : fim, serial, seq++, 0x04));
  });
  if (pacotes.length === 0) paginas.push(pagina([], 0n, serial, seq++, 0x04));
  const total = paginas.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of paginas) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Só no navegador (painel): decodifica qualquer áudio que o navegador abre e codifica em Opus.

export function codificaOpus(): boolean {
  return typeof AudioEncoder !== "undefined" && typeof OfflineAudioContext !== "undefined";
}

async function paraMono48k(bytes: ArrayBuffer): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, TAXA);
  const original = await ctx.decodeAudioData(bytes.slice(0));
  const tamanho = Math.max(1, Math.ceil(original.duration * TAXA));
  const mix = new OfflineAudioContext(1, tamanho, TAXA);
  const fonte = mix.createBufferSource();
  fonte.buffer = original;
  fonte.connect(mix.destination);
  fonte.start();
  const pronto = await mix.startRendering();
  return pronto.getChannelData(0);
}

// Qualquer áudio (M4A, MP3, OGG, WebM...) vira OGG/Opus mono a 48 kHz. Devolve também a duração.
export async function paraOggOpus(bytes: ArrayBuffer): Promise<{ ogg: Uint8Array; segundos: number }> {
  const pcm = await paraMono48k(bytes);
  const pacotes: { dados: Uint8Array; amostras: number }[] = [];
  let erro: unknown = null;
  const enc = new AudioEncoder({
    output: (chunk) => {
      const dados = new Uint8Array(chunk.byteLength);
      chunk.copyTo(dados);
      pacotes.push({ dados, amostras: Math.round(((chunk.duration ?? 20000) * TAXA) / 1_000_000) });
    },
    error: (e) => (erro = e),
  });
  enc.configure({ codec: "opus", sampleRate: TAXA, numberOfChannels: 1, bitrate: 32000 });
  const passo = TAXA; // um segundo por vez
  for (let i = 0; i < pcm.length; i += passo) {
    const pedaco = pcm.subarray(i, Math.min(pcm.length, i + passo));
    const dados = new AudioData({
      format: "f32-planar",
      sampleRate: TAXA,
      numberOfFrames: pedaco.length,
      numberOfChannels: 1,
      timestamp: Math.round((i / TAXA) * 1_000_000),
      data: new Float32Array(pedaco),
    });
    enc.encode(dados);
    dados.close();
  }
  await enc.flush();
  enc.close();
  if (erro) throw erro;
  return { ogg: embrulharOgg(pacotes, pcm.length), segundos: pcm.length / TAXA };
}
