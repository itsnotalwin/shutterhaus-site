/** Keep currency formatting identical on Services, Home and Contact. */
export function formatPrice(amount: number): string {
  return `R${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
