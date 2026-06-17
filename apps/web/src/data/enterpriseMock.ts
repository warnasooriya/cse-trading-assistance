export type LocalizedText = {
  en: string;
  si: string;
  ta: string;
};

export type PortfolioHolding = {
  symbol: string;
  name: string;
  sector: string;
  quantity: number;
  avgCost: number;
  marketPrice: number;
};

export type AlertItem = {
  id: string;
  type: string;
  symbol: string;
  channel: "Email" | "SMS" | "Push";
  status: "Active" | "Paused";
  trigger: string;
};

export type SentimentItem = {
  id: string;
  headline: LocalizedText;
  symbol: string;
  source: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  score: number;
  summary: LocalizedText;
  publishedAt: string;
  url: string;
};

export const portfolioHoldings: PortfolioHolding[] = [
  { symbol: "JKH.N0000", name: "John Keells Holdings", sector: "Diversified", quantity: 4200, avgCost: 179.2, marketPrice: 188.5 },
  { symbol: "SAMP.N0000", name: "Sampath Bank", sector: "Banking", quantity: 3000, avgCost: 81.4, marketPrice: 84.8 },
  { symbol: "LOLC.N0000", name: "LOLC Holdings", sector: "Finance", quantity: 1750, avgCost: 522.6, marketPrice: 545.25 },
  { symbol: "HAYL.N0000", name: "Hayleys", sector: "Conglomerates", quantity: 2100, avgCost: 116.3, marketPrice: 112.75 }
];

export const sectorAllocation = [
  { name: "Finance", value: 31 },
  { name: "Diversified", value: 28 },
  { name: "Banking", value: 21 },
  { name: "Conglomerates", value: 20 }
];

export const alertsMock: AlertItem[] = [
  { id: "a-1", type: "AI Buy Signal", symbol: "JKH.N0000", channel: "Push", status: "Active", trigger: "Confidence above 80%" },
  { id: "a-2", type: "RSI Oversold", symbol: "LOLC.N0000", channel: "Email", status: "Active", trigger: "RSI below 30" },
  { id: "a-3", type: "Price Breakout", symbol: "SAMP.N0000", channel: "SMS", status: "Paused", trigger: "Price above 86.00" },
  { id: "a-4", type: "Volume Spike", symbol: "HAYL.N0000", channel: "Push", status: "Active", trigger: "2x 20-day average volume" }
];

export const sentimentFeed: SentimentItem[] = [
  {
    id: "n-1",
    headline: {
      en: "John Keells reports resilient earnings outlook with tourism momentum",
      si: "John Keells සංචාරක වේගය සමඟ ස්ථාවර ඉපැයීම් ඉදිරි දැක්මක් වාර්තා කරයි",
      ta: "சுற்றுலா வேகத்துடன் John Keells நிலையான வருமான முன்னோக்கை அறிவிக்கிறது"
    },
    symbol: "JKH.N0000",
    source: "Corporate Disclosure",
    sentiment: "Positive",
    score: 0.81,
    summary: {
      en: "Forward guidance and sector recovery narrative imply improving medium-term earnings visibility.",
      si: "ඉදිරි මාර්ගෝපදේශය සහ අංශ ප්‍රතිසාධන කතාව මධ්‍ය කාලීන ඉපැයීම් දෘශ්‍යතාව වැඩිදියුණු වන බව පෙන්වයි.",
      ta: "முன்னோக்கிய வழிகாட்டலும் துறை மீட்சிக் கதைமாந்திரமும் நடுக்கால வருமான தெளிவை மேம்படுத்துகிறது."
    },
    publishedAt: "2026-06-10T10:15:00+05:30",
    url: "https://www.cse.lk/pages/company-announcements/company-announcements.component.html"
  },
  {
    id: "n-2",
    headline: {
      en: "Sampath Bank signals margin pressure amid funding cost normalization",
      si: "අරමුදල් පිරිවැය සාමාන්‍යකරණය අතර Sampath Bank මාජින් පීඩනයක් පෙන්වයි",
      ta: "நிதி செலவுகள் இயல்புபடுத்தப்படும் நிலையில் Sampath Bank மார்ஜின் அழுத்தத்தை சுட்டிக்காட்டுகிறது"
    },
    symbol: "SAMP.N0000",
    source: "Financial Report",
    sentiment: "Neutral",
    score: 0.12,
    summary: {
      en: "Asset quality remains solid, but net interest margin compression tempers upside expectations.",
      si: "වත්කම් ගුණාත්මකභාවය ශක්තිමත් වුවද, ශුද්ධ පොලී මාජින් සංකෝචනය ඉහළ යාමේ බලාපොරොත්තු මන්දගාමී කරයි.",
      ta: "சொத்து தரம் உறுதியாக இருந்தாலும், நிகர வட்டி மார்ஜின் சுருக்கம் மேல்நோக்கி எதிர்பார்ப்புகளை கட்டுப்படுத்துகிறது."
    },
    publishedAt: "2026-06-09T16:45:00+05:30",
    url: "https://www.cse.lk/pages/company-announcements/company-announcements.component.html"
  },
  {
    id: "n-3",
    headline: {
      en: "Hayleys faces weaker export order book in selected industrial segments",
      si: "තෝරාගත් කර්මාන්ත අංශවල දුර්වල අපනයන ඇණවුම් පොතකට Hayleys මුහුණ දෙයි",
      ta: "தேர்ந்தெடுக்கப்பட்ட தொழில் பிரிவுகளில் Hayleys பலவீனமான ஏற்றுமதி ஆர்டர் புத்தகத்தை எதிர்கொள்கிறது"
    },
    symbol: "HAYL.N0000",
    source: "Market News",
    sentiment: "Negative",
    score: -0.56,
    summary: {
      en: "Short-term demand pressure may weigh on quarterly performance despite diversified group resilience.",
      si: "විවිධාංගීකृत සමූහ ප්‍රතිරෝධතාව තිබුණද කෙටි කාලීන ඉල්ලුම් පීඩනය ත්‍රෛමාසික ප්‍රතිඵල මත බලපෑම් කළ හැක.",
      ta: "பல்வகை குழுமத்தின் நெகிழ்வுத்தன்மை இருந்தாலும், குறுகியகால கேள்வி அழுத்தம் காலாண்டு செயல்திறனை பாதிக்கலாம்."
    },
    publishedAt: "2026-06-08T09:20:00+05:30",
    url: "https://www.cse.lk/pages/market-summary/market-summary.component.html"
  },
  {
    id: "n-4",
    headline: {
      en: "LOLC expansion plans strengthen longer-term growth narrative",
      si: "LOLC පුළුල් කිරීමේ සැලසුම් දිගුකාලීන වර්ධන කතාව ශක්තිමත් කරයි",
      ta: "LOLC விரிவாக்கத் திட்டங்கள் நீண்டகால வளர்ச்சி கதைமாந்திரத்தை வலுப்படுத்துகின்றன"
    },
    symbol: "LOLC.N0000",
    source: "Corporate Disclosure",
    sentiment: "Positive",
    score: 0.67,
    summary: {
      en: "Management commentary indicates broader regional optionality and stronger non-bank earnings support.",
      si: "කළමනාකාරීත්ව අදහස් මගින් පුළුල් කලාපීය අවස්ථා සහ බැංකු නොවන ඉපැයීම් සහාය ශක්තිමත් බව පෙන්වයි.",
      ta: "மேலாண்மை கருத்துக்கள் விரிவான பிராந்திய வாய்ப்புகளையும் வங்கியல்லா வருமான ஆதரவையும் சுட்டிக்காட்டுகின்றன."
    },
    publishedAt: "2026-06-10T12:05:00+05:30",
    url: "https://www.cse.lk/pages/company-announcements/company-announcements.component.html"
  }
];

export const executionTimeline = [
  { name: "09:30", exposure: 32, pnl: 0.2 },
  { name: "10:30", exposure: 38, pnl: 0.8 },
  { name: "11:30", exposure: 44, pnl: 1.1 },
  { name: "12:30", exposure: 47, pnl: 0.9 },
  { name: "13:30", exposure: 49, pnl: 1.4 },
  { name: "14:30", exposure: 52, pnl: 1.8 }
];
