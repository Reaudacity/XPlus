export function getBaseDocument(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="{XPLUS_PAGE_DESCRIPTION}" />
    <title>{XPLUS_PAGE_TITLE}</title>
{XPLUS_HEAD_EXTRAS}</head>
<body>
{XPLUS_PAGE_CONTENT}
</body>
</html>`;
}
