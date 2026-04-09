# CoinExx MT5 → Lumina Ops Hub Bridge

**Run this on your Windows PC to connect live MT5 data to the dashboard.**

---

## Quick Setup (5 minutes)

### 1. Install Python + MetaTrader5 library
```bash
pip install MetaTrader5 supabase schedule python-dotenv requests
```

### 2. Find your MT5 Account Number
- Open MetaTrader 5
- Go to **File → Open Account**
- Note your **numeric account number** (e.g. `123456789`)
- This is different from your email login

### 3. Edit coinexx_sync.py
Open the file and update line 42:
```python
MT5_LOGIN = 123456789   # ← Your actual account number here
```

### 4. Test the connection
```bash
python coinexx_sync.py --test
```
Expected output:
```
✓ Connection OK
  Account:  #123456789
  Server:   CoinExx-Live
  Balance:  $49,880.32
  Equity:   $49,880.32
```

### 5. Start the live bridge
```bash
python coinexx_sync.py
```

The bridge will:
- Sync your account every **10 seconds** to Supabase
- Write hourly **equity curve snapshots**
- Start a **REST API on port 8080** for the web app

---

## What gets synced

| Table | Data | Frequency |
|-------|------|-----------|
| `mt5_accounts` | Balance, equity, PnL | Every 10s |
| `mt5_trades` | Open positions | Every 10s |
| `mt5_snapshots` | Equity curve history | Every hour |

---

## Run as a Windows Service (always-on)

Install NSSM (Non-Sucking Service Manager):
```bash
# Download from https://nssm.cc/download
nssm install LuminaMT5Bridge "python" "C:\path\to\coinexx_sync.py"
nssm start LuminaMT5Bridge
```

Or use Task Scheduler to run on Windows startup.

---

## Troubleshooting

**"MT5 login failed"**
- Make sure MetaTrader 5 is running and open
- Check your account number (numeric, not email)
- Server name: `CoinExx-Live` (live) or `CoinExx-Demo` (demo)

**"No data in dashboard"**
- Verify Supabase USER_ID matches your login UUID
- Check `mt5_bridge.log` for errors

**Web app shows cached data**
- The dashboard falls back to Supabase cache automatically
- As long as the bridge writes data, the web app will show it
