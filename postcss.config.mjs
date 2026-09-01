// Standard Next.js + Tailwind v4 wiring (the Vite/vinext path used the plugin
// directly; `next build` needs PostCSS to pick Tailwind up from here).
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
