import defaultTheme from "tailwindcss/defaultTheme";
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["PT Sans", "Open Sans", ...defaultTheme.fontFamily.sans],
        serif: ["Georgia", "Lora", ...defaultTheme.fontFamily.serif],
        mono: ["Geist Mono", ...defaultTheme.fontFamily.mono],
      },
      typography: {
        DEFAULT: {
          css: {
            fontSize: "1.25rem", // 20px
            lineHeight: "1.8",
            maxWidth: "750px",
            fontFamily: "Georgia, Lora, serif",
            h1: {
              fontFamily: "PT Sans, Open Sans, sans-serif",
              fontSize: "3.75rem", // 60px (3x основного текста)
              lineHeight: "1.2",
              fontWeight: "600",
            },
            h2: {
              fontFamily: "PT Sans, Open Sans, sans-serif",
              fontSize: "2.5rem", // 40px (2x основного текста)
              lineHeight: "1.3",
              fontWeight: "600",
            },
            h3: {
              fontFamily: "PT Sans, Open Sans, sans-serif",
              fontSize: "1.75rem",
              lineHeight: "1.4",
              fontWeight: "600",
            },
            h4: {
              fontFamily: "PT Sans, Open Sans, sans-serif",
              fontSize: "1.5rem",
              lineHeight: "1.4",
              fontWeight: "600",
            },
            p: {
              marginTop: "1.5em",
              marginBottom: "1.5em",
            },
            a: {
              fontFamily: "Georgia, Lora, serif",
            },
            blockquote: {
              fontFamily: "Georgia, Lora, serif",
              fontStyle: "italic",
            },
            li: {
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
