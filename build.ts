import {rimraf} from 'rimraf';
import {build, type Options} from 'tsdown';

const isWatch = process.argv.includes('--watch');

const tsdownConfig: Options = {
  dts: true,
  clean: false,
  sourcemap: false,
  target: 'esnext',
  format: ['esm', 'cjs'],
  outDir: './dist',
  unbundle: true,
  treeshake: true,
  unused: true,
  watch: isWatch,
};

const entries: Options[] = [
  {
    entry: [
      './src/index.ts',
      './src/consts.ts',
      './src/core/index.ts',
      './src/utils/tools.ts',
      // Middleware
      './src/middle/cors.ts',
      './src/middle/proxy.ts',
      './src/middle/logger.ts',
      // helps
      './src/helps/stream/index.ts',
    ],
    external: [/.*\/uws$/, /^\.\.\/uws/, 'uws'],
  },
];

async function buildProject() {
  // Clean previous dist folders
  await rimraf('./dist', {glob: false});
  console.log('🚀 Building exstack...');
  for (const entry of entries) {
    // Build main entry point
    await build({...tsdownConfig, ...entry});
  }
  // Remove all .d.mts files
  await rimraf(['./dist/**/*.d.mts', './dist/**/*.d.cts'], {glob: true});
}

buildProject();
