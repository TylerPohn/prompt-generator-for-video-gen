#!/bin/bash
set -e

echo "AI Video Generation Lambda Deployment Script"
echo "============================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Must run from lambda directory"
    exit 1
fi

# Install dependencies
echo "1. Installing dependencies..."
npm install

# Type check
echo ""
echo "2. Type checking..."
npm run typecheck

# Build
echo ""
echo "3. Building Lambda functions..."
npm run build

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Error: Build failed - dist directory not found"
    exit 1
fi

echo ""
echo "4. Build artifacts created:"
ls -lh dist/*/index.js

echo ""
echo "✓ Lambda functions ready for deployment!"
echo ""
echo "Next steps:"
echo "  - Deploy using CDK: cd ../cdk && cdk deploy"
echo "  - Or package individually for manual deployment"
