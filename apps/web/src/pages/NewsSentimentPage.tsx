import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, CardContent, Chip, CircularProgress, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { fetchMarketNews } from "../api/marketDataApi";
import { useI18n } from "../i18n/I18nProvider";

export function NewsSentimentPage() {
  const { language, t } = useI18n();
  const [search, setSearch] = useState("");
  const [sentiment, setSentiment] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [scope, setScope] = useState<"local" | "world">("local");

  const newsQuery = useQuery({
    queryKey: ["news", scope, search],
    queryFn: () => fetchMarketNews({ scope, q: search || undefined, limit: 20 }),
    refetchInterval: 120_000
  });

  const sourceOptions = useMemo(() => ["ALL", ...new Set((newsQuery.data?.items ?? []).map((item) => item.source ?? "News"))], [newsQuery.data?.items]);

  const sentimentLabel = (value: "Positive" | "Neutral" | "Negative") => {
    if (value === "Positive") return t("news.positive");
    if (value === "Negative") return t("news.negative");
    return t("news.neutral");
  };

  const visibleNews = (newsQuery.data?.items ?? []).filter((item) => {
    const headline = item.title.toLowerCase();
    const summary = (item.summary ?? "").toLowerCase();
    const matchesSearch =
      !search ||
      headline.includes(search.toLowerCase()) ||
      summary.includes(search.toLowerCase()) ||
      (item.symbols ?? []).some((symbol) => symbol.toLowerCase().includes(search.toLowerCase()));
    const matchesSentiment = sentiment === "ALL" || item.sentiment === sentiment;
    const matchesSource = source === "ALL" || (item.source ?? "News") === source;
    return matchesSearch && matchesSentiment && matchesSource;
  });

  return (
    <Stack gap={3}>
      <Typography variant="h4">{t("news.title")}</Typography>
      <Typography color="text.secondary">
        {t("news.subtitle")}
      </Typography>

      <Stack direction={{ xs: "column", lg: "row" }} gap={2}>
        <TextField select label="Scope" value={scope} onChange={(event) => setScope(event.target.value as "local" | "world")} sx={{ minWidth: 160 }}>
          <MenuItem value="local">Local</MenuItem>
          <MenuItem value="world">World</MenuItem>
        </TextField>
        <TextField
          fullWidth
          label={t("common.search")}
          placeholder={t("news.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TextField select label={t("common.sentiment")} value={sentiment} onChange={(event) => setSentiment(event.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="ALL">{t("news.allSentiments")}</MenuItem>
          <MenuItem value="Positive">{t("news.positive")}</MenuItem>
          <MenuItem value="Neutral">{t("news.neutral")}</MenuItem>
          <MenuItem value="Negative">{t("news.negative")}</MenuItem>
        </TextField>
        <TextField select label={t("common.source")} value={source} onChange={(event) => setSource(event.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="ALL">{t("news.allSources")}</MenuItem>
          {sourceOptions.filter((item) => item !== "ALL").map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={() => { setSearch(""); setSentiment("ALL"); setSource("ALL"); }}>
          {t("common.reset")}
        </Button>
      </Stack>

      {newsQuery.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">{t("common.loading")}</Typography>
        </Stack>
      )}
      {newsQuery.error && <Alert severity="error">{(newsQuery.error as Error).message}</Alert>}

      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label={`${t("news.latestCoverage")}: ${visibleNews.length}`} color="primary" />
        <Chip label={`${t("news.newsLanguage")}: ${language.toUpperCase()}`} variant="outlined" />
        <Chip label={`Scope: ${scope}`} variant="outlined" />
        <Chip label={`${t("news.filtersApplied")}: ${[search && t("common.search"), sentiment !== "ALL" && t("common.sentiment"), source !== "ALL" && t("common.source")].filter(Boolean).length}`} variant="outlined" />
      </Stack>

      {visibleNews.length === 0 && <Typography color="text.secondary">{t("news.noResults")}</Typography>}

      {visibleNews.map((item) => (
        <Card key={item.link}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
              <Stack gap={1}>
                <Typography variant="h6">{item.title}</Typography>
                <Typography color="text.secondary">
                  {(item.symbols ?? []).join(", ") || "Market"} | {item.source ?? "News"} | {t("dashboard.score")} {(item.sentimentScore ?? 0).toFixed(2)} | {item.pubDate ? new Date(item.pubDate).toLocaleString() : "Latest"}
                </Typography>
                <Divider />
                <Typography>{item.summary ?? item.title}</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button variant="outlined" component="a" href={item.link} target="_blank" rel="noreferrer">
                    {t("common.openSource")}
                  </Button>
                  <Chip size="small" label={item.source ?? "News"} variant="outlined" />
                  {(item.symbols ?? []).map((symbol) => (
                    <Chip key={`${item.link}-${symbol}`} size="small" label={symbol} variant="outlined" />
                  ))}
                  {(item.keywords ?? []).slice(0, 3).map((keyword) => (
                    <Chip key={`${item.link}-${keyword}`} size="small" label={keyword} variant="outlined" />
                  ))}
                </Stack>
              </Stack>
              <Chip
                label={sentimentLabel(item.sentiment ?? "Neutral")}
                color={item.sentiment === "Positive" ? "success" : item.sentiment === "Negative" ? "error" : "warning"}
              />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
