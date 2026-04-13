import path from 'node:path';

const feRoot = path.resolve('apps/frontend');
const prettierConfig = path.resolve('apps/frontend/.prettierrc.json');

/** Paths relative to apps/frontend, quoted for the shell. */
function frontendArgs(files) {
  const rels = files.map((f) =>
    path.relative(feRoot, path.resolve(f)).split(path.sep).join('/')
  );
  return rels.map((r) => JSON.stringify(r)).join(' ');
}

function absArgs(files) {
  return files.map((f) => JSON.stringify(path.resolve(f))).join(' ');
}

/** Orval output — ignored by ESLint; linting it triggers "file ignored" warnings and fails --max-warnings=0. */
function excludeOrvalGenerated(files) {
  return files.filter(
    (f) => !path.normalize(f).includes(`${path.sep}lib${path.sep}api${path.sep}generated${path.sep}`)
  );
}

export default {
  'apps/frontend/**/*.{ts,tsx,js,jsx,mjs,cjs}': (files) => {
    const lintable = excludeOrvalGenerated(files);
    if (lintable.length === 0) return [];
    const args = frontendArgs(lintable);
    return [
      `pnpm --dir apps/frontend exec -- eslint --fix --max-warnings=0 ${args}`,
      `pnpm --dir apps/frontend exec -- prettier --write ${args}`
    ];
  },
  'apps/backend/**/*.go': (files) => {
    if (files.length === 0) return [];
    return `gofmt -s -w ${absArgs(files)}`;
  },
  'packages/{shared-types,kiosk-lib,ui-kit}/**/*.{ts,tsx}': (files) => {
    if (files.length === 0) return [];
    const cfg = JSON.stringify(prettierConfig);
    return `pnpm --dir apps/frontend exec -- prettier --write --config ${cfg} ${absArgs(files)}`;
  }
};
