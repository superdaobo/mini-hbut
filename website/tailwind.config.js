/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Cyberpunk colors
        cyan: {
          DEFAULT: '#0FF0FC',
          50: '#E6FEFF',
          100: '#B3FCFE',
          200: '#80FAFE',
          300: '#4DF7FD',
          400: '#0FF0FC',
          500: '#0DD4E0',
          600: '#0AB0BC',
          700: '#078C98',
          800: '#046874',
          900: '#024450',
        },
        purple: {
          DEFAULT: '#FF2E63',
          50: '#FFE6EC',
          100: '#FFB3C4',
          200: '#FF809D',
          300: '#FF4D75',
          400: '#FF2E63',
          500: '#E0284E',
          600: '#BC2040',
          700: '#981832',
          800: '#741024',
          900: '#500816',
        },
        pink: {
          DEFAULT: '#FE53BB',
          50: '#FEE6F5',
          100: '#FDB3E4',
          200: '#FC80D3',
          300: '#FB4DC2',
          400: '#FE53BB',
          500: '#E048A4',
          600: '#BC3D8D',
          700: '#983276',
          800: '#74275F',
          900: '#501C48',
        },
        cyber: {
          dark: '#161b22',
          gray: '#30363d',
          blue: '#3b4dd6',
          green: '#29d64d',
        },
      },
      fontFamily: {
        pixel: ['SmileySans', 'sans-serif'], // User requested all fonts to be changed
        mono: ['SmileySans', 'sans-serif'],  // User requested all fonts to be changed
        sans: ['SmileySans', 'sans-serif'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        neon: '0 0 5px #0FF0FC, 0 0 10px #0FF0FC, 0 0 20px #0FF0FC',
        'neon-pink': '0 0 5px #FE53BB, 0 0 10px #FE53BB, 0 0 20px #FE53BB',
        'neon-purple': '0 0 5px #FF2E63, 0 0 10px #FF2E63, 0 0 20px #FF2E63',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 5px #0FF0FC, 0 0 10px #0FF0FC" },
          "50%": { boxShadow: "0 0 20px #0FF0FC, 0 0 40px #0FF0FC" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "orbit": {
          from: { transform: "rotate(0deg) translateX(120px) rotate(0deg)" },
          to: { transform: "rotate(360deg) translateX(120px) rotate(-360deg)" },
        },
        "glitch": {
          "0%": { clipPath: "inset(40% 0 61% 0)", transform: "translate(-2px, 2px)" },
          "20%": { clipPath: "inset(92% 0 1% 0)", transform: "translate(2px, -2px)" },
          "40%": { clipPath: "inset(43% 0 1% 0)", transform: "translate(-2px, 2px)" },
          "60%": { clipPath: "inset(25% 0 58% 0)", transform: "translate(2px, -2px)" },
          "80%": { clipPath: "inset(54% 0 7% 0)", transform: "translate(-2px, 2px)" },
          "100%": { clipPath: "inset(58% 0 43% 0)", transform: "translate(2px, -2px)" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "data-rain": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { transform: "translateY(100vh)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "orbit": "orbit 20s linear infinite",
        "glitch": "glitch 2s infinite linear alternate-reverse",
        "scan": "scan 3s linear infinite",
        "data-rain": "data-rain 10s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
