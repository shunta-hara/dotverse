import leoProfanity from "leo-profanity";

leoProfanity.loadDictionary("en");

const japaneseNgWords: string[] = [];

japaneseNgWords.forEach((w) => leoProfanity.add(w));

export function containsNgWord(text: string): boolean {
  return leoProfanity.check(text);
}

export function cleanText(text: string): string {
  return leoProfanity.clean(text);
}
