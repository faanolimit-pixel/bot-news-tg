const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// GANTI TOKEN BOT KAMU DI SINI
const token = '8542375348:AAGzEaj-tlfgAJ0PArJPz-x9FQL3EcXyMNw';
const bot = new TelegramBot(token, { polling: true });

// API RESMI FOREX FACTORY (LINK AKTIF TERBARU)
const API_URL = 'https://nodedata.forexfactory.com/forex-calendar/this-week.json';
const CHATS_FILE = path.join(__dirname, 'chats.json');

// Memory Storage untuk Chat ID
let activeChatIds = new Set();

// Muat data chat tersimpan jika file ada
if (fs.existsSync(CHATS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
    if (Array.isArray(saved)) {
      saved.forEach(id => activeChatIds.add(String(id)));
    }
  } catch (e) {
    console.error('Info: Belum ada chats.json atau file corrupt, menggunakan memory RAM.');
  }
}

// Fungsi simpan ID Chat
function saveChats() {
  try {
    const dataArray = Array.from(activeChatIds);
    fs.writeFileSync(CHATS_FILE, JSON.stringify(dataArray, null, 2), 'utf8');
  } catch (e) {
    console.log('Storage note: Chat ID disimpan di memory RAM.');
  }
}

// Memory Cache Notifikasi
const reminded1HourNews = new Set();
const sentReleasedNews = new Set();

// Helper pembersih karakter HTML Telegram
function escapeHTML(str) {
  if (!str) return '-';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Helper Konversi Nilai Keuangan (K, M, B, %) ke Angka Murni
function parseFinancialNumber(valStr) {
  if (!valStr || valStr === '-') return NaN;
  let str = String(valStr).toUpperCase().trim();
  let multiplier = 1;

  if (str.endsWith('K')) {
    multiplier = 1000;
    str = str.slice(0, -1);
  } else if (str.endsWith('M')) {
    multiplier = 1000000;
    str = str.slice(0, -1);
  } else if (str.endsWith('B')) {
    multiplier = 1000000000;
    str = str.slice(0, -1);
  } else if (str.endsWith('%')) {
    str = str.slice(0, -1);
  }

  const cleanNum = parseFloat(str.replace(/[^0-9.-]/g, ''));
  return isNaN(cleanNum) ? NaN : cleanNum * multiplier;
}

// Helper Parsing Tanggal Aman
function parseNewsDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// Handle Error Polling Telegram
bot.on('polling_error', (error) => {
  console.error('Polling error Telegram:', error.code || error.message);
});

// 1. Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = String(msg.chat.id);
  if (!activeChatIds.has(chatId)) {
    activeChatIds.add(chatId);
    saveChats();
  }

  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const targetText = isGroup ? 'grup ini' : 'kamu';

  bot.sendMessage(
    msg.chat.id,
    `👋 <b>Bot News XAUUSD (Forex Factory) Aktif!</b>\n\n` +
    `Bot telah terhubung & terdaftar untuk <b>${targetText}</b>.\n\n` +
    `<b>Perintah:</b>\n` +
    `• /news - Lihat detail jadwal berita USD minggu ini\n` +
    `• /listnews - Ringkasan tanggal rilis berita\n\n` +
    `<b>Fitur Otomatis:</b>\n` +
    `1. ⏰ Peringatan ~1 jam sebelum berita High Impact USD rilis.\n` +
    `2. 🚨 Hasil Rilis (Actual) + Estimasi Signal Buy/Sell XAUUSD.`,
    { parse_mode: 'HTML' }
  ).catch(err => console.error('Gagal kirim /start:', err.message));
});

// 2. Command /listnews
bot.onText(/\/listnews/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!activeChatIds.has(chatId)) {
    activeChatIds.add(chatId);
    saveChats();
  }

  bot.sendMessage(msg.chat.id, '⏳ <i>Mengambil data Forex Factory...</i>', { parse_mode: 'HTML' })
    .catch(err => console.error(err.message));

  try {
    const response = await axios.get(API_URL, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    if (!Array.isArray(response.data)) {
      return bot.sendMessage(msg.chat.id, '❌ Format data dari Forex Factory sedang tidak sesuai.');
    }

    const events = response.data;
    const usdNews = events.filter(e => e.country === 'USD' && e.impact === 'High');

    if (usdNews.length === 0) {
      return bot.sendMessage(msg.chat.id, '🟢 Tidak ada berita High Impact USD minggu ini.');
    }

    const groupedByDate = {};
    usdNews.forEach((item) => {
      let dateKey = 'Tanggal Tidak Diketahui';
      const d = parseNewsDate(item.date);
      if (d) {
        dateKey = d.toLocaleDateString('id-ID', {
          timeZone: 'Asia/Jakarta',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }

      if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
      groupedByDate[dateKey].push(escapeHTML(item.title));
    });

    let message = '📅 <b>RINGKASAN TANGGAL BERITA HIGH IMPACT USD</b>\n\n';
    for (const [date, titles] of Object.entries(groupedByDate)) {
      message += `📆 <b>${date}</b>\n`;
      titles.forEach(t => message += `  • ${t}\n`);
      message += `\n`;
    }
    message += `💡 <i>Ketik /news untuk lihat jam rilis & detail forecast.</i>`;

    bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error fetch /listnews:', error.message);
    bot.sendMessage(msg.chat.id, '❌ Gagal terhubung ke Forex Factory. Coba lagi nanti.');
  }
});

// 3. Command /news
bot.onText(/\/news/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!activeChatIds.has(chatId)) {
    activeChatIds.add(chatId);
    saveChats();
  }

  bot.sendMessage(msg.chat.id, '⏳ <i>Mengambil detail berita XAUUSD...</i>', { parse_mode: 'HTML' })
    .catch(err => console.error(err.message));

  try {
    const response = await axios.get(API_URL, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!Array.isArray(response.data)) {
      return bot.sendMessage(msg.chat.id, '❌ Format data dari Forex Factory sedang tidak sesuai.');
    }

    const events = response.data;
    const usdNews = events.filter(e => e.country === 'USD' && e.impact === 'High');

    if (usdNews.length === 0) {
      return bot.sendMessage(msg.chat.id, '🟢 Tidak ada berita High Impact USD minggu ini.');
    }

    let message = '📊 <b>JADWAL BERITA HIGH IMPACT USD (XAUUSD)</b>\n\n';

    usdNews.forEach((item) => {
      const title = escapeHTML(item.title);
      const forecast = escapeHTML(item.forecast);
      const previous = escapeHTML(item.previous);
      
      let timeWIB = '-';
      const d = parseNewsDate(item.date);
      if (d) {
        timeWIB = d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
      }

      message += `📌 <b>${title}</b>\n`;
      message += `⏰ Waktu (WIB): ${timeWIB}\n`;
      message += `📈 Forecast: <code>${forecast}</code> | Prev: <code>${previous}</code>\n`;
      message += `-----------------------------------\n`;
    });

    bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error fetch /news:', error.message);
    bot.sendMessage(msg.chat.id, '❌ Gagal terhubung ke Forex Factory.');
  }
});

// 4. Auto-Check Loop
async function checkNewsAutomatically() {
  if (activeChatIds.size === 0) return;

  try {
    const response = await axios.get(API_URL, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!Array.isArray(response.data)) return;

    const events = response.data;
    const usdHighNews = events.filter(e => e.country === 'USD' && e.impact === 'High');
    const now = new Date();

    usdHighNews.forEach((item) => {
      const newsId = `${item.title}-${item.date}`;
      const newsTime = parseNewsDate(item.date);

      // A. PENGINGAT 1 JAM SEBELUM RILIS
      if (newsTime) {
        const diffInMinutes = Math.floor((newsTime.getTime() - now.getTime()) / (1000 * 60));

        if (diffInMinutes >= 50 && diffInMinutes <= 65 && !reminded1HourNews.has(newsId)) {
          reminded1HourNews.add(newsId);

          const title = escapeHTML(item.title);
          const forecast = escapeHTML(item.forecast);
          const previous = escapeHTML(item.previous);
          const timeWIB = newsTime.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

          let reminderMsg = `⏳ <b>PERINGATAN 1 JAM SEBELUM RILIS!</b>\n\n`;
          reminderMsg += `📌 <b>Berita:</b> ${title} (USD)\n`;
          reminderMsg += `⏰ <b>Waktu Rilis:</b> ${timeWIB} WIB\n`;
          reminderMsg += `📊 <b>Forecast:</b> <code>${forecast}</code> | <b>Previous:</b> <code>${previous}</code>\n\n`;
          reminderMsg += `⚠️ <i>Siapkan posisi & perhatikan MM di Gold (XAUUSD)!</i>`;

          activeChatIds.forEach((chatId) => {
            bot.sendMessage(chatId, reminderMsg, { parse_mode: 'HTML' })
              .catch(err => console.error(`Gagal kirim pengingat ke ${chatId}:`, err.message));
          });
        }
      }

      // B. HASIL RILIS (ACTUAL) + SIGNAL BUY / SELL
      if (item.actual && String(item.actual).trim() !== '' && !sentReleasedNews.has(newsId)) {
        sentReleasedNews.add(newsId);

        const title = escapeHTML(item.title);
        const actualStr = String(item.actual).trim();
        const forecastStr = String(item.forecast).trim();
        const previous = escapeHTML(item.previous);

        const actNum = parseFinancialNumber(actualStr);
        const fcastNum = parseFinancialNumber(forecastStr);

        let biasText = '❓ <b>Dampak Netral / Sesuai Ekspektasi</b>';

        if (!isNaN(actNum) && !isNaN(fcastNum)) {
          if (actNum > fcastNum) {
            biasText = '🔴 <b>USD Menguat (Actual > Forecast)</b>\n📊 <b>Estimasi Dampak XAUUSD:</b> 📉 <b>Cenderung SELL / TURUN</b>';
          } else if (actNum < fcastNum) {
            biasText = '🟢 <b>USD Melemah (Actual < Forecast)</b>\n📊 <b>Estimasi Dampak XAUUSD:</b> 📈 <b>Cenderung BUY / NAIK</b>';
          }
        }

        let alertMsg = `🚨 <b>BERITA RILIS! (XAUUSD Impact)</b>\n\n`;
        alertMsg += `📌 <b>${title}</b>\n\n`;
        alertMsg += `📊 <b>Hasil Rilis:</b>\n`;
        alertMsg += `• <b>Actual:</b> <code>${escapeHTML(actualStr)}</code>\n`;
        alertMsg += `• <b>Forecast:</b> <code>${escapeHTML(forecastStr)}</code>\n`;
        alertMsg += `• <b>Previous:</b> <code>${previous}</code>\n\n`;
        alertMsg += `${biasText}\n\n`;
        alertMsg += `⚠️ <i>Tetap padukan dengan analisa teknikal di chart!</i>`;

        activeChatIds.forEach((chatId) => {
          bot.sendMessage(chatId, alertMsg, { parse_mode: 'HTML' })
            .catch(err => console.error(`Gagal kirim hasil ke ${chatId}:`, err.message));
        });
      }
    });
  } catch (error) {
    console.error('Error auto checking news:', error.message);
  }
}

setInterval(checkNewsAutomatically, 60 * 1000);

console.log('Bot News XAUUSD siap dijalankan!');
