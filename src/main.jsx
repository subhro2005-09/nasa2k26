import { render } from 'preact';
import App from './App.jsx';
import './styles/app.css';

render(<App />, document.getElementById('root'));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
