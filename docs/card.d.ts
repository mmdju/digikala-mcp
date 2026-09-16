// Card envelope shared by every list tool. Keep in sync with docs/tools.md.
export interface CardShape {
  id: number;
  title: string;
  price_toman: number | null;
  price_rial: number | null;
  price_before_toman: number | null;
  discount_percent: number;
  rating_stars: number | null;
  rating_count: number;
  in_stock: boolean;
  seller: string | null;
  badges: string[];
  url: string | null;
}
