#!/usr/bin/env bash
# Gate de SUPPLY-CHAIN (DA-045). Roda no `postinstall` (hook automático no install) e antes do deploy.
# Pega o sinal real de pacote comprometido no npm:
#   1) advisory de MALWARE/compromisso no `npm audit`  → FATAL (exit 1): trava o install/deploy.
#   2) pacote com INSTALL-SCRIPT (postinstall/preinstall/install) fora da ALLOWLIST → WARN (revisar).
# Offline-tolerante: se o `npm audit` não responder, pula a checagem de malware (não falha o install à toa).
set -uo pipefail
cd "$(dirname "$0")/.." 2>/dev/null || cd "$(dirname "$0")"

# install-scripts APROVADOS (nativos/resolvers conhecidos). Aprovar um novo = adicionar aqui (com revisão).
ALLOW=" better-sqlite3 esbuild keccak secp256k1 sharp unrs-resolver bufferutil utf-8-validate node-gyp "

fail=0
echo "── check-supply-chain · $(basename "$PWD") ──"

# 1) advisory de malware/compromisso (sinal de ataque de supply-chain). Regex APERTADO: indica PACOTE malicioso,
#    NÃO classe de vuln ("exfiltration/hijacking" são impactos de CVE em pacote legítimo, ex.: axios → não dispara).
#    PIPE DIRETO pro node (capturar o JSON gigante do audit numa var bash TRUNCA → falso-negativo). node sai 7 se malware.
npm audit --json 2>/dev/null | node -e '
  let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    let j;try{j=JSON.parse(d)}catch(e){console.log("  ⚠ npm audit indisponível/ilegível — checagem de malware pulada");process.exit(0)}
    const re=/\bmalware\b|malicious (package|code|version)|\bbackdoor\b|protestware|crypto-?miner|\bstealer\b|is compromised|supply[- ]chain (attack|compromise)/i;
    const mal=[...new Set(Object.values(j.vulnerabilities||{}).flatMap(v=>(v.via||[]).filter(x=>typeof x==="object")).filter(a=>re.test((a.title||"")+" "+(a.url||""))).map(a=>a.title))];
    const m=(j.metadata&&j.metadata.vulnerabilities)||{};
    if(mal.length) console.log("  ✗ MALWARE/compromisso:",mal.join(" | "));
    else console.log("  ✓ 0 advisory de malware (compromisso)");
    console.log(`  ℹ vulns: critical=${m.critical||0} high=${m.high||0} (CVE em pacote legítimo ≠ compromisso — rode npm audit)`);
    process.exit(mal.length?7:0);
  });'
[ "${PIPESTATUS[1]:-$?}" -eq 7 ] && fail=1

# 2) install-scripts fora da allowlist (superfície de exfil)
pkgs=$(npm query ":attr(scripts,[postinstall]), :attr(scripts,[preinstall]), :attr(scripts,[install])" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{[...new Set(JSON.parse(d).map(p=>p.name))].forEach(n=>console.log(n))}catch(e){}}' 2>/dev/null | sort -u)
newp=""
for p in $pkgs; do echo "$ALLOW" | grep -q " $p " || newp="$newp $p"; done
if [ -n "$newp" ]; then
  echo "  ⚠ install-script NÃO aprovado (revisar — é assim que malware de npm exfiltra):$newp"
  echo "    → se legítimo, adicione à ALLOWLIST em scripts/check-supply-chain.sh"
else
  echo "  ✓ install-scripts todos na allowlist"
fi

if [ "$fail" -ne 0 ]; then echo "  ✗ check-supply-chain: BLOQUEADO (pacote comprometido)"; exit 1; fi
echo "  ✓ check-supply-chain OK"
