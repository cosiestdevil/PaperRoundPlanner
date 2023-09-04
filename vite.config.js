import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          const match = /node_modules\/([^\.]*?)\//gm.exec(id);
          if (match) {
            return match[1];
          }
        },
      },
    },
  },
});
