// Country presets for the Region master-data form: picking one auto-fills the key + the
// name in every supported locale (zh/zh-Hant/en/ms/id), matching how the Subsidiary form
// already auto-derives its fields. Covers the platform's supported UI locales plus the
// countries most likely to appear in a Southeast/East Asia group's regional reporting.
export const REGION_COUNTRY_PRESETS: { value: string; label: string; fill: Record<string, string> }[] = [
  { value: "sg", label: "新加坡 Singapore", fill: { key: "sg", nameZh: "新加坡", nameZhTw: "新加坡", nameEn: "Singapore", nameMs: "Singapura", nameId: "Singapura" } },
  { value: "my", label: "马来西亚 Malaysia", fill: { key: "my", nameZh: "马来西亚", nameZhTw: "馬來西亞", nameEn: "Malaysia", nameMs: "Malaysia", nameId: "Malaysia" } },
  { value: "id", label: "印度尼西亚 Indonesia", fill: { key: "id", nameZh: "印度尼西亚", nameZhTw: "印度尼西亞", nameEn: "Indonesia", nameMs: "Indonesia", nameId: "Indonesia" } },
  { value: "th", label: "泰国 Thailand", fill: { key: "th", nameZh: "泰国", nameZhTw: "泰國", nameEn: "Thailand", nameMs: "Thailand", nameId: "Thailand" } },
  { value: "vn", label: "越南 Vietnam", fill: { key: "vn", nameZh: "越南", nameZhTw: "越南", nameEn: "Vietnam", nameMs: "Vietnam", nameId: "Vietnam" } },
  { value: "ph", label: "菲律宾 Philippines", fill: { key: "ph", nameZh: "菲律宾", nameZhTw: "菲律賓", nameEn: "Philippines", nameMs: "Filipina", nameId: "Filipina" } },
  { value: "cn", label: "中国大陆 China", fill: { key: "cn", nameZh: "中国大陆", nameZhTw: "中國大陸", nameEn: "China", nameMs: "China", nameId: "Tiongkok" } },
  { value: "hk", label: "中国香港 Hong Kong", fill: { key: "hk", nameZh: "中国香港", nameZhTw: "中國香港", nameEn: "Hong Kong", nameMs: "Hong Kong", nameId: "Hong Kong" } },
  { value: "tw", label: "中国台湾 Taiwan", fill: { key: "tw", nameZh: "中国台湾", nameZhTw: "中國台灣", nameEn: "Taiwan", nameMs: "Taiwan", nameId: "Taiwan" } },
  { value: "bn", label: "文莱 Brunei", fill: { key: "bn", nameZh: "文莱", nameZhTw: "汶萊", nameEn: "Brunei", nameMs: "Brunei", nameId: "Brunei" } },
  { value: "other", label: "其他 / Other (自定义)", fill: { key: "", nameZh: "", nameZhTw: "", nameEn: "", nameMs: "", nameId: "" } },
];
