import { regionStatus } from "@lastbell/shared/region";

/**
 * Writes the visitor's region onto <html> so the app knows before its first render:
 *   <html lang="en" data-country="DE" data-region="allowed">
 * Only a two-character code ever reaches the markup.
 */
export function stampRegion(html: string, country: string | null | undefined): string {
  const code = country && /^[A-Za-z0-9]{2}$/.test(country) ? country.toUpperCase() : "";
  const status = regionStatus(country);
  return html.replace(/<html\b([^>]*)>/i, (_, attrs: string) => `<html${attrs} data-country="${code}" data-region="${status}">`);
}
