import { defineConfig, loadEnv } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "");

  return {
    plugins: [
      webExtension({
        manifest: "src/manifest.json",
      }),
    ],
    define: {
      __OPENROUTER_API_KEY__: JSON.stringify(env.OPENROUTER_API_KEY ?? ""),
      __HF_UNCERTAINTY_API_TOKEN__: JSON.stringify(env.HF_UNCERTAINTY_API_TOKEN ?? ""),
    },
  };
});
