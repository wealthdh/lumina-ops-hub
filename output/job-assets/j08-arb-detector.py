#!/usr/bin/env python3
"""
Cross-Market Arbitrage Detection Script for Polymarket
Detects arbitrage opportunities between Polymarket prediction markets and traditional financial instruments.
Author: Lumina Ops Hub
Date: 2026-04-03
"""

import requests
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import logging
from urllib.parse import urljoin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MarketCategory(Enum):
    """Market category types for mapping to financial instruments."""
    FED_RATE = "fed_rate_cut"
    BTC_PRICE = "btc_price"
    SP500 = "sp500"
    RECESSION = "recession"
    CRYPTO = "crypto"
    FOREX = "forex"
    COMMODITY = "commodity"
    OTHER = "other"


@dataclass
class ArbitrageOpportunity:
    """Represents a detected arbitrage opportunity."""
    market_id: str
    market_name: str
    category: MarketCategory
    polymarket_price: float
    polymarket_probability: float
    financial_instrument: str
    financial_probability: float
    probability_spread: float
    edge_percentage: float
    recommended_trade: str
    kelly_fraction: float
    position_size_pct: float
    entry_prices: Dict[str, float]
    risk_level: str
    timestamp: datetime

    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        return {
            'market_id': self.market_id,
            'market_name': self.market_name,
            'category': self.category.value,
            'polymarket_price': round(self.polymarket_price, 4),
            'polymarket_probability': round(self.polymarket_probability, 4),
            'financial_instrument': self.financial_instrument,
            'financial_probability': round(self.financial_probability, 4),
            'probability_spread': round(self.probability_spread, 4),
            'edge_percentage': round(self.edge_percentage, 2),
            'recommended_trade': self.recommended_trade,
            'kelly_fraction': round(self.kelly_fraction, 4),
            'position_size_pct': round(self.position_size_pct, 2),
            'entry_prices': {k: round(v, 4) for k, v in self.entry_prices.items()},
            'risk_level': self.risk_level,
            'timestamp': self.timestamp.isoformat()
        }


class PolymarketAPI:
    """Interface for Polymarket data via Gamma API."""

    BASE_URL = "https://gamma-api.polymarket.com"
    REQUEST_TIMEOUT = 10
    RETRY_MAX = 3
    RETRY_DELAY = 1

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Lumina-Arbitrage-Detector/1.0'
        })

    def fetch_markets(self) -> List[Dict]:
        """
        Fetch all markets from Polymarket.
        Returns list of market objects with prices.
        """
        try:
            url = urljoin(self.BASE_URL, "/markets")
            logger.info(f"Fetching Polymarket data from {url}")

            for attempt in range(self.RETRY_MAX):
                try:
                    response = self.session.get(
                        url,
                        timeout=self.REQUEST_TIMEOUT,
                        params={'closed': False}  # Only active markets
                    )
                    response.raise_for_status()
                    markets = response.json()
                    logger.info(f"Successfully fetched {len(markets)} markets")
                    return markets

                except requests.exceptions.RequestException as e:
                    if attempt < self.RETRY_MAX - 1:
                        logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying...")
                        time.sleep(self.RETRY_DELAY)
                    else:
                        raise

        except Exception as e:
            logger.error(f"Failed to fetch Polymarket data: {e}")
            raise

    def categorize_market(self, market: Dict) -> Tuple[MarketCategory, str]:
        """
        Categorize market based on title and description.
        Returns (category, financial_instrument).
        """
        title = market.get('title', '').lower()
        description = market.get('description', '').lower()
        combined = f"{title} {description}"

        # Fed/Rate markets
        if any(term in combined for term in ['fed', 'rate cut', 'interest rate', 'fomc']):
            return MarketCategory.FED_RATE, "EURUSD"

        # BTC/Crypto markets
        if any(term in combined for term in ['bitcoin', 'btc', 'eth', 'ethereum', 'crypto']):
            if 'ethereum' in combined or 'eth' in combined:
                return MarketCategory.CRYPTO, "ETHUSD"
            return MarketCategory.BTC_PRICE, "BTCUSD"

        # S&P 500 / Stock markets
        if any(term in combined for term in ['sp 500', 's&p 500', 'us500', 'es futures', 'stock market']):
            return MarketCategory.SP500, "US500"

        # Recession / Economic indicators
        if any(term in combined for term in ['recession', 'unemployment', 'gdp', 'inflation']):
            return MarketCategory.RECESSION, "VIX"

        # Commodity markets
        if any(term in combined for term in ['oil', 'gold', 'silver', 'copper', 'commodity']):
            if 'gold' in combined or 'silver' in combined:
                return MarketCategory.COMMODITY, "XAUUSD"
            return MarketCategory.COMMODITY, "WTIUSD"

        # Forex markets
        if any(term in combined for term in ['forex', 'exchange rate', 'currency', 'eur', 'gbp', 'jpy']):
            return MarketCategory.FOREX, "EURUSD"

        return MarketCategory.OTHER, "UNKNOWN"

    def extract_price_data(self, market: Dict) -> Tuple[float, float]:
        """
        Extract current price and implied probability from market data.
        Returns (price, probability).
        """
        try:
            # Try multiple possible price fields
            price = market.get('last_price') or market.get('price') or 0.5
            price = float(price)

            # Price should be between 0 and 1
            if not (0 <= price <= 1):
                price = 0.5

            probability = price  # In prediction markets, price = probability
            return price, probability

        except (ValueError, TypeError) as e:
            logger.warning(f"Error extracting price data: {e}")
            return 0.5, 0.5


class FinancialMarketSimulator:
    """
    Simulates financial market probability pricing.
    In production, this would connect to real market data feeds.
    """

    def __init__(self):
        self.mock_data = {
            "EURUSD": 1.0841,
            "BTCUSD": 42500.00,
            "ETHUSD": 2400.50,
            "US500": 5420.30,
            "VIX": 18.50,
            "XAUUSD": 2350.00,
            "WTIUSD": 85.30
        }
        # Historical volatility and market implied probabilities
        self.implied_probabilities = {
            "EURUSD": 0.45,  # Fed rate cut probability from EURUSD movement
            "BTCUSD": 0.68,  # BTC price above certain level
            "ETHUSD": 0.55,
            "US500": 0.60,   # S&P 500 upside
            "VIX": 0.35,     # Recession probability (inverse of VIX)
            "XAUUSD": 0.50,
            "WTIUSD": 0.48
        }

    def get_market_price(self, instrument: str) -> Optional[float]:
        """Get current price of financial instrument."""
        return self.mock_data.get(instrument)

    def get_implied_probability(self, instrument: str) -> float:
        """
        Get market-implied probability for an instrument.
        In production: calculate from options markets, term structure, etc.
        """
        probability = self.implied_probabilities.get(instrument, 0.5)
        # Add small random variation to simulate real-time updates
        import random
        variation = random.uniform(-0.02, 0.02)
        return max(0.01, min(0.99, probability + variation))

    def update_from_live_feeds(self):
        """
        Placeholder for connecting to live market data.
        Could integrate with:
        - Alpha Vantage for stocks
        - CoinGecko/Kraken for crypto
        - OANDA/Forex.com for FX
        - CME for futures
        """
        pass


class ArbitrageDetector:
    """Main arbitrage detection engine."""

    MIN_SPREAD_THRESHOLD = 0.02  # 2% minimum spread
    KELLY_SAFETY_FACTOR = 0.25  # Use 1/4 Kelly for position sizing

    def __init__(self):
        self.polymarket_api = PolymarketAPI()
        self.financial_market = FinancialMarketSimulator()
        self.opportunities: List[ArbitrageOpportunity] = []

    def calculate_kelly_criterion(
        self,
        win_probability: float,
        loss_probability: float,
        win_payout: float,
        loss_payout: float = 1.0
    ) -> float:
        """
        Calculate Kelly Criterion for position sizing.
        f* = (bp - q) / b
        where:
        - b = odds (payout ratio)
        - p = win probability
        - q = loss probability = 1 - p
        """
        if win_probability >= 1.0 or win_probability <= 0:
            return 0.0

        b = win_payout / loss_payout if loss_payout > 0 else 1.0
        p = win_probability
        q = 1 - p

        kelly = (b * p - q) / b if b > 0 else 0

        # Apply safety factor and cap at 0.25
        kelly_fractional = max(0, min(kelly * self.KELLY_SAFETY_FACTOR, 0.25))

        return kelly_fractional

    def detect_opportunities(self) -> List[ArbitrageOpportunity]:
        """
        Main detection pipeline.
        Fetch Polymarket data, compare to financial markets, identify arbs.
        """
        try:
            logger.info("Starting arbitrage detection cycle")

            # Fetch Polymarket data
            markets = self.polymarket_api.fetch_markets()

            if not markets:
                logger.warning("No markets returned from Polymarket API")
                return []

            # Process each market
            for market in markets:
                try:
                    self._process_market(market)
                except Exception as e:
                    logger.warning(f"Error processing market: {e}")
                    continue

            # Sort by edge percentage
            self.opportunities.sort(key=lambda x: x.edge_percentage, reverse=True)

            logger.info(f"Detected {len(self.opportunities)} opportunities above threshold")
            return self.opportunities

        except Exception as e:
            logger.error(f"Error in detection pipeline: {e}")
            return []

    def _process_market(self, market: Dict) -> None:
        """Process individual market for arbitrage opportunities."""
        market_id = market.get('id', 'unknown')
        market_name = market.get('title', 'Unknown Market')

        # Categorize and map to financial instrument
        category, financial_instrument = self.polymarket_api.categorize_market(market)

        if financial_instrument == "UNKNOWN":
            return  # Skip unmapped markets

        # Extract Polymarket pricing
        polymarket_price, poly_probability = self.polymarket_api.extract_price_data(market)

        # Get financial market implied probability
        financial_probability = self.financial_market.get_implied_probability(financial_instrument)
        financial_price = self.financial_market.get_market_price(financial_instrument)

        # Calculate spread
        probability_spread = abs(poly_probability - financial_probability)

        # Check if above threshold
        if probability_spread < self.MIN_SPREAD_THRESHOLD:
            return

        # Calculate edge percentage
        edge_percentage = probability_spread * 100

        # Calculate Kelly fraction
        # Assuming 1:1 odds (typical for binary prediction markets)
        kelly_fraction = self.calculate_kelly_criterion(
            win_probability=poly_probability,
            loss_probability=1 - poly_probability,
            win_payout=1.0,
            loss_payout=polymarket_price
        )

        position_size_pct = kelly_fraction * 100

        # Determine trade recommendation
        if poly_probability > financial_probability:
            # Polymarket overprices YES relative to financial market
            recommended_trade = f"BUY Polymarket YES at ${polymarket_price:.2f} + SELL {financial_instrument} = Hedged {edge_percentage:.1f}% edge"
            risk_level = "Low" if edge_percentage < 5 else "Medium"
        else:
            # Polymarket underprices YES relative to financial market
            recommended_trade = f"SELL Polymarket YES at ${polymarket_price:.2f} + BUY {financial_instrument} = Hedged {edge_percentage:.1f}% edge"
            risk_level = "Low" if edge_percentage < 5 else "Medium"

        entry_prices = {
            "polymarket_price": polymarket_price,
            "financial_instrument_price": financial_price if financial_price else 0.0
        }

        opportunity = ArbitrageOpportunity(
            market_id=market_id,
            market_name=market_name,
            category=category,
            polymarket_price=polymarket_price,
            polymarket_probability=poly_probability,
            financial_instrument=financial_instrument,
            financial_probability=financial_probability,
            probability_spread=probability_spread,
            edge_percentage=edge_percentage,
            recommended_trade=recommended_trade,
            kelly_fraction=kelly_fraction,
            position_size_pct=position_size_pct,
            entry_prices=entry_prices,
            risk_level=risk_level,
            timestamp=datetime.now()
        )

        self.opportunities.append(opportunity)

    def format_table_output(self, opportunities: List[ArbitrageOpportunity]) -> str:
        """Format opportunities as clean ASCII table."""
        if not opportunities:
            return "No arbitrage opportunities detected above 2% threshold.\n"

        output = []
        output.append("\n" + "=" * 140)
        output.append("POLYMARKET CROSS-MARKET ARBITRAGE OPPORTUNITIES")
        output.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        output.append("=" * 140)
        output.append("")

        # Header
        headers = [
            "Market",
            "Category",
            "Poly Price",
            "Poly Prob",
            "Financial Instr",
            "Fin Prob",
            "Spread",
            "Edge %",
            "Kelly %",
            "Position %",
            "Risk"
        ]
        header_line = " | ".join(f"{h:18}" for h in headers)
        output.append(header_line)
        output.append("-" * 140)

        # Data rows
        for opp in opportunities[:20]:  # Top 20
            row = [
                opp.market_name[:18],
                opp.category.value[:18],
                f"${opp.polymarket_price:.4f}",
                f"{opp.polymarket_probability:.2%}",
                opp.financial_instrument[:18],
                f"{opp.financial_probability:.2%}",
                f"{opp.probability_spread:.2%}",
                f"{opp.edge_percentage:.2f}%",
                f"{opp.kelly_fraction:.2%}",
                f"{opp.position_size_pct:.2f}%",
                opp.risk_level
            ]
            row_line = " | ".join(f"{str(v):18}" for v in row)
            output.append(row_line)

        output.append("")
        output.append("=" * 140)
        output.append("DETAILED TRADE RECOMMENDATIONS")
        output.append("=" * 140)
        output.append("")

        for i, opp in enumerate(opportunities[:10], 1):
            output.append(f"{i}. {opp.market_name}")
            output.append(f"   Category: {opp.category.value}")
            output.append(f"   Polymarket: ${opp.polymarket_price:.4f} ({opp.polymarket_probability:.2%})")
            output.append(f"   Financial ({opp.financial_instrument}): {opp.financial_probability:.2%}")
            output.append(f"   Probability Spread: {opp.probability_spread:.2%} ({opp.edge_percentage:.2f}% edge)")
            output.append(f"   Recommended Trade: {opp.recommended_trade}")
            output.append(f"   Kelly Fraction: {opp.kelly_fraction:.2%}")
            output.append(f"   Recommended Position Size: {opp.position_size_pct:.2f}% of capital")
            output.append(f"   Risk Level: {opp.risk_level}")
            output.append(f"   Entry Prices: {opp.entry_prices}")
            output.append("")

        output.append("=" * 140)
        output.append(f"Total opportunities: {len(opportunities)}")
        output.append("=" * 140)

        return "\n".join(output)

    def export_json(self, opportunities: List[ArbitrageOpportunity], filepath: str) -> None:
        """Export opportunities to JSON file."""
        try:
            data = {
                'timestamp': datetime.now().isoformat(),
                'total_opportunities': len(opportunities),
                'opportunities': [opp.to_dict() for opp in opportunities]
            }
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2)
            logger.info(f"Exported {len(opportunities)} opportunities to {filepath}")
        except Exception as e:
            logger.error(f"Error exporting JSON: {e}")


def main():
    """Main entry point."""
    try:
        logger.info("=" * 80)
        logger.info("Polymarket Cross-Market Arbitrage Detector v1.0")
        logger.info("=" * 80)

        detector = ArbitrageDetector()

        # Run detection
        opportunities = detector.detect_opportunities()

        # Display results
        table_output = detector.format_table_output(opportunities)
        print(table_output)

        # Export to JSON
        if opportunities:
            json_path = "polymarket_arb_opportunities.json"
            detector.export_json(opportunities, json_path)
            logger.info(f"Results saved to {json_path}")

        logger.info("Arbitrage detection complete")
        return 0

    except KeyboardInterrupt:
        logger.info("Detection interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
