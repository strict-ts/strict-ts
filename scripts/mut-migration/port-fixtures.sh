#!/bin/bash
# Ports a directory of single-file fixtures to the Mut the compiler carries.
# usage: port.sh <fixtures dir>
S=$(mktemp -d)
D=$1; N=$(basename $D); W=$S/port/$N
rm -rf $W && mkdir -p $W/src $W/node_modules/@strict-ts && ln -s $S/wt/packages/std $W/node_modules/@strict-ts/std
cp $D/*.ts $W/src/ && cp $S/wt/packages/core/test/fixtures/env.d.ts $W/src/ 2>/dev/null
cat > $W/tsconfig.json <<'JSON'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "lib": ["ES2022", "DOM"], "types": [], "noEmit": true, "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true, "noImplicitReturns": true, "noFallthroughCasesInSwitch": true, "noImplicitOverride": true, "moduleDetection": "force" }, "include": ["src"] }
JSON
cd $W && sed -i -E 's/Mut<(number|string|boolean)( \| undefined)?>/\1\2/g' src/*.ts
node $S/mutfix.mjs $S/wt/node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/typescript.js $W/tsconfig.json | head -30
python3 $S/mutimports.py $W/src
