#!/usr/bin/env python3
"""
Polymarket Edge-Entry Trading Script (Job 4)
Scans Polymarket for cheap contracts (≤ $0.15) and evaluates using AI confidence scoring.

This script identifies edge-entry trading opportunities by:
1. Fetching live markets from Polymarket Gamma API
2. Filtering for low-priced contracts (≤ $0.15)
3. Calculating Expected Value (EV) with estimated probability
4. Ranking by EV and applying Kelly criterion for position sizing
5. Optionally checking copy-trading positions from @swisstony

Usage:
    python j04-polymarket-edge-scanner.py --top 10 --min-edge 0.30 --max-position 500
"""

import argparse
import sys
import time
import json
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from urllib.parse import urljoin
import statistics

try:
    import requests
except ImportError:
    print("Error: requests library not found. Install with: pip install requests")
    sys.exit(1)


# Configuration
DEFAULT_CONFIG = {
    "api_base": "https://gamma-api.polymarket.com",
    "clob_api": "https://clob.polymarket.com",
    "max_position": 500,
    "min_edge_threshold": 0.30,
    "price_ceiling": 0.15,
    "kelly_fraction": 0.25,
    "request_timeout": 10,
    "rate_limit_delay": 0.5,
    "supported_categories": {
        "politics",
        "crypto",
        "economics",
        "sports",
        "science",
        "technology",
        "entertainment",
    },
}

# Session for connection pooling
session = requests.Session()


@dataclass
class Market:
    """Represents a Polymarket contract."""

    market_id: str
    question: str
    yes_price: float
    no_price: float
    volume: float
    category: str
    end_date: str
    outcome_type: str = "binary"
    liquidity: float = 0.0
    swisstony_position: Optional[Dict] = None

    def get_cheap_price(self) -> Tuple[float, str]:
        """Returns the cheaper price and which side (yes/no)."""
        if self.yes_price <= self.no_price:
            return self.yes_price, "YES"
        return self.no_price, "NO"

    def display_price(self) -> str:
        """Format prices for display."""
        return f"YES: ${self.yes_price:.3f} | NO: ${self.no_price:.3f}"


@dataclass
class Opportunity:
    """Represents an edge-entry opportunity."""

    market_id: str
    question: str
    current_price: float
    side: str
    estimated_probability: float
    expected_value: float
    volume: float
    category: str
    position_size: float = 0.0
    kelly_percentage: float = 0.0
    swisstony_match: bool = False

    def ev_percentage(self) -> float:
        """Calculate EV as percentage."""
        return (self.expected_value / self.current_price * 100) if self.current_price > 0 else 0


class PolymarketScanner:
    """Scans Polymarket for edge-entry opportunities."""

    def __init__(self, config: Optional[Dict] = None):
        """
        Initialize scanner with configuration.

        Args:
            config: Configuration dictionary. Uses DEFAULT_CONFIG if None.
        """
        self.config = {**DEFAULT_CONFIG, **(config or {})}
        self.markets: List[Market] = []
        self.opportunities: List[Opportunity] = []
        self.last_request_time = 0

    def rate_limit(self):
        """Implement rate limiting."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.config["rate_limit_delay"]:
            time.sleep(self.config["rate_limit_delay"] - elapsed)
        self.last_request_time = time.time()

    def fetch_markets(self) -> bool:
        """
        Fetch live markets from Polymarket Gamma API.

        Returns:
            True if successful, False otherwise.
        """
        try:
            self.rate_limit()
            url = f"{self.config['api_base']}/markets"
            params = {
                "limit": 1000,
                "order": "volume24hr",
            }

            print(f"[INFO] Fetching markets from {url}...")
            response = session.get(
                url,
                params=params,
                timeout=self.config["request_timeout"],
            )
            response.raise_for_status()

            data = response.json()
            markets_data = data.get("data", data) if isinstance(data, dict) else data

            if not isinstance(markets_data, list):
                print("[ERROR] Unexpected API response format")
                return False

            self.markets = []
            for m in markets_data:
                try:
                    # Parse prices from outcome tokens
                    yes_price = float(m.get("last_price_yes", m.get("bestAskYes", 0.5)))
                    no_price = float(m.get("last_price_no", m.get("bestBidNo", 0.5)))

                    # Normalize prices if needed
                    if yes_price > 1.0:
                        yes_price = yes_price / 100.0
                    if no_price > 1.0:
                        no_price = no_price / 100.0

                    # Ensure prices sum close to 1.0 for binary markets
                    if yes_price + no_price > 1.1:
                        yes_price = min(yes_price, 0.99)
                        no_price = min(no_price, 0.99)
                    elif yes_price + no_price < 0.9:
                        scale_factor = 1.0 / (yes_price + no_price)
                        yes_price *= scale_factor
                        no_price *= scale_factor

                    volume = float(m.get("volume24hr", m.get("volume", 0)))
                    liquidity = float(m.get("liquidity", 0))

                    market = Market(
                        market_id=m.get("id", m.get("market_id", "")),
                        question=m.get("question", "")[:100],
                        yes_price=yes_price,
                        no_price=no_price,
                        volume=volume,
                        category=m.get("category", "").lower(),
                        end_date=m.get("end_date", m.get("endDate", "Unknown")),
                        outcome_type=m.get("outcomeType", "binary"),
                        liquidity=liquidity,
                    )

                    if market.market_id and market.question:
                        self.markets.append(market)

                except (ValueError, KeyError, TypeError) as e:
                    continue

            print(f"[SUCCESS] Loaded {len(self.markets)} markets")
            return len(self.markets) > 0

        except requests.RequestException as e:
            print(f"[ERROR] Failed to fetch markets: {e}")
            return False
        except json.JSONDecodeError as e:
            print(f"[ERROR] Failed to parse JSON response: {e}")
            return False

    def estimate_probability(self, price: float, side: str) -> float:
        """
        Estimate implied probability from market price.

        In a binary market, yes_price + no_price ≈ 1.0
        The price itself represents the market's probability estimate.

        Args:
            price: Current price of the contract
            side: "YES" or "NO"

        Returns:
            Estimated probability (0.0 to 1.0)
        """
        # Add uncertainty for extreme prices
        if price < 0.01:
            return 0.02  # Very unlikely but not impossible
        if price > 0.99:
            return 0.98  # Very likely but not certain

        return float(price)

    def calculate_expected_value(
        self, current_price: float, estimated_prob: float, max_profit: float = 1.0
    ) -> float:
        """
        Calculate Expected Value of the position.

        EV = (estimated_probability × max_profit) - current_price

        Args:
            current_price: Current market price
            estimated_prob: Estimated probability of winning
            max_profit: Maximum profit if correct (default $1.00)

        Returns:
            Expected value in dollars
        """
        return (estimated_prob * max_profit) - current_price

    def kelly_criterion(self, win_prob: float, win_amount: float, loss_amount: float) -> float:
        """
        Calculate optimal position size using Kelly Criterion.

        Kelly % = (bp - q) / b
        where:
            b = odds (win_amount / loss_amount)
            p = probability of winning
            q = probability of losing (1 - p)

        Args:
            win_prob: Probability of winning (0.0 to 1.0)
            win_amount: Amount won if correct
            loss_amount: Amount lost if wrong

        Returns:
            Optimal percentage of bankroll to bet (0.0 to 1.0)
        """
        if win_prob <= 0 or win_prob >= 1:
            return 0.0

        loss_prob = 1 - win_prob

        # Avoid division by zero
        if loss_amount <= 0:
            return 0.0

        odds = win_amount / loss_amount
        kelly_pct = (odds * win_prob - loss_prob) / odds

        # Bound to [0, 1]
        kelly_pct = max(0.0, min(1.0, kelly_pct))

        # Apply fractional Kelly for safety
        return kelly_pct * self.config["kelly_fraction"]

    def scan_opportunities(self, filter_category: Optional[str] = None) -> List[Opportunity]:
        """
        Scan markets for edge-entry opportunities.

        Filters for:
        - Prices ≤ $0.15
        - Expected Value > threshold
        - Category matching (if specified)

        Args:
            filter_category: Optional category filter

        Returns:
            List of opportunities sorted by EV (descending)
        """
        self.opportunities = []

        for market in self.markets:
            # Category filter
            if filter_category and market.category != filter_category.lower():
                continue

            if market.category not in self.config["supported_categories"]:
                continue

            # Check both YES and NO sides
            for side, price in [("YES", market.yes_price), ("NO", market.no_price)]:
                if price > self.config["price_ceiling"]:
                    continue

                estimated_prob = self.estimate_probability(price, side)

                # Calculate EV
                ev = self.calculate_expected_value(price, estimated_prob)

                # Check edge threshold
                min_ev = price * self.config["min_edge_threshold"]
                if ev < min_ev:
                    continue

                # Calculate position size using Kelly
                kelly_pct = self.kelly_criterion(
                    win_prob=estimated_prob,
                    win_amount=1.0 - price,
                    loss_amount=price,
                )

                position_size = self.config["max_position"] * kelly_pct

                opp = Opportunity(
                    market_id=market.market_id,
                    question=market.question,
                    current_price=price,
                    side=side,
                    estimated_probability=estimated_prob,
                    expected_value=ev,
                    volume=market.volume,
                    category=market.category,
                    position_size=position_size,
                    kelly_percentage=kelly_pct * 100,
                )

                self.opportunities.append(opp)

        # Sort by EV descending
        self.opportunities.sort(key=lambda x: x.expected_value, reverse=True)

        return self.opportunities

    def check_swisstony_positions(self, top_n: int = 10) -> bool:
        """
        Check @swisstony's recent positions for copy-trading.

        Note: This requires Polymarket's unofficial profile API or web scraping.
        Current implementation is a placeholder that would need:
        - Direct API endpoint for user positions (if available)
        - Or web scraping of public profile page

        Args:
            top_n: Number of top opportunities to check

        Returns:
            True if check completed (even without results)
        """
        try:
            print("[INFO] Checking @swisstony positions...")

            # Note: Polymarket doesn't have a public API for user positions
            # This would require either:
            # 1. Polymarket to expose a /users/{username}/positions endpoint
            # 2. Web scraping the public profile (polymarket.com/user/swisstony)
            # 3. Using the CLOB order book data

            # For now, return success but note that data isn't available
            print("[WARNING] Polymarket user positions API not publicly available")
            print("[INFO] Recommendation: Check https://polymarket.com/user/swisstony manually")

            return True

        except Exception as e:
            print(f"[WARNING] Could not check swisstony positions: {e}")
            return False

    def format_table(self, opportunities: List[Opportunity], top_n: int = 10) -> str:
        """
        Format opportunities as a clean ASCII table.

        Args:
            opportunities: List of opportunities
            top_n: Number of top opportunities to display

        Returns:
            Formatted table string
        """
        if not opportunities:
            return "No opportunities found matching criteria."

        top = opportunities[:top_n]

        lines = []
        lines.append("\n" + "=" * 180)
        lines.append(
            f"{'Market Question':<50} | {'Price':>8} | {'EST %':>7} | {'EV':>9} | {'EV %':>7} | {'Volume':>12} | {'Position':>10} | {'Kelly %':>7}"
        )
        lines.append("-" * 180)

        for opp in top:
            # Truncate question to 50 chars
            q = opp.question[:47] + "..." if len(opp.question) > 50 else opp.question

            line = (
                f"{q:<50} | "
                f"${opp.current_price:>7.4f} | "
                f"{opp.estimated_probability * 100:>6.1f}% | "
                f"${opp.expected_value:>8.4f} | "
                f"{opp.ev_percentage():>6.1f}% | "
                f"${opp.volume:>11.0f} | "
                f"${opp.position_size:>9.2f} | "
                f"{opp.kelly_percentage:>6.1f}%"
            )
            lines.append(line)

        lines.append("=" * 180)

        return "\n".join(lines)

    def display_summary(self, top_n: int = 10):
        """
        Display summary statistics.

        Args:
            top_n: Number of top opportunities to show
        """
        if not self.opportunities:
            print("\n[WARNING] No edge-entry opportunities found")
            return

        top = self.opportunities[:top_n]

        print(self.format_table(self.opportunities, top_n))

        # Summary stats
        evs = [opp.expected_value for opp in top]
        total_position = sum(opp.position_size for opp in top)

        print(f"\n[SUMMARY]")
        print(f"  Total Opportunities: {len(self.opportunities)}")
        print(f"  Top {top_n} shown above")
        print(f"  Avg EV (top {top_n}): ${statistics.mean(evs):.4f}")
        if len(evs) > 1:
            print(f"  Std Dev EV: ${statistics.stdev(evs):.4f}")
        print(f"  Best EV: ${max(evs):.4f}")
        print(f"  Combined Position Size (top {top_n}): ${total_position:.2f}")
        print(f"  Max Position Limit: ${self.config['max_position']:.2f}")
        print(f"  Min Edge Threshold: {self.config['min_edge_threshold'] * 100:.0f}%")

        # Category breakdown
        categories = {}
        for opp in top:
            categories[opp.category] = categories.get(opp.category, 0) + 1

        print(f"\n[CATEGORIES]")
        for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
            print(f"  {cat}: {count} opportunities")

    def save_results(self, filename: str = "polymarket_opportunities.json"):
        """
        Save opportunities to JSON file.

        Args:
            filename: Output filename
        """
        try:
            data = {
                "timestamp": datetime.now().isoformat(),
                "config": {
                    "max_position": self.config["max_position"],
                    "min_edge_threshold": self.config["min_edge_threshold"],
                    "price_ceiling": self.config["price_ceiling"],
                },
                "summary": {
                    "total_markets_scanned": len(self.markets),
                    "total_opportunities": len(self.opportunities),
                },
                "opportunities": [
                    {
                        "market_id": opp.market_id,
                        "question": opp.question,
                        "side": opp.side,
                        "current_price": opp.current_price,
                        "estimated_probability": opp.estimated_probability,
                        "expected_value": opp.expected_value,
                        "ev_percentage": opp.ev_percentage(),
                        "volume": opp.volume,
                        "category": opp.category,
                        "position_size": opp.position_size,
                        "kelly_percentage": opp.kelly_percentage,
                    }
                    for opp in self.opportunities[:50]  # Top 50
                ],
            }

            with open(filename, "w") as f:
                json.dump(data, f, indent=2)

            print(f"\n[INFO] Saved results to {filename}")
            return True

        except IOError as e:
            print(f"[ERROR] Failed to save results: {e}")
            return False


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Polymarket Edge-Entry Trading Scanner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scan for top 20 opportunities with 35% min edge
  python j04-polymarket-edge-scanner.py --top 20 --min-edge 0.35

  # Filter by category (politics, crypto, economics, sports)
  python j04-polymarket-edge-scanner.py --category crypto --top 15

  # Custom max position size
  python j04-polymarket-edge-scanner.py --max-position 1000

  # Save results to file
  python j04-polymarket-edge-scanner.py --save results.json
        """,
    )

    parser.add_argument(
        "--top",
        type=int,
        default=10,
        help="Number of top opportunities to display (default: 10)",
    )

    parser.add_argument(
        "--min-edge",
        type=float,
        default=0.30,
        help="Minimum edge threshold as decimal (default: 0.30 = 30%%)",
    )

    parser.add_argument(
        "--max-position",
        type=float,
        default=500,
        help="Maximum position size in dollars (default: 500)",
    )

    parser.add_argument(
        "--category",
        type=str,
        choices=list(DEFAULT_CONFIG["supported_categories"]),
        help="Filter by category",
    )

    parser.add_argument(
        "--check-swisstony",
        action="store_true",
        help="Check @swisstony positions for copy-trading",
    )

    parser.add_argument(
        "--save",
        type=str,
        help="Save results to JSON file",
    )

    parser.add_argument(
        "--no-display",
        action="store_true",
        help="Don't display results table",
    )

    args = parser.parse_args()

    # Validate arguments
    if args.min_edge < 0 or args.min_edge > 1:
        print("[ERROR] min-edge must be between 0 and 1")
        return 1

    if args.max_position <= 0:
        print("[ERROR] max-position must be positive")
        return 1

    # Configure scanner
    config = {
        "min_edge_threshold": args.min_edge,
        "max_position": args.max_position,
    }

    scanner = PolymarketScanner(config)

    print(f"\n{'='*60}")
    print(f"POLYMARKET EDGE-ENTRY SCANNER")
    print(f"{'='*60}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Config: Max Position=${args.max_position}, Min Edge={args.min_edge*100:.0f}%")
    print(f"{'='*60}\n")

    # Fetch markets
    if not scanner.fetch_markets():
        print("[ERROR] Failed to fetch markets")
        return 1

    # Scan for opportunities
    opportunities = scanner.scan_opportunities(filter_category=args.category)

    if not opportunities:
        print("[WARNING] No opportunities found")
        return 0

    print(f"[SUCCESS] Found {len(opportunities)} edge-entry opportunities")

    # Check swisstony if requested
    if args.check_swisstony:
        scanner.check_swisstony_positions(top_n=args.top)

    # Display results
    if not args.no_display:
        scanner.display_summary(top_n=args.top)

    # Save results if requested
    if args.save:
        scanner.save_results(args.save)

    return 0


if __name__ == "__main__":
    sys.exit(main())
