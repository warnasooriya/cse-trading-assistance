import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#63a4ff"
    },
    secondary: {
      main: "#2dd4bf"
    },
    error: {
      main: "#ff5f7a"
    },
    warning: {
      main: "#ffbc5c"
    },
    success: {
      main: "#34d399"
    },
    background: {
      default: "#050b16",
      paper: "#0b1422"
    },
    text: {
      primary: "#f6f9ff",
      secondary: "#94a6c8"
    },
    divider: alpha("#7d8fb3", 0.18)
  },
  shape: {
    borderRadius: 20
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h3: {
      fontWeight: 800,
      letterSpacing: -0.8
    },
    h4: {
      fontWeight: 800,
      letterSpacing: -0.6
    },
    h5: {
      fontWeight: 800,
      letterSpacing: -0.4
    },
    h6: {
      fontWeight: 700
    },
    subtitle1: {
      fontWeight: 600
    },
    button: {
      textTransform: "none",
      fontWeight: 600
    }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at top left, rgba(99,164,255,0.14), transparent 26%), radial-gradient(circle at top right, rgba(45,212,191,0.10), transparent 18%), linear-gradient(180deg, #050b16 0%, #07101d 100%)"
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          background:
            "linear-gradient(180deg, rgba(14,24,40,0.92) 0%, rgba(11,20,34,0.94) 100%)",
          border: `1px solid ${alpha("#a4badf", 0.10)}`,
          boxShadow: "0 18px 50px rgba(1, 6, 16, 0.32)"
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 16,
            backgroundColor: alpha("#ffffff", 0.02)
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true
      }
    }
  }
});
