#!/usr/bin/env python3
"""
DeFi Yield Stack Tracker - Crypto Yield Job Asset

Fetches real-time DeFi yield opportunities from DeFi Llama API.
- Filters for stablecoin pools with TVL > $1B
- Sorts by APY descending
- Displays top 20 opportunities with chain, TVL, APY, IL risk
- Includes portfolio allocation suggestions for $10K capital

API: https://yields.llama.fi/pools

Usage:
    python j06-defi-yield-tracker.py
    python j06-defi-yield-tracker.py --tvl-min 500000000 --limit 30
    python j06-defi-yield-tracker.py --stablecoins --json
"""

import json
import sys
import requests
from typing import Dict, List, Tuple, Optional
from datetime import datetime


class DeFiYieldTracker:
    """Fetches and analyzes DeFi yield opportunities from DeFi Llama."""

    BASE_URL = "https://yields.llama.fi"
    DEFAULT_TVL_MIN = 1_000_000_000  # $1B minimum
    DEFAULT_LIMIT = 20

    # Stablecoin identifiers (common symbols + addresses)
    STABLECOINS = {
        'USDC', 'USDT', 'DAI', 'BUSD', 'USDP', 'FRAX', 'LUSD',
        'TUSD', 'GUSD', 'SUSD', 'USDN', 'CUSD', 'AUSD', 'OUSD',
        'UST',  # Caution: UST collapsed, but may be in data
    }

    STABLECOIN_ADDRESSES = {
        # USDC
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        # USDT
        '0xdac17f958d2ee523a2206206994597c13d831ec7',
        # DAI
        '0x6b175474e89094c44da98b954eedeac495271d0f',
    }

    # IL risk assessment based on pool composition
    IL_RISK_MAPPING = {
        'stablecoin': 'Very Low',
        'single': 'Very Low',
        'volatile': 'Very High',
        'moderate': 'Moderate',
    }

    def __init__(self, tvl_min: float = DEFAULT_TVL_MIN, limit: int = DEFAULT_LIMIT):
        """
        Initialize DeFi Yield Tracker.

        Args:
            tvl_min: Minimum TVL filter in USD
            limit: Number of pools to return
        """
        self.tvl_min = tvl_min
        self.limit = limit
        self.pools = []
        self.fetch_timestamp = None

    def fetch_pools(self) -> List[Dict]:
        """
        Fetch all pools from DeFi Llama API.

        Returns:
            List of pool dictionaries with yield data
        """
        try:
            print(f"Fetching DeFi yield data from {self.BASE_URL}/pools...", file=sys.stderr)
            response = requests.get(f"{self.BASE_URL}/pools", timeout=15)
            response.raise_for_status()

            data = response.json()
            self.pools = data.get('data', [])
            self.fetch_timestamp = datetime.now().isoformat()

            print(f"Fetched {len(self.pools)} total pools", file=sys.stderr)
            return self.pools

        except requests.RequestException as e:
            print(f"Error fetching from DeFi Llama API: {e}", file=sys.stderr)
            sys.exit(1)

    def is_stablecoin_pool(self, pool: Dict) -> bool:
        """
        Determine if pool is primarily stablecoin-based.

        Args:
            pool: Pool dictionary from API

        Returns:
            True if pool is identified as stablecoin pool
        """
        # Check symbol first
        symbol = pool.get('symbol', '').upper()
        if any(stab in symbol for stab in self.STABLECOINS):
            return True

        # Check underlying tokens
        underlying = pool.get('underlyingTokens', [])
        if underlying:
            # If all underlying tokens are stablecoins, it's a stablecoin pool
            if all(token.upper() in self.STABLECOINS for token in underlying):
                return True

        # Check pool name
        pool_name = pool.get('pool', '').upper()
        if any(stab in pool_name for stab in self.STABLECOINS):
            return True

        return False

    def estimate_il_risk(self, pool: Dict) -> str:
        """
        Estimate impermanent loss risk based on pool composition.

        Args:
            pool: Pool dictionary

        Returns:
            Risk level string
        """
        # Stablecoin pools have minimal IL
        if self.is_stablecoin_pool(pool):
            return "Very Low"

        # Check number of assets
        underlying = pool.get('underlyingTokens', [])
        if len(underlying) == 1:
            return "Very Low"

        # High APY on volatile pairs = higher IL risk
        apy = pool.get('apy', 0)
        if apy and apy > 50:
            return "Very High"
        elif apy and apy > 20:
            return "High"
        elif apy and apy > 10:
            return "Moderate"

        return "Moderate"

    def filter_pools(self, stablecoins_only: bool = True) -> List[Dict]:
        """
        Filter pools by TVL and optionally by stablecoin composition.

        Args:
            stablecoins_only: If True, only return stablecoin pools

        Returns:
            Filtered and sorted list of pools
        """
        filtered = []

        for pool in self.pools:
            tvl = pool.get('tvlUsd', 0)

            # Skip if TVL below minimum
            if tvl < self.tvl_min:
                continue

            # Filter by stablecoins if requested
            if stablecoins_only and not self.is_stablecoin_pool(pool):
                continue

            # Add IL risk assessment
            pool['il_risk'] = self.estimate_il_risk(pool)

            filtered.append(pool)

        # Sort by APY descending
        filtered.sort(key=lambda x: x.get('apy', 0), reverse=True)

        return filtered[:self.limit]

    def format_currency(self, value: float) -> str:
        """Format large numbers as currency with abbreviated units."""
        if value >= 1_000_000_000:
            return f"${value/1_000_000_000:.2f}B"
        elif value >= 1_000_000:
            return f"${value/1_000_000:.2f}M"
        elif value >= 1_000:
            return f"${value/1_000:.2f}K"
        else:
            return f"${value:.2f}"

    def print_pools_table(self, pools: List[Dict]):
        """
        Print pools in formatted table.

        Args:
            pools: List of pool dictionaries
        """
        if not pools:
            print("No pools found matching criteria.")
            return

        print(f"\n{'Rank':<4} {'Protocol':<20} {'Pool':<25} {'Chain':<12} {'TVL':<14} {'APY':<10} {'IL Risk':<12}")
        print("=" * 117)

        for i, pool in enumerate(pools, 1):
            protocol = pool.get('project', 'Unknown')[:19]
            pool_name = pool.get('symbol', 'Unknown')[:24]
            chain = pool.get('chain', 'Unknown')[:11]
            tvl = self.format_currency(pool.get('tvlUsd', 0))
            apy = pool.get('apy', 0)
            apy_str = f"{apy:.2f}%" if apy else "N/A"
            il_risk = pool.get('il_risk', 'Unknown')

            print(f"{i:<4} {protocol:<20} {pool_name:<25} {chain:<12} {tvl:<14} {apy_str:<10} {il_risk:<12}")

    def suggest_portfolio_allocation(self, pools: List[Dict], capital: float = 10000) -> Dict:
        """
        Suggest portfolio allocation across top 3 pools.

        Args:
            pools: Filtered pool list
            capital: Capital to allocate in USD

        Returns:
            Allocation dictionary with positions and expected yields
        """
        if len(pools) < 3:
            print(f"Warning: Only {len(pools)} pools available, recommend at least 3 for diversification")
            top_3 = pools[:len(pools)]
        else:
            top_3 = pools[:3]

        # Weight by inverse variance (higher APY = potentially higher volatility)
        apys = [p.get('apy', 1) for p in top_3]
        tvls = [p.get('tvlUsd', 1) for p in top_3]

        # Allocation: 50% top pool, 30% second, 20% third
        weights = [0.50, 0.30, 0.20]
        allocations = []

        total_expected_yield = 0

        print(f"\n{'Portfolio Allocation Suggestion for ${capital:,.2f}':<70}")
        print("=" * 110)
        print(f"{'#':<3} {'Protocol':<20} {'Pool':<25} {'Allocation':<15} {'Amount':<15} {'Expected Yield/Year':<20}")
        print("-" * 110)

        for idx, (pool, weight) in enumerate(zip(top_3, weights), 1):
            amount = capital * weight
            apy = pool.get('apy', 0)
            expected_yield = amount * (apy / 100) if apy else 0
            total_expected_yield += expected_yield

            protocol = pool.get('project', 'Unknown')[:19]
            pool_name = pool.get('symbol', 'Unknown')[:24]

            print(f"{idx:<3} {protocol:<20} {pool_name:<25} {weight*100:>5.0f}%{'':<9} ${amount:>12,.2f} ${expected_yield:>17,.2f}")

            allocations.append({
                'rank': idx,
                'protocol': protocol,
                'pool': pool_name,
                'allocation_pct': weight * 100,
                'amount_usd': round(amount, 2),
                'apy': round(apy, 2),
                'expected_yield_annual': round(expected_yield, 2),
                'tvl': round(pool.get('tvlUsd', 0), 2),
                'il_risk': pool.get('il_risk', 'Unknown'),
                'chain': pool.get('chain', 'Unknown')
            })

        print("-" * 110)
        print(f"{'TOTAL':<48} {'100%':<15} ${capital:>12,.2f} ${total_expected_yield:>17,.2f}")

        return {
            'capital': capital,
            'expected_annual_yield': round(total_expected_yield, 2),
            'expected_annual_yield_pct': round((total_expected_yield / capital) * 100, 2),
            'allocations': allocations,
            'note': 'This is theoretical yield. Actual returns depend on slippage, gas fees, and contract risks.'
        }

    def generate_report(self, output_json: bool = False) -> Optional[Dict]:
        """
        Generate complete yield analysis report.

        Args:
            output_json: If True, return data as dict instead of printing

        Returns:
            Dict if output_json=True, else None
        """
        # Fetch and filter
        self.fetch_pools()
        filtered_pools = self.filter_pools(stablecoins_only=True)

        if not output_json:
            print("\n" + "=" * 117)
            print(f"DeFi Yield Stack Tracker - {self.fetch_timestamp}")
            print(f"Criteria: Stablecoin pools, TVL >= {self.format_currency(self.tvl_min)}")
            print("=" * 117)

            self.print_pools_table(filtered_pools)

            # Portfolio suggestion
            if filtered_pools:
                portfolio = self.suggest_portfolio_allocation(filtered_pools, capital=10000)
                print(f"\n⚠️  RISK DISCLAIMER")
                print("-" * 110)
                print("• DeFi yields can change rapidly; past APY does not guarantee future returns")
                print("• Smart contract risks: audit status, code vulnerabilities, exploit history")
                print("• Impermanent loss may apply to multi-asset pools despite 'stablecoin' classification")
                print("• Gas fees on some chains can significantly reduce net returns")
                print("• Regulatory risks vary by jurisdiction; some protocols may face legal challenges")
                print("• Concentrated liquidity and rug pull risks; verify TVL and liquidity depth")
                print("-" * 110)

                return portfolio
        else:
            # JSON output mode
            report_data = {
                'timestamp': self.fetch_timestamp,
                'criteria': {
                    'tvl_min_usd': self.tvl_min,
                    'stablecoins_only': True,
                    'limit': self.limit
                },
                'pools': filtered_pools,
                'top_pools_count': len(filtered_pools)
            }

            if filtered_pools:
                report_data['portfolio_suggestion'] = self.suggest_portfolio_allocation(
                    filtered_pools, capital=10000
                )

            return report_data


def main():
    """CLI interface for DeFi Yield Tracker."""
    import argparse

    parser = argparse.ArgumentParser(
        description='DeFi Yield Stack Tracker - Find best stablecoin yield opportunities',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''Examples:
  python j06-defi-yield-tracker.py
  python j06-defi-yield-tracker.py --tvl-min 500000000 --limit 30
  python j06-defi-yield-tracker.py --json
  python j06-defi-yield-tracker.py --capital 25000
        '''
    )

    parser.add_argument('--tvl-min', type=float, default=DeFiYieldTracker.DEFAULT_TVL_MIN,
                        help=f'Minimum TVL filter in USD (default: {DeFiYieldTracker.DEFAULT_TVL_MIN/1e9:.1f}B)')
    parser.add_argument('--limit', type=int, default=DeFiYieldTracker.DEFAULT_LIMIT,
                        help=f'Number of pools to display (default: {DeFiYieldTracker.DEFAULT_LIMIT})')
    parser.add_argument('--capital', type=float, default=10000,
                        help='Capital for portfolio allocation suggestion (default: 10000)')
    parser.add_argument('--json', action='store_true',
                        help='Output results as JSON')
    parser.add_argument('--stablecoins', action='store_true', default=True,
                        help='Only show stablecoin pools (default: True)')

    args = parser.parse_args()

    try:
        tracker = DeFiYieldTracker(tvl_min=args.tvl_min, limit=args.limit)

        if args.json:
            report = tracker.generate_report(output_json=True)
            print(json.dumps(report, indent=2, default=str))
        else:
            tracker.generate_report(output_json=False)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
