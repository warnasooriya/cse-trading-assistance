import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type AppLanguage = "en" | "si" | "ta";

type TranslationTree = {
  [key: string]: string | TranslationTree;
};

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string) => string;
  languageLabel: (language: AppLanguage) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const STORAGE_KEY = "cse-ai-language";

const translations: Record<AppLanguage, TranslationTree> = {
  en: {
    common: {
      active: "Active",
      paused: "Paused",
      create: "Create",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      reset: "Reset",
      search: "Search",
      loading: "Loading...",
      language: "Language",
      analyze: "Analyze",
      openSource: "Open Source",
      viewAll: "View All",
      review: "Review",
      symbol: "Symbol",
      source: "Source",
      sentiment: "Sentiment",
      summary: "Summary",
      status: "Status",
      type: "Type",
      trigger: "Trigger",
      channel: "Channel",
      actions: "Actions",
      notifications: "Notifications",
      settings: "Settings",
      noItems: "No items matched the current filters."
    },
    shell: {
      exchange: "Colombo Stock Exchange",
      appName: "CSE AI Trading Assistant",
      description:
        "Institutional-grade intelligence for discretionary trading, portfolio monitoring, and signal orchestration.",
      marketIntelligence: "Market Intelligence",
      executiveDashboard: "Executive Dashboard",
      stockAnalysis: "Stock Analysis",
      newsSentiment: "News & Sentiment",
      portfolioRisk: "Portfolio & Risk",
      portfolioCommand: "Portfolio Command",
      riskCenter: "Risk Center",
      alerts: "Alerts",
      strategyLab: "Strategy Lab",
      backtesting: "Backtesting",
      systemPosture: "System Posture",
      postureDescription:
        "All critical engines are healthy. Market data, AI inference, and alerting are operating within normal thresholds.",
      marketFeedLive: "Market Feed Live",
      aiEngineOnline: "AI Engine Online",
      alertsActive: "Alerts Active",
      searchPlaceholder: "Search symbol, company, announcements, disclosures...",
      searchHelp: "Type a CSE symbol to open analysis or use keywords like news, alerts, risk, portfolio, backtest.",
      aspiFeedLive: "ASPI Feed: Live",
      executionManual: "Execution: Manual",
      analystRole: "Risk Analyst",
      workspace: "Enterprise Workspace",
      premiumWorkspace: "Premium Trading Workspace",
      consoleTitle: "Institutional Decision Console",
      consoleDescription:
        "Professional-grade market intelligence, risk control, backtesting, and signal orchestration.",
      systemStable: "System Stable",
      productionWorkspace: "Production Workspace"
    },
    dashboard: {
      title: "Executive Market Command Center",
      subtitle: "Colombo Stock Exchange market intelligence, AI signals, and operating posture.",
      recommendationOnline: "Recommendation Engine Online",
      riskMonitoring: "Risk Monitoring Active",
      createAlert: "Create Trading Alert",
      managedPortfolioValue: "Managed Portfolio Value",
      unrealizedPnl: "Unrealized P/L",
      riskPosture: "Risk Posture",
      sectorLeadership: "Intraday Sector Leadership",
      sectorLeadershipDesc: "Top sector index movement to identify risk-on and risk-off leadership rotation.",
      executionTimeline: "Execution & Exposure Timeline",
      executionTimelineDesc: "Illustrative intraday exposure posture versus realized P/L.",
      tradingSignals: "Priority Trading Signals",
      tradingSignalsDesc: "Decision-ready short list combining leaders and laggards for analyst review.",
      actionBias: "Action Bias",
      momentumLong: "Momentum Long",
      meanReversion: "Mean Reversion Watch",
      sectorAllocation: "Sector Allocation",
      allocationDesc: "Current portfolio diversification posture.",
      liquidity: "Liquidity & Capacity",
      liquidityDesc: "Deployment capacity for new ideas and alert-driven entries.",
      availableCash: "Available Cash",
      mostActiveCounters: "Most Active Counters",
      portfolioMonitor: "Portfolio Monitor",
      portfolioMonitorDesc: "Core holdings with active mark-to-market monitoring.",
      counter: "Counter",
      qty: "Qty",
      avgCost: "Avg Cost",
      newsRadar: "News & Sentiment Radar",
      newsRadarDesc: "Language-aware signal triage from announcements and market narratives.",
      score: "Score"
    },
    alerts: {
      title: "Alert Operations Center",
      subtitle: "Multi-channel event monitoring for price breakouts, technical conditions, and AI-generated signals.",
      createRule: "Create Alert Rule",
      configuredAlerts: "Configured Alerts",
      formTitle: "New Alert Rule",
      formSubtitle: "Create a local alert rule for dashboard review and future notification workflows.",
      ruleCreated: "Alert rule created successfully.",
      pause: "Pause",
      activate: "Activate",
      channelEmail: "Email",
      channelSms: "SMS",
      channelPush: "Push Notification"
    },
    news: {
      title: "News & Sentiment Intelligence",
      subtitle:
        "Qualitative signal review for announcements, disclosures, financial reports, and market narrative shifts.",
      allSentiments: "All Sentiments",
      positive: "Positive",
      neutral: "Neutral",
      negative: "Negative",
      allSources: "All Sources",
      searchPlaceholder: "Search headlines, symbols, or summaries...",
      latestCoverage: "Latest Coverage",
      filtersApplied: "Filters Applied",
      newsLanguage: "News Language",
      noResults: "No news items matched the current filters."
    },
    stock: {
      title: "Advanced Stock Analysis Workbench",
      subtitle:
        "Institutional-style decision support with explainable recommendation context and technical reference signals.",
      symbolLabel: "CSE Symbol",
      symbolHelper: "Example: JKH.N0000, LOLC.N0000, SAMP.N0000",
      recommendation: "AI Recommendation",
      confidence: "Confidence",
      marketSnapshot: "Market Snapshot",
      marketSnapshotDesc: "Trading range, liquidity, and 12-month context for position decisioning.",
      signalMatrix: "Signal Matrix",
      signalMatrixDesc: "Composite indicator posture used by discretionary review.",
      indicatorReference: "Indicator Reference",
      indicatorReferenceDesc: "Trading desk quick glossary for interpreting recommendation drivers.",
      previousClose: "Previous Close",
      intradayHigh: "Intraday High",
      intradayLow: "Intraday Low",
      high12m: "12M High",
      low12m: "12M Low",
      volume: "Volume",
      marketCap: "Market Cap",
      failed: "Failed to analyze stock"
    }
  },
  si: {
    common: {
      active: "සක්‍රිය",
      paused: "අත්හිටුවා ඇත",
      create: "සාදන්න",
      cancel: "අවලංගු කරන්න",
      save: "සුරකින්න",
      delete: "මකන්න",
      reset: "යළි සකසන්න",
      search: "සොයන්න",
      loading: "පූරණය වෙමින්...",
      language: "භාෂාව",
      analyze: "විශ්ලේෂණය කරන්න",
      openSource: "මූලාශ්‍රය විවෘත කරන්න",
      viewAll: "සියල්ල බලන්න",
      review: "සමාලෝචනය",
      symbol: "සංකේතය",
      source: "මූලාශ්‍රය",
      sentiment: "මතභේදය",
      summary: "සාරාංශය",
      status: "තත්ත්වය",
      type: "වර්ගය",
      trigger: "ආරම්භක කොන්දේසිය",
      channel: "නාලිකාව",
      actions: "ක්‍රියා",
      notifications: "දැනුම්දීම්",
      settings: "සැකසුම්",
      noItems: "දැනට යෙදුම් පෙරහන් සමඟ ගැලපෙන අයිතම නොමැත."
    },
    shell: {
      exchange: "කොළඹ කොටස් හුවමාරුව",
      appName: "CSE AI Trading Assistant",
      description:
        "අභිරුචි වෙළඳාම, පෝට්ෆෝලියෝ නිරීක්ෂණය සහ සංඥා කළමනාකරණය සඳහා ආයතනික මට්ටමේ බුද්ධිමය සහාය.",
      marketIntelligence: "වෙළඳපල බුද්ධිය",
      executiveDashboard: "ප්‍රධාන උපකරණ පුවරුව",
      stockAnalysis: "කොටස් විශ්ලේෂණය",
      newsSentiment: "පුවත් සහ මතභේදය",
      portfolioRisk: "පෝට්ෆෝලියෝ සහ අවදානම",
      portfolioCommand: "පෝට්ෆෝලියෝ මධ්‍යස්ථානය",
      riskCenter: "අවදානම් මධ්‍යස්ථානය",
      alerts: "අනතුරු ඇඟවීම්",
      strategyLab: "ක්‍රමෝපාය පර්යේෂණාගාරය",
      backtesting: "Backtesting",
      systemPosture: "පද්ධති තත්ත්වය",
      postureDescription:
        "අත්‍යවශ්‍ය එන්ජින් සියල්ල සෞඛ්‍ය සම්පන්නව ක්‍රියාත්මක වේ. වෙළඳපල දත්ත, AI අනාවැකි සහ අනතුරු ඇඟවීම් සාමාන්‍ය සීමාවන් තුළ පවතී.",
      marketFeedLive: "සජීවී වෙළඳපල දත්ත",
      aiEngineOnline: "AI එන්ජිම සජීවීයි",
      alertsActive: "අනතුරු ඇඟවීම් සක්‍රිය",
      searchPlaceholder: "සංකේත, සමාගම, නිවේදන හෝ හෙළිදරව් සොයන්න...",
      searchHelp: "CSE සංකේතයක් ඇතුළු කර කොටස් විශ්ලේෂණයට යන්න හෝ news, alerts, risk, portfolio, backtest යන්න භාවිතා කරන්න.",
      aspiFeedLive: "ASPI දත්ත: සජීවී",
      executionManual: "ක්‍රියාත්මක කිරීම: අතින්",
      analystRole: "අවදානම් විශ්ලේෂක",
      workspace: "ආයතනික වැඩබිම",
      premiumWorkspace: "ප්‍රිමියම් වෙළඳ වැඩබිම",
      consoleTitle: "ආයතනික තීරණ මණ්ඩපය",
      consoleDescription:
        "වෘත්තීය මට්ටමේ වෙළඳපල බුද්ධිය, අවදානම් පාලනය, backtesting සහ සංඥා කළමනාකරණය.",
      systemStable: "පද්ධතිය ස්ථාවරයි",
      productionWorkspace: "නිෂ්පාදන වැඩබිම"
    },
    dashboard: {
      title: "ප්‍රධාන වෙළඳපල පාලන මධ්‍යස්ථානය",
      subtitle: "කොළඹ කොටස් හුවමාරුවේ වෙළඳපල බුද්ධිය, AI සංඥා සහ ක්‍රියාකාරී තත්ත්වය.",
      recommendationOnline: "නිර්දේශ එන්ජිම සජීවී",
      riskMonitoring: "අවදානම් නිරීක්ෂණය සක්‍රිය",
      createAlert: "වෙළඳ අනතුරු ඇඟවීමක් සාදන්න",
      managedPortfolioValue: "කළමනාකරණය වන පෝට්ෆෝලියෝ වටිනාකම",
      unrealizedPnl: "නොපෙන්නුම් කළ ලාභ/අලාභ",
      riskPosture: "අවදානම් තත්ත්වය",
      sectorLeadership: "අංශ නායකත්වය",
      sectorLeadershipDesc: "අංශ දර්ශක චලනය අනුව risk-on සහ risk-off නායකත්වය හඳුනාගන්න.",
      executionTimeline: "ක්‍රියාත්මක කිරීම සහ නිරාවරණ කාලරේඛාව",
      executionTimelineDesc: "දෛනික නිරාවරණය සහ ඉපැයූ P/L පිළිබඳ නිදර්ශන.",
      tradingSignals: "ප්‍රමුඛ වෙළඳ සංඥා",
      tradingSignalsDesc: "විශ්ලේෂක සමාලෝචනය සඳහා සූදානම් කෙටි ලැයිස්තුව.",
      actionBias: "ක්‍රියා නැඹුරුව",
      momentumLong: "Momentum දිගු",
      meanReversion: "Mean Reversion නිරීක්ෂණය",
      sectorAllocation: "අංශ වෙන්කිරීම",
      allocationDesc: "වත්මන් පෝට්ෆෝලියෝ විවිධීකරණ තත්ත්වය.",
      liquidity: "ද්‍රවශීලතාව සහ හැකියාව",
      liquidityDesc: "නව අදහස් සහ අනතුරු ඇඟවීම් මත පිවිසුම් සඳහා යෙදවිය හැකි ධාරිතාව.",
      availableCash: "ලබාගත හැකි මුදල්",
      mostActiveCounters: "වඩාත් ක්‍රියාශීලී කොටස්",
      portfolioMonitor: "පෝට්ෆෝලියෝ නිරීක්ෂණය",
      portfolioMonitorDesc: "mark-to-market නිරීක්ෂණය සමඟ මූලික කොටස්.",
      counter: "කවුන්ටරය",
      qty: "ප්‍රමාණය",
      avgCost: "සාමාන්‍ය මිල",
      newsRadar: "පුවත් සහ මතභේද රේඩාර්",
      newsRadarDesc: "නිවේදන සහ වෙළඳපල කතාබස් මත භාෂා-සවිස්තර සංඥා තේරීම.",
      score: "ලකුණ"
    },
    alerts: {
      title: "අනතුරු ඇඟවීම් මෙහෙයුම් මධ්‍යස්ථානය",
      subtitle: "මිල breakout, තාක්ෂණික කොන්දේසි සහ AI සංඥා සඳහා බහු-නාලිකා නිරීක්ෂණය.",
      createRule: "අනතුරු ඇඟවීමේ නියමයක් සාදන්න",
      configuredAlerts: "සැකසූ අනතුරු ඇඟවීම්",
      formTitle: "නව අනතුරු ඇඟවීමේ නියමය",
      formSubtitle: "උපකරණ පුවරුවේ සමාලෝචනය සහ අනාගත දැනුම්දීම් සඳහා ස්ථානීය නියමයක් සාදන්න.",
      ruleCreated: "අනතුරු ඇඟවීමේ නියමය සාර්ථකව සාදන ලදී.",
      pause: "අත්හිටුවන්න",
      activate: "සක්‍රිය කරන්න",
      channelEmail: "ඊමේල්",
      channelSms: "SMS",
      channelPush: "Push දැනුම්දීම"
    },
    news: {
      title: "පුවත් සහ මතභේද බුද්ධි පද්ධතිය",
      subtitle: "නිවේදන, හෙළිදරව්, මූල්‍ය වාර්තා සහ වෙළඳපල කථාන්තර වෙනස්කම් පිළිබඳ ගුණාත්මක සමාලෝචනය.",
      allSentiments: "සියලු මතභේද",
      positive: "ධනාත්මක",
      neutral: "මධ්‍යස්ථ",
      negative: "අහිතකර",
      allSources: "සියලු මූලාශ්‍ර",
      searchPlaceholder: "ශීර්ෂ, සංකේත හෝ සාරාංශ සොයන්න...",
      latestCoverage: "නවතම ආවරණය",
      filtersApplied: "යෙදූ පෙරහන්",
      newsLanguage: "පුවත් භාෂාව",
      noResults: "වත්මන් පෙරහන් සමඟ ගැලපෙන පුවත් අයිතම නොමැත."
    },
    stock: {
      title: "උසස් කොටස් විශ්ලේෂණ වැඩබිම",
      subtitle: "විස්තරාත්මක AI නිර්දේශ සහ තාක්ෂණික සංඥා සමඟ ආයතනික තීරණ සහාය.",
      symbolLabel: "CSE සංකේතය",
      symbolHelper: "උදාහරණය: JKH.N0000, LOLC.N0000, SAMP.N0000",
      recommendation: "AI නිර්දේශය",
      confidence: "විශ්වාස මට්ටම",
      marketSnapshot: "වෙළඳපල සැණෙළිය",
      marketSnapshotDesc: "ස්ථානගත තීරණ සඳහා මිල පරාසය, ද්‍රවශීලතාව සහ මාස 12 පසුබිම.",
      signalMatrix: "සංඥා මැට්‍රික්සය",
      signalMatrixDesc: "විචක්ෂණාත්මක සමාලෝචනය සඳහා සංයුක්ත දර්ශක තත්ත්වය.",
      indicatorReference: "දර්ශක සන්ධර්භය",
      indicatorReferenceDesc: "නිර්දේශ සාධක තේරුම් ගැනීමට වෙළඳ කණ්ඩායම් ඉක්මන් වචනකෝෂය.",
      previousClose: "පෙර වසා දැමීම",
      intradayHigh: "දෛනික ඉහළම",
      intradayLow: "දෛනික පහළම",
      high12m: "මාස 12 ඉහළම",
      low12m: "මාස 12 පහළම",
      volume: "පරිමාව",
      marketCap: "වෙළඳපල ප්‍රාග්ධනීකරණය",
      failed: "කොටස විශ්ලේෂණය කිරීමට අසමත් විය"
    }
  },
  ta: {
    common: {
      active: "செயலில்",
      paused: "இடைநிறுத்தப்பட்டது",
      create: "உருவாக்கு",
      cancel: "ரத்து செய்",
      save: "சேமி",
      delete: "நீக்கு",
      reset: "மீட்டமை",
      search: "தேடு",
      loading: "ஏற்றுகிறது...",
      language: "மொழி",
      analyze: "பகுப்பாய்வு செய்",
      openSource: "மூலத்தைத் திற",
      viewAll: "அனைத்தையும் காண்",
      review: "ஆய்வு",
      symbol: "சின்னம்",
      source: "மூலம்",
      sentiment: "உணர்வு",
      summary: "சுருக்கம்",
      status: "நிலை",
      type: "வகை",
      trigger: "தூண்டுதல்",
      channel: "சேனல்",
      actions: "செயல்கள்",
      notifications: "அறிவிப்புகள்",
      settings: "அமைப்புகள்",
      noItems: "தற்போதைய வடிகட்டல்களுக்கு பொருந்தும் உருப்படிகள் இல்லை."
    },
    shell: {
      exchange: "கொழும்பு பங்குச் சந்தை",
      appName: "CSE AI Trading Assistant",
      description:
        "தன்னிச்சை வர்த்தகம், போர்ட்ஃபோலியோ கண்காணிப்பு மற்றும் சிக்னல் ஒருங்கிணைப்புக்கான நிறுவனம் தர நுண்ணறிவு.",
      marketIntelligence: "சந்தை நுண்ணறிவு",
      executiveDashboard: "நிர்வாக டாஷ்போர்டு",
      stockAnalysis: "பங்கு பகுப்பாய்வு",
      newsSentiment: "செய்தி & உணர்வு",
      portfolioRisk: "போர்ட்ஃபோலியோ & அபாயம்",
      portfolioCommand: "போர்ட்ஃபோலியோ மையம்",
      riskCenter: "அபாய மையம்",
      alerts: "எச்சரிக்கைகள்",
      strategyLab: "மூலோபாய ஆய்வகம்",
      backtesting: "Backtesting",
      systemPosture: "கணினி நிலை",
      postureDescription:
        "முக்கிய இயங்கிகள் அனைத்தும் நலமாக இயங்குகின்றன. சந்தை தரவு, AI கணிப்பு மற்றும் எச்சரிக்கைகள் இயல்பான வரம்புகளில் உள்ளன.",
      marketFeedLive: "சந்தை தரவு செயல்பாட்டில்",
      aiEngineOnline: "AI இயந்திரம் செயல்பாட்டில்",
      alertsActive: "எச்சரிக்கைகள் செயல்பாட்டில்",
      searchPlaceholder: "சின்னம், நிறுவனம், அறிவிப்பு அல்லது வெளிப்படுத்தலைத் தேடுங்கள்...",
      searchHelp: "CSE சின்னத்தை உள்ளிட்டு பகுப்பாய்வைத் திறக்கவும் அல்லது news, alerts, risk, portfolio, backtest போன்ற சொற்களைப் பயன்படுத்தவும்.",
      aspiFeedLive: "ASPI தரவு: செயல்பாட்டில்",
      executionManual: "நிறைவேற்றல்: கையேடு",
      analystRole: "அபாய பகுப்பாய்வாளர்",
      workspace: "நிறுவன பணிமனை",
      premiumWorkspace: "பிரீமியம் வர்த்தக பணிமனை",
      consoleTitle: "நிறுவன தீர்மான கட்டுப்பாட்டு மையம்",
      consoleDescription:
        "தொழில்முறை சந்தை நுண்ணறிவு, அபாயக் கட்டுப்பாடு, backtesting மற்றும் சிக்னல் ஒருங்கிணைப்பு.",
      systemStable: "கணினி நிலையானது",
      productionWorkspace: "தயாரிப்பு பணிமனை"
    },
    dashboard: {
      title: "நிர்வாக சந்தை கட்டுப்பாட்டு மையம்",
      subtitle: "கொழும்பு பங்குச் சந்தை நுண்ணறிவு, AI சிக்னல்கள் மற்றும் செயல்பாட்டு நிலை.",
      recommendationOnline: "பரிந்துரை இயந்திரம் செயல்பாட்டில்",
      riskMonitoring: "அபாய கண்காணிப்பு செயல்பாட்டில்",
      createAlert: "வர்த்தக எச்சரிக்கை உருவாக்கு",
      managedPortfolioValue: "மேலாண்மை போர்ட்ஃபோலியோ மதிப்பு",
      unrealizedPnl: "உணரப்படாத லாபம்/இழப்பு",
      riskPosture: "அபாய நிலை",
      sectorLeadership: "துறை முன்னிலை",
      sectorLeadershipDesc: "risk-on மற்றும் risk-off முன்னிலையை அடையாளம் காண துறை இயக்கம்.",
      executionTimeline: "நிறைவேற்றல் & வெளிப்பாடு காலவரிசை",
      executionTimelineDesc: "நாளாந்திர வெளிப்பாடு மற்றும் P/L பற்றிய விளக்கப் பார்வை.",
      tradingSignals: "முக்கிய வர்த்தக சிக்னல்கள்",
      tradingSignalsDesc: "ஆய்வாளருக்கான தயாரான முடிவு பட்டியல்.",
      actionBias: "நடவடிக்கை சாய்வு",
      momentumLong: "Momentum Long",
      meanReversion: "Mean Reversion கண்காணிப்பு",
      sectorAllocation: "துறை ஒதுக்கீடு",
      allocationDesc: "தற்போதைய போர்ட்ஃபோலியோ பல்வகைப்படுத்தல் நிலை.",
      liquidity: "திரவம் & திறன்",
      liquidityDesc: "புதிய யோசனைகள் மற்றும் எச்சரிக்கை சார்ந்த நுழைவுகளுக்கான பயன்பாட்டு திறன்.",
      availableCash: "கிடைக்கும் பணம்",
      mostActiveCounters: "அதிகச் செயல்பாட்டு பங்குகள்",
      portfolioMonitor: "போர்ட்ஃபோலியோ கண்காணிப்பு",
      portfolioMonitorDesc: "mark-to-market கண்காணிப்புடன் மையப் பங்குகள்.",
      counter: "பங்கு",
      qty: "அளவு",
      avgCost: "சராசரி செலவு",
      newsRadar: "செய்தி & உணர்வு ரேடார்",
      newsRadarDesc: "அறிவிப்புகள் மற்றும் சந்தை கதைகளிலிருந்து மொழி அடிப்படையிலான சிக்னல் ஆய்வு.",
      score: "மதிப்பெண்"
    },
    alerts: {
      title: "எச்சரிக்கை செயல்பாட்டு மையம்",
      subtitle: "விலை breakout, தொழில்நுட்ப நிபந்தனைகள் மற்றும் AI சிக்னல்களுக்கான பல சேனல் கண்காணிப்பு.",
      createRule: "எச்சரிக்கை விதி உருவாக்கு",
      configuredAlerts: "கட்டமைக்கப்பட்ட எச்சரிக்கைகள்",
      formTitle: "புதிய எச்சரிக்கை விதி",
      formSubtitle: "டாஷ்போர்டு ஆய்வுக்கும் எதிர்கால அறிவிப்பு ஓட்டங்களுக்கும் உள்ளூர் விதி ஒன்றை உருவாக்குங்கள்.",
      ruleCreated: "எச்சரிக்கை விதி வெற்றிகரமாக உருவாக்கப்பட்டது.",
      pause: "இடைநிறுத்து",
      activate: "செயல்படுத்து",
      channelEmail: "மின்னஞ்சல்",
      channelSms: "SMS",
      channelPush: "Push அறிவிப்பு"
    },
    news: {
      title: "செய்தி & உணர்வு நுண்ணறிவு",
      subtitle: "அறிவிப்புகள், வெளிப்படுத்தல்கள், நிதி அறிக்கைகள் மற்றும் சந்தை கதைமாற்றங்கள் குறித்த தரமான ஆய்வு.",
      allSentiments: "அனைத்து உணர்வுகள்",
      positive: "நேர்மறை",
      neutral: "நடுநிலை",
      negative: "எதிர்மறை",
      allSources: "அனைத்து மூலங்கள்",
      searchPlaceholder: "தலைப்புகள், சின்னங்கள் அல்லது சுருக்கங்களைத் தேடுங்கள்...",
      latestCoverage: "சமீபத்திய செய்திகள்",
      filtersApplied: "பயன்பாட்டிலுள்ள வடிகட்டல்கள்",
      newsLanguage: "செய்தி மொழி",
      noResults: "தற்போதைய வடிகட்டல்களுக்கு பொருந்தும் செய்தி இல்லை."
    },
    stock: {
      title: "மேம்பட்ட பங்கு பகுப்பாய்வு பணிமனை",
      subtitle: "விளக்கமான AI பரிந்துரைகள் மற்றும் தொழில்நுட்ப சிக்னல்களுடன் நிறுவன முடிவு ஆதரவு.",
      symbolLabel: "CSE சின்னம்",
      symbolHelper: "உதாரணம்: JKH.N0000, LOLC.N0000, SAMP.N0000",
      recommendation: "AI பரிந்துரை",
      confidence: "நம்பிக்கை",
      marketSnapshot: "சந்தை சுருக்கம்",
      marketSnapshotDesc: "நிலைத் தீர்மானத்திற்கான விலை வரம்பு, திரவம் மற்றும் 12 மாத சூழல்.",
      signalMatrix: "சிக்னல் அட்டவணை",
      signalMatrixDesc: "தன்னிச்சையான ஆய்வுக்கான கூட்டு குறியீட்டு நிலை.",
      indicatorReference: "குறியீட்டு குறிப்புகள்",
      indicatorReferenceDesc: "பரிந்துரை இயக்கிகளைப் புரிந்துகொள்ள விரைவு வர்த்தக குறிப்பேடு.",
      previousClose: "முந்தைய நிறைவு",
      intradayHigh: "நாள் உச்சம்",
      intradayLow: "நாள் தாழ்வு",
      high12m: "12 மாத உச்சம்",
      low12m: "12 மாத தாழ்வு",
      volume: "பரிவர்த்தனை அளவு",
      marketCap: "சந்தை மதிப்பு",
      failed: "பங்கை பகுப்பாய்வு செய்ய முடியவில்லை"
    }
  }
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getBrowserLanguage(): AppLanguage {
  const language = navigator.language.toLowerCase();
  if (language.startsWith("si")) return "si";
  if (language.startsWith("ta")) return "ta";
  return "en";
}

function resolveTranslation(tree: TranslationTree, key: string): string | undefined {
  return key.split(".").reduce<string | TranslationTree | undefined>((acc, part) => {
    if (!acc || typeof acc === "string") return undefined;
    return acc[part];
  }, tree) as string | undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AppLanguage | null;
    return stored ?? getBrowserLanguage();
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage: (nextLanguage) => setLanguageState(nextLanguage),
      t: (key) => resolveTranslation(translations[language], key) ?? resolveTranslation(translations.en, key) ?? key,
      languageLabel: (targetLanguage) =>
        ({
          en: "English",
          si: "සිංහල",
          ta: "தமிழ்"
        })[targetLanguage],
      formatNumber: (value, options) =>
        new Intl.NumberFormat(
          language === "si" ? "si-LK" : language === "ta" ? "ta-LK" : "en-LK",
          options
        ).format(value)
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
