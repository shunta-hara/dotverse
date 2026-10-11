// 仕様: NGワードフィルタは leo-profanity（design-decisions.md）。検出時 CHAT_NG_WORD。
import { describe, expect, it } from "vitest";
import { cleanText, containsNgWord } from "../ngWordFilter";

describe("containsNgWord", () => {
  it("NGワードを含む文は検出する", () => {
    expect(containsNgWord("fuck you")).toBe(true);
  });

  it("大文字小文字を区別しない", () => {
    expect(containsNgWord("FUCK")).toBe(true);
  });

  it("文中に埋もれていても検出する", () => {
    expect(containsNgWord("well, what the fuck is this")).toBe(true);
  });

  it("通常の文は検出しない", () => {
    expect(containsNgWord("hello world")).toBe(false);
    expect(containsNgWord("こんにちは！")).toBe(false);
  });

  it("空文字は検出しない", () => {
    expect(containsNgWord("")).toBe(false);
  });

  it("NGワードを部分文字列に含むだけの無害な単語は誤検出しない", () => {
    expect(containsNgWord("class assignment classic")).toBe(false);
  });

  // 日本語チャットが主用途だが japaneseNgWords が空配列のため、日本語の暴言は素通りする。
  // 日本語辞書の方針が決まったら実データで test に昇格させる。
  it.todo("日本語のNGワードを検出する（辞書が未整備）");
});

describe("cleanText", () => {
  it("NGワードを伏せ字にし、元の語を残さない", () => {
    const cleaned = cleanText("what the fuck");
    expect(cleaned).not.toContain("fuck");
    expect(cleaned.startsWith("what the ")).toBe(true);
  });

  it("無害な文はそのまま", () => {
    expect(cleanText("hello world")).toBe("hello world");
  });
});
