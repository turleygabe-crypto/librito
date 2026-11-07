export const browserLanguageCodes = {
  ar: "ara", bn: "ben", cs: "cze", da: "dan", de: "ger", en: "eng",
  es: "spa", fi: "fin", fr: "fre", el: "gre", hi: "hin", he: "heb",
  hu: "hun", id: "ind", it: "ita", ja: "jpn", ko: "kor", nl: "dut",
  no: "nor", pl: "pol", pt: "por", ro: "rum", ru: "rus", sv: "swe",
  th: "tha", tr: "tur", uk: "ukr", vi: "vie", zh: "chi",
};

export async function detectSearchLanguage(query) {
  const text = query.trim();
  if (!/\p{L}/u.test(text)) return { language: "", preferredLanguage: "" };
  const { detectAll } = await import("./language-detector.js");
  const candidates = detectAll(text);
  const first = candidates[0];
  if (!first || !browserLanguageCodes[first.lang]) {
    return { language: "", preferredLanguage: "" };
  }
  const second = candidates[1]?.accuracy || 0;
  const strongSignal = first.accuracy >= 0.1 && first.accuracy >= second * 2.5;
  const preferredLanguage = strongSignal ? browserLanguageCodes[first.lang] : "";
  const sufficientlyLong = /\p{Script=Latin}/u.test(text)
    ? (text.match(/\p{L}+/gu) || []).length >= 3 && [...text].length >= 15
    : [...text].length >= 5;
  const confident = sufficientlyLong && strongSignal;
  return { language: confident ? preferredLanguage : "", preferredLanguage };
}

export function rankSearchLanguages(books, query, preferredLanguage) {
  if (!preferredLanguage) return books;
  const normalize = (value) => String(value || "").normalize("NFD")
    .replace(/\p{M}/gu, "").toLowerCase();
  const terms = normalize(query).match(/\p{L}+/gu) || [];
  const score = (book) => {
    const text = normalize(`${book.title} ${book.author}`);
    return terms.filter((term) => text.includes(term)).length * 2
      + Number(book.language === preferredLanguage);
  };
  return [...books].sort((first, second) => score(second) - score(first));
}
