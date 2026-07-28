"""Pretendard 가변폰트를 상용/희귀 한글 2벌로 쪼개 public/fonts/ 에 굽는다.

왜: 원본 1벌(1.7MB)은 첫 방문자가 전부 받아야 한다. KS X 1001 상용 2,350자만 담은
    벌은 447KB라, 희귀 글자가 없는 평범한 페이지는 이것만 받고 끝난다(약 74% 절감).
    희귀 8,822자 벌은 unicode-range 덕에 실제로 그 글자가 화면에 있을 때만 받는다.

실행: pip install -r scripts/requirements-fonts.txt
      npm run fonts:build
      원본(scripts/assets/PretendardVariable.subset.woff2)을 바꿨을 때만 돌리면 된다.
      생성물 4개(woff2 2개 + src/app/fonts.css + src/app/fonts.ts)는 전부 커밋한다.

주의: 빌드에는 걸어두지 않았다(배포 환경에 파이썬을 요구하게 되므로). 그래서 원본만 바꾸고
      이걸 안 돌리면 조용히 옛 폰트가 계속 나간다 — 깨지진 않지만 바뀐 게 반영되지 않는다.
"""

import hashlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit(
        "fontTools 가 없습니다. 먼저 설치하세요:\n"
        "  pip install -r scripts/requirements-fonts.txt"
    )

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/assets/PretendardVariable.subset.woff2"
OUT = ROOT / "public/fonts"
CSS = ROOT / "src/app/fonts.css"
TS = ROOT / "src/app/fonts.ts"

# 파일명에 박는 내용 해시 길이. 파일이 2개뿐이라 8자(32비트)면 충돌은 사실상 없다.
HASH_LEN = 8
# 이 스크립트가 만드는 파일만 정확히 매칭 — 나중에 누가 public/fonts 에 손으로 넣은
# 다른 폰트를 접두사만 보고 지워버리지 않게 한다.
GENERATED = re.compile(r"^pretendard-(common|rare)\.[0-9a-f]{%d}\.woff2$" % HASH_LEN)


def split_codepoints():
    """원본이 가진 글자 전부를 희귀 한글 / 나머지 로 가른다.

    쓸 기호를 손으로 나열하면 반드시 빠뜨린다(→ 와 ✓ 를 실제로 빠뜨렸었다).
    그래서 "원본에 있는 건 다 넣고, 희귀 한글만 떼낸다"로 뒤집었다.

    희귀 판정: euc-kr 로 인코딩했을 때 첫 바이트가 0xB0~0xC8 이면 KS X 1001 상용 한글
    2,350자. 그 밖의 음절은 파이썬 euc-kr 코덱이 CP949 확장으로 처리하는 희귀 글자다.
    """
    everything = set(TTFont(SRC).getBestCmap())
    common, rare = [], []
    for cp in sorted(everything):
        if 0xAC00 <= cp <= 0xD7A3:
            b = chr(cp).encode("euc-kr")
            (common if len(b) == 2 and 0xB0 <= b[0] <= 0xC8 else rare).append(cp)
        else:
            common.append(cp)
    return common, rare


def weight_range():
    """원본의 fvar wght 축 범위를 그대로 읽어 `"45 930"` 꼴로 돌려준다.

    손으로 적지 않는 이유: 예전 코드가 `45 920` 으로 10 을 적게 적어놨었다. @font-face 가
    실제보다 좁게 말하면 그 바깥 굵기(921~930)는 원본 데이터를 두고도 브라우저가 가짜로
    굵게 그린다. 축 값은 폰트에 적혀 있으니 사람이 옮겨 적을 이유가 없다.
    """
    axis = next(a for a in TTFont(SRC)["fvar"].axes if a.axisTag == "wght")
    fmt = lambda v: f"{v:g}"  # 45.0 → "45"
    return f"{fmt(axis.minValue)} {fmt(axis.maxValue)}"


def to_ranges(codepoints):
    """연속된 코드포인트를 구간으로 묶어 CSS unicode-range 문자열을 만든다."""
    out, start, prev = [], None, None
    for cp in sorted(codepoints):
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev))
            start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ",".join(
        f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in out
    )


def subset(stem, codepoints):
    """서브셋을 구워 `<stem>.<내용해시>.woff2` 로 저장하고 경로를 돌려준다.

    파일명에 내용 해시를 박는 이유: public/ 은 Next 가 지문을 안 붙여 기본 헤더가
    `max-age=0` 이다. next.config.ts 에서 1년 immutable 을 걸어 재방문자가 폰트를
    다시 안 받게 하는데, 이름이 고정이면 폰트를 갈아도 옛 캐시에 1년간 갇힌다.
    해시가 바뀌면 URL 이 바뀌므로 그 함정이 사라진다.
    """
    OUT.mkdir(parents=True, exist_ok=True)
    # 중간 파일은 public/ 바깥에 만든다. 안에 두면 fontTools 가 중간에 죽었을 때 잔해가
    # 남고, next.config.ts 의 /fonts/:path* 규칙에 걸려 1년 immutable 로 공개 서빙된다.
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        tmp = tmpdir / f"{stem}.woff2"
        # 코드포인트가 수천 개라 명령줄 길이 제한에 걸린다 → 파일로 넘긴다
        listfile = tmpdir / f"{stem}.unicodes.txt"
        listfile.write_text(",".join(f"U+{cp:04X}" for cp in codepoints))
        subprocess.run(
            [sys.executable, "-m", "fontTools.subset", str(SRC),
             f"--unicodes-file={listfile}", "--flavor=woff2",
             f"--output-file={tmp}", "--layout-features=*"],
            check=True,
        )
        digest = hashlib.sha256(tmp.read_bytes()).hexdigest()[:HASH_LEN]
        dst = OUT / f"{stem}.{digest}.woff2"
        dst.write_bytes(tmp.read_bytes())
    return dst


def face(name, weight_range, unicode_range):
    return (
        "@font-face {\n"
        "  font-family: 'Pretendard';\n"
        "  font-style: normal;\n"
        f"  font-weight: {weight_range};\n"
        "  font-display: swap;\n"
        f"  src: url('/fonts/{name}') format('woff2');\n"
        f"  unicode-range: {unicode_range};\n"
        "}\n"
    )


def main():
    # 윈도우 콘솔 기본 인코딩(cp1252)은 한글을 못 찍는다 — 아래 진행 출력에서 죽는다.
    # PYTHONIOENCODING 을 매번 손으로 붙이게 하지 않으려고 여기서 못 박는다.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    if not SRC.exists():
        sys.exit(f"원본 폰트가 없습니다: {SRC}")

    common, rare = split_codepoints()
    weights = weight_range()

    common_file = subset("pretendard-common", common)
    rare_file = subset("pretendard-rare", rare)

    # 희귀 벌을 먼저, 상용 벌을 나중에 선언한다. 한 글자를 두 벌이 다 주장하면 나중 선언이
    # 이기므로 상용 글자는 항상 작은 쪽(common)에서 온다. 덕분에 희귀 벌은 8,822자를 일일이
    # 적을 필요 없이 한글 블록 전체로 둬도 된다 — 상용에 없는 글자만 실제로 이 벌을 쓰고,
    # 브라우저는 쓰이는 벌만 내려받으므로 희귀 글자가 없는 페이지는 1.3MB를 건드리지 않는다.
    # (CSS가 31KB → 14KB로 줄어든다. 상용 쪽 목록은 정확해야 해서 그대로 나열한다.)
    CSS.write_text(
        "/* scripts/build-fonts.py 가 생성함 — 직접 고치지 말 것 */\n"
        + face(rare_file.name, weights, "U+AC00-D7A3")
        + face(common_file.name, weights, to_ranges(common)),
        encoding="utf-8",
    )

    # preload 태그도 해시가 박힌 같은 이름을 가리켜야 한다. 손으로 맞추면 반드시 어긋나서
    # 폰트를 두 번 받게 되므로(preload 는 안 쓰이고 CSS 가 따로 받음) 여기서 같이 뽑는다.
    TS.write_text(
        "// scripts/build-fonts.py 가 생성함 — 직접 고치지 말 것\n"
        f'export const FONT_PRELOAD_HREF = "/fonts/{common_file.name}";\n',
        encoding="utf-8",
    )

    # 두 벌을 합쳐도 원본과 글자 수가 같아야 한다 — 하나라도 새면 그 글자는 두부(□)로 뜬다
    covered = set(TTFont(common_file).getBestCmap()) | set(TTFont(rare_file).getBestCmap())
    missing = set(TTFont(SRC).getBestCmap()) - covered
    assert not missing, "원본에 있는 글자가 빠졌다: " + " ".join(
        f"U+{c:04X}({chr(c)})" for c in sorted(missing)[:20]
    )

    # 해시가 바뀌면 옛 파일이 남는다 — 저장소에 유령 폰트가 쌓이지 않게 치운다.
    # 반드시 맨 마지막에 지운다. 앞에서 지우면 중간에 죽었을 때 커밋돼 있는
    # fonts.css/fonts.ts 는 옛 이름을 가리키는데 파일만 사라져 폰트가 404 난다.
    keep = {common_file.name, rare_file.name}
    for stale in OUT.iterdir():
        if stale.name not in keep and GENERATED.match(stale.name):
            stale.unlink()

    kb = lambda p: p.stat().st_size / 1024
    print(f"원본            : {kb(SRC):7.0f} KB")
    print(f"상용 {len(common):5d}자  : {kb(common_file):7.0f} KB  (평소 이것만 받음)")
    print(f"희귀 {len(rare):5d}자  : {kb(rare_file):7.0f} KB  (해당 글자 있을 때만)")
    print(f"CSS             : {CSS.relative_to(ROOT)} ({kb(CSS):.0f} KB)")
    print(f"preload 상수    : {TS.relative_to(ROOT)} -> /fonts/{common_file.name}")
    print(f"빠진 글자 없음  : {len(covered)}자 = 원본과 동일")


if __name__ == "__main__":
    main()
