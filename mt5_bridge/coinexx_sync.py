"""
╔══════════════════════════════════════════════════════════════════╗
║   LUMINA OPS HUB — CoinExx MT5 → Supabase Live Sync Bridge      ║
║   Run this on your Windows PC with MetaTrader 5 installed        ║
╚══════════════════════════════════════════════════════════════════╝

SETUP (Windows only):
  pip install MetaTrader5 supabase schedule python-dotenv requests

USAGE:
  python coinexx_sync.py          # runs live, syncs every 10s
  python coinexx_sync.py --once   # single sync then exit
  python coinexx_sync.py --test   # test connection only

This script:
  1. Connects to your CoinExx MT5 account
  2. Pushes live account data → Supabase `mt5_accounts` table
  3. Pushes open trades     → Supabase `mt5_trades` table
  4. Appends hourly snapshot→ Supabase `mt5_snapshots` (equity curve)
  5. Also starts the REST bridge on port 8080 (optional)
"""

import sys
import time
import json
import argparse
import logging
import threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# ── Dependencies check ────────────────────────────────────────────────────────
try:
    import MetaTrader5 as mt5
except ImportError:
    print("ERROR: MetaTrader5 not installed. Run: pip install MetaTrader5")
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

try:
    import schedule
except ImportError:
    print("ERROR: schedule not installed. Run: pip install schedule")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
# Your CoinExx MT5 credentials
MT5_LOGIN    = 0           # Set to 0 to use whatever account is already open in MT5
                           # OR set to your numeric account number
                           # Find it in MT5: Tools > Options > Server tab, or the title bar
MT5_PASSWORD = "Drowssap0!"
MT5_SERVER   = "CoinExx-Live"   # Exact server name shown when logging in to CoinExx

# Your Supabase project
SUPABASE_URL = "https://rjtxkjozlhvnxkzmqffk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdHhram96bGh2bnhrem1xZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM0NjAsImV4cCI6MjA5MDEyOTQ2MH0.RbF0iZocHiofHQapTt71LYGgSr-4xcXHd-DCSxfZV68"
USER_ID      = "0ce62691-721c-4eba-bf3e-052731d9839b"   # Your Supabase user UUID

# Bridge REST server (matches the Vite proxy target)
BRIDGE_PORT  = 8080
SYNC_INTERVAL_SECONDS  = 10     # account + trades sync
SNAPSHOT_INTERVAL_MINS = 60     # equity curve snapshot

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("mt5_bridge.log", encoding="utf-8"),
    ]
)
log = logging.getLogger(__name__)

# ── Supabase client ───────────────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── MT5 connection ────────────────────────────────────────────────────────────
def connect_mt5() -> bool:
    """Connect to CoinExx MT5. Returns True on success."""
    if not mt5.initialize():
        log.error(f"MT5 initialize failed: {mt5.last_error()}")
        return False

    if MT5_LOGIN == 0:
        # No login supplied — use whatever account is already open in MT5 terminal
        info = mt5.account_info()
        if info is None:
            log.warning("MT5 running but no account logged in. Log in via the MT5 terminal.")
            return False
        log.info(f"✓ Using active MT5 account #{info.login} on {info.server}")
        return True

    # Login with explicit credentials
    authorized = mt5.login(MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER)
    if not authorized:
        log.error(f"MT5 login failed: {mt5.last_error()}")
        log.info("Tip: Make sure MetaTrader 5 is running and the account number is correct.")
        return False

    info = mt5.account_info()
    log.info(f"✓ Connected to CoinExx: account #{info.login}, server {info.server}")
    log.info(f"  Balance: ${info.balance:,.2f}  Equity: ${info.equity:,.2f}")
    return True


def get_account_data() -> dict | None:
    """Fetch current account snapshot from MT5."""
    info = mt5.account_info()
    if info is None:
        log.warning(f"account_info() returned None: {mt5.last_error()}")
        return None

    # Compute day PnL from today's closed trades
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    hist = mt5.history_deals_get(today, datetime.now(timezone.utc))
    day_pnl  = sum(d.profit for d in (hist or []) if d.entry == 1)   # entry==1 = close
    month_start = today.replace(day=1)
    hist_month  = mt5.history_deals_get(month_start, datetime.now(timezone.utc))
    month_pnl   = sum(d.profit for d in (hist_month or []) if d.entry == 1)

    return {
        "user_id":     USER_ID,
        "account_id":  str(info.login),
        "balance":     float(info.balance),
        "equity":      float(info.equity),
        "margin":      float(info.margin),
        "free_margin": float(info.margin_free),
        "margin_level":float(info.margin_level) if info.margin_level else 0.0,
        "profit":      float(info.profit),
        "day_pnl":     round(day_pnl, 2),
        "week_pnl":    0.0,   # computed separately if needed
        "month_pnl":   round(month_pnl, 2),
        "updated_at":  datetime.now(timezone.utc).isoformat(),
    }


def get_open_trades() -> list[dict]:
    """Fetch all open positions from MT5."""
    positions = mt5.positions_get()
    if positions is None:
        return []

    trades = []
    for p in positions:
        trades.append({
            "user_id":       USER_ID,
            "ticket":        int(p.ticket),
            "symbol":        p.symbol,
            "type":          "buy" if p.type == 0 else "sell",
            "volume":        float(p.volume),
            "open_price":    float(p.price_open),
            "current_price": float(p.price_current),
            "profit":        float(p.profit),
            "open_time":     datetime.fromtimestamp(p.time, tz=timezone.utc).isoformat(),
            "sl":            float(p.sl),
            "tp":            float(p.tp),
            "updated_at":    datetime.now(timezone.utc).isoformat(),
        })
    return trades


# ── Supabase upsert helpers ───────────────────────────────────────────────────
def push_account(data: dict):
    try:
        # Upsert by user_id (one row per user, always overwrite)
        res = supabase.table("mt5_accounts") \
            .upsert(data, on_conflict="user_id") \
            .execute()
        log.debug(f"Account upserted: equity=${data['equity']:,.2f}")
    except Exception as e:
        log.error(f"push_account error: {e}")


def push_trades(trades: list[dict]):
    try:
        if not trades:
            # Delete all open trades for this user (all closed)
            supabase.table("mt5_trades") \
                .delete() \
                .eq("user_id", USER_ID) \
                .execute()
            return

        # Upsert all open trades
        for t in trades:
            supabase.table("mt5_trades") \
                .upsert(t, on_conflict="user_id,ticket") \
                .execute()

        # Delete any tickets no longer open
        open_tickets = [t["ticket"] for t in trades]
        supabase.table("mt5_trades") \
            .delete() \
            .eq("user_id", USER_ID) \
            .not_.in_("ticket", open_tickets) \
            .execute()

        log.debug(f"Trades synced: {len(trades)} open positions")
    except Exception as e:
        log.error(f"push_trades error: {e}")


def push_income_entries(account: dict):
    """
    Push today's closed-trade profits as income_entries so the withdrawal
    balance is always accurate.  Called every sync cycle.
    """
    try:
        from datetime import timedelta
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        deals = mt5.history_deals_get(today_start, datetime.now(timezone.utc))
        if deals is None:
            return

        # Only closing deals with positive profit
        profitable = [d for d in deals if d.entry == 1 and d.profit > 0]
        if not profitable:
            return

        # Build income_entries rows — use ticket as reference_id to deduplicate
        rows = []
        for d in profitable:
            rows.append({
                "user_id":      USER_ID,
                "job_id":       "376dcb4f-baf5-47b8-8e17-eeb0452f6978",  # Liquidity Sniper (MT5) UUID
                "source":       "mt5",
                "amount":       round(float(d.profit), 2),
                "description":  f"{d.symbol} trade #{d.order} closed",
                "reference_id": f"mt5-{d.order}",
                "entry_date":   datetime.fromtimestamp(d.time, tz=timezone.utc).strftime("%Y-%m-%d"),
            })

        for row in rows:
            # Upsert by reference_id to avoid duplicates
            res = supabase.table("income_entries") \
                .upsert(row, on_conflict="reference_id") \
                .execute()

        if rows:
            total = sum(r["amount"] for r in rows)
            log.info(f"Income entries pushed: {len(rows)} deals, total profit ${total:.2f}")
    except Exception as e:
        log.error(f"push_income_entries error: {e}")


def push_snapshot(account: dict):
    """Append hourly equity curve snapshot."""
    try:
        supabase.table("mt5_snapshots").insert({
            "user_id":      USER_ID,
            "account_id":   account["account_id"],
            "equity":       account["equity"],
            "balance":      account["balance"],
            "profit":       account["profit"],
            "poly_balance": 0.0,   # set from Polymarket if available
            "created_at":   datetime.now(timezone.utc).isoformat(),
        }).execute()
        log.info(f"Snapshot saved: ${account['equity']:,.2f}")
    except Exception as e:
        log.error(f"push_snapshot error: {e}")


# ── Main sync loop ────────────────────────────────────────────────────────────
last_snapshot_hour = -1

def sync_once():
    global last_snapshot_hour

    if not mt5.terminal_info():
        log.warning("MT5 terminal not available, attempting reconnect...")
        if not connect_mt5():
            return

    account = get_account_data()
    if account:
        push_account(account)
        trades = get_open_trades()
        push_trades(trades)
        push_income_entries(account)   # ← push closed-trade profits as withdrawable income

        # Hourly snapshot for equity curve
        current_hour = datetime.now().hour
        if current_hour != last_snapshot_hour:
            push_snapshot(account)
            last_snapshot_hour = current_hour

        n_trades = len(trades)
        log.info(
            f"Synced ✓  equity=${account['equity']:,.2f}  "
            f"day_pnl={'+' if account['day_pnl']>=0 else ''}${account['day_pnl']:,.2f}  "
            f"positions={n_trades}"
        )


# ── REST Bridge server ────────────────────────────────────────────────────────
# Exposes http://localhost:8080 — Vite proxies /api/mt5/* to this

_last_account: dict = {}
_last_trades:  list = []

class MT5Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass   # suppress default HTTP logs

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")

        if path == "/account":
            self._json(_last_account or {"error": "no data yet"})
        elif path == "/trades":
            self._json(_last_trades)
        elif path.startswith("/kelly/"):
            symbol = path.split("/kelly/")[1]
            self._json(self._kelly(symbol))
        elif path == "/history":
            qs   = parse_qs(parsed.query)
            days = int(qs.get("days", ["30"])[0])
            self._json(self._history(days))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length) or b"{}")
        path   = self.path.rstrip("/")

        if path == "/order":
            result = self._place_order(body)
            self._json(result)
        elif path.startswith("/close/"):
            ticket = int(path.split("/close/")[1])
            result = self._close_trade(ticket)
            self._json(result)
        elif path == "/mirror-edge":
            self._json({"error": "mirror-edge not implemented in local bridge"})
        else:
            self.send_response(404)
            self.end_headers()

    def _json(self, data: dict | list):
        payload = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(payload))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _kelly(self, symbol: str) -> dict:
        # Simple Kelly sizing from historical deals
        try:
            from datetime import timedelta
            end   = datetime.now(timezone.utc)
            start = end - timedelta(days=90)
            deals = mt5.history_deals_get(start, end)
            sym_deals = [d for d in (deals or []) if d.symbol == symbol and d.entry == 1]
            if not sym_deals:
                return {"symbol": symbol, "kellyFraction": 0.1, "recommendedVolume": 0.01}
            wins  = [d.profit for d in sym_deals if d.profit > 0]
            losses= [abs(d.profit) for d in sym_deals if d.profit < 0]
            if not wins or not losses:
                return {"symbol": symbol, "kellyFraction": 0.1, "recommendedVolume": 0.01}
            win_rate = len(wins) / len(sym_deals)
            avg_win  = sum(wins) / len(wins)
            avg_loss = sum(losses) / len(losses)
            b        = avg_win / avg_loss
            kelly    = max(0, min(0.25, win_rate - (1 - win_rate) / b))
            return {
                "symbol": symbol, "kellyFraction": round(kelly, 4),
                "recommendedVolume": round(kelly * 0.1, 2),
                "winRate": round(win_rate, 4),
                "avgWin":  round(avg_win, 2),
                "avgLoss": round(avg_loss, 2),
            }
        except Exception as e:
            return {"error": str(e)}

    def _history(self, days: int) -> list:
        try:
            from datetime import timedelta
            end   = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            deals = mt5.history_deals_get(start, end)
            return [
                {
                    "ticket":     int(d.order),
                    "symbol":     d.symbol,
                    "type":       "buy" if d.type == 0 else "sell",
                    "volume":     float(d.volume),
                    "openPrice":  float(d.price),
                    "profit":     float(d.profit),
                    "openTime":   datetime.fromtimestamp(d.time, tz=timezone.utc).isoformat(),
                }
                for d in (deals or []) if d.entry == 1
            ]
        except Exception as e:
            return []

    def _place_order(self, body: dict) -> dict:
        symbol    = body.get("symbol", "EURUSD")
        order_type= mt5.ORDER_TYPE_BUY if body.get("type") == "buy" else mt5.ORDER_TYPE_SELL
        volume    = float(body.get("volume", 0.01))
        price     = mt5.symbol_info_tick(symbol)
        if not price:
            return {"error": f"Symbol {symbol} not found"}
        ask = price.ask if order_type == mt5.ORDER_TYPE_BUY else price.bid
        req = {
            "action":    mt5.TRADE_ACTION_DEAL,
            "symbol":    symbol,
            "volume":    volume,
            "type":      order_type,
            "price":     ask,
            "sl":        float(body.get("sl", 0)),
            "tp":        float(body.get("tp", 0)),
            "comment":   body.get("comment", "LuminaOpsHub"),
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(req)
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return {"ticket": result.order}
        return {"error": f"Order failed: {result.retcode} {result.comment}"}

    def _close_trade(self, ticket: int) -> dict:
        pos = mt5.positions_get(ticket=ticket)
        if not pos:
            return {"success": False, "error": "Position not found"}
        p = pos[0]
        price = mt5.symbol_info_tick(p.symbol)
        close_price = price.bid if p.type == 0 else price.ask
        req = {
            "action":   mt5.TRADE_ACTION_DEAL,
            "symbol":   p.symbol,
            "volume":   p.volume,
            "type":     mt5.ORDER_TYPE_SELL if p.type == 0 else mt5.ORDER_TYPE_BUY,
            "position": ticket,
            "price":    close_price,
            "comment":  "LuminaOpsHub close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(req)
        return {"success": result.retcode == mt5.TRADE_RETCODE_DONE}


def run_rest_bridge():
    server = HTTPServer(("127.0.0.1", BRIDGE_PORT), MT5Handler)
    log.info(f"✓ MT5 REST bridge running on http://localhost:{BRIDGE_PORT}")
    server.serve_forever()


def sync_loop():
    """Background thread: sync MT5 → Supabase every SYNC_INTERVAL_SECONDS."""
    global _last_account, _last_trades
    while True:
        try:
            account = get_account_data()
            if account:
                _last_account = account
                push_account(account)
                trades = get_open_trades()
                _last_trades = trades
                push_trades(trades)

                current_hour = datetime.now().hour
                global last_snapshot_hour
                if current_hour != last_snapshot_hour:
                    push_snapshot(account)
                    last_snapshot_hour = current_hour

                log.info(
                    f"Sync ✓  equity=${account['equity']:,.2f}  "
                    f"PnL={'+' if account['day_pnl']>=0 else ''}${account['day_pnl']:,.2f}  "
                    f"trades={len(trades)}"
                )
        except Exception as e:
            log.error(f"Sync error: {e}")
        time.sleep(SYNC_INTERVAL_SECONDS)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CoinExx MT5 → Supabase Bridge")
    parser.add_argument("--once",  action="store_true", help="Sync once then exit")
    parser.add_argument("--test",  action="store_true", help="Test connection only")
    parser.add_argument("--no-bridge", action="store_true", help="Skip REST bridge server")
    args = parser.parse_args()

    print("═" * 60)
    print("  LUMINA OPS HUB — CoinExx MT5 Bridge")
    print("═" * 60)

    # Connect to MT5
    if not connect_mt5():
        print("\n⚠️  Could not connect to MT5.")
        print("   Make sure MetaTrader 5 is open and logged in to CoinExx.")
        print(f"   If MT5_LOGIN=0, log in manually via the MT5 terminal.")
        sys.exit(1)

    if args.test:
        info = mt5.account_info()
        print(f"\n✓ Connection OK")
        print(f"  Account:  #{info.login}")
        print(f"  Server:   {info.server}")
        print(f"  Balance:  ${info.balance:,.2f}")
        print(f"  Equity:   ${info.equity:,.2f}")
        print(f"  Day PnL:  ${info.profit:,.2f}")
        mt5.shutdown()
        sys.exit(0)

    if args.once:
        sync_once()
        log.info("Single sync complete.")
        mt5.shutdown()
        sys.exit(0)

    # Full live mode: sync thread + REST bridge
    log.info("Starting live sync... press Ctrl+C to stop.")

    # Start REST bridge in background thread (unless disabled)
    if not args.no_bridge:
        bridge_thread = threading.Thread(target=run_rest_bridge, daemon=True)
        bridge_thread.start()

    # Start sync loop in background thread
    sync_thread = threading.Thread(target=sync_loop, daemon=True)
    sync_thread.start()

    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Shutting down bridge...")
        mt5.shutdown()
        print("\n✓ MT5 bridge stopped.")
