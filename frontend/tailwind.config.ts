import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: "#212B36",
          active: "#343D48",
        },
        cream: {
          DEFAULT: "#F9F8F4",
          card: "#EFE9DF",
        },
        "create-btn": "#AA4A44",
      },
    },
  },
  plugins: [],
};
export default config;
