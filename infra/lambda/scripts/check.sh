#!/bin/bash

echo "Lambda Functions Installation Check"
echo "===================================="
echo ""

# Check Node.js version
echo "1. Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "   ✓ Node.js: $NODE_VERSION"

    # Extract major version
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 20 ]; then
        echo "   ⚠ Warning: Node.js 20+ recommended (found v$NODE_MAJOR)"
    fi
else
    echo "   ✗ Node.js not found (required)"
fi

echo ""

# Check npm
echo "2. Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "   ✓ npm: v$NPM_VERSION"
else
    echo "   ✗ npm not found (required)"
fi

echo ""

# Check AWS CLI
echo "3. Checking AWS CLI..."
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version 2>&1 | head -n1)
    echo "   ✓ AWS CLI: $AWS_VERSION"
else
    echo "   ⚠ AWS CLI not found (optional, but recommended)"
fi

echo ""

# Check directory structure
echo "4. Checking directory structure..."
REQUIRED_FILES=(
    "submit-job/index.ts"
    "get-status/index.ts"
    "process-job/index.ts"
    "shared/types.ts"
    "package.json"
    "tsconfig.json"
)

ALL_PRESENT=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✓ $file"
    else
        echo "   ✗ $file (missing)"
        ALL_PRESENT=false
    fi
done

echo ""

# Check if dependencies are installed
echo "5. Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "   ✓ node_modules directory exists"

    # Check for key dependencies
    if [ -d "node_modules/@aws-sdk" ]; then
        echo "   ✓ AWS SDK v3 installed"
    else
        echo "   ✗ AWS SDK v3 not found"
    fi

    if [ -d "node_modules/typescript" ]; then
        echo "   ✓ TypeScript installed"
    else
        echo "   ✗ TypeScript not found"
    fi
else
    echo "   ⚠ node_modules not found - run 'npm install'"
fi

echo ""

# Check if build has been run
echo "6. Checking build artifacts..."
if [ -d "dist" ]; then
    echo "   ✓ dist directory exists"

    if [ -f "dist/submit-job/index.js" ] && [ -f "dist/get-status/index.js" ] && [ -f "dist/process-job/index.js" ]; then
        echo "   ✓ All Lambda bundles built"
    else
        echo "   ⚠ Some Lambda bundles missing - run 'npm run build'"
    fi
else
    echo "   ⚠ dist directory not found - run 'npm run build'"
fi

echo ""
echo "===================================="

if [ "$ALL_PRESENT" = true ]; then
    echo "Status: ✓ All required files present"
    echo ""
    echo "Next steps:"
    if [ ! -d "node_modules" ]; then
        echo "  1. npm install"
    fi
    if [ ! -d "dist" ]; then
        echo "  2. npm run build"
    fi
    echo "  3. Deploy with CDK (cd ../cdk && cdk deploy)"
else
    echo "Status: ✗ Some files are missing"
    echo "Please ensure all Lambda function files are present"
fi
