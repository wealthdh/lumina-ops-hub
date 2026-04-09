#!/usr/bin/env python3
"""
Multi-Platform Content Distribution Engine
Transforms blog articles into platform-specific formats for 14+ distribution channels
Includes SEO analysis, keyword extraction, and schema markup suggestions
"""

import sys
import os
import json
import re
from datetime import datetime
from pathlib import Path
from collections import Counter
from urllib.parse import urljoin

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Error: BeautifulSoup4 is required. Install with: pip install beautifulsoup4")
    sys.exit(1)


class ContentExtractor:
    """Extract and parse HTML article content"""

    def __init__(self, html_path):
        self.html_path = Path(html_path)
        if not self.html_path.exists():
            raise FileNotFoundError(f"HTML file not found: {html_path}")

        with open(self.html_path, 'r', encoding='utf-8') as f:
            self.soup = BeautifulSoup(f.read(), 'html.parser')

        self.content = self._extract_content()

    def _extract_content(self):
        """Extract article metadata and content from HTML"""
        content = {
            'title': self._extract_title(),
            'meta_description': self._extract_meta_description(),
            'keywords': self._extract_keywords(),
            'headings': self._extract_headings(),
            'body_text': self._extract_body_text(),
            'images': self._extract_images(),
            'links': self._extract_links(),
            'author': self._extract_author(),
            'publish_date': self._extract_publish_date(),
        }
        return content

    def _extract_title(self):
        """Extract article title from various HTML sources"""
        # Try OG title
        og_title = self.soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            return og_title['content']

        # Try meta title
        meta_title = self.soup.find('meta', attrs={'name': 'title'})
        if meta_title and meta_title.get('content'):
            return meta_title['content']

        # Try h1
        h1 = self.soup.find('h1')
        if h1:
            return h1.get_text(strip=True)

        # Try title tag
        title_tag = self.soup.find('title')
        if title_tag:
            return title_tag.get_text(strip=True)

        return "Untitled Article"

    def _extract_meta_description(self):
        """Extract meta description"""
        meta_desc = self.soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            return meta_desc['content']

        og_desc = self.soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            return og_desc['content']

        return ""

    def _extract_keywords(self):
        """Extract keywords from meta tags"""
        meta_keywords = self.soup.find('meta', attrs={'name': 'keywords'})
        if meta_keywords and meta_keywords.get('content'):
            keywords = [k.strip() for k in meta_keywords['content'].split(',')]
            return keywords
        return []

    def _extract_headings(self):
        """Extract all headings with hierarchy"""
        headings = []
        for tag in ['h1', 'h2', 'h3', 'h4']:
            for heading in self.soup.find_all(tag):
                text = heading.get_text(strip=True)
                if text:
                    headings.append({
                        'level': int(tag[1]),
                        'text': text
                    })
        return headings

    def _extract_body_text(self):
        """Extract main body text content"""
        # Remove script and style elements
        for script in self.soup(["script", "style", "meta", "link"]):
            script.decompose()

        # Try to find main content areas
        main_content = (
            self.soup.find('main') or
            self.soup.find('article') or
            self.soup.find(class_=re.compile(r'content|article|post|main', re.I)) or
            self.soup.find('body')
        )

        if main_content:
            # Extract paragraphs
            paragraphs = []
            for p in main_content.find_all(['p', 'li']):
                text = p.get_text(strip=True)
                if len(text) > 20:  # Only significant paragraphs
                    paragraphs.append(text)
            return '\n\n'.join(paragraphs)

        return self.soup.get_text(separator='\n', strip=True)

    def _extract_images(self):
        """Extract image sources and alt text"""
        images = []
        for img in self.soup.find_all('img'):
            images.append({
                'src': img.get('src', ''),
                'alt': img.get('alt', ''),
                'title': img.get('title', '')
            })
        return images

    def _extract_links(self):
        """Extract internal and external links"""
        links = []
        for link in self.soup.find_all('a', href=True):
            links.append({
                'text': link.get_text(strip=True),
                'href': link['href']
            })
        return links

    def _extract_author(self):
        """Extract author information"""
        author_meta = self.soup.find('meta', attrs={'name': 'author'})
        if author_meta and author_meta.get('content'):
            return author_meta['content']

        author_tag = self.soup.find(class_=re.compile(r'author', re.I))
        if author_tag:
            return author_tag.get_text(strip=True)

        return ""

    def _extract_publish_date(self):
        """Extract publication date"""
        date_meta = self.soup.find('meta', attrs={'property': 'article:published_time'})
        if date_meta and date_meta.get('content'):
            return date_meta['content']

        date_meta = self.soup.find('meta', attrs={'name': 'publish_date'})
        if date_meta and date_meta.get('content'):
            return date_meta['content']

        return ""


class SEOAnalyzer:
    """Analyze content for SEO metrics"""

    def __init__(self, content):
        self.content = content

    def analyze(self):
        """Perform complete SEO analysis"""
        return {
            'keyword_density': self._calculate_keyword_density(),
            'word_count': self._count_words(),
            'reading_time': self._estimate_reading_time(),
            'headings_structure': self._analyze_headings(),
            'schema_recommendations': self._recommend_schema(),
            'seo_score': self._calculate_seo_score(),
        }

    def _calculate_keyword_density(self):
        """Calculate keyword density for provided keywords"""
        if not self.content['keywords']:
            return {}

        body_lower = self.content['body_text'].lower()
        words = body_lower.split()
        total_words = len(words)

        density = {}
        for keyword in self.content['keywords']:
            keyword_lower = keyword.lower()
            count = body_lower.count(keyword_lower)
            percentage = (count / total_words * 100) if total_words > 0 else 0
            density[keyword] = {
                'count': count,
                'density': round(percentage, 2)
            }

        return density

    def _count_words(self):
        """Count total words in body"""
        return len(self.content['body_text'].split())

    def _estimate_reading_time(self):
        """Estimate reading time in minutes"""
        word_count = self._count_words()
        reading_speed = 200  # words per minute
        return max(1, round(word_count / reading_speed))

    def _analyze_headings(self):
        """Analyze heading structure"""
        return {
            'total': len(self.content['headings']),
            'h1_count': sum(1 for h in self.content['headings'] if h['level'] == 1),
            'h2_count': sum(1 for h in self.content['headings'] if h['level'] == 2),
            'h3_count': sum(1 for h in self.content['headings'] if h['level'] == 3),
            'headings_list': [h['text'] for h in self.content['headings'][:10]]
        }

    def _recommend_schema(self):
        """Recommend schema markup types"""
        recommendations = []

        if self.content['title'] and self.content['body_text']:
            recommendations.append({
                'type': 'Article',
                'description': 'Standard article schema for blog posts',
                'priority': 'High'
            })

        if self.content['author']:
            recommendations.append({
                'type': 'Author',
                'description': 'Author schema with biographical information',
                'priority': 'High'
            })

        if self.content['publish_date']:
            recommendations.append({
                'type': 'DatePublished',
                'description': 'Article publication date',
                'priority': 'High'
            })

        if self.content['meta_description']:
            recommendations.append({
                'type': 'Description',
                'description': 'Meta description for search results',
                'priority': 'Medium'
            })

        if self.content['images']:
            recommendations.append({
                'type': 'Image',
                'description': 'Image schema with alt text',
                'priority': 'Medium'
            })

        return recommendations

    def _calculate_seo_score(self):
        """Calculate overall SEO score out of 100"""
        score = 0

        # Title (15 points)
        if self.content['title'] and len(self.content['title']) > 10:
            score += 15

        # Meta description (15 points)
        if self.content['meta_description'] and len(self.content['meta_description']) >= 120:
            score += 15

        # Keywords (15 points)
        if self.content['keywords']:
            score += 15

        # Headings structure (15 points)
        heading_counts = self._analyze_headings()
        if heading_counts['h1_count'] >= 1 and heading_counts['h2_count'] >= 2:
            score += 15

        # Word count (15 points)
        word_count = self._count_words()
        if word_count >= 500:
            score += 15

        # Images (10 points)
        if self.content['images']:
            score += 10

        # Links (10 points)
        if self.content['links']:
            score += 10

        return score


class PlatformContentGenerator:
    """Generate platform-specific content versions"""

    def __init__(self, content, article_url=""):
        self.content = content
        self.article_url = article_url
        self.title = content['title']
        self.body = content['body_text']
        self.description = content['meta_description']
        self.keywords = content['keywords']

    def generate_all(self):
        """Generate content for all platforms"""
        return {
            'twitter': self._generate_twitter(),
            'linkedin': self._generate_linkedin(),
            'reddit': self._generate_reddit(),
            'medium': self._generate_medium(),
            'facebook': self._generate_facebook(),
            'instagram': self._generate_instagram(),
            'tiktok': self._generate_tiktok(),
            'pinterest': self._generate_pinterest(),
            'hackernews': self._generate_hackernews(),
            'substack': self._generate_substack(),
            'quora': self._generate_quora(),
            'youtube': self._generate_youtube(),
            'devto': self._generate_devto(),
            'newsletter': self._generate_newsletter(),
        }

    def _get_first_sentences(self, count=3):
        """Extract first N sentences from body"""
        sentences = re.split(r'(?<=[.!?])\s+', self.body)
        return ' '.join(sentences[:count]).strip()

    def _truncate(self, text, length):
        """Truncate text to specified length, respecting word boundaries"""
        if len(text) <= length:
            return text
        truncated = text[:length].rsplit(' ', 1)[0]
        return truncated.rstrip(',.;:!?') + '...'

    def _generate_twitter(self):
        """Generate Twitter thread (3 tweets)"""
        hook = self._truncate(self.description or self.title, 280)

        # Extract 2 key points from body
        sentences = re.split(r'(?<=[.!?])\s+', self.body)
        point1 = self._truncate(sentences[1] if len(sentences) > 1 else "", 260)
        point2 = self._truncate(sentences[2] if len(sentences) > 2 else "", 260)

        cta = f"Read the full article here: {self.article_url}" if self.article_url else "Read more to learn the details!"
        cta = self._truncate(cta, 260)

        return {
            'type': 'Twitter Thread (3 tweets)',
            'tweet_1_hook': hook,
            'tweet_2_keypoint': f"Key insight: {point1}",
            'tweet_3_cta': cta,
            'full_thread': f"""Tweet 1: {hook}

Tweet 2: Key insight: {point1}

Tweet 3: {cta}"""
        }

    def _generate_linkedin(self):
        """Generate LinkedIn professional post"""
        excerpt = self._get_first_sentences(3)

        post = f"""{self.title}

{excerpt}

Key Takeaways:
"""

        # Add bullet points from headings
        for heading in self.content['headings'][:5]:
            if heading['level'] >= 2:
                post += f"• {heading['text']}\n"

        post += f"\n{self._truncate(self.body, 500)}\n\n"

        if self.article_url:
            post += f"Read the full article: {self.article_url}"

        return {
            'type': 'LinkedIn Professional Post (300 words)',
            'content': self._truncate(post, 3000),
            'hashtags': ' '.join([f"#{tag.replace(' ', '')}" for tag in self.keywords[:5]])
        }

    def _generate_reddit(self):
        """Generate Reddit discussion posts for 3 subreddits"""
        excerpt = self._get_first_sentences(2)

        reddit_posts = {
            'r/cryptocurrency': {
                'title': f"[Discussion] {self.title}",
                'body': f"{excerpt}\n\n{self._truncate(self.body, 800)}\n\nWhat are your thoughts on this topic?",
            },
            'r/algotrading': {
                'title': f"Insights: {self.title}",
                'body': f"Found this interesting perspective: {excerpt}\n\n{self._truncate(self.body, 800)}",
            },
            'r/passiveincome': {
                'title': f"Worth reading: {self.title}",
                'body': f"{excerpt}\n\nFull article: {self.article_url if self.article_url else 'See comments for link'}\n\n{self._truncate(self.body, 500)}",
            },
        }

        return {
            'type': 'Reddit Posts (3 subreddits)',
            'posts': reddit_posts
        }

    def _generate_medium(self):
        """Generate Medium article format"""
        content = f"""# {self.title}

{self.description}

---

## Overview

{self._get_first_sentences(2)}

## Key Points
"""

        # Add structured sections from headings
        for heading in self.content['headings'][:8]:
            if heading['level'] == 2:
                content += f"\n### {heading['text']}\n\n"
                content += f"[Add relevant content about {heading['text']}]\n"

        content += f"\n## Conclusion\n\n{self._truncate(self.body, 300)}"

        if self.article_url:
            content += f"\n\n---\n*Originally published at: {self.article_url}*"

        return {
            'type': 'Medium Reformatted Article',
            'markdown_content': content
        }

    def _generate_facebook(self):
        """Generate Facebook post"""
        excerpt = self._get_first_sentences(2)

        post = f"""{self.title}

{excerpt}

🎯 Key insights inside!"""

        engagement_q = "\n\nWhat's your take on this? Drop your thoughts below! 👇"

        return {
            'type': 'Facebook Post',
            'content': post + engagement_q,
            'call_to_action': 'Learn More' if self.article_url else None,
            'link': self.article_url or ''
        }

    def _generate_instagram(self):
        """Generate Instagram caption and carousel outline"""
        caption = f"""{self.title}

{self._truncate(self.body, 150)}

#content #insights #strategy"""

        carousel_slides = [
            {
                'slide': 1,
                'title': 'Hook',
                'content': self.title,
                'design': 'Bold headline with contrasting background'
            },
            {
                'slide': 2,
                'title': 'Key Point 1',
                'content': self.content['headings'][0]['text'] if self.content['headings'] else 'Main insight',
                'design': 'Single point with icon'
            },
            {
                'slide': 3,
                'title': 'Key Point 2',
                'content': self.content['headings'][1]['text'] if len(self.content['headings']) > 1 else 'Secondary insight',
                'design': 'Single point with icon'
            },
            {
                'slide': 4,
                'title': 'Statistics',
                'content': 'Add key statistics or data points',
                'design': 'Number-focused with clean layout'
            },
            {
                'slide': 5,
                'title': 'CTA',
                'content': 'Link in bio to read full article',
                'design': 'Action-oriented with link emphasis'
            }
        ]

        return {
            'type': 'Instagram (Caption + 5-slide carousel)',
            'caption': caption,
            'carousel_outline': carousel_slides
        }

    def _generate_tiktok(self):
        """Generate TikTok video script outline"""
        main_point = self.content['headings'][0]['text'] if self.content['headings'] else self.title

        script = f"""[0-5 seconds] HOOK
- Show the problem or surprising fact
- Text on screen: "{self._truncate(self.title, 40)}"
- Upbeat background music

[5-25 seconds] MAIN CONTENT
- Visual demonstration or explanation
- Point 1: {self._truncate(main_point, 50)}
- Point 2: Explain why it matters
- Use text overlays for key points

[25-55 seconds] DEEP DIVE
- Share 2-3 quick tips or insights
- Use quick cuts and transitions
- Keep energy high

[55-60 seconds] CTA
- Call to action: "Like, comment, follow for more insights"
- Direct to full article in bio
- End screen with link

MUSIC: Upbeat, trending audio
HASHTAGS: #insights #learning #strategy #trending"""

        return {
            'type': 'TikTok 60-Second Script',
            'script': script,
            'estimated_duration': '60 seconds'
        }

    def _generate_pinterest(self):
        """Generate Pinterest pin description"""
        pin_descriptions = [
            {
                'board': 'Business Strategy',
                'pin_title': f"{self.title[:70]}",
                'pin_description': f"{self.description or self._truncate(self.body, 200)}. Click for full insights.",
            },
            {
                'board': 'Digital Marketing',
                'pin_title': f"Marketing Insights: {self.title[:50]}",
                'pin_description': f"Learn about {self.keywords[0] if self.keywords else 'this topic'}: {self._truncate(self.body, 150)}",
            },
            {
                'board': 'Professional Development',
                'pin_title': f"Growth: {self.title[:55]}",
                'pin_description': f"Key learnings: {self._truncate(self.body, 150)}. Save this for later!",
            },
        ]

        return {
            'type': 'Pinterest Pins (3 variations)',
            'pins': pin_descriptions,
            'optimal_dimensions': '1000x1500px',
            'design_tips': 'Use bold text, contrasting colors, and clear call-to-action'
        }

    def _generate_hackernews(self):
        """Generate Hacker News submission"""
        summary = self._get_first_sentences(1)

        return {
            'type': 'Hacker News Submission',
            'title': self.title[:80],
            'summary': summary,
            'url': self.article_url or 'https://example.com/article',
            'submission_tips': 'Best posted during US business hours, Wed-Thu morning'
        }

    def _generate_substack(self):
        """Generate Substack newsletter format"""
        newsletter = f"""Subject: {self.title}
Preview Text: {self._truncate(self.description, 50)}

---

Hi there,

I came across something interesting I wanted to share with you.

{self.title}

{self._get_first_sentences(3)}

## What This Means

{self._truncate(self.body, 500)}

## Key Takeaway

{self._truncate(self.body[len(self.body)//2:], 300)}

Thanks for reading. If you found this valuable, share it with someone who might benefit.

---

[Your Name]
[Your Email]"""

        return {
            'type': 'Substack Newsletter',
            'content': newsletter,
            'send_tips': 'Send Tuesday-Thursday mornings for best open rates'
        }

    def _generate_quora(self):
        """Generate Quora answer format"""
        answers = []

        potential_questions = [
            f"What is {self.keywords[0] if self.keywords else 'this topic'} and how does it work?",
            f"How do you approach {self.title}?",
            f"What are the best practices for {self.keywords[0] if self.keywords else 'this topic'}?",
        ]

        for question in potential_questions:
            answer = f"""{self.description or self._truncate(self.title, 100)}

{self._get_first_sentences(3)}

Key Points:
"""
            for heading in self.content['headings'][:3]:
                answer += f"• {heading['text']}\n"

            answer += f"\n{self._truncate(self.body, 400)}"

            answers.append({
                'question': question,
                'answer': answer
            })

        return {
            'type': 'Quora Answers (3 variations)',
            'answers': answers,
            'tips': 'Answer 3-5 related questions to build authority'
        }

    def _generate_youtube(self):
        """Generate YouTube video description"""
        description = f"""{self.title}

{self.description}

{self._truncate(self.body, 500)}

TIMESTAMPS:
0:00 - Introduction
{len(self.content['headings']) // 2}:00 - Main Content
{len(self.content['headings']) * 2}:00 - Key Takeaways
{len(self.content['headings']) * 3}:00 - Conclusion

RESOURCES:
📄 Full Article: {self.article_url or 'Link in description'}

CONNECT WITH ME:
🔗 Website: [Your website]
📧 Email: [Your email]
🐦 Twitter: [@yourhandle]

#shorts #video #{self.keywords[0].replace(' ', '')}"""

        return {
            'type': 'YouTube Video Description',
            'description': description,
            'tags': self.keywords + ['tutorial', 'educational'],
            'optimal_length': '5-15 minutes'
        }

    def _generate_devto(self):
        """Generate Dev.to post for developer audience"""
        content = f"""---
title: {self.title}
description: {self.description}
published: true
tags: {','.join(self.keywords[:4]) if self.keywords else 'coding,tutorial'}
---

# {self.title}

{self.description}

## Overview

{self._get_first_sentences(2)}

## Getting Started

{self._truncate(self.body, 400)}

## Code Example

```python
# Add relevant code examples here
# This is a placeholder
```

## Key Points Recap

"""

        for i, heading in enumerate(self.content['headings'][:5], 1):
            content += f"{i}. {heading['text']}\n"

        content += f"\n## Conclusion\n\n{self._truncate(self.body[len(self.body)//2:], 300)}"

        if self.article_url:
            content += f"\n\n## References\n- [Full Article]({self.article_url})"

        return {
            'type': 'Dev.to Post (Developer-focused)',
            'markdown_content': content
        }

    def _generate_newsletter(self):
        """Generate email newsletter version"""
        newsletter = f"""From: Your Name <your@email.com>
Subject: {self.title}
Preview Text: {self._truncate(self.description, 50)}

---

<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">

  <h2>{self.title}</h2>

  <p>{self.description}</p>

  <h3>Today's Insight</h3>

  <p>{self._get_first_sentences(3)}</p>

  <h3>What We'll Cover</h3>
  <ul>
"""

        for heading in self.content['headings'][:5]:
            newsletter += f"    <li>{heading['text']}</li>\n"

        newsletter += f"""  </ul>

  <h3>The Details</h3>

  <p>{self._truncate(self.body, 600)}</p>

  <p style="text-align: center; margin-top: 30px;">
    <a href="{self.article_url or '#'}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
      Read Full Article
    </a>
  </p>

  <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">

  <p style="font-size: 12px; color: #999;">
    Questions? Reply to this email or visit our website.
  </p>

</body>
</html>"""

        return {
            'type': 'Email Newsletter (HTML + Text)',
            'html_content': newsletter,
            'text_content': f"{self.title}\n\n{self._truncate(self.body, 500)}",
            'subject_line': self.title,
            'preview_text': self._truncate(self.description, 100)
        }


class DistributionExporter:
    """Export generated content to files"""

    def __init__(self, output_dir):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_all(self, platforms_content, seo_analysis, extractor_content):
        """Export all platform content to individual files"""
        exported_files = []

        for platform, content in platforms_content.items():
            filename = f"{platform}_content.txt"
            filepath = self.output_dir / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(self._format_platform_content(platform, content))

            exported_files.append(filepath)

        # Export SEO analysis
        seo_file = self.output_dir / "seo_analysis.json"
        with open(seo_file, 'w', encoding='utf-8') as f:
            json.dump(seo_analysis, f, indent=2)
        exported_files.append(seo_file)

        # Export metadata
        metadata_file = self.output_dir / "content_metadata.json"
        with open(metadata_file, 'w', encoding='utf-8') as f:
            metadata = {
                'title': extractor_content['title'],
                'author': extractor_content['author'],
                'publish_date': extractor_content['publish_date'],
                'keywords': extractor_content['keywords'],
                'word_count': len(extractor_content['body_text'].split()),
                'export_date': datetime.now().isoformat(),
                'platforms': list(platforms_content.keys()),
            }
            json.dump(metadata, f, indent=2)
        exported_files.append(metadata_file)

        return exported_files

    def _format_platform_content(self, platform, content):
        """Format platform content for export"""
        output = f"{'='*70}\n"
        output += f"PLATFORM: {content.get('type', platform.upper())}\n"
        output += f"{'='*70}\n\n"

        for key, value in content.items():
            if key == 'type':
                continue

            if isinstance(value, dict):
                output += f"{key.upper()}:\n"
                output += self._format_dict(value, indent=2)
                output += "\n"
            elif isinstance(value, list):
                output += f"{key.upper()}:\n"
                for item in value:
                    if isinstance(item, dict):
                        output += self._format_dict(item, indent=2)
                    else:
                        output += f"  • {item}\n"
                output += "\n"
            else:
                output += f"{key.upper()}:\n"
                output += f"{value}\n\n"

        output += f"{'='*70}\n"
        output += "NOTES:\n"
        output += "  • Review and customize before posting\n"
        output += "  • Ensure links are active and relevant\n"
        output += "  • Adapt tone for platform-specific audience\n"
        output += "  • Include hashtags and mentions where appropriate\n"
        output += f"{'='*70}\n"

        return output

    def _format_dict(self, d, indent=0):
        """Format dictionary for display"""
        output = ""
        for key, value in d.items():
            prefix = " " * indent
            if isinstance(value, dict):
                output += f"{prefix}{key}:\n"
                output += self._format_dict(value, indent + 2)
            elif isinstance(value, list):
                output += f"{prefix}{key}:\n"
                for item in value:
                    if isinstance(item, dict):
                        output += self._format_dict(item, indent + 2)
                    else:
                        output += f"{prefix}  • {item}\n"
            else:
                output += f"{prefix}{key}: {value}\n"
        return output


def print_summary(seo_analysis, output_dir):
    """Print SEO and export summary"""
    print("\n" + "="*70)
    print("SEO ANALYSIS SUMMARY")
    print("="*70)

    analysis = seo_analysis
    print(f"\nSEO Score: {analysis['seo_score']}/100")
    print(f"Word Count: {analysis['word_count']}")
    print(f"Reading Time: {analysis['reading_time']} minutes")

    print("\nHeading Structure:")
    headings = analysis['headings_structure']
    print(f"  • Total Headings: {headings['total']}")
    print(f"  • H1 Count: {headings['h1_count']}")
    print(f"  • H2 Count: {headings['h2_count']}")
    print(f"  • H3 Count: {headings['h3_count']}")

    if analysis['keyword_density']:
        print("\nKeyword Density:")
        for keyword, metrics in analysis['keyword_density'].items():
            print(f"  • {keyword}: {metrics['count']}x ({metrics['density']}%)")

    print("\nRecommended Schema Markup:")
    for schema in analysis['schema_recommendations']:
        print(f"  • {schema['type']} [{schema['priority']}]")
        print(f"    {schema['description']}")

    print("\n" + "="*70)
    print(f"Content exported to: {output_dir}")
    print("="*70 + "\n")


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python j10-distribution-engine.py <article.html> [output_dir]")
        print("\nExample: python j10-distribution-engine.py article.html")
        print("\nThis script will:")
        print("  1. Parse HTML article")
        print("  2. Extract content and metadata")
        print("  3. Generate 14 platform-specific versions")
        print("  4. Perform SEO analysis")
        print("  5. Export all content to organized files")
        sys.exit(1)

    html_path = sys.argv[1]
    output_base = sys.argv[2] if len(sys.argv) > 2 else "distribution_output"

    # Create timestamped output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(output_base) / f"content_distribution_{timestamp}"

    try:
        print(f"\nProcessing: {html_path}")
        print(f"Output directory: {output_dir}\n")

        # Extract content
        print("[1/4] Extracting content from HTML...")
        extractor = ContentExtractor(html_path)
        content = extractor.content
        print(f"      ✓ Title: {content['title']}")
        print(f"      ✓ Word count: {len(content['body_text'].split())} words")
        print(f"      ✓ Headings found: {len(content['headings'])}")

        # Analyze SEO
        print("\n[2/4] Performing SEO analysis...")
        analyzer = SEOAnalyzer(content)
        seo_analysis = analyzer.analyze()
        print(f"      ✓ SEO Score: {seo_analysis['seo_score']}/100")
        print(f"      ✓ Reading time: {seo_analysis['reading_time']} minutes")

        # Generate platform content
        print("\n[3/4] Generating platform-specific content...")
        generator = PlatformContentGenerator(content)
        platforms_content = generator.generate_all()
        print(f"      ✓ Generated content for {len(platforms_content)} platforms")

        # Export content
        print("\n[4/4] Exporting content to files...")
        exporter = DistributionExporter(output_dir)
        exported_files = exporter.export_all(platforms_content, seo_analysis, content)
        print(f"      ✓ Created {len(exported_files)} files")

        # Print summary
        print_summary(seo_analysis, output_dir)

        print(f"Files created:")
        for file in sorted(exported_files):
            print(f"  • {file.name}")

        print("\n✓ Distribution engine completed successfully!")

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
