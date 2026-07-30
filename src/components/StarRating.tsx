"use client";

import { useState } from "react";

// value: 수정 화면에서 저장된 별점을 시작값으로 받는다(새 리뷰는 0).
// 미지정으로 열어두면 수정 화면에서 별점을 다시 고르지 않은 사람이 0점을 저장하게 된다.
export default function StarRating({ value = 0 }: Readonly<{ value?: number }>) {
  const [rating, setRating] = useState(value);
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
