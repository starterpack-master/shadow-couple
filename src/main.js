import './style.css';
import { Game } from './game.js';

// iOS 사파리: 더블탭 확대/스크롤 방지
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

new Game(document.getElementById('c'));
