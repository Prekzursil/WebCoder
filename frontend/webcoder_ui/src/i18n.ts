import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// For now, we will not load translations from a backend, but include them here or load from public/locales
// Later, you might want to use i18next-http-backend to load translations from a server
// import Backend from 'i18next-http-backend';

const resources = {
  en: {
    translation: {
      "app_title": "WebCoder",
      "nav_home": "Home",
      "nav_problems": "Problems",
      "nav_login": "Login",
      "nav_register": "Register",
      "login_header": "Login",
      "username_label": "Username",
      "password_label": "Password",
      "login_button": "Login",
      "or_login_with": "Or login with",
      "google_login": "Google",
      "github_login": "GitHub",
      "no_account_prompt": "Don't have an account?",
      "register_link_text": "Register here",
      "welcome_message": "Welcome to WebCoder",
      "problem_list_header": "Problems",
      "nav_my_submissions": "My Submissions",
      "nav_profile": "Profile",
      "nav_welcome_user": "Welcome, {{username}}!",
      "nav_logout": "Logout"
    }
  },
  ro: {
    translation: {
      "app_title": "WebCoder",
      "nav_home": "Acasă",
      "nav_problems": "Probleme",
      "nav_login": "Autentificare",
      "nav_register": "Înregistrare",
      "login_header": "Autentificare",
      "username_label": "Nume de utilizator",
      "password_label": "Parolă",
      "login_button": "Autentificare",
      "or_login_with": "Sau autentifică-te cu",
      "google_login": "Google",
      "github_login": "GitHub",
      "no_account_prompt": "Nu ai un cont?",
      "register_link_text": "Înregistrează-te aici",
      "welcome_message": "Bun venit la WebCoder",
      "problem_list_header": "Probleme",
      "nav_my_submissions": "Submisiile Mele",
      "nav_profile": "Profil",
      "nav_welcome_user": "Bun venit, {{username}}!",
      "nav_logout": "Deconectare"
    }
  }
};

i18n
  // .use(Backend) // If you want to load translations from a backend
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources,
    fallbackLng: 'en', // Use English if detected language is not available
    debug: true, // Set to false in production
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    detection: {
      // Order and from where user language should be detected
      order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage', 'cookie'], // Where to cache detected language
    }
  });

export default i18n;
