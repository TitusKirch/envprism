import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`)
]);

const runtimeDeps = ['citty', 'consola', 'pathe'];

export default defineConfig({
  build: {
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        'bin/envprism': resolve(__dirname, 'src/bin/envprism.ts'),
        index: resolve(__dirname, 'src/index.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      external: (id) => {
        if (nodeBuiltins.has(id)) return true;
        if (runtimeDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))) {
          return true;
        }
        return false;
      },
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
        banner: (chunk) => {
          if (chunk.name === 'bin/envprism') {
            return '#!/usr/bin/env node';
          }
          return '';
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
