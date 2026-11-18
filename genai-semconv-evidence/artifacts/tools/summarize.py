import json, glob, sys, os, collections
d = sys.argv[1]
def advice(o):
    if isinstance(o, dict):
        if 'live_check_result' in o and o['live_check_result']:
            for a in o['live_check_result'].get('all_advice', []):
                yield a
        for v in o.values():
            yield from advice(v)
    elif isinstance(o, list):
        for v in o:
            yield from advice(v)
for f in sorted(glob.glob(os.path.join(d, '*.json'))):
    rep = json.load(open(f))
    print('=== scenario', os.path.basename(f)[:-5])
    levels = collections.Counter()
    groups = collections.defaultdict(set)
    for a in advice(rep['samples']):
        levels[a.get('level')] += 1
        if a.get('level') != 'violation':
            continue
        ctx = dict(a.get('context') or {})
        key = ctx.get('attribute_key') or ctx.get('metric_name') or ''
        groups[a['id']].add((a.get('signal_type'), a.get('signal_name') if a['id'] != 'missing_attribute' else '', json.dumps(ctx, sort_keys=True) if a['id'] not in ('missing_attribute',) else key))
    print('advice levels:', dict(levels))
    for i, items in sorted(groups.items()):
        print(f'  {i}: {len(items)} distinct')
        if i == 'missing_attribute':
            keys = sorted({k for _, _, k in items})
            print('    keys:', ', '.join(keys))
        else:
            for t in sorted(items):
                print('    ', t)
    spans = [s['span'] for s in rep['samples'] if 'span' in s]
    for sp in spans:
        print('  span:', sp.get('name'), 'kind', sp.get('kind'), 'status', sp.get('status'))
    metrics = sorted({s['metric']['name'] for s in rep['samples'] if 'metric' in s})
    print('  metrics:', ', '.join(metrics))
    scopes = [s['instrumentation_scope'] for s in rep['samples'] if 'instrumentation_scope' in s]
    print('  scopes:', json.dumps([{k: v for k, v in sc.items() if k != 'live_check_result'} for sc in scopes])[:600])
