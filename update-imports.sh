#!/bin/bash

echo "Updating import paths for reorganized tests and scripts..."

# Update app test imports - change relative paths to point to src/
find app/tests -name "*.test.ts" -o -name "*.test.tsx" | while read file; do
    echo "Updating $file"
    # Convert relative imports like '../../components' to '../../src/components'
    sed -i 's|from '\''\.\.\/\.\.\//\([^/]*\)'\''|from '\''../../src/\1'\''|g' "$file"
    sed -i 's|from '\''\.\.\//\([^/]*\)'\''|from '\''../src/\1'\''|g' "$file"
    sed -i 's|from '\''\.\/\([^/]*\)'\''|from '\''../src/\1'\''|g' "$file"
done

# Update backend test imports - change relative paths to point to src/
find backend/tests -name "*.test.ts" | while read file; do
    echo "Updating $file"
    # Calculate depth and adjust paths accordingly
    depth=$(echo "$file" | sed 's|[^/]||g' | wc -c)
    if [[ $depth -eq 4 ]]; then
        # tests/unit/*.test.ts -> needs ../../src/
        sed -i 's|from '\''\.\.\/\.\.\//\([^/]*\)'\''|from '\''../../src/\1'\''|g' "$file"
    elif [[ $depth -eq 5 ]]; then
        # tests/unit/crypto/*.test.ts -> needs ../../../src/
        sed -i 's|from '\''\.\.\/\.\.\//\([^/]*\)'\''|from '\''../../../src/\1'\''|g' "$file"
        sed -i 's|from '\''\.\.\//\([^/]*\)'\''|from '\''../../src/\1'\''|g' "$file"
    fi
done

# Update simulation-service test imports
find simulation-service/tests -name "*.test.ts" | while read file; do
    echo "Updating $file"
    # Update to point to simulation-service/src/
    sed -i 's|from '\''\.\.\/\.\.\//\([^/]*\)'\''|from '\''../../src/\1'\''|g' "$file"
done

echo "Import path updates completed!"