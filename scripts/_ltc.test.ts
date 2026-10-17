import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { firstZipEntry, ltcAddress, ltcKind, ltcRegion, ltcRowAddress, mergeLtc, parseDetail, parseRoadNames, xmlField, type LtcItem } from "./_ltc.ts";

const BAD = String.fromCharCode(0xfffd); // EUC-KR 로 안 읽힌 글자 자리(U+FFFD)

const item = (o: Partial<LtcItem>): LtcItem => ({
  adminNm: "행복재가센터", adminPttnCd: "C01", longTermAdminSym: "31111000108", siDoCd: "11", siGunGuCd: "110", ...o,
});
const names: Record<string, string> = { "11/110": "종로구", "12/750": "보성군", "36/110": " " };
const sgg = (sd: string, g: string) => names[`${sd}/${g}`];

test("급여 종류 코드 → 이름(서울 기관명으로 맞춰 본 규칙)", () => {
  assert.equal(ltcKind("C01"), "방문요양");
  assert.equal(ltcKind("B02"), "방문목욕");
  assert.equal(ltcKind("B03"), "주야간보호");
  assert.equal(ltcKind("C04"), "단기보호");
  assert.equal(ltcKind("B05"), "방문간호");
  assert.equal(ltcKind("C06"), "복지용구");
  assert.equal(ltcKind("A03"), "노인요양시설");
  assert.equal(ltcKind("A04"), "노인요양공동생활가정");
  assert.equal(ltcKind("G31"), "노인요양시설");
  assert.equal(ltcKind("S41"), "노인요양공동생활가정");
  assert.equal(ltcKind("H31"), "주야간보호");
  assert.equal(ltcKind("Z99"), null);
});

test("지역 — 공단 시도 번호를 명부 표기로(전남광주 통합 12, 세종은 시군구 이름이 비어 시도만)", () => {
  assert.equal(ltcRegion("11", "종로구"), "서울 종로구");
  assert.equal(ltcRegion("12", "보성군"), "전남광주 보성군");
  assert.equal(ltcRegion("36", " "), "세종");
  assert.equal(ltcRegion("46", "보성군"), null, "공단에 없는 번호면 틀린 지역 대신 비운다");
});

test("같은 기관의 여러 줄을 하나로 — 급여 종류를 이어 붙이고 복지용구만 하는 곳은 뺀다", () => {
  const rows = mergeLtc(
    [
      item({ adminPttnCd: "C02" }),
      item({ adminPttnCd: "C01" }),
      item({ adminPttnCd: "C06" }), // 복지용구도 하지만 방문요양·목욕 기관이다 → 싣되 그 종류는 뺀다
      item({ adminNm: "약손복지용구", adminPttnCd: "B06", longTermAdminSym: "31111000999" }), // 복지용구만 → 뺀다
      item({ adminNm: "보성은빛복지센터", adminPttnCd: "B01", longTermAdminSym: "34675000001", siDoCd: "12", siGunGuCd: "750" }),
      item({ adminNm: "모르는코드기관", adminPttnCd: "Z99", longTermAdminSym: "31111000555" }),
    ],
    sgg,
  );
  assert.deepEqual(rows.map((r) => [r.ltc_code, r.name, r.region, r.cl_cd_nm]), [
    ["31111000108", "행복재가센터", "서울 종로구", "방문요양·방문목욕"],
    ["34675000001", "보성은빛복지센터", "전남광주 보성군", "방문요양"],
    ["31111000555", "모르는코드기관", "서울 종로구", "장기요양기관"],
  ]);
  assert.ok(rows.every((r) => r.source === "public_data"));
});

test("주소 — 도로명 파일로 도로명코드를 이름으로 바꾸고 건물번호를 붙인다(공단 상세조회는 글자 주소를 안 준다)", () => {
  const roads = parseRoadNames([
    "11305|3107018|01|월계로|Wolgye-ro|서울특별시|강북구|1|102|번동|0|||||||||20100125|",
    "11305|3107018|02|월계로|Wolgye-ro|서울특별시|강북구|1|103|수유동|0|||||||||20100125|", // 같은 도로가 동마다 한 줄씩
    "36110|3258034|01|한누리대로|Hannuri-daero|세종특별자치시||1|101|어진동|0|||||||||20120701|", // 세종은 시군구가 빈칸
    `11545|4864373|01|금천구${BAD}역중앙통로|x|서울특별시|금천구|1|103|시흥동|0|||||||||20200101|`, // 실제 파일의 깨진 글자 줄
    `11680|1234567|01|정상로|x|서울특별시|강${BAD}구|1|101|역삼동|0|||||||||20100125|`, // 시군구 칸이 깨진 줄
    "11680|1234568|01||x|서울특별시|강남구|1|101|역삼동|0|||||||||20100125|", // 도로명이 빈 줄
    "1130|53107018|01|밀린칸로|x|서울특별시|강북구|1|102|번동|0|||||||||20100125|", // 칸이 밀리면 코드 자릿수로 거른다
    "깨진 줄",
  ].join("\r\n"));
  assert.equal(roads.size, 2);
  assert.equal(ltcAddress(roads.get("113053107018"), "187", "0"), "서울특별시 강북구 월계로 187");
  assert.equal(ltcAddress(roads.get("361103258034"), "90", "3"), "세종특별자치시 한누리대로 90-3");
  assert.equal(ltcAddress(roads.get("999999999999"), "187", "0"), null, "도로를 모르면 틀린 주소 대신 비운다");
  assert.equal(ltcAddress(roads.get("113053107018"), "", "0"), null, "건물번호가 없으면 비운다");
  assert.equal(ltcAddress(roads.get("113053107018"), "0", "0"), null, "건물번호 0 도 비운다");
  assert.equal(ltcAddress(roads.get("113053107018"), "18a", "0"), null, "숫자가 아닌 번호도 비운다");
  assert.equal(ltcAddress(roads.get("113053107018"), "187", ""), "서울특별시 강북구 월계로 187", "부번이 비면 본번만");
});

test("zip 첫 파일 꺼내기 — 압축 안 함·deflate 둘 다, 끝 레코드가 없으면 멈춘다", () => {
  const text = Buffer.from("11305|3107018|01|월계로|");
  const zipOf = (method: 0 | 8, extraLen = 0) => {
    const body = method === 8 ? deflateRawSync(text) : text;
    const name = Buffer.from("TN_SPRD_RDNM.txt");
    const extra = Buffer.alloc(extraLen); // 로컬 헤더의 부가 칸(+28) — 있으면 그만큼 건너뛰어야 데이터다
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(body.length, 18);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extraLen, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10); central.writeUInt32LE(body.length, 20);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt32LE(30 + name.length + extraLen + body.length, 16);
    return Buffer.concat([local, name, extra, body, central, name, end]);
  };
  assert.deepEqual(firstZipEntry(zipOf(0)), text);
  assert.deepEqual(firstZipEntry(zipOf(8)), text);
  assert.deepEqual(firstZipEntry(zipOf(8, 9)), text, "로컬 부가 칸이 있어도");
  assert.throws(() => firstZipEntry(Buffer.from("zip 아님")), /끝 레코드/);
});

test("명부 행 한 곳의 주소 — 도로를 모르면 noRoad, 명부 지역과 다른 동네면 otherArea(틀린 동네보다 빈 주소)", () => {
  const roads = new Map([
    ["113053107018", "서울특별시 강북구 월계로"],
    ["123004286597", "전남광주통합특별시 북구 일곡로"],
    ["361103258034", "세종특별자치시 한누리대로"],
    ["431114523162", "충청북도 청주시 상당구 수영로137번길"],
  ]);
  const d = (road: string) => ({ road, main: "187", sub: "0" });
  assert.deepEqual(ltcRowAddress(d("113053107018"), roads, "서울 강북구"), { address: "서울특별시 강북구 월계로 187" });
  assert.deepEqual(ltcRowAddress(d("123004286597"), roads, "전남광주 북구"), { address: "전남광주통합특별시 북구 일곡로 187" });
  assert.deepEqual(ltcRowAddress(d("361103258034"), roads, "세종"), { address: "세종특별자치시 한누리대로 187" }, "세종은 시군구가 없다");
  assert.deepEqual(ltcRowAddress(d("431114523162"), roads, "충북 청주시 상당구"), { address: "충청북도 청주시 상당구 수영로137번길 187" }, "2단 시군구");
  assert.deepEqual(ltcRowAddress(d("999999999999"), roads, "서울 강북구"), { miss: "noRoad" });
  assert.deepEqual(ltcRowAddress(d("113053107018"), roads, "서울 노원구"), { miss: "otherArea" }, "같은 시도의 다른 구");
  assert.deepEqual(ltcRowAddress(d("123004286597"), roads, "전남광주 목포시"), { miss: "otherArea" }, "전남광주는 한 시도 — 광주↔전남 어긋남도 거른다");
  assert.deepEqual(ltcRowAddress(d("113053107018"), roads, "서울"), { address: "서울특별시 강북구 월계로 187" }, "명부 시군구가 비면 시도만 본다");
  assert.deepEqual(ltcRowAddress(d("113053107018"), roads, null), { miss: "otherArea" }, "명부 지역을 모르면 싣지 않는다");
});

test("옛 시군구 번호의 도로명코드 — 뒤 7자리가 같은 도로가 명부 지역에 딱 하나면 그 도로", () => {
  const roads = new Map([
    ["521113266065", "전북특별자치도 전주시 완산구 전룡로"],
    ["483102006004", "경상남도 거제시 거제대로"],
    ["115452005010", "서울특별시 금천구 시흥대로"],
    ["115602005010", "서울특별시 영등포구 시흥대로"],
  ]);
  const d = (road: string) => ({ road, main: "49", sub: "14" });
  assert.deepEqual(ltcRowAddress(d("451113266065"), roads, "전북 전주시 완산구"), { address: "전북특별자치도 전주시 완산구 전룡로 49-14" }, "전북 45→52");
  assert.deepEqual(ltcRowAddress(d("264702006004"), roads, "부산 연제구"), { miss: "noRoad" }, "뒤 7자리만 같은 다른 지역 도로는 안 쓴다");
  assert.deepEqual(ltcRowAddress(d("115902005010"), roads, "서울"), { miss: "noRoad" }, "명부 지역 안에 둘 이상이면 고르지 않는다");
  assert.deepEqual(ltcRowAddress(d(""), roads, "서울"), { miss: "noRoad" }, "도로명코드가 비면");
});

test("XML 칸 — 엔티티를 풀고, 없는 칸은 빈 글자", () => {
  assert.equal(xmlField("<adminNm>행복&amp;사랑 요양원</adminNm>", "adminNm"), "행복&사랑 요양원");
  assert.equal(xmlField("<adminNm>x</adminNm>", "roadNmCd"), "");
});

test("상세조회 응답 판정 — 요청한 기관인지 확인하고, 하루 한도와 잠깐 오류를 가른다", () => {
  const ok = (sym: string) =>
    `<response><header><resultCode>00</resultCode></header><body><item><gunmulMlno>187</gunmulMlno><gunmulSlno>0</gunmulSlno><longTermAdminSym>${sym}</longTermAdminSym><roadNmCd>113053107018</roadNmCd></item></body></response>`;
  assert.deepEqual(parseDetail(ok("21130500195"), "21130500195"), { road: "113053107018", main: "187", sub: "0" });
  assert.equal(parseDetail(ok("99999999999"), "21130500195"), null, "다른 기관을 주면 쓰지 않는다");
  assert.equal(parseDetail("<response><header><resultCode>00</resultCode></header><body/></response>", "1"), null, "없는 기관(실측)");
  assert.equal(parseDetail("<response><header><resultCode>03</resultCode><resultMsg>NODATA_ERROR</resultMsg></header></response>", "1"), null);
  const quota = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
  assert.equal(parseDetail(quota, "1"), "quota");
  assert.equal(parseDetail("<returnReasonCode>22</returnReasonCode>", "1"), "quota", "사유 코드만 와도 하루 한도");
  assert.equal(parseDetail("<response><header><resultCode>22</resultCode></header></response>", "1"), "quota", "머리 결과 코드로 와도");
  assert.equal(parseDetail("API token quota exceeded", "1"), "quota", "평문 한도 문구");
  const perSecond = "<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>23</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
  assert.equal(parseDetail(perSecond, "1"), "retry", "초당 한도는 쉬었다 다시 — 하루 한도로 오인해 멈추지 않는다");
  assert.equal(parseDetail("TypeError: fetch failed", "1"), "retry");
});
