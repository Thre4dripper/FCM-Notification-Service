import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/main.js',
  minify: true,
});

const stat = await import('fs').then(fs => fs.promises.stat('dist/main.js'));
console.log(`Bundle size: ${(stat.size / 1024).toFixed(1)} KB`);
