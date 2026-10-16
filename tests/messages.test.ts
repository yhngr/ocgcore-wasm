// Message decoders checked against the byte layout written by the core
// (cpp/ygo, edo9300/ygopro-core). Every message must be read exactly: no
// "eof", no byte left. Run with `pnpm run test:messages`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BufferReader, BufferWriter } from "../src/internal/buffer";
import { readMessage } from "../src/messages";
import { OcgMessageType } from "../src/type_message";

type Loc = [controller: number, location: number, sequence: number, position: number];

function loc(w: BufferWriter, [c, l, s, p]: Loc) {
  w.u8(c).u8(l).u32(s).u32(p);
}

function read(w: BufferWriter) {
  const bytes = w.get();
  const reader = new BufferReader(new DataView(bytes.buffer, 0, bytes.byteLength));
  const message = readMessage(reader);
  assert.equal(reader.avail, 0, "every byte of the message is read");
  return message as any;
}

const empty: Loc = [0, 0, 0, 0];

test("SHUFFLE_SET_CARD: u8 count, all origins, then all destinations (ShuffleSetCard)", () => {
  const from: Loc[] = [
    [1, 0x08, 0, 0xa],
    [1, 0x08, 2, 0xa],
    [1, 0x08, 3, 0xa],
  ];
  const w = new BufferWriter().u8(OcgMessageType.SHUFFLE_SET_CARD);
  w.u8(0x08).u8(from.length);
  from.forEach((l) => loc(w, l));
  from.forEach(() => loc(w, empty));
  const m = read(w);
  assert.equal(m.location, 0x08);
  assert.equal(m.cards.length, 3);
  assert.deepEqual(
    m.cards.map((c: any) => [c.from.controller, c.from.location, c.from.sequence, c.from.position]),
    from,
  );
  for (const c of m.cards) assert.equal(c.to.location, 0);
});

test("SHUFFLE_SET_CARD: destination of an Xyz host (monster zone)", () => {
  const w = new BufferWriter().u8(OcgMessageType.SHUFFLE_SET_CARD);
  w.u8(0x04).u8(2);
  loc(w, [0, 0x04, 1, 0x8]);
  loc(w, [0, 0x04, 4, 0x8]);
  loc(w, [0, 0x04, 4, 0x8]);
  loc(w, empty);
  const m = read(w);
  assert.equal(m.cards[0].to.sequence, 4);
  assert.equal(m.cards[1].to.location, 0);
});

test("MOVE ends with the reason", () => {
  const w = new BufferWriter().u8(OcgMessageType.MOVE).u32(12345678);
  loc(w, [0, 0x02, 1, 0xa]);
  loc(w, [0, 0x10, 0, 0x5]);
  w.u32(0x40);
  const m = read(w);
  assert.equal(m.card, 12345678);
  assert.equal(m.to.location, 0x10);
  assert.equal(m.reason, 0x40);
});

test("ANNOUNCE_ATTRIB: available is an u32", () => {
  const w = new BufferWriter().u8(OcgMessageType.ANNOUNCE_ATTRIB).u8(1).u8(1).u32(0x3f);
  const m = read(w);
  assert.equal(m.player, 1);
  assert.equal(m.count, 1);
  assert.equal(Number(m.available), 0x3f);
});

test("AI_NAME and SHOW_HINT: u16 length, text, terminating NUL", () => {
  for (const type of [OcgMessageType.AI_NAME, OcgMessageType.SHOW_HINT]) {
    const text = new TextEncoder().encode("Windbot");
    const w = new BufferWriter().u8(type).u16(text.length);
    w.bytes(text);
    w.u8(0);
    const m = read(w);
    assert.equal(type === OcgMessageType.AI_NAME ? m.name : m.hint, "Windbot");
  }
});

test("SWAP_GRAVE_DECK: bit buffer of the cards sent to the Extra Deck", () => {
  const w = new BufferWriter().u8(OcgMessageType.SWAP_GRAVE_DECK).u8(0).u32(15);
  w.u32(2);
  w.u8(0b00000101).u8(0b00000010);
  const m = read(w);
  assert.equal(m.deck_size, 15);
  assert.deepEqual(m.returned_to_extra, [0, 2, 9]);
});
