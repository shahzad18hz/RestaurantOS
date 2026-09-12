import assert from "node:assert/strict";
import test from "node:test";
function luminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
test("corrected workspace text pairs meet 4.5:1 contrast", () => {
  for (const [text, background] of [["172033", "ffffff"], ["596579", "f3f5f7"], ["ffffff", "1554c0"], ["f8fafc", "243244"], ["c3cfdd", "17212e"], ["172033", "f8fafc"]]) {
    const values = [luminance(text), luminance(background)].sort((a,b) => b-a);
    assert.ok((values[0]+0.05)/(values[1]+0.05) >= 4.5, `${text} on ${background}`);
  }
});
