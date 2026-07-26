import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "@/i18n/locales/en.json";
import ru from "@/i18n/locales/ru.json";

export const SUPPORTED_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number]["value"];

const LANGUAGE_KEY = "intervalTrainer.lang";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.value),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_KEY,
      caches: ["localStorage"],
    },
  });

export { i18n };
