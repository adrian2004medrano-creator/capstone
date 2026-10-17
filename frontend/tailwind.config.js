/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1F5E9E",
          light: "#2B78C2",
        },
        surface: "#F1F7FD",
        primary: {
          DEFAULT: "#2B7FCB",
          dark: "#1F65A8",
          light: "#E3F1FC",
        },
        amber: {
          DEFAULT: "#C58B36",
          light: "#F8F0E2",
        },
        risk: {
          DEFAULT: "#C9524D",
          light: "#F8EAE8",
        },
        caution: {
          DEFAULT: "#B77B25",
          light: "#F8F0E2",
        },
        ink900: "#17324F",
        muted: "#5E7691",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(31, 94, 158, 0.05), 0 8px 24px rgba(31, 94, 158, 0.06)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
};
