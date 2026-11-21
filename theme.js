/*
 * Madden League Trade Calculator - Light/Dark theme
 *
 * Loaded first so the stored preference is applied as early as possible.
 * The only browser storage this application uses is the theme preference
 * (localStorage key below). No trade data, session token, or credential is
 * ever written to browser storage.
 *
 * The Dark mode toggle button wiring lives in calculator-ui.js because it
 * uses the shared $ helper that file declares.
 */

// ----------------------------------------------------------------------------
// Theme preference (local persistence) and application
// ----------------------------------------------------------------------------

const THEME_KEY='madden-trade-theme';

function readStoredTheme() {
  try {
    let value=localStorage.getItem(THEME_KEY);
    return value==='dark'||value==='light'?value:null
  } catch {
    return null
  }
}

function applyTheme(theme,{persist=true}={}) {
  let next=theme==='dark'?'dark':'light';
  document.documentElement.dataset.theme=next;
  document.documentElement.style.colorScheme=next;
  let control=document.querySelector('#themeToggle');
  if(control) {
    control.textContent=next==='dark'?'Light mode':'Dark mode';
    control.setAttribute('aria-pressed',String(next==='dark'));
    control.setAttribute('aria-label',next==='dark'?'Switch to light mode':'Switch to dark mode')
  }
  if(persist) {
    try {
      localStorage.setItem(THEME_KEY,next)
    } catch {}
  }
}

// ----------------------------------------------------------------------------
// Apply the stored theme on load
// ----------------------------------------------------------------------------

applyTheme(readStoredTheme()||'light',{persist:false});
