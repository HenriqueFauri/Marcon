import { test } from "node:test";
import assert from "node:assert/strict";
import { PRE_SKIP, crcOgg, embrulharOgg } from "../src/ogg-opus.ts";

interface Pagina {
  tipo: number;
  granulo: bigint;
  seq: number;
  crcOk: boolean;
  pacotes: Uint8Array[];
}

// lê de volta as páginas Ogg, remonta os pacotes e confere o CRC de cada página
function ler(ogg: Uint8Array): Pagina[] {
  const paginas: Pagina[] = [];
  let pos = 0;
  let aberto: number[] = [];
  while (pos < ogg.length) {
    assert.equal(String.fromCharCode(...ogg.subarray(pos, pos + 4)), "OggS");
    const v = new DataView(ogg.buffer, ogg.byteOffset + pos);
    const nseg = v.getUint8(26);
    const tabela = ogg.subarray(pos + 27, pos + 27 + nseg);
    const corpo = tabela.reduce((s, x) => s + x, 0);
    const bruto = ogg.slice(pos, pos + 27 + nseg + corpo);
    const crc = new DataView(bruto.buffer).getUint32(22, true);
    new DataView(bruto.buffer).setUint32(22, 0, true);
    const pacotes: Uint8Array[] = [];
    let p = pos + 27 + nseg;
    for (const seg of tabela) {
      aberto.push(...ogg.subarray(p, p + seg));
      p += seg;
      if (seg < 255) {
        pacotes.push(Uint8Array.from(aberto));
        aberto = [];
      }
    }
    paginas.push({ tipo: v.getUint8(5), granulo: v.getBigInt64(6, true), seq: v.getUint32(18, true), crcOk: crcOgg(bruto) === crc, pacotes });
    pos += 27 + nseg + corpo;
  }
  return paginas;
}

test("CRC do Ogg bate com o valor conhecido", () => {
  // "OggS" com o polinômio 0x04c11db7 sem reflexão
  assert.equal(crcOgg(new TextEncoder().encode("OggS")), 0x5fb0a94f);
});

test("cabeçalhos Opus, CRC certo, começo e fim marcados e duração cortada", () => {
  // 100 pacotes de 20 ms (960 amostras), tamanhos variados, inclusive acima de 255 bytes
  const pacotes = Array.from({ length: 100 }, (_, i) => ({ dados: new Uint8Array(40 + ((i * 37) % 400)).fill(i), amostras: 960 }));
  const total = 100 * 960 - 500; // o áudio original é um pouco menor que os pacotes
  const paginas = ler(embrulharOgg(pacotes, total));

  assert.ok(paginas.every((p) => p.crcOk), "CRC de alguma página não confere");
  assert.deepEqual(paginas.map((p) => p.seq), paginas.map((_, i) => i));
  assert.equal(paginas[0].tipo, 0x02); // começo do fluxo
  assert.equal(paginas.at(-1)!.tipo, 0x04); // fim do fluxo
  assert.equal(String.fromCharCode(...paginas[0].pacotes[0].subarray(0, 8)), "OpusHead");
  assert.equal(new DataView(paginas[0].pacotes[0].buffer).getUint16(10, true), PRE_SKIP);
  assert.equal(String.fromCharCode(...paginas[1].pacotes[0].subarray(0, 8)), "OpusTags");

  const dados = paginas.slice(2).flatMap((p) => p.pacotes);
  assert.equal(dados.length, 100);
  dados.forEach((d, i) => assert.equal(d.length, 40 + ((i * 37) % 400)));
  // granulo só cresce e o último corta o enchimento: pre-skip + tamanho original
  const granulos = paginas.slice(2).map((p) => p.granulo);
  for (let i = 1; i < granulos.length; i++) assert.ok(granulos[i] >= granulos[i - 1]);
  assert.equal(paginas.at(-1)!.granulo, BigInt(PRE_SKIP + total));
});

test("pacote de tamanho múltiplo de 255 termina com segmento zero", () => {
  const paginas = ler(embrulharOgg([{ dados: new Uint8Array(510).fill(7), amostras: 960 }], 960));
  assert.equal(paginas.at(-1)!.pacotes[0].length, 510);
});
