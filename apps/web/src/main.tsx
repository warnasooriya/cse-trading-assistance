import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { store } from "./store/store";
import { appTheme } from "./theme";
import { AuthProvider } from "./auth/AuthProvider";

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ThemeProvider theme={appTheme}>
            <CssBaseline />
            <BrowserRouter>
              <AuthProvider>
                <App />
              </AuthProvider>
            </BrowserRouter>
          </ThemeProvider>
        </I18nProvider>
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
)
