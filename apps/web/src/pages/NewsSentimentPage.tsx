import { useMemo, useState } from "react";
import { Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { sentimentFeed } from "../data/enterpriseMock";
import { useI18n } from "../i18n/I18nProvider";

export function NewsSentimentPage() {
  const { language, t } = useI18n();
  const [search, setSearch] = useState("");
  const [sentiment, setSentiment] = useState("ALL");
  const [source, setSource] = useState("ALL");

  const sourceOptions = useMemo(() => ["ALL", ...new Set(sentimentFeed.map((item) => item.source))], []);

  const sentimentLabel = (value: "Positive" | "Neutral" | "Negative") => {
    if (value === "Positive") return t("news.positive");
    if (value === "Negative") return t("news.negative");
    return t("news.neutral");
  };

  const visibleNews = sentimentFeed.filter((item) => {
    const localizedHeadline = item.headline[language].toLowerCase();
    const localizedSummary = item.summary[language].toLowerCase();
    const matchesSearch =
      !search ||
      localizedHeadline.includes(search.toLowerCase()) ||
      localizedSummary.includes(search.toLowerCase()) ||
      item.symbol.toLowerCase().includes(search.toLowerCase());
    const matchesSentiment = sentiment === "ALL" || item.sentiment === sentiment;
    const matchesSource = source === "ALL" || item.source === source;
    return matchesSearch && matchesSentiment && matchesSource;
  });

  return (
    <Stack gap={3}>
      <Typography variant="h4">{t("news.title")}</Typography>
      <Typography color="text.secondary">
        {t("news.subtitle")}
      </Typography>

      <Stack direction={{ xs: "column", lg: "row" }} gap={2}>
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

      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label={`${t("news.latestCoverage")}: ${visibleNews.length}`} color="primary" />
        <Chip label={`${t("news.newsLanguage")}: ${language.toUpperCase()}`} variant="outlined" />
        <Chip label={`${t("news.filtersApplied")}: ${[search && t("common.search"), sentiment !== "ALL" && t("common.sentiment"), source !== "ALL" && t("common.source")].filter(Boolean).length}`} variant="outlined" />
      </Stack>

      {visibleNews.length === 0 && <Typography color="text.secondary">{t("news.noResults")}</Typography>}

      {visibleNews.map((item) => (
        <Card key={item.id}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
              <Stack gap={1}>
                <Typography variant="h6">{item.headline[language]}</Typography>
                <Typography color="text.secondary">
                  {item.symbol} | {item.source} | {t("dashboard.score")} {item.score.toFixed(2)} | {new Date(item.publishedAt).toLocaleString()}
                </Typography>
                <Divider />
                <Typography>{item.summary[language]}</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button variant="outlined" component="a" href={item.url} target="_blank" rel="noreferrer">
                    {t("common.openSource")}
                  </Button>
                  <Chip size="small" label={item.source} variant="outlined" />
                  <Chip size="small" label={item.symbol} variant="outlined" />
                </Stack>
              </Stack>
              <Chip
                label={sentimentLabel(item.sentiment)}
                color={item.sentiment === "Positive" ? "success" : item.sentiment === "Negative" ? "error" : "warning"}
              />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
