import { Navigate, Route, Routes } from "react-router-dom";
import { AlertsPage } from "./pages/AlertsPage";
import { AppShell } from "./app/AppShell";
import { BacktestPage } from "./pages/BacktestPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MarketWatchPage } from "./pages/MarketWatchPage";
import { NewsSentimentPage } from "./pages/NewsSentimentPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { RiskPage } from "./pages/RiskPage";
import { StockAnalysisPage } from "./pages/StockAnalysisPage";
import { SuggestionsPage } from "./pages/SuggestionsPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ProfilePage } from "./pages/ProfilePage";
import { WatchlistsPage } from "./pages/WatchlistsPage";
import { RequireAuth } from "./auth/RequireAuth";
import { ProfitSimulatorPage } from "./pages/ProfitSimulatorPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/suggestions"
          element={
            <RequireAuth feature="Trade Ideas">
              <SuggestionsPage />
            </RequireAuth>
          }
        />
        <Route path="/market-watch" element={<MarketWatchPage />} />
        <Route
          path="/watchlists"
          element={
            <RequireAuth feature="Watchlists">
              <WatchlistsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/stocks"
          element={
            <RequireAuth feature="Stock Analysis">
              <StockAnalysisPage />
            </RequireAuth>
          }
        />
        <Route
          path="/portfolio"
          element={
            <RequireAuth feature="Portfolio Command">
              <PortfolioPage />
            </RequireAuth>
          }
        />
        <Route path="/risk" element={<RiskPage />} />
        <Route
          path="/alerts"
          element={
            <RequireAuth feature="Create Alert Rules">
              <AlertsPage />
            </RequireAuth>
          }
        />
        <Route path="/news" element={<NewsSentimentPage />} />
        <Route path="/backtests" element={<BacktestPage />} />
        <Route
          path="/profit-simulator"
          element={
            <RequireAuth feature="Profit Simulator">
              <ProfitSimulatorPage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
