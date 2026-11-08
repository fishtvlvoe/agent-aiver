export { config, type Locale } from "./config";
export { getMessagesForLocale } from "./lib/get-messages";
export { resolveLocale } from "./lib/resolve-locale";
export { default as defaultMailTranslations } from "./translations/zh-TW/mail.json";
export type { MailMessages, MarketingMessages, SaasMessages, SharedMessages } from "./types";
