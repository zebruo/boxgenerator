/**
 * Module i18n — wrapper i18next pour BoxGenerator.
 * Ressources inline (fr / en), pas de backend/fetch.
 * Usage : import { t, setLang, currentLang } from './i18n.js';
 */
import i18next from '../../node_modules/i18next/dist/esm/i18next.bundled.js';
import { fr } from '../i18n/fr.js';
import { en } from '../i18n/en.js';

i18next.init({
  lng:            localStorage.getItem('lang') || 'fr',
  fallbackLng:    'fr',
  resources:      { fr: { translation: fr }, en: { translation: en } },
  initImmediate:  false,   // synchrone — pas de Promise à attendre
  interpolation:  { escapeValue: false }
});

export const t          = (key, opts) => i18next.t(key, opts);
export const currentLang = ()         => i18next.language;
export const setLang    = lang => {
  localStorage.setItem('lang', lang);
  i18next.changeLanguage(lang);
};
