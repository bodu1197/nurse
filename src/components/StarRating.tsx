"use client";

import { useState } from "react";

export default function StarRating() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="평점 선택">
      <input type="hidden" name="rating" value={rating} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n}
          aria-label={`${n}점`}
          onClick={() => setRating(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="rounded text-3xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          <span className={(hover || rating) >= n ? "text-amber-400" : "text-slate-300"}>★</span>
        </button>
      ))}
      {rating > 0 && <span className="ml-2 text-sm text-slate-500">{rating}점</span>}
    </div>
  );
}
