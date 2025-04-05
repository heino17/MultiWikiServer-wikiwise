// required by @angular/forms
import "@angular/compiler";
import { StrictMode, useEffect } from 'react';
import './styles/index.css';
import './styles/login.css';
import { createRoot } from 'react-dom/client';
import Login from './components/Login';
import { Frame } from './components/Frame/Frame';
import { DataLoader, getIndexJson, IndexJsonContext } from './helpers/utils';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
const theme = createTheme({
  palette: {
    background: {
      default: "#f0f0f0",
      paper: "#fff"
    }
  },

  colorSchemes: {
    dark: true,

  },
});
//https://v5.mui.com/material-ui/getting-started/

export const App = DataLoader(async () => {
  return await getIndexJson();
}, (indexJson, refresh, props) => {
  useEffect(() => { window.document.documentElement.classList.add("loaded"); }, []);

  return (
    <StrictMode>
      <ThemeProvider theme={theme} defaultMode="system" noSsr>
        <CssBaseline enableColorScheme />
        <IndexJsonContext.Provider value={[indexJson, refresh]}>
          {location.pathname === "/login" ? <Login /> : <Frame />}
        </IndexJsonContext.Provider>
      </ThemeProvider>
    </StrictMode>
    // <StrictMode>
    //   <ThemeProvider theme={theme}>
    //     <CssBaseline />
    //     {location.pathname === "/login" ? <Login /> : <Frame />}
    //   </ThemeProvider>
    // </StrictMode>
  );
});

(async () => {
  // const preload = document.getElementById('index-json')?.textContent;
  // const indexJson = preload ? JSON.parse(preload) : await (await fetch("/index.json")).json();
  createRoot(document.getElementById('root')!).render(<App />);
})();


class _Result<OK extends boolean, T> {
  constructor(
    public ok: OK,
    public error: OK extends true ? undefined : unknown,
    public value: OK extends true ? T : undefined
  ) { }

  get [Symbol.iterator]() { return [this.ok, this.error, this.value] }

  static ok<T>(value: T) {
    return new _Result(true, undefined, value)
  }
  static error(error: unknown) {
    return new _Result(false, error, undefined)
  }

  /**
   * @example
   * // const result = try something();
   * const result = Result.try_(() => {
   *   something();
   * });
   */
  static try_<T, This>(callback: (this: This) => T, thisarg: This) {
    try {
      return _Result.ok(callback.apply(thisarg));
    } catch (e) {
      return _Result.error(e);
    }
  }

}

(global as any).TryResult = _Result;
Promise.prototype.try = function <T>(this: Promise<T>) {
  return this.then(_Result.ok, _Result.error);
}
