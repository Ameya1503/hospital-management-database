import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// NEW: Import the Tailwind V4 Vite plugin
import tailwindcss from '@tailwindcss/vite' 

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // NEW: Add the V4 Tailwind plugin here
    tailwindcss(), 
  ],
})