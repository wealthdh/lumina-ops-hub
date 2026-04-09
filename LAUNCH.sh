#!/bin/bash
# ═══════════════════════════════════════════════════════════
#   LUMINA OPS HUB — ONE-COMMAND LAUNCH SCRIPT
#   Run this on your Windows PC (Git Bash / WSL) or Mac
# ═══════════════════════════════════════════════════════════
set -e

echo "═══════════════════════════════════════════"
echo "  LUMINA OPS HUB — Going Live"
echo "═══════════════════════════════════════════"

PROJECT_REF="rjtxkjozlhvnxkzmqffk"

# ── Step 1: Install Supabase CLI if missing ───────────────
if ! command -v supabase &> /dev/null && ! npx supabase --version &> /dev/null 2>&1; then
    echo "[1/4] Installing Supabase CLI..."
    npm install -g supabase
else
    echo "[1/4] Supabase CLI ✓"
fi

# ── Step 2: Login (if needed) ─────────────────────────────
echo "[2/4] Checking Supabase auth..."
supabase login 2>/dev/null || npx supabase login

# ── Step 3: Deploy ALL edge functions ─────────────────────
echo "[3/4] Deploying edge functions..."
FUNCTIONS=(cashout-crypto cashout-bank cashout-card cashout-approve generate-lead-package plaid-link-token)
for fn in "${FUNCTIONS[@]}"; do
    if [ -d "supabase/functions/$fn" ]; then
        echo "  → Deploying $fn..."
        supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt 2>/dev/null || \
        npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
        echo "    ✓ $fn deployed"
    fi
done

# ── Step 4: Done ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ All edge functions deployed!"
echo ""
echo "  NEXT STEPS:"
echo "  1. Fund hot wallet with USDT + BNB (address shown in app)"
echo "  2. Run the MT5 bridge: cd mt5_bridge && python coinexx_sync.py"
echo "  3. Open http://localhost:3000 and start logging real income"
echo "═══════════════════════════════════════════"
