# Wraps in mut(…) the value a local starts with, where the gate says the local is changed and does not say Mut.
# usage: python3 mutlocals.py <project dir> <cli main.js> [<mut import source>]
import json, re, subprocess, sys, os
root, cli = sys.argv[1], sys.argv[2]
source = sys.argv[3] if len(sys.argv) > 3 else None
def gate():
    out = subprocess.run(['node', cli, '-p', '.', '--no-baseline', '--format', 'json'], cwd=root, capture_output=True, text=True).stdout
    try: return json.loads(out)['diagnostics']
    except Exception: return []
total = 0; left = []
for _ in range(5):
    done = 0; left = []
    by_file = {}
    for d in gate():
        if d['rule'] != 'no-param-mutation': continue
        m = re.match(r"`([A-Za-z_$][\w$]*)` is changed", d['message'])
        if not m: left.append(d); continue
        by_file.setdefault(d['file'], []).append((d['start']['line'], m.group(1), d))
    for file, items in by_file.items():
        path = os.path.join(root, file); lines = open(path).read().split('\n'); changed = False
        for line, name, d in items:
            hit = None
            for i in range(line - 1, -1, -1):
                mm = re.match(r"^(\s*(?:export )?(?:const|let|var) %s(?:: [^=]+)? = )(.*?)(;?)$" % re.escape(name), lines[i])
                if mm: hit = (i, mm); break
                mm = re.match(r"^(\s*(?:private |protected |public )?(?:static )?(?:readonly )?%s(?:: [^=]+)? = )(.*?)(;?)$" % re.escape(name), lines[i])
                if mm: hit = (i, mm); break
            if hit is None: left.append(d); continue
            i, mm = hit; init = mm.group(2)
            if init.startswith('mut(') or not re.match(r"(\[|\{|new |Object\.|Array\.|structuredClone\(|\(|[\w.]+\.(slice|map|filter|concat|flat|flatMap|toSorted|split)\()", init) or not mm.group(3):
                if not init.startswith('mut('): left.append(d)
                continue
            lines[i] = mm.group(1) + 'mut(' + init + ')' + mm.group(3); changed = True; done += 1
        if changed:
            text = '\n'.join(lines)
            if not re.search(r"import \{[^}]*(?<!type )\bmut\b[^}]*\} from", text):
                m2 = re.search(r"^import (?:type )?\{[^}]*\bMut\b[^}]*\} from (['\"][^'\"]+['\"]);$", text, re.M)
                src = m2.group(1) if m2 else (source and "'%s'" % source)
                if src:
                    last = [m3 for m3 in re.finditer(r"^import [^;]*;$", text, re.M)]
                    at = m2.end() if m2 else (last[-1].end() if last else 0)
                    text = text[:at] + ("\n" if at else "") + "import { mut } from %s;" % src + ("" if at else "\n") + text[at:]
            open(path, 'w').write(text)
    total += done
    if done == 0: break
print('wrapped', total, 'left', len(left))
for d in left[:40]: print('  %s:%s %s' % (d['file'], d['start']['line'], d['message'][:110]))
