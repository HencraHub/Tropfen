import re,sys
txt=open(sys.argv[1] if len(sys.argv)>1 else '/home/user/Tropfen/docs/BALANCE.md').read()
combos=re.split(r'\n## ',txt)[1:]
bots=['hitzkopf','frostwart','tropfmeister','keilschlaeger','dampfkessel','ingenieur','gaertner','haendler','planlos','coop_abgestimmt','coop_nebeneinander']
print(re.search(r'Seeds je Kombination: (\d+)',txt).group(0))
print('combo'.ljust(20)+''.join(b[:7].rjust(8) for b in bots)+'  best  n')
ta=tn=0
for c in combos:
    name=c.split('\n')[0]
    if name.startswith('Schnellster'): break
    row={}
    for line in c.split('\n'):
        m=re.match(r'\| (\w+) \| ([\d.]+) \| (\d+)/(\d+) \| (\S+)',line)
        if m: row[m.group(1)]=(float(m.group(2)),m.group(5)[:4])
    n=re.search(r'→ (\d) Methoden',c); best=re.search(r'Bestzeit ([\d.]+)',c)
    if 'coop_abgestimmt' in row: ta+=row['coop_abgestimmt'][0]; tn+=row['coop_nebeneinander'][0]
    print(name.ljust(20)+''.join((f"{row[b][0]:.0f}{row[b][1][:2]}" if b in row else '-').rjust(8) for b in bots)+f"  {best.group(1) if best else '?'}  {n.group(1) if n else '?'}")
print(txt[txt.index('## Koop') if '## Koop' in txt else txt.index('## Schnellster'):txt.index('## Ergebnis')].strip())
print(len(re.findall(r'^- \(d\)',txt,re.M)),'d', len(re.findall(r'^- \(a\)',txt,re.M)),'a', len(re.findall(r'^- \(e\)',txt,re.M)),'e', len(re.findall(r'^- \(c\)',txt,re.M)),'c', len(re.findall(r'^- \(b\)',txt,re.M)),'b', 'coop ratio %.3f' % (ta/tn if tn else 0))
