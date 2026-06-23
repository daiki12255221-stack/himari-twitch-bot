import express from 'express';
import fs from 'fs';
import path from 'path';

// ====== 【ここにAPIキーやトークンを直接書き込んでください】 ======
const CLIENT_ID = "kz8uvhyodutzolak71mb0ykrfqd1c2";
const CLIENT_SECRET = "esp1w19jvrqug8fb9wgm8gvg76tvup";

const LINE_ACCESS_TOKEN = "HsDoSA+O/W4Z7s2LmpUSg4m/VO5ok0o/MRBnzPR+Bl183Kc7Lj8tKqyoEjQ4AyMpWhRdJ8ae7+gASbDzCVL/L8wUKVK4sikTTsNUgCJ8YPrS+1beXYsbZm5MZqW1MQzZ0C6wBTTK0bTnXx7yWKniQgdB04t89/1O/w1cDnyilFU=";
const LINE_USER_ID = "U273b8c7b36b2b330adda5b2458a8f446";

const CHATWORK_API_TOKEN = "47f3a071fe49e7259100d70071c986b7";
const CHATWORK_ROOM_ID = "440046837";

// YouTube APIキーが未取得（初期値のまま）ならあとでスキップするようにします
const YOUTUBE_API_KEY = "ここにYouTubeのAPI_KEYを書く";
// ============================================================

const UPLOADS_PLAYLIST_ID = "UUBA2EDiX5euSTM2Ic3gKqIw";
const STREAMER = "meimeihimari";

// 🔥【Vercel対応】ファイルの書き込み制限を回避するため、/tmp フォルダの中にキャッシュを作ります
const CACHE_FILE = path.join('/tmp', '.status_cache');

const app = express();

// 画面表示用のステータス文を一時保持する変数
let currentStatusText = "未チェック";

// キャッシュを読み込む関数（多重通知防止用）
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
      return { isLive: false, lastVideoId: "" };
    }
  }
  return { isLive: false, lastVideoId: "" };
}

// キャッシュを保存する関数
function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error("キャッシュの保存に失敗しました(Vercel環境):", e);
  }
}

// ---------------- LINE (既存機能維持) ----------------

async function sendLineMessage(message) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: LINE_USER_ID,
      messages: [
        {
          type: "text",
          text: message,
        },
      ],
    }),
  });

  console.log("LINE送信:", res.status);

  if (!res.ok) {
    console.log(await res.text());
  }
}

// ---------------- Chatwork (既存機能維持) ----------------

async function sendChatworkMessage(message) {
  const res = await fetch(
    `https://api.chatwork.com/v2/rooms/${CHATWORK_ROOM_ID}/messages`,
    {
      method: "POST",
      headers: {
        "X-ChatWorkToken": CHATWORK_API_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        body: message,
      }),
    }
  );

  console.log("Chatwork送信:", res.status);

  if (!res.ok) {
    console.log(await res.text());
  }
}

// ---------------- YouTube (既存機能維持 + 空欄スキップ機能追加) ----------------

async function checkYouTube(cache) {
  if (YOUTUBE_API_KEY === "ここにYouTubeのAPI_KEYを書く" || !YOUTUBE_API_KEY) {
    console.log("YouTube APIキーが設定されていないためスキップします");
    currentStatusText += "\n[YouTube] ⚠️APIキー未設定のためチェックをスキップしました";
    return;
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${UPLOADS_PLAYLIST_ID}&maxResults=1&key=${YOUTUBE_API_KEY}`
  );

  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    console.log("YouTube動画なし");
    currentStatusText += "\n[YouTube] 最新動画が見つかりませんでした。";
    return;
  }

  const video = data.items[0];
  const videoId = video.snippet.resourceId.videoId;

  const published = new Date(video.snippet.publishedAt);
  const now = new Date();

  const diffMinutes = (now - published) / 1000 / 60;

  console.log("最新動画:", video.snippet.title);
  console.log(`投稿から ${diffMinutes.toFixed(1)} 分`);

  if (diffMinutes <= 10) {
    const message =
`🎥 新しい動画が投稿されました！

📺 タイトル
${video.snippet.title}

🔗 https://youtu.be/${videoId}`;

    await sendLineMessage(message);
    await sendChatworkMessage(message);
    
    cache.lastVideoId = videoId;
    currentStatusText += `\n[YouTube] 新着動画を検知・通知しました！: 「${video.snippet.title}」`;
  } else {
    currentStatusText += `\n[YouTube] 最新動画: 「${video.snippet.title}」 (10分以上前の投稿のため通知対象外)`;
  }
}

// ---------------- Twitch (既存機能維持 + テスト用毎回通知モード) ----------------

async function getToken(cache) {
  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
    {
      method: "POST",
    }
  );

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const streamRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${STREAMER}`,
    {
      headers: {
        "Client-Id": CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const streamData = await streamRes.json();

  if (streamData.data.length > 0) {
    const stream = streamData.data[0];

    console.log("🔴 現在オンライン");
    console.log("タイトル:", stream.title);

    const message =
`🔴 冥鳴ひまり 配信中！【テスト通知】

🎮 タイトル
${stream.title}

👥 視聴者数
${stream.viewer_count}人

🔗 https://www.twitch.tv/${STREAMER}`;

    await sendLineMessage(message);
    await sendChatworkMessage(message);
    
    cache.isLive = true;
    currentStatusText = `[Twitch] 🔴現在配信中！ (テストモード：開くたびに毎回通知を送ります)\nタイトル: ${stream.title}`;

  } else {
    console.log("⚫ 現在オフライン");
    cache.isLive = false;
    currentStatusText = "[Twitch] ⚫現在オフラインです (配信が始まれば開くたびに通知がきます)";
  }
}

// ---------------- メイン処理 ----------------

async function main() {
  const cache = loadCache();
  
  await getToken(cache);
  await checkYouTube(cache);
  
  saveCache(cache);
}

// ---------------- Webサーバー設定 ----------------

app.get('/', async (req, res) => {
  const nowStr = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  console.log(`[${nowStr}] 定期チェックアクセスを受信（テストモード）`);
  
  try {
    currentStatusText = ""; 
    await main();
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(
`【Bot 動作チェックログ ★テストモード中★】
実行日時: ${nowStr}

現在のステータス:
--------------------------------------------
${currentStatusText}
--------------------------------------------
テストチェック完了。オンラインなら通知が飛んでいるはずです！`
    );
  } catch (error) {
    console.error("エラー発生:", error);
    res.status(500).send(`エラーが発生しました:\n${error.message}`);
  }
});

// 🔥【Vercel対応】app.listenを削除し、Expressのインスタンスをデフォルトエクスポートします
export default app;
