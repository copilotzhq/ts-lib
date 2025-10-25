
// Smart SQL statement splitter that respects dollar-quoted strings (DO $$ ... $$)
export function splitSQLStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = "";
    let inDollarQuote = false;
    let dollarTag = "";
    
    const lines = sql.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for start of dollar-quoted string (DO $$, $tag$, etc)
      const dollarMatch = line.match(/\$\$|\$\w+\$/);
      if (dollarMatch && !inDollarQuote) {
        inDollarQuote = true;
        dollarTag = dollarMatch[0];
      }
      
      current += line + "\n";
      
      // Check for end of dollar-quoted string
      if (inDollarQuote && line.includes(dollarTag) && line.trim().endsWith(";")) {
        inDollarQuote = false;
        dollarTag = "";
        statements.push(current.trim());
        current = "";
        continue;
      }
      
      // Normal statement end (semicolon at end of line, not inside dollar quotes)
      if (!inDollarQuote && line.trim().endsWith(";")) {
        statements.push(current.trim());
        current = "";
      }
    }
    
    // Add any remaining content
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements.filter(s => s.length > 0 && !s.startsWith("--") || s.includes("CREATE"));
  }