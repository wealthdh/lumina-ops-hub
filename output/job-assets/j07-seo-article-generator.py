#!/usr/bin/env python3
"""
SEO Article Generator - Content Swarm Job Asset

Generates SEO-optimized article outlines and HTML templates.
- Takes keyword/topic as input
- Generates H1, H2, H3 structure with SEO optimization
- Meta description (155 chars)
- FAQ section with 5 questions
- Internal link suggestions
- Article JSON-LD schema markup
- Outputs formatted HTML file

Usage:
    python j07-seo-article-generator.py "ai trading strategies 2026"
    python j07-seo-article-generator.py "best crypto wallets" --author "Lumina Pulse"
    python j07-seo-article-generator.py "forex risk management" --json
"""

import json
import sys
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import argparse


class SEOArticleGenerator:
    """Generates SEO-optimized article outlines and HTML templates."""

    # SEO content templates and best practices
    H2_TEMPLATES = [
        "Understanding {keyword}",
        "{keyword}: Complete Guide",
        "How to {verb} {keyword}",
        "Best Practices for {keyword}",
        "Why {keyword} Matters",
        "{keyword} 2026: What You Need to Know",
        "Common Mistakes in {keyword}",
        "Advanced {keyword} Strategies",
        "{keyword} for Beginners",
        "The Future of {keyword}"
    ]

    H3_SUBTOPICS = {
        'Understanding {keyword}': [
            'Definition and Core Concepts',
            'Historical Background',
            'Key Components Explained'
        ],
        'Best Practices for {keyword}': [
            'Implementation Checklist',
            'Common Pitfalls to Avoid',
            'Pro Tips and Optimization'
        ],
        'How to {verb} {keyword}': [
            'Step-by-Step Process',
            'Tools and Resources',
            'Troubleshooting Guide'
        ]
    }

    FAQ_TEMPLATES = [
        "What is {keyword}?",
        "How do I get started with {keyword}?",
        "Is {keyword} worth the effort?",
        "What are the risks of {keyword}?",
        "How much does {keyword} cost?",
        "Where can I learn more about {keyword}?",
        "What tools do professionals use for {keyword}?",
        "How long does it take to master {keyword}?",
    ]

    def __init__(self, keyword: str, author: str = "Lumina Pulse",
                 focus_area: str = "trading"):
        """
        Initialize SEO Article Generator.

        Args:
            keyword: Main topic/keyword to generate article for
            author: Article author name
            focus_area: Content focus (trading, crypto, finance, general)
        """
        self.keyword = keyword.strip()
        self.author = author
        self.focus_area = focus_area.lower()
        self.generated_at = datetime.now().isoformat()

        if not self.keyword:
            raise ValueError("Keyword cannot be empty")

    def extract_main_keyword(self) -> str:
        """Extract primary keyword (usually first significant word)."""
        words = self.keyword.split()
        # Filter out common modifiers
        stops = {'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'to'}
        keywords = [w for w in words if w.lower() not in stops]
        return keywords[0] if keywords else words[0]

    def generate_h1_title(self) -> str:
        """
        Generate SEO-optimized H1 title.

        Returns:
            H1 title string with keyword
        """
        main_keyword = self.extract_main_keyword()

        # Patterns for compelling titles (with keyword)
        patterns = [
            f"The Ultimate Guide to {self.keyword}",
            f"{self.keyword}: Complete 2026 Guide",
            f"Master {self.keyword} in 2026",
            f"How to {self.keyword}: Expert Strategies",
            f"{self.keyword} Explained: Full Tutorial",
        ]

        return patterns[0]  # Primary recommendation

    def generate_meta_description(self) -> str:
        """
        Generate meta description (150-160 chars).

        Returns:
            Meta description string
        """
        templates = [
            f"Learn {self.keyword} with our comprehensive guide. Expert strategies, best practices, and proven tips to master {self.keyword} in 2026.",
            f"Discover everything about {self.keyword}. Step-by-step tutorial covering fundamentals, advanced techniques, and actionable strategies.",
            f"Complete guide to {self.keyword}. Learn from industry experts. Includes practical tips, FAQs, and resources for success.",
        ]

        for template in templates:
            if len(template) <= 160:
                return template

        # Fallback: truncate and add ellipsis
        return (f"Learn {self.keyword} with our expert guide. Complete tutorial with practical strategies and best practices for 2026."[:157] + "...")

    def generate_h2_headings(self) -> List[str]:
        """
        Generate 8-10 H2 section headings.

        Returns:
            List of H2 heading strings
        """
        main_keyword = self.extract_main_keyword()
        verb = "master" if self.focus_area == "trading" else "understand"

        headings = [
            f"Understanding {self.keyword}",
            f"Why {self.keyword} Matters in 2026",
            f"Key Components of {self.keyword}",
            f"How to Get Started with {self.keyword}",
            f"Best Practices for {self.keyword}",
            f"Advanced {main_keyword} Strategies",
            f"Common Mistakes in {self.keyword}",
            f"Tools and Resources for {self.keyword}",
            f"Measuring Success with {self.keyword}",
            f"The Future of {self.keyword}"
        ]

        return headings

    def generate_h3_subheadings(self, h2_heading: str) -> List[str]:
        """
        Generate 3-5 H3 subheadings for each H2.

        Args:
            h2_heading: Parent H2 heading

        Returns:
            List of relevant H3 subheadings
        """
        # Map H2 to templates
        if "Understanding" in h2_heading:
            return [
                "Definition and Core Concepts",
                "Historical Background and Evolution",
                "Key Components Explained",
                "Why It Matters Today"
            ]
        elif "How to Get Started" in h2_heading:
            return [
                "Prerequisites and Requirements",
                "Step-by-Step Beginner's Roadmap",
                "Essential Tools and Platforms",
                "Common Beginner Questions"
            ]
        elif "Best Practices" in h2_heading:
            return [
                "Implementation Checklist",
                "Risk Management Essentials",
                "Pro Tips from Industry Experts",
                "Optimization Strategies"
            ]
        elif "Advanced" in h2_heading:
            return [
                "Intermediate Techniques",
                "Pro-Level Strategies",
                "Automation and Optimization",
                "Case Studies: Real-World Examples"
            ]
        elif "Common Mistakes" in h2_heading:
            return [
                "Pitfalls Beginners Face",
                "How to Avoid Costly Errors",
                "Recovery from Common Setbacks",
                "Learning from Failures"
            ]
        elif "Tools and Resources" in h2_heading:
            return [
                "Essential Software and Platforms",
                "Recommended Learning Resources",
                "Community and Networking",
                "Premium Tools Worth Investing In"
            ]
        elif "Measuring Success" in h2_heading:
            return [
                "Key Performance Indicators",
                "Tracking Progress Over Time",
                "Benchmarking Against Peers",
                "Continuous Improvement Metrics"
            ]
        elif "Future" in h2_heading:
            return [
                "Emerging Trends and Technologies",
                "Market Predictions for 2026-2027",
                "Preparing for Changes Ahead",
                "Opportunities on the Horizon"
            ]
        else:
            return [
                "Fundamentals",
                "Practical Implementation",
                "Expert Insights",
                "Key Takeaways"
            ]

    def generate_faq_section(self) -> List[Dict[str, str]]:
        """
        Generate 5-8 FAQ question-answer pairs.

        Returns:
            List of FAQ dictionaries with question and answer outline
        """
        main_keyword = self.extract_main_keyword()

        faqs = [
            {
                "question": f"What is {self.keyword}?",
                "answer": f"Brief definition and explanation of {self.keyword}, its importance, and primary use cases."
            },
            {
                "question": f"How do I get started with {self.keyword}?",
                "answer": "Step-by-step guide for beginners, including prerequisites, initial setup, and first steps."
            },
            {
                "question": f"Is {self.keyword} worth the effort?",
                "answer": f"Analysis of benefits, ROI potential, time commitment, and when {self.keyword} makes sense."
            },
            {
                "question": f"What are the main risks of {self.keyword}?",
                "answer": f"Honest discussion of risks, downsides, and mitigation strategies for {self.keyword}."
            },
            {
                "question": f"What tools do professionals use for {self.keyword}?",
                "answer": "Overview of industry-standard tools, platforms, and software used by experts."
            },
            {
                "question": f"How long does it take to master {self.keyword}?",
                "answer": "Realistic timeline, skill progression stages, and factors affecting learning curve."
            },
            {
                "question": f"Where can I learn more about {self.keyword}?",
                "answer": "Curated list of resources, courses, communities, and recommended reading materials."
            },
            {
                "question": f"How much does it cost to get started with {self.keyword}?",
                "answer": "Cost breakdown, free vs. paid options, and budget recommendations for different levels."
            }
        ]

        return faqs[:7]  # Return 5-7 FAQs

    def generate_internal_links(self) -> List[Dict[str, str]]:
        """
        Generate internal linking suggestions.

        Returns:
            List of suggested internal link targets
        """
        main_keyword = self.extract_main_keyword()

        suggestions = [
            {
                "anchor_text": f"Introduction to {main_keyword}",
                "suggested_url": f"/guides/intro-{main_keyword.lower()}",
                "placement": "First mention in introduction"
            },
            {
                "anchor_text": "Risk Management Guide",
                "suggested_url": "/guides/risk-management",
                "placement": "In best practices section"
            },
            {
                "anchor_text": "Advanced Trading Strategies",
                "suggested_url": "/guides/advanced-strategies",
                "placement": "In advanced section"
            },
            {
                "anchor_text": f"{self.keyword} Tools Comparison",
                "suggested_url": f"/tools-comparison/{main_keyword.lower()}",
                "placement": "In tools section"
            },
            {
                "anchor_text": "Market Analysis 2026",
                "suggested_url": "/market-analysis/2026",
                "placement": "In future trends section"
            }
        ]

        return suggestions

    def generate_json_ld_schema(self) -> Dict:
        """
        Generate Article JSON-LD schema markup.

        Returns:
            Dictionary representing JSON-LD Article schema
        """
        h2_headings = self.generate_h2_headings()

        schema = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": self.generate_h1_title(),
            "description": self.generate_meta_description(),
            "author": {
                "@type": "Organization",
                "name": self.author,
                "url": "https://luminapulse.io"
            },
            "publisher": {
                "@type": "Organization",
                "name": self.author,
                "logo": {
                    "@type": "ImageObject",
                    "url": "https://luminapulse.io/logo.png"
                }
            },
            "datePublished": datetime.now().strftime("%Y-%m-%d"),
            "dateModified": datetime.now().strftime("%Y-%m-%d"),
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": f"https://luminapulse.io/{self.keyword.lower().replace(' ', '-')}"
            },
            "keywords": [self.keyword, self.extract_main_keyword(), "2026", "guide"],
            "articleSection": "Finance & Trading"
        }

        return schema

    def generate_html_output(self) -> str:
        """
        Generate complete HTML article template.

        Returns:
            HTML string ready for blog publication
        """
        h1 = self.generate_h1_title()
        meta_desc = self.generate_meta_description()
        h2_headings = self.generate_h2_headings()
        faq = self.generate_faq_section()
        internal_links = self.generate_internal_links()
        schema = self.generate_json_ld_schema()

        slug = self.keyword.lower().replace(' ', '-').replace(':', '').replace('&', 'and')

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="{meta_desc}">
    <meta name="keywords" content="{self.keyword}, {self.extract_main_keyword()}, trading, 2026">
    <meta name="author" content="{self.author}">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{h1}">
    <meta property="og:description" content="{meta_desc}">
    <meta property="og:url" content="https://luminapulse.io/{slug}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{h1}">
    <meta name="twitter:description" content="{meta_desc}">

    <title>{h1} | {self.author}</title>

    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
        }}

        .container {{
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background: white;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
        }}

        header {{
            margin-bottom: 40px;
            border-bottom: 3px solid #2c3e50;
            padding-bottom: 20px;
        }}

        .meta {{
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
        }}

        h1 {{
            font-size: 2.5em;
            margin: 20px 0;
            color: #1a1a1a;
            line-height: 1.2;
        }}

        .meta-description {{
            font-size: 1.1em;
            color: #555;
            font-style: italic;
            margin: 15px 0;
        }}

        .table-of-contents {{
            background: #f0f0f0;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
        }}

        .table-of-contents h2 {{
            font-size: 1.3em;
            margin-bottom: 15px;
        }}

        .table-of-contents ol {{
            margin-left: 20px;
        }}

        .table-of-contents li {{
            margin: 8px 0;
        }}

        .table-of-contents a {{
            color: #3498db;
            text-decoration: none;
        }}

        .table-of-contents a:hover {{
            text-decoration: underline;
        }}

        h2 {{
            font-size: 1.8em;
            margin: 40px 0 20px 0;
            color: #2c3e50;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }}

        h3 {{
            font-size: 1.3em;
            margin: 25px 0 15px 0;
            color: #34495e;
        }}

        p {{
            margin-bottom: 15px;
            text-align: justify;
        }}

        .internal-link {{
            color: #3498db;
            text-decoration: none;
            font-weight: 500;
            border-bottom: 1px dotted #3498db;
        }}

        .internal-link:hover {{
            text-decoration: underline;
        }}

        .faq-section {{
            background: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
        }}

        .faq-item {{
            margin: 20px 0;
            border-left: 4px solid #3498db;
            padding-left: 15px;
        }}

        .faq-question {{
            font-weight: bold;
            font-size: 1.1em;
            margin-bottom: 8px;
            color: #2c3e50;
        }}

        .faq-answer {{
            color: #555;
            font-size: 0.95em;
        }}

        .internal-links-section {{
            background: #e8f4f8;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
        }}

        .internal-links-section h3 {{
            margin-top: 0;
        }}

        .internal-links-section ul {{
            margin-left: 20px;
        }}

        .internal-links-section li {{
            margin: 8px 0;
            font-size: 0.95em;
        }}

        footer {{
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #999;
            font-size: 0.9em;
            text-align: center;
        }}

        .author-badge {{
            background: #ecf0f1;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }}

        code {{
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }}

        blockquote {{
            border-left: 4px solid #3498db;
            padding-left: 15px;
            margin: 20px 0;
            color: #666;
            font-style: italic;
        }}

        @media (max-width: 600px) {{
            h1 {{ font-size: 1.8em; }}
            h2 {{ font-size: 1.4em; }}
            h3 {{ font-size: 1.1em; }}
            .container {{ padding: 20px 10px; }}
        }}
    </style>
</head>
<body>
    <article class="container">
        <header>
            <div class="meta">
                <span>By {self.author}</span> |
                <span>Published: {datetime.now().strftime('%B %d, %Y')}</span> |
                <span>Category: Trading & Finance</span>
            </div>
            <h1>{h1}</h1>
            <div class="meta-description">{meta_desc}</div>
        </header>

        <!-- Table of Contents -->
        <div class="table-of-contents">
            <h2>Table of Contents</h2>
            <ol>
"""

        for i, heading in enumerate(h2_headings, 1):
            toc_id = heading.lower().replace(' ', '-')
            html += f'                <li><a href="#{toc_id}">{heading}</a></li>\n'

        html += """            </ol>
        </div>

        <!-- Main Content -->
        <section class="content">
            <p>
                <strong>Introduction:</strong> This comprehensive guide covers everything you need to know about {keyword}.
                Whether you're a beginner looking to get started or an experienced professional seeking advanced strategies,
                this article provides actionable insights and expert recommendations.
            </p>
""".replace('{keyword}', self.keyword)

        # Add H2 sections with H3 subheadings
        for h2_heading in h2_headings:
            toc_id = h2_heading.lower().replace(' ', '-')
            html += f'            <h2 id="{toc_id}">{h2_heading}</h2>\n'

            h3_headings = self.generate_h3_subheadings(h2_heading)
            for h3_heading in h3_headings:
                html += f'            <h3>{h3_heading}</h3>\n'
                html += f'            <p>Detailed content about {h3_heading.lower()}. This section explains key concepts, provides practical examples, and offers actionable advice based on industry best practices.</p>\n'

        # FAQ Section
        html += """
            <div class="faq-section">
                <h2>Frequently Asked Questions</h2>
"""

        for faq in faq:
            html += f"""                <div class="faq-item">
                    <div class="faq-question">Q: {faq['question']}</div>
                    <div class="faq-answer">A: {faq['answer']}</div>
                </div>
"""

        # Internal Links Section
        html += """
            </div>

            <div class="internal-links-section">
                <h3>Related Resources</h3>
                <ul>
"""

        for link in internal_links:
            html += f'                    <li><a href="{link["suggested_url"]}" class="internal-link">{link["anchor_text"]}</a></li>\n'

        html += """                </ul>
            </div>

            <div class="author-badge">
                <h3>About the Author</h3>
                <p>{author} specializes in trading, finance, and digital asset strategies. This content is provided for educational purposes only and should not be considered financial advice.</p>
            </div>
        </section>

        <footer>
            <p>Last updated: {date} | Content by {author}</p>
            <p>Disclaimer: This article is for educational purposes only. Trading and investing involve substantial risk of loss. Past performance is not indicative of future results.</p>
        </footer>
    </article>

    <!-- JSON-LD Schema Markup -->
    <script type="application/ld+json">
{json_ld}
    </script>
</body>
</html>
""".format(
            author=self.author,
            date=datetime.now().strftime('%B %d, %Y'),
            json_ld=json.dumps(schema, indent=8)
        )

        return html

    def save_html(self, output_path: Optional[str] = None) -> str:
        """
        Generate and save HTML file.

        Args:
            output_path: Custom output path. If None, uses keyword-based filename

        Returns:
            Path to saved HTML file
        """
        if output_path is None:
            slug = self.keyword.lower().replace(' ', '-').replace(':', '').replace('&', 'and')
            output_path = f"{slug}-article.html"

        html_content = self.generate_html_output()

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        return output_path


def main():
    """CLI interface for SEO Article Generator."""
    parser = argparse.ArgumentParser(
        description='SEO Article Generator - Generate optimized article outlines and HTML',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''Examples:
  python j07-seo-article-generator.py "ai trading strategies 2026"
  python j07-seo-article-generator.py "best crypto wallets" --author "Lumina Pulse"
  python j07-seo-article-generator.py "forex risk management" --json
  python j07-seo-article-generator.py "defi yield farming" --output custom-article.html
        '''
    )

    parser.add_argument('keyword', help='Main topic/keyword for article')
    parser.add_argument('--author', default='Lumina Pulse',
                        help='Article author name (default: Lumina Pulse)')
    parser.add_argument('--output', help='Custom output HTML file path')
    parser.add_argument('--json', action='store_true',
                        help='Output article structure as JSON instead of HTML')
    parser.add_argument('--focus', default='trading',
                        help='Content focus area: trading, crypto, finance, general')

    args = parser.parse_args()

    try:
        generator = SEOArticleGenerator(
            keyword=args.keyword,
            author=args.author,
            focus_area=args.focus
        )

        if args.json:
            # JSON output mode
            output = {
                'keyword': generator.keyword,
                'h1_title': generator.generate_h1_title(),
                'meta_description': generator.generate_meta_description(),
                'h2_headings': generator.generate_h2_headings(),
                'h3_subheadings': {
                    h2: generator.generate_h3_subheadings(h2)
                    for h2 in generator.generate_h2_headings()
                },
                'faq': generator.generate_faq_section(),
                'internal_links': generator.generate_internal_links(),
                'json_ld_schema': generator.generate_json_ld_schema()
            }
            print(json.dumps(output, indent=2))
        else:
            # HTML output mode
            output_path = generator.save_html(args.output)
            print(f"✓ Article HTML generated: {output_path}")
            print(f"  Keyword: {generator.keyword}")
            print(f"  H1 Title: {generator.generate_h1_title()}")
            print(f"  Sections: {len(generator.generate_h2_headings())} H2s")
            print(f"  FAQs: {len(generator.generate_faq_section())} questions")
            print(f"  Meta Description: {len(generator.generate_meta_description())} chars")

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except IOError as e:
        print(f"File error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
