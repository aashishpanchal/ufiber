import fs from 'node:fs';
import {glob} from 'glob';
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
      './src/types.ts',
      './src/consts.ts',
      './src/utils/tools.ts',
      './src/stream/index.ts',
      // Middleware
      './src/middle/cors.ts',
      './src/middle/proxy.ts',
      './src/middle/logger.ts',
      './src/middle/powered-by.ts',
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
  // Fix uws imports in ESM files
  console.log('🔧 Fixing uws imports in ESM files...');
  await patchCjsFile();
  await patchMjsFile();
}

buildProject().catch(console.error);

const patchCjsFile = async () => {
  const files = await glob('./dist/**/*.cjs');
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    // CJS: require("../../../uws") → require("../../../uws/index.cjs")
    content = content.replace(
      /require\(\s*(['"])((?:\.\.\/)+uws)\1\s*\)/g,
      "require('$2/index.cjs')",
    );
    if (content !== originalContent) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`  ✓ Fixed: ${file}`);
    }
  }
};

const patchMjsFile = async () => {
  const files = await glob('./dist/**/*.{js,d.ts}');
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    // ESM: from "../../../uws" → from "../../../uws/index.js"
    content = content.replace(
      /from\s+(['"])((?:\.\.\/)+uws)\1/g,
      "from '$2/index.js'",
    );
    if (content !== originalContent) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`  ✓ Fixed: ${file}`);
    }
  }
};
