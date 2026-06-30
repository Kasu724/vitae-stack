import { Parser } from "htmlparser2";

const blocked = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "form",
  "template",
]);
const blockTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "div",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "p",
  "section",
  "table",
  "td",
  "th",
  "tr",
]);

export function extractJobTextFromHtml(html: string): string {
  const output: string[] = [];
  const suppressionStack: boolean[] = [];
  let suppressed = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        const suppress = blocked.has(name);
        suppressionStack.push(suppress);
        if (suppress) suppressed += 1;
        if (!suppressed && blockTags.has(name)) output.push("\n");
      },
      ontext(text) {
        if (!suppressed) output.push(text);
      },
      onclosetag(name) {
        if (!suppressed && blockTags.has(name)) output.push("\n");
        if (suppressionStack.pop()) suppressed -= 1;
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return output
    .join("")
    .replace(/[ \t\f\v]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
