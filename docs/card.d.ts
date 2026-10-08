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
  /** Deal countdown, only while a deal runs. */
  ends_in_seconds?: number | null;
  /** Deal deadline, when the payload carries one - absent on every ordinary card. */
  ends_at?: string | null;
  /** How much of the batch is already sold, when Digikala publishes it. */
  sold_percent?: number | null;
  /** Fewer reviews than the honest-sample floor: the score is real, the sample is thin. */
  rating_low_sample?: true;
}
