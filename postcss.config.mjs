// Standard Next.js + Tailwind v4 wiring (the Vite/vinext path used the plugin
// directly; `next build` needs PostCSS to pick Tailwind up from here).
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
