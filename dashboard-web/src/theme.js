import { defaultTheme } from 'react-admin'

export const theme = {
  ...defaultTheme,
  palette: {
    ...defaultTheme.palette,
    primary: {
      main: '#c52222', // Primary brand red
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#a36b16', // Amber accent
      contrastText: '#ffffff',
    },
    background: {
      default: '#f9fafb',
    },
  },
  components: {
    ...defaultTheme.components,
    MuiAppBar: {
      styleOverrides: {
        root: {
          // Applies your gradient across the top bar
          background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%) !important',
          color: '#ffffff !important',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        },
      },
    },
    // Optional: Keep toolbar icons and hamburger menu crisp white
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: 'inherit',
        },
      },
    },
  },
}