/**
 * migrate-response-format — Add `success: true/false` to old-style tool returns.
 *
 * Old format: `{ content: [...], details: {...} }`
 * New format: `{ success: true/false, content: [...], details: {...}, ... }`
 *
 * Heuristic: For each `return {` block that has `content:`, add `success: true`.
 * If the block also has `duplicate_detected` or `error` in details, add `success: false`.
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const TOOLS_DIR = "./tools";

interface Block {
  start: number;
  end: number;
  text: string;
}

/**
 * Find balanced brace blocks starting with `return {` in the file.
 */
function findReturnBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const re = /return\s*\{/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    // Find matching closing brace
    let depth = 0;
    let i = m.index + m[0].length - 1; // position of `{`
    let inString = false;
    let stringChar = "";
    let inTemplate = false;
    let templateDepth = 0;
    while (i < content.length) {
      const c = content[i];
      const prev = i > 0 ? content[i - 1] : "";
      if (!inString && !inTemplate) {
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            blocks.push({
              start,
              end: i + 1,
              text: content.slice(start, i + 1),
            });
            break;
          }
        } else if (c === '"' || c === "'") {
          inString = true;
          stringChar = c;
        } else if (c === "`") {
          inTemplate = true;
          templateDepth = 0;
        }
      } else if (inString) {
        if (c === stringChar && prev !== "\\") {
          inString = false;
        }
      } else if (inTemplate) {
        if (c === "`" && prev !== "\\") {
          inTemplate = false;
        } else if (c === "{") {
          templateDepth++;
        } else if (c === "}") {
          templateDepth--;
        }
      }
      i++;
    }
  }
  return blocks;
}

/**
 * Check if a block already has `success:`.
 */
function hasSuccess(text: string): boolean {
  return /^\s*success\s*:/m.test(text);
}

/**
 * Check if a block contains indicators of failure.
 */
function isFailure(text: string): boolean {
  return (
    /duplicate_detected/.test(text) ||
    /\bduplicate\b/.test(text) ||
    /\bnot_found\b/.test(text) ||
    /throw new Error/.test(text) ||
    /\bno_writes\b/.test(text) ||
    /hint:\s*"/.test(text) && /error|excede|inválid/i.test(text)
  );
}

/**
 * Add `success: true` or `success: false` to a return block.
 */
function addSuccess(text: string, isFail: boolean): string {
  // Insert after the opening `return {`
  const match = /^(return\s*\{)/.exec(text);
  if (!match) return text;
  const successValue = isFail ? "false" : "true";
  return `${match[1]}\n        success: ${successValue},\n` + text.slice(match[0].length);
}

function migrateFile(filepath: string): { changed: boolean; blocksModified: number } {
  const content = readFileSync(filepath, "utf-8");
  const blocks = findReturnBlocks(content);

  let modified = content;
  let count = 0;
  // Apply in reverse order to preserve offsets
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (hasSuccess(b.text)) continue;
    if (!/\bcontent\s*:/.test(b.text)) continue;
    // Skip if block is just `{ content: [{ type: "text", text: "..." }] }` for a throw
    if (/throw new Error/.test(b.text)) continue;

    const isFail = isFailure(b.text);
    const newText = addSuccess(b.text, isFail);
    modified = modified.slice(0, b.start) + newText + modified.slice(b.end);
    count++;
  }

  if (count > 0) {
    writeFileSync(filepath, modified, "utf-8");
  }
  return { changed: count > 0, blocksModified: count };
}

const targetFiles = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith(".ts") && !f.includes("-helpers") && !f.includes("duplicate-detector"))
  .map((f) => join(TOOLS_DIR, f));

let totalChanged = 0;
let totalBlocks = 0;
for (const f of targetFiles) {
  const result = migrateFile(f);
  if (result.changed) {
    console.log(`✅ ${f}: ${result.blocksModified} returns updated`);
    totalChanged++;
    totalBlocks += result.blocksModified;
  }
}
console.log(`\n🎉 Migration complete: ${totalChanged} files, ${totalBlocks} return blocks updated`);
