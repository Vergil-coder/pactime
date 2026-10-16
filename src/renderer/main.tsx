import React from 'react';
import { createRoot } from 'react-dom/client';
import App, { Reminder } from './App';
import { ThemeProvider } from './theme';
import './styles.css';
if (location.hash === '#reminder') document.body.classList.add('reminder-window');
createRoot(document.getElementById('root')!).render(<React.StrictMode><ThemeProvider>{location.hash === '#reminder' ? <Reminder /> : <App />}</ThemeProvider></React.StrictMode>);
