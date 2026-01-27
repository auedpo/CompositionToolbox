from pathlib import Path
lines = Path('src/main.js').read_text().splitlines()
for i in range(2805, 2845):
    print(f"{i+1}: {lines[i]}")
