import './css/app.css';
import './js/api.js';
import './js/s3.js';
import './js/reader.js';
import './js/app.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/apps/boox/api/sw.js', { scope: '/apps/boox/' });
}
