#!/usr/bin/env python3
"""
Demo version of cross-market arbitrage detector showing sample output.
This demonstrates the output format without requiring live API access.
"""

from datetime import datetime
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List


class MarketCategory(Enum):
    """Market category types for mapping to financial instruments."""
    FED_RATE = "fed_rate_cut"
    BTC_PRICE = "btc_price"
    SP500 = "sp500"
    RECESSION = "recession"


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


def format_table_output(opportunities: List[ArbitrageOpportunity]) -> str:
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


def main():
    """Demo main function."""
    # Create sample opportunities for demonstration
    sample_opps = [
        ArbitrageOpportunity(
            market_id="0x001",
            market_name="Will Fed cut rates in Q2 2026?",
            category=MarketCategory.FED_RATE,
            polymarket_price=0.62,
            polymarket_probability=0.62,
            financial_instrument="EURUSD",
            financial_probability=0.58,
            probability_spread=0.04,
            edge_percentage=4.1,
            recommended_trade="BUY Polymarket YES at $0.62 + SELL EURUSD at 1.0841 = Hedged 4.1% edge",
            kelly_fraction=0.0205,
            position_size_pct=2.05,
            entry_prices={"polymarket_price": 0.62, "financial_instrument_price": 1.0841},
            risk_level="Low",
            timestamp=datetime.now()
        ),
        ArbitrageOpportunity(
            market_id="0x002",
            market_name="BTC price above $45K by end of April?",
            category=MarketCategory.BTC_PRICE,
            polymarket_price=0.48,
            polymarket_probability=0.48,
            financial_instrument="BTCUSD",
            financial_probability=0.55,
            probability_spread=0.07,
            edge_percentage=7.2,
            recommended_trade="SELL Polymarket YES at $0.48 + BUY BTCUSD spot = Hedged 7.2% edge",
            kelly_fraction=0.036,
            position_size_pct=3.6,
            entry_prices={"polymarket_price": 0.48, "financial_instrument_price": 42500.0},
            risk_level="Low",
            timestamp=datetime.now()
        ),
        ArbitrageOpportunity(
            market_id="0x003",
            market_name="S&P 500 above 5500 by June?",
            category=MarketCategory.SP500,
            polymarket_price=0.58,
            polymarket_probability=0.58,
            financial_instrument="US500",
            financial_probability=0.52,
            probability_spread=0.06,
            edge_percentage=5.8,
            recommended_trade="BUY Polymarket YES at $0.58 + SELL US500 futures = Hedged 5.8% edge",
            kelly_fraction=0.029,
            position_size_pct=2.9,
            entry_prices={"polymarket_price": 0.58, "financial_instrument_price": 5420.30},
            risk_level="Low",
            timestamp=datetime.now()
        ),
        ArbitrageOpportunity(
            market_id="0x004",
            market_name="Will US enter recession by Q4 2026?",
            category=MarketCategory.RECESSION,
            polymarket_price=0.35,
            polymarket_probability=0.35,
            financial_instrument="VIX",
            financial_probability=0.42,
            probability_spread=0.07,
            edge_percentage=7.0,
            recommended_trade="SELL Polymarket YES at $0.35 + BUY VIX upside = Hedged 7.0% edge",
            kelly_fraction=0.035,
            position_size_pct=3.5,
            entry_prices={"polymarket_price": 0.35, "financial_instrument_price": 18.50},
            risk_level="Medium",
            timestamp=datetime.now()
        ),
    ]

    # Display results
    output = format_table_output(sample_opps)
    print(output)


if __name__ == "__main__":
    main()
