# Adds the import of mut to the files that call it without importing it.
# usage: python3 mutimports.py <dir> [<relative-to file that exports mut>]
import re, glob, os, sys
root = sys.argv[1]; own = sys.argv[2] if len(sys.argv) > 2 else None
n = 0
for p in glob.glob(os.path.join(root, '**', '*.ts'), recursive=True) + glob.glob(os.path.join(root, '**', '*.tsx'), recursive=True):
    if '/node_modules/' in p or p.endswith('/mut.ts') or p.endswith('.d.ts'): continue
    s = open(p).read()
    if not re.search(r"(?<![\w.])mut(<[^>(]*>)?\(", s): continue
    if re.search(r"import \{[^}]*(?<!type )\bmut\b[^}]*\} from", s): continue
    if own:
        rel = os.path.relpath(own, os.path.dirname(p)).replace('.ts', '.js')
        src = rel if rel.startswith('.') else './' + rel
    else:
        src = '@strict-ts/std'
    q = '"' if re.search(r'^import .* from "', s, re.M) else "'"
    line = "import { mut } from %s%s%s;" % (q, src, q)
    imports = list(re.finditer(r"^import [^;]*;$", s, re.M | re.S))
    imports = [m for m in re.finditer(r"^import (?:[^;]|\n)*?;$", s, re.M)]
    if imports:
        at = imports[-1].end(); s = s[:at] + "\n" + line + s[at:]
    else:
        s = line + "\n" + s
    open(p, 'w').write(s); n += 1
print('imports added', n)
