---
description: PowerShell UTF-8 argument encoding rule
---

# PowerShell UTF-8 Encoding

## Rule

PowerShell corrupts UTF-8 characters (accents, ñ, em-dashes, curly quotes) when they are passed as command-line arguments.

## Never Do

```powershell
node scripts/fb-post.mjs "imagen.png" "texto con acentos áéíóú"
node scripts/fb-post.mjs "imagen.png" "$(cat scripts/generated-article.txt)"
```

## Always Do

```powershell
node scripts/fb-post.mjs "imagen.png" @scripts/generated-article.txt
```

## Implementation

- Scripts that receive UTF-8 text must support `@file` syntax:
  - If an argument starts with `@`, read the file with `readFileSync(path, "utf-8")`.
  - Otherwise, use the argument directly.
- Any script receiving accented text or emojis from PowerShell must read it from a file, never from CLI arguments.
