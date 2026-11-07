import {createRoot} from 'react-dom/client';
import './lib/appkit';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
