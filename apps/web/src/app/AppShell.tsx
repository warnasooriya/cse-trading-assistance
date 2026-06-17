import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import AutoGraphOutlinedIcon from "@mui/icons-material/AutoGraphOutlined";
import NewspaperOutlinedIcon from "@mui/icons-material/NewspaperOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import CandlestickChartOutlinedIcon from "@mui/icons-material/CandlestickChartOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import TableViewOutlinedIcon from "@mui/icons-material/TableViewOutlined";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import { alpha } from "@mui/material/styles";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { AppLanguage } from "../i18n/I18nProvider";
import { useI18n } from "../i18n/I18nProvider";
import { useAuth } from "../auth/AuthProvider";

const SIDEBAR_WIDTH = 288;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();
  const { state: authState, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsAnchor, setSettingsAnchor] = useState<null | HTMLElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isAuthed = authState.status === "authenticated";
  const userLabel = isAuthed ? (authState.user.displayName ?? authState.user.email ?? "User") : "Guest";
  const userSubLabel = isAuthed ? (authState.user.email ?? "") : "Sign in to save settings";
  const userInitials = (() => {
    const text = isAuthed ? (authState.user.displayName ?? authState.user.email ?? "U") : "G";
    const parts = text.split(/[\s@._-]+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
    return letters.join("") || "U";
  })();

  const navigation = useMemo(
    () => [
      {
        title: t("shell.marketIntelligence"),
        items: [
          { label: t("shell.executiveDashboard"), to: "/", icon: <DashboardOutlinedIcon /> },
          { label: "Trade Ideas", to: "/suggestions", icon: <CandlestickChartOutlinedIcon /> },
          { label: "Full Market Watch", to: "/market-watch", icon: <TableViewOutlinedIcon /> },
          { label: "Watchlists", to: "/watchlists", icon: <NotificationsActiveOutlinedIcon /> },
          { label: t("shell.stockAnalysis"), to: "/stocks", icon: <InsightsOutlinedIcon /> },
          { label: t("shell.newsSentiment"), to: "/news", icon: <NewspaperOutlinedIcon /> }
        ]
      },
      {
        title: t("shell.portfolioRisk"),
        items: [
          { label: t("shell.portfolioCommand"), to: "/portfolio", icon: <AccountBalanceWalletOutlinedIcon /> },
          { label: "Profit Simulator", to: "/profit-simulator", icon: <CalculateOutlinedIcon /> },
          { label: t("shell.riskCenter"), to: "/risk", icon: <SecurityOutlinedIcon /> },
          { label: t("shell.alerts"), to: "/alerts", icon: <NotificationsActiveOutlinedIcon /> }
        ]
      },
      {
        title: t("shell.strategyLab"),
        items: [{ label: t("shell.backtesting"), to: "/backtests", icon: <AutoGraphOutlinedIcon /> }]
      }
    ],
    [t]
  );

  const runSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    const normalized = query.toLowerCase();
    const routeMap: Record<string, string> = {
      watch: "/market-watch",
      market: "/market-watch",
      idea: "/suggestions",
      ideas: "/suggestions",
      suggest: "/suggestions",
      suggestions: "/suggestions",
      watchlist: "/watchlists",
      watchlists: "/watchlists",
      news: "/news",
      alert: "/alerts",
      alerts: "/alerts",
      risk: "/risk",
      portfolio: "/portfolio",
      simulator: "/profit-simulator",
      profit: "/profit-simulator",
      backtest: "/backtests",
      backtesting: "/backtests",
      stock: "/stocks"
    };
    const matchedRoute = Object.entries(routeMap).find(([keyword]) => normalized.includes(keyword))?.[1];
    if (matchedRoute) {
      navigate(matchedRoute);
      return;
    }
    navigate(`/stocks?symbol=${encodeURIComponent(query.toUpperCase())}`);
  };

  const sidebarContent = (
    <Stack spacing={2} sx={{ height: "100%" }}>
      <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
        {navigation.map((section) => (
          <Box key={section.title} sx={{ mb: 1.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ pl: 1.5, letterSpacing: 1 }}>
              {section.title}
            </Typography>
            <List disablePadding sx={{ mt: 1.25 }}>
              {section.items.map((item) => (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  selected={location.pathname === item.to}
                  sx={{
                    mb: 0.75,
                    px: 1.5,
                    py: 1.15,
                    borderRadius: 3,
                    color: "text.secondary",
                    transition: "all 180ms ease",
                    "&:hover": {
                      bgcolor: alpha("#ffffff", 0.04),
                      color: "text.primary",
                      transform: "translateX(2px)"
                    },
                    "&.Mui-selected": {
                      color: "text.primary",
                      background:
                        "linear-gradient(90deg, rgba(79,140,255,0.20), rgba(79,140,255,0.06))",
                      border: `1px solid ${alpha("#4f8cff", 0.22)}`,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)"
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          p: 2.5,
          zIndex: 1200,
          borderRight: `1px solid ${alpha("#b7c7ea", 0.08)}`,
          background:
            "linear-gradient(180deg, rgba(7,17,31,0.98) 0%, rgba(9,18,34,0.96) 100%)",
          backdropFilter: "blur(18px)",
          display: { xs: "none", lg: "block" }
        }}
      >
        {sidebarContent}
      </Box>

      <Drawer
        anchor="left"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        sx={{
          display: { xs: "block", lg: "none" },
          "& .MuiDrawer-paper": {
            width: Math.min(SIDEBAR_WIDTH, 320),
            p: 2,
            bgcolor: "#091322",
            backgroundImage: "none"
          }
        }}
      >
        {sidebarContent}
      </Drawer>

      <Box sx={{ ml: { xs: 0, lg: `${SIDEBAR_WIDTH}px` }, minHeight: "100vh" }}>
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 1100,
            px: { xs: 2.5, xl: 4 },
            py: 2.25,
            borderBottom: `1px solid ${alpha("#b7c7ea", 0.08)}`,
            background: alpha("#08111f", 0.72),
            backdropFilter: "blur(18px)"
          }}
        >
          <Toolbar disableGutters sx={{ gap: 2, alignItems: "center" }}>
            <IconButton
              color="inherit"
              onClick={() => setMobileNavOpen(true)}
              sx={{ display: { xs: "inline-flex", lg: "none" } }}
            >
              <MenuOutlinedIcon />
            </IconButton>
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 2,
                py: 1.2,
                borderRadius: 999,
                border: `1px solid ${alpha("#b7c7ea", 0.08)}`,
                bgcolor: alpha("#ffffff", 0.04),
                maxWidth: 480,
                minWidth: 0
              }}
            >
              <SearchOutlinedIcon fontSize="small" color="inherit" />
              <InputBase
                placeholder={t("shell.searchPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runSearch();
                  }
                }}
                sx={{ flex: 1 }}
              />
              <Tooltip title={t("common.search")}>
                <IconButton size="small" onClick={runSearch}>
                  <SearchOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <Stack direction="row" spacing={1} sx={{ display: { xs: "none", md: "flex" }, flexShrink: 0 }}>
              <Chip size="small" label={t("shell.aspiFeedLive")} color="primary" variant="outlined" />
              <Chip size="small" label={t("shell.executionManual")} variant="outlined" />
            </Stack>

            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
              <FormControl size="small" sx={{ minWidth: 120, flexShrink: 0 }}>
              <Select
                value={language}
                onChange={(event) => setLanguage(event.target.value as AppLanguage)}
                displayEmpty
                sx={{ borderRadius: 999, bgcolor: alpha("#ffffff", 0.02) }}
              >
                {(["en", "si", "ta"] as AppLanguage[]).map((option) => (
                  <MenuItem key={option} value={option}>
                    {option.toUpperCase()} - {option === "en" ? "English" : option === "si" ? "සිංහල" : "தமிழ்"}
                  </MenuItem>
                ))}
              </Select>
              </FormControl>

              <Tooltip title={t("common.notifications")}>
                <IconButton color="inherit" onClick={() => navigate("/alerts")}>
                  <Badge badgeContent={4} color="error">
                    <NotificationsOutlinedIcon />
                  </Badge>
                </IconButton>
              </Tooltip>

              <Tooltip title={t("common.settings")}>
                <IconButton color="inherit" onClick={(event) => setSettingsAnchor(event.currentTarget)}>
                  <SettingsOutlinedIcon />
                </IconButton>
              </Tooltip>

              <Divider orientation="vertical" flexItem sx={{ borderColor: alpha("#fff", 0.08), display: { xs: "none", sm: "block" } }} />

              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flexShrink: 0 }}>
                <Button
                  onClick={() => navigate(isAuthed ? "/profile" : "/login")}
                  sx={{
                    p: 0,
                    minWidth: 0,
                    textTransform: "none",
                    color: "inherit",
                    justifyContent: "flex-end",
                    ml: "auto"
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                    <Avatar sx={{ width: 40, height: 40, bgcolor: "primary.main", flexShrink: 0 }}>{userInitials}</Avatar>
                    <Box
                      sx={{
                        minWidth: 0,
                        textAlign: "left",
                        display: { xs: "none", sm: "block" }
                      }}
                    >
                      <Typography variant="subtitle2" noWrap>
                        {userLabel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {userSubLabel}
                      </Typography>
                    </Box>
                  </Stack>
                </Button>
              </Stack>
            </Box>
          </Toolbar>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {t("shell.searchHelp")}
          </Typography>
        </Box>

        <Box sx={{ px: { xs: 2.5, lg: 4 }, py: 3.5 }}>
          <Box
            sx={{
              maxWidth: 1680,
              mx: "auto",
              p: { xs: 0, md: 1 },
              borderRadius: 6
            }}
          >
            <Stack spacing={3} sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: { xs: "flex-start", lg: "center" },
                  justifyContent: "space-between",
                  gap: 2,
                  flexDirection: { xs: "column", lg: "row" }
                }}
              >
               
                 
              </Box>
            </Stack>
          <Outlet />
          </Box>
        </Box>
      </Box>
      <Menu
        anchorEl={settingsAnchor}
        open={Boolean(settingsAnchor)}
        onClose={() => setSettingsAnchor(null)}
      >
        {isAuthed ? (
          <MenuItem
            onClick={() => {
              navigate("/profile");
              setSettingsAnchor(null);
            }}
          >
            Profile
          </MenuItem>
        ) : (
          <>
            <MenuItem
              onClick={() => {
                navigate("/login");
                setSettingsAnchor(null);
              }}
            >
              Sign In
            </MenuItem>
            <MenuItem
              onClick={() => {
                navigate("/register");
                setSettingsAnchor(null);
              }}
            >
              Create Account
            </MenuItem>
          </>
        )}
        <MenuItem
          onClick={() => {
            navigate("/news");
            setSettingsAnchor(null);
          }}
        >
          {t("shell.newsSentiment")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            navigate("/market-watch");
            setSettingsAnchor(null);
          }}
        >
          Full Market Watch
        </MenuItem>
        <MenuItem
          onClick={() => {
            navigate("/portfolio");
            setSettingsAnchor(null);
          }}
        >
          {t("shell.portfolioCommand")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            navigate("/risk");
            setSettingsAnchor(null);
          }}
        >
          {t("shell.riskCenter")}
        </MenuItem>
        {isAuthed && (
          <MenuItem
            onClick={() => {
              logout();
              navigate("/");
              setSettingsAnchor(null);
            }}
          >
            Sign Out
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
