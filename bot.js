require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cron = require("node-cron");
const HttpsProxyAgent = require("https-proxy-agent");
const fs = require("fs");
const path = require("path");

// ------------------- HTTP Proxy -------------------
// const proxyAgent = new HttpsProxyAgent("http://10.12.173.164:10808");

// ------------------- Telegram Bot -------------------
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
  // ,
//   request: { agent: proxyAgent }
});


const NERKH_TOKEN = process.env.NERKH_TOKEN;

// ------------------- JSON Database -------------------
const usersFile = path.join(__dirname, "users.json");

function loadUsers() {
  if (!fs.existsSync(usersFile)) return [];
  const data = fs.readFileSync(usersFile);
  try {
    return JSON.parse(data).users || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify({ users }, null, 2));
}

let registeredChatIds = loadUsers();

// ------------------- Fetch Gold & Coins -------------------
async function fetchGoldData() {
  try {
    const res = await axios.get(
      "https://api.nerkh.io/v1/prices/json/gold",
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NERKH_TOKEN}`
        }
      }
    );
    return res.data.data.prices;
  } catch (err) {
    console.log("❌ Error fetching gold data:", err.message);
    return null;
  }
}

// ------------------- Fetch Currency -------------------
async function fetchCurrencyData() {
  try {
    const res = await axios.get(
      "https://api.nerkh.io/v1/prices/json/currency",
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NERKH_TOKEN}`
        }
      }
    );
    return res.data.data.prices;
  } catch (err) {
    console.log("❌ Error fetching currency data:", err.message);
    return null;
  }
}

// ------------------- Persian Number -------------------
function toPersianNumber(num) {
  return num.toString().replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

// ------------------- Build Message -------------------
function buildMessage(goldData, currencyData) {
  const now = new Date().toLocaleString("fa-IR");

  let message = `📊 گزارش قیمت‌ها\n🕒 زمان: ${now}\n\n`;

  // Gold
  message += "🥇 طلا:\n";
  if (goldData.GOLD18K) message += `18 عیار: ${toPersianNumber(goldData.GOLD18K.current)} تومان\n`;
  if (goldData.GOLD24K) message += `24 عیار: ${toPersianNumber(goldData.GOLD24K.current)} تومان\n`;

  // Coins
  message += "\n💰 سکه‌ها:\n";
  const coins = ["SEKE_1G","SEKE_BAHAR","SEKE_EMAMI","SEKE_NIM","SEKE_PRS100","SEKE_PRS200","SEKE_PRS400","SEKE_PRS500","SEKE_PRS700","SEKE_ROB"];
  coins.forEach(c => {
    if (goldData[c]) {
      const name = c.replace("SEKE_","سکه ").replace("_"," ");
      message += `${name}: ${toPersianNumber(goldData[c].current)} تومان\n`;
    }
  });

  // Currency
  message += "\n💵 ارزها:\n";
  const currencies = ["USD","EUR","GBP","TRY","AED"];
  currencies.forEach(cur => {
    if (currencyData[cur]) message += `${cur}: ${toPersianNumber(currencyData[cur].current)} تومان\n`;
  });

  return message;
}

// ------------------- Send Message to All -------------------
async function sendPricesToAll() {
  const goldData = await fetchGoldData();
  const currencyData = await fetchCurrencyData();
  if (!goldData || !currencyData) return;

  const message = buildMessage(goldData, currencyData);

  for (const id of registeredChatIds) {
    try {
      await bot.sendMessage(id, message);
      console.log(`Message sent to ${id} ✅`);
    } catch (err) {
      console.log(`❌ Error sending message to ${id}:`, err.message);
    }
  }
}

// ------------------- Handle /start -------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!registeredChatIds.includes(chatId)) {
    registeredChatIds.push(chatId);
    saveUsers(registeredChatIds);
    console.log("New user registered:", chatId);
  }
  bot.sendMessage(chatId, "سلام! از این به بعد قیمت‌ها هر 2 ساعت برایت ارسال می‌شوند ✅\nبا دستور /getnow می‌توانی هم‌اکنون قیمت‌ها را دریافت کنی.");
});

// ------------------- Handle /getnow -------------------
bot.onText(/\/getnow/, async (msg) => {
  const chatId = msg.chat.id;
  const goldData = await fetchGoldData();
  const currencyData = await fetchCurrencyData();
  if (!goldData || !currencyData) return;
  const message = buildMessage(goldData, currencyData);
  try {
    await bot.sendMessage(chatId, message);
    console.log(`Message sent to ${chatId} (getnow) ✅`);
  } catch (err) {
    console.log(`❌ Error sending message to ${chatId}:`, err.message);
  }
});

// ------------------- Schedule: every 2 hours -------------------
const cronExpression = "0 */2 * * *"; // every 2 hours
cron.schedule(cronExpression, () => {
  console.log("Sending prices to all users...");
  sendPricesToAll();
});

// ------------------- Initial send (optional) -------------------
sendPricesToAll();

console.log("bot is running... without proxy");
