#!/usr/bin/env python3
"""
MT5 Kelly Criterion Position Sizer & Risk Calculator
For Liquidity Sniper Job - Forex/Gold Trading

Calculates optimal position sizing based on:
- Win rate and average win/loss ratios
- Kelly Criterion formula for risk management
- Account balance and risk tolerance
- ATR-based stop loss recommendations

Usage:
    python j02-mt5-optimizer.py --pair XAUUSD --balance 49880 --winrate 0.62
    python j02-mt5-optimizer.py --pair EURUSD --balance 50000 --winrate 0.58 --avgwin 45 --avgloss 30
"""

import argparse
import json
import sys
from math import log, sqrt
from typing import Dict, Tuple, Optional


class MT5Optimizer:
    """Kelly Criterion position sizer for MT5 forex/gold trading."""

    # Preset configurations for major pairs
    PAIR_PRESETS = {
        'EURUSD': {
            'win_rate': 0.58,
            'avg_win': 35.0,      # pips
            'avg_loss': 25.0,     # pips
            'pip_value': 10.0,    # $ per pip
            'atr_period': 14,
            'atr_sl_multiplier': 1.5
        },
        'XAUUSD': {
            'win_rate': 0.62,
            'avg_win': 45.0,      # pips
            'avg_loss': 30.0,     # pips
            'pip_value': 0.01,    # $ per pip for gold
            'atr_period': 14,
            'atr_sl_multiplier': 2.0
        },
        'GBPUSD': {
            'win_rate': 0.60,
            'avg_win': 40.0,      # pips
            'avg_loss': 28.0,     # pips
            'pip_value': 10.0,    # $ per pip
            'atr_period': 14,
            'atr_sl_multiplier': 1.5
        }
    }

    def __init__(self, pair: str = 'XAUUSD', balance: float = 50000.0,
                 win_rate: float = None, avg_win: float = None,
                 avg_loss: float = None):
        """
        Initialize MT5 optimizer.

        Args:
            pair: Currency/commodity pair (EURUSD, XAUUSD, GBPUSD)
            balance: Account balance in USD
            win_rate: Historical win rate (0.0-1.0). If None, uses pair preset
            avg_win: Average winning trade in pips. If None, uses pair preset
            avg_loss: Average losing trade in pips. If None, uses pair preset
        """
        self.pair = pair.upper()
        self.balance = float(balance)

        # Load preset or use provided values
        preset = self.PAIR_PRESETS.get(self.pair)
        if not preset:
            raise ValueError(f"Unknown pair: {self.pair}. Available: {list(self.PAIR_PRESETS.keys())}")

        self.win_rate = float(win_rate) if win_rate is not None else preset['win_rate']
        self.avg_win = float(avg_win) if avg_win is not None else preset['avg_win']
        self.avg_loss = float(avg_loss) if avg_loss is not None else preset['avg_loss']
        self.pip_value = preset['pip_value']
        self.atr_period = preset['atr_period']
        self.atr_sl_multiplier = preset['atr_sl_multiplier']

        # Validation
        if not (0 < self.win_rate < 1):
            raise ValueError(f"Win rate must be between 0 and 1, got {self.win_rate}")
        if self.avg_win <= 0 or self.avg_loss <= 0:
            raise ValueError("Average win/loss must be positive")
        if self.balance <= 0:
            raise ValueError("Balance must be positive")

    def kelly_criterion(self) -> float:
        """
        Calculate Kelly Criterion fraction for optimal bet sizing.

        Formula: f* = (bp - q) / b
        where:
        - b = ratio of win amount to loss amount
        - p = probability of winning
        - q = probability of losing (1-p)

        Returns:
            Kelly fraction (0.0-1.0). Recommended to use 1/4 to 1/2 of this value
            for safety (fractional Kelly).
        """
        b = self.avg_win / self.avg_loss  # Win/loss ratio
        p = self.win_rate
        q = 1 - p

        kelly_f = (b * p - q) / b

        # Kelly fraction can be negative (don't trade) or > 1 (overleveraged)
        return max(0, kelly_f)

    def recommended_position_size(self, fractional: float = 0.25) -> Dict[str, float]:
        """
        Calculate recommended position size using fractional Kelly.

        Args:
            fractional: Fraction of full Kelly to use (0.25 = quarter Kelly, safer)

        Returns:
            Dict with position sizes in different units
        """
        kelly_f = self.kelly_criterion()
        kelly_fraction = kelly_f * fractional

        # Calculate risk per trade (% of balance)
        risk_pct = kelly_fraction * 100
        risk_amount = self.balance * kelly_fraction

        # Position size in lots (standard = 100k units)
        # Assumption: 1 pip loss = risk_amount / avg_loss
        position_pips = risk_amount / (self.avg_loss * self.pip_value)

        # For MT5, convert to micro lots (0.01 lot = 1000 units)
        micro_lots = position_pips / 10  # Standard lot = 10 micro lots per pip risk

        return {
            'kelly_fraction': round(kelly_f, 4),
            'fractional_kelly': round(kelly_fraction, 4),
            'risk_percent': round(risk_pct, 2),
            'risk_amount_usd': round(risk_amount, 2),
            'position_pips': round(position_pips, 2),
            'micro_lots': round(micro_lots, 2),
            'lot_size': round(micro_lots / 100, 4)  # Standard lots
        }

    def max_drawdown_estimate(self) -> Dict[str, float]:
        """
        Estimate maximum drawdown using Kelly Criterion theory.

        Returns:
            Dict with drawdown estimates at different confidence levels
        """
        kelly_f = self.kelly_criterion()
        if kelly_f <= 0:
            return {
                'note': 'System not profitable with Kelly Criterion',
                'max_drawdown_50pct': 0.0,
                'max_drawdown_95pct': 0.0
            }

        # Using logarithmic utility: E[ln(W)] = p*ln(1 + f*b) + q*ln(1 - f)
        expected_log_return = (self.win_rate * log(1 + kelly_f * (self.avg_win / self.avg_loss)) +
                               (1 - self.win_rate) * log(1 - kelly_f))

        # Conservative drawdown estimates
        conservative_dd_50 = abs(min(kelly_f * (self.avg_win / self.avg_loss) * -0.5,
                                      (1 - kelly_f) * 2))

        conservative_dd_95 = abs(min(kelly_f * (self.avg_win / self.avg_loss) * -2,
                                      (1 - kelly_f) * 5))

        return {
            'expected_log_return': round(expected_log_return, 4),
            'max_drawdown_50pct_confidence': round(conservative_dd_50 * 100, 2),
            'max_drawdown_95pct_confidence': round(conservative_dd_95 * 100, 2),
            'recommended_account_buffer': round(conservative_dd_95 * self.balance, 2)
        }

    def optimal_stoploss_atr(self, current_atr: float = None) -> Dict[str, float]:
        """
        Calculate optimal stop-loss distance based on ATR.

        Args:
            current_atr: Current ATR value. If None, returns formula for user calculation

        Returns:
            Dict with stop-loss recommendations
        """
        if current_atr is None:
            return {
                'note': f'Provide current ATR value for {self.pair}',
                'formula': f'SL distance = ATR * {self.atr_sl_multiplier}',
                'example_atr_50': {
                    'atr_value': 50.0,
                    'recommended_sl_pips': round(50.0 * self.atr_sl_multiplier, 1)
                }
            }

        current_atr = float(current_atr)
        sl_pips = current_atr * self.atr_sl_multiplier
        sl_usd = sl_pips * self.pip_value

        return {
            'current_atr': current_atr,
            'atr_multiplier': self.atr_sl_multiplier,
            'recommended_sl_pips': round(sl_pips, 1),
            'recommended_sl_usd': round(sl_usd, 2),
            'tight_sl_pips': round(current_atr * 0.5, 1),
            'loose_sl_pips': round(current_atr * 2.5, 1)
        }

    def generate_report(self, fractional_kelly: float = 0.25,
                       atr_value: Optional[float] = None) -> str:
        """
        Generate comprehensive trading recommendation report.

        Args:
            fractional_kelly: Kelly fraction multiplier
            atr_value: Current ATR for stop-loss calculation

        Returns:
            Formatted report string
        """
        pos_size = self.recommended_position_size(fractional_kelly)
        dd_estimate = self.max_drawdown_estimate()
        sl_rec = self.optimal_stoploss_atr(atr_value)

        kelly_f = self.kelly_criterion()
        expected_win = self.win_rate * self.avg_win
        expected_loss = (1 - self.win_rate) * self.avg_loss
        exp_return_pips = expected_win - expected_loss

        report = f"""
╔════════════════════════════════════════════════════════════════╗
║               MT5 KELLY CRITERION POSITION SIZER                ║
║                    {self.pair} Trading Analysis               ║
╚════════════════════════════════════════════════════════════════╝

📊 INPUT PARAMETERS
────────────────────────────────────────────────────────────────
Account Balance:        ${self.balance:,.2f}
Trading Pair:           {self.pair}
Historical Win Rate:    {self.win_rate * 100:.1f}%
Average Win:            {self.avg_win:.1f} pips
Average Loss:           {self.avg_loss:.1f} pips
Pip Value:              ${self.pip_value}

📈 KELLY CRITERION ANALYSIS
────────────────────────────────────────────────────────────────
Full Kelly Fraction:    {pos_size['kelly_fraction']:.4f} ({pos_size['kelly_fraction']*100:.2f}%)
Fractional Kelly (¼):   {pos_size['fractional_kelly']:.4f} ({pos_size['fractional_kelly']*100:.2f}%)
Expected Return/Trade:  {exp_return_pips:.2f} pips
Win Expectancy:         {expected_win:.2f} pips
Loss Expectancy:        {expected_loss:.2f} pips

💰 POSITION SIZING RECOMMENDATIONS (¼ Kelly)
────────────────────────────────────────────────────────────────
Risk per Trade:         {pos_size['risk_percent']:.2f}% of account
Risk Amount:            ${pos_size['risk_amount_usd']:.2f}
Position Size (Micro):  {pos_size['micro_lots']:.2f} micro lots
Position Size (Std):    {pos_size['lot_size']:.4f} standard lots
Position Pips Risk:     {pos_size['position_pips']:.2f} pips

⚠️  DRAWDOWN ESTIMATES
────────────────────────────────────────────────────────────────
Max DD (50% confidence):  {dd_estimate['max_drawdown_50pct_confidence']:.2f}%
Max DD (95% confidence):  {dd_estimate['max_drawdown_95pct_confidence']:.2f}%
Recommended Buffer:       ${dd_estimate['recommended_account_buffer']:,.2f}

"""

        if atr_value:
            report += f"""🎯 STOP LOSS RECOMMENDATIONS (ATR-based)
────────────────────────────────────────────────────────────────
Current ATR ({self.atr_period}):    {atr_value:.2f} pips
Recommended SL:          {sl_rec['recommended_sl_pips']:.1f} pips (${sl_rec['recommended_sl_usd']:.2f})
Tight SL:                {sl_rec['tight_sl_pips']:.1f} pips
Loose SL:                {sl_rec['loose_sl_pips']:.1f} pips

"""
        else:
            report += f"""🎯 STOP LOSS FORMULA
────────────────────────────────────────────────────────────────
Recommended SL = Current ATR × {self.atr_sl_multiplier}
(Provide ATR value with --atr flag for specific recommendation)

"""

        report += """╔════════════════════════════════════════════════════════════════╗
║                        RISK WARNINGS                             ║
╠════════════════════════════════════════════════════════════════╣
│ • These are theoretical recommendations only                   │
│ • Past performance does not guarantee future results           │
│ • Use ¼ to ½ Kelly for safety (never full Kelly)              │
│ • Scale down during drawdowns, scale up during winning streaks│
│ • Consider slippage, spreads, and broker requirements          │
│ • Always use stop-losses; manage position sizing dynamically   │
╚════════════════════════════════════════════════════════════════╝
"""

        return report


def main():
    """CLI interface for MT5 optimizer."""
    parser = argparse.ArgumentParser(
        description='MT5 Kelly Criterion Position Sizer & Risk Calculator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''Examples:
  python j02-mt5-optimizer.py --pair XAUUSD --balance 49880 --winrate 0.62
  python j02-mt5-optimizer.py --pair EURUSD --balance 50000 --winrate 0.58 --avgwin 45 --avgloss 30
  python j02-mt5-optimizer.py --pair GBPUSD --balance 100000 --winrate 0.60 --atr 35.5
        '''
    )

    parser.add_argument('--pair', default='XAUUSD',
                        help='Trading pair: EURUSD, XAUUSD, GBPUSD (default: XAUUSD)')
    parser.add_argument('--balance', type=float, default=50000,
                        help='Account balance in USD (default: 50000)')
    parser.add_argument('--winrate', type=float,
                        help='Win rate 0.0-1.0 (uses preset if not provided)')
    parser.add_argument('--avgwin', type=float,
                        help='Average win in pips (uses preset if not provided)')
    parser.add_argument('--avgloss', type=float,
                        help='Average loss in pips (uses preset if not provided)')
    parser.add_argument('--atr', type=float,
                        help='Current ATR value for stop-loss calculation')
    parser.add_argument('--kelly-fraction', type=float, default=0.25,
                        help='Kelly fraction multiplier: 0.25=¼Kelly, 0.5=½Kelly (default: 0.25)')
    parser.add_argument('--json', action='store_true',
                        help='Output results as JSON instead of formatted report')

    args = parser.parse_args()

    try:
        optimizer = MT5Optimizer(
            pair=args.pair,
            balance=args.balance,
            win_rate=args.winrate,
            avg_win=args.avgwin,
            avg_loss=args.avgloss
        )

        if args.json:
            # JSON output mode
            result = {
                'pair': optimizer.pair,
                'balance': optimizer.balance,
                'win_rate': optimizer.win_rate,
                'avg_win': optimizer.avg_win,
                'avg_loss': optimizer.avg_loss,
                'position_sizing': optimizer.recommended_position_size(args.kelly_fraction),
                'drawdown_estimates': optimizer.max_drawdown_estimate(),
                'stop_loss_recommendation': optimizer.optimal_stoploss_atr(args.atr)
            }
            print(json.dumps(result, indent=2))
        else:
            # Formatted report mode
            report = optimizer.generate_report(
                fractional_kelly=args.kelly_fraction,
                atr_value=args.atr
            )
            print(report)

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
