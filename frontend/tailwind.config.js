/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#132A26", // deep forest teal - sidebar/nav base
          light: "#1B3A34",
        },
        surface: "#F7F5EF", // warm off-white background
        primary: {
          DEFAULT: "#1F7A63", // growth/care teal
          dark: "#155A48",
          light: "#E7F3EF",
        },
        amber: {
          DEFAULT: "#E2A73E", // IDP / progress accent
          light: "#FBF0DC",
        },
        risk: {
          DEFAULT: "#D9534F", // high risk / alerts
          light: "#FBEAE9",
        },
        caution: {
          DEFAULT: "#E2A73E", // medium risk
          light: "#FBF0DC",
        },
        ink900: "#16211F",
        muted: "#5B6B67",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(19, 42, 38, 0.06), 0 4px 16px rgba(19, 42, 38, 0.05)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};