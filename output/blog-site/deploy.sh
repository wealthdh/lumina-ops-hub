#!/bin/bash
# ============================================================
# LUMINA PULSE INSIGHTS - One-Click GitHub Pages Deploy
# ============================================================
# Run this script from the blog-site/ directory:
#   chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e

echo "🚀 Lumina Pulse Insights - GitHub Pages Deployment"
echo "=================================================="

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Install it first: https://git-scm.com"
    exit 1
fi

# Check if we're already in a git repo
if [ -d ".git" ]; then
    echo "✅ Git repo already initialized"
else
    echo "📦 Initializing git repo..."
    git init
    git branch -M main
fi

# Check for remote
if git remote get-url origin &> /dev/null; then
    echo "✅ Remote 'origin' already configured"
else
    echo ""
    echo "📝 Enter your GitHub repo URL (e.g., https://github.com/USERNAME/USERNAME.github.io.git):"
    read -r REPO_URL
    if [ -z "$REPO_URL" ]; then
        echo "❌ No URL provided. Exiting."
        exit 1
    fi
    git remote add origin "$REPO_URL"
    echo "✅ Remote set to: $REPO_URL"
fi

# Stage all files
echo ""
echo "📁 Staging files..."
git add -A

# Check if there are changes to commit
if git diff --cached --quiet 2>/dev/null; then
    echo "ℹ️  No new changes to commit"
else
    echo "💾 Committing..."
    git commit -m "Deploy Lumina Pulse Insights blog site

- Homepage with dark modern design
- Article 1: AI Trading Bots in 2026 (2,024 words)
- Article 2: Polymarket Prediction Markets Guide (2,000 words)
- Article 3: 5 AI-Powered Passive Income Streams (2,021 words)
- Complete SEO: sitemap.xml, robots.txt, schema markup
- AdSense + affiliate monetization framework
- Mobile responsive, <1s load time"
fi

# Push to GitHub
echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin main

echo ""
echo "=================================================="
echo "✅ DEPLOYED SUCCESSFULLY!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Go to your repo on GitHub"
echo "2. Click Settings → Pages"
echo "3. Under 'Source', select 'Deploy from a branch'"
echo "4. Choose 'main' branch, '/ (root)' folder"
echo "5. Click Save"
echo ""
echo "Your site will be live at: https://YOUR-USERNAME.github.io"
echo "(or your custom domain if you configured CNAME)"
echo ""
echo "🎉 Done! Site should be live within 1-2 minutes."
