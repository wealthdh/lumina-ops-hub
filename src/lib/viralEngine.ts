/**
 * Viral Engine Module
 * Generates viral-optimized hooks, CTAs, and captions for social media content
 */

// Types
export interface Hook {
  text: string;
  category: "curiosity" | "authority" | "urgency";
  score: number;
}

export interface HooksResult {
  hooks: Hook[];
  bestHook: string;
  bestScore: number;
}

export interface CaptionBuilderOptions {
  title: string;
  platform: string;
  prompt: string;
  stripeLink?: string;
}

export interface CaptionResult {
  caption: string;
  hooks: Hook[];
  hookUsed: string;
  hookScore: number;
  ctaUsed: string;
}

// Module-level state
let ctaRotationIndex = 0;

// Hook templates organized by category
const hookTemplates = {
  curiosity: [
    "You won't believe what I discovered about {title}...",
    "This {title} hack is insane (try it)",
    "Nobody talks about this {title} strategy",
    "The {title} secret nobody wants you to know",
    "What {title} experts don't want you to see",
    "This {title} technique just changed everything",
    "How {title} really works (shocking truth)",
    "The {title} loophole everyone's missing",
    "I tried {title} for 30 days... here's what happened",
    "The {title} trick that nobody teaches",
    "Why {title} is way easier than you think",
    "The dark side of {title} nobody discusses",
    "This {title} method is too good to be true",
    "The {title} breakthrough you've been waiting for",
    "Why I quit {title} the traditional way",
    "The {title} system that actually works",
    "This {title} pattern will blow your mind",
    "What happens when you really understand {title}?",
    "The {title} opportunity hiding in plain sight",
    "This {title} mindset shift changes everything",
  ],
  authority: [
    "I made ${amount} with {title} (here's how)",
    "I've been {title} for 5 years - here's what I learned",
    "My {title} system generated $X in 90 days",
    "I tested 50 {title} strategies, ranked them",
    "As someone who automated {title}, here's my advice",
    "I scaled {title} to 6 figures, ask me anything",
    "After 1000+ hours of {title}, I discovered this",
    "My proven {title} framework that works",
    "I've helped 1000+ people with {title}",
    "The {title} method I've perfected over years",
    "I documented my entire {title} journey",
    "My {title} results speak for themselves",
    "Here's exactly how I do {title}",
    "I've cracked the code on {title}}",
    "My {title} playbook (battle-tested)",
    "I share everything about {title} with my community",
    "Years of {title} experience in one post",
    "My {title} system is now automated",
    "I teach {title} to thousands monthly",
    "Here's my {title} roadmap that actually works",
  ],
  urgency: [
    "This {title} opportunity won't last long 🚨",
    "Only {title} spots left for this week",
    "The {title} doors close tonight at midnight",
    "Last chance for {title} early access",
    "This {title} deal expires in 48 hours",
    "{title} pricing increases tomorrow 📈",
    "The {title} window closes Friday (don't miss it)",
    "Spots filling up fast for {title} beta",
    "This {title} strategy is time-sensitive",
    "The {title} method works better NOW",
    "Limited {title} access - join before it's gone",
    "The {title} opportunity is closing down",
    "{title} is trending hard RIGHT NOW",
    "Catch this {title} wave while you can",
    "The {title} community is exploding",
    "This {title} strategy has a short shelf life",
    "The {title} gold rush is happening NOW",
    "You need to see this {title} before it blows up",
    "Get in on {title} before everyone else does",
    "The {title} secret is out (not for long)",
  ],
};

// Power words for scoring
const powerWords = [
  "free",
  "secret",
  "hack",
  "system",
  "money",
  "profit",
  "ai",
  "automated",
];

const emojis = ["🚀", "💰", "🔥", "🎯", "⚡", "🤯", "💡", "✅", "🚨", "📈"];

/**
 * Score a hook based on power words, length, emojis, and question marks
 */
function scoreHook(text: string): number {
  let score = 50; // Base score

  // Length scoring (ideal: 10-80 characters)
  const length = text.length;
  if (length >= 10 && length <= 80) {
    score += 20;
  } else if (length >= 8 && length <= 100) {
    score += 10;
  }

  // Power words (+10 each)
  const lowerText = text.toLowerCase();
  powerWords.forEach((word) => {
    if (lowerText.includes(word)) {
      score += 10;
    }
  });

  // Emoji presence (+5)
  if (emojis.some((emoji) => text.includes(emoji))) {
    score += 5;
  }

  // Question mark (+5)
  if (text.includes("?")) {
    score += 5;
  }

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Replace template variables with actual values
 */
function fillTemplate(template: string, title: string): string {
  let result = template.replace(/{title}/g, title);
  result = result.replace(/{amount}/g, String(Math.floor(Math.random() * 50000) + 5000));
  return result;
}

/**
 * Generate 3 viral hooks (one per category) with scores
 */
export function generateHooks(title: string, platform: string): HooksResult {
  const hooks: Hook[] = [];

  // Generate one hook from each category
  const categories: Array<"curiosity" | "authority" | "urgency"> = [
    "curiosity",
    "authority",
    "urgency",
  ];

  categories.forEach((category) => {
    const templates = hookTemplates[category];
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const hookText = fillTemplate(randomTemplate, title);
    const score = scoreHook(hookText);

    hooks.push({
      text: hookText,
      category,
      score,
    });
  });

  // Find best hook
  const bestHook = hooks.reduce((prev, current) =>
    prev.score > current.score ? prev : current
  );

  return {
    hooks,
    bestHook: bestHook.text,
    bestScore: bestHook.score,
  };
}

/**
 * Get next CTA in rotation
 */
export function getNextCTA(stripeLink?: string): string {
  const baseCTAs = [
    "DM 'AI' for access",
    "Comment 'HOW' for the system",
    "Link in bio",
    "Click the link to get started",
  ];

  const cta = baseCTAs[ctaRotationIndex % baseCTAs.length];
  ctaRotationIndex++;

  if (stripeLink && cta === "Link in bio") {
    return `${cta}: ${stripeLink}`;
  }

  return cta;
}

/**
 * Build a complete caption with hook, prompt, and CTA
 */
export function buildCaption(opts: CaptionBuilderOptions): CaptionResult {
  const { title, platform, prompt, stripeLink } = opts;

  // Generate hooks
  const hooksResult = generateHooks(title, platform);

  // Get next CTA
  const ctaUsed = getNextCTA(stripeLink);

  // Extract first sentence or ~50 chars of prompt
  const promptSnippet = prompt.split(".")[0].substring(0, 100);

  // Build caption
  const caption = `${hooksResult.bestHook}\n\n${promptSnippet}\n\n${ctaUsed}`;

  return {
    caption,
    hooks: hooksResult.hooks,
    hookUsed: hooksResult.bestHook,
    hookScore: hooksResult.bestScore,
    ctaUsed,
  };
}

/**
 * Reset CTA rotation index (useful for testing)
 */
export function resetCTARotation(): void {
  ctaRotationIndex = 0;
}

/**
 * Get current CTA rotation index (useful for testing)
 */
export function getCTARotationIndex(): number {
  return ctaRotationIndex;
}
