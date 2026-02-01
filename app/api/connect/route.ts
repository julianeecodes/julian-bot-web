import { NextResponse } from 'next/server';
import makeWASocket, { useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

// --- CONFIG PATH ---
const SESSION_DIR = 'auth_info_baileys';
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

// --- HELPER FUNCTIONS ---
const loadJSON = (filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath));
        // Default settings
        if (filePath.includes('settings')) {
             const def = { status_bot: "ON" }; 
             fs.writeFileSync(filePath, JSON.stringify(def, null, 2));
             return def;
        }
        fs.writeFileSync(filePath, '{}');
        return {};
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) { return {}; }
};

const saveJSON = (filePath: string, data: any) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

let sock: any = null;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { phoneNumber } = body;
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (phoneNumber.startsWith('0')) phoneNumber = '62' + phoneNumber.slice(1);

    const startSock = async () => {
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

      sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        logger: pino({ level: 'silent' }) as any,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false, 
      });

      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
          if (shouldReconnect) startSock();
        } else if (connection === 'open') {
          console.log('✅ BOT DATABASE GLOBAL: ONLINE!');
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
        const msg = messages[0];
        if (!msg.message) return;

        // Izinkan pesan dari Orang Lain (notify) ATAU dari Diri Sendiri (fromMe)
        const isFromMe = msg.key.fromMe;
        
        if (type === 'notify' || isFromMe) { 
          const pesanMasuk = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
          const remoteJid = msg.key.remoteJid!;

          if (pesanMasuk) {
             const text = pesanMasuk; 
             const command = text.split(' ')[0].toLowerCase();
             
             // Cek Status Bot (ON/OFF) via file settings
             const settings = loadJSON(SETTINGS_PATH);
             if (settings.status_bot === "OFF" && !isFromMe) return;

             // Proteksi Loop: Jangan respon pesan sendiri KECUALI diawali titik (Command)
             if (isFromMe && !text.startsWith('.')) return;

             console.log(`📩 Pesan Masuk: ${text}`);

             // --- FITUR DATABASE GLOBAL ---

             // 1. TAMBAH DATA (.addglobal keyword | isi)
             if (command === '.addglobal' || command === '.add') {
                 const isi = text.replace(command, '').trim(); // Hapus command
                 const args = isi.split('|'); // Pisahkan dengan garis lurus
                 
                 if (args.length < 2) {
                     await sock.sendMessage(remoteJid, { text: "❌ Format Salah!\n\nContoh:\n.addglobal menu | Nasi Goreng 15k\n.addglobal salam | Halo selamat pagi!" });
                     return;
                 }

                 const kunci = args[0].trim().toLowerCase();
                 const jawaban = args[1].trim();

                 const db = loadJSON(DB_PATH);
                 db[kunci] = jawaban;
                 saveJSON(DB_PATH, db);

                 await sock.sendMessage(remoteJid, { text: `✅ Berhasil Disimpan!\n\nKetik *${kunci}* untuk mengetes.` });
                 return;
             }

             // 2. HAPUS DATA (.delglobal keyword)
             if (command === '.delglobal' || command === '.del') {
                 const kunci = text.replace(command, '').trim().toLowerCase();
                 
                 const db = loadJSON(DB_PATH);
                 if (db[kunci]) {
                     delete db[kunci];
                     saveJSON(DB_PATH, db);
                     await sock.sendMessage(remoteJid, { text: `🗑️ Keyword '${kunci}' telah dihapus.` });
                 } else {
                     await sock.sendMessage(remoteJid, { text: "⚠️ Keyword tidak ditemukan." });
                 }
                 return;
             }

             // 3. LIHAT SEMUA DATA (.list)
             if (command === '.list' || command === '.menu') {
                 const db = loadJSON(DB_PATH);
                 const keys = Object.keys(db);
                 
                 if (keys.length === 0) {
                     await sock.sendMessage(remoteJid, { text: "📂 Database Kosong." });
                 } else {
                     let daftar = "📋 *LIST KEYWORD:*\n(Ketik kata ini, bot akan membalas)\n\n";
                     keys.forEach((k, index) => {
                         daftar += `${index + 1}. ${k}\n`;
                     });
                     await sock.sendMessage(remoteJid, { text: daftar });
                 }
                 return;
             }

             // 4. CEK ID (.cekid)
             if (command === '.cekid') {
                 await sock.sendMessage(remoteJid, { text: "🤖 Bot Online!" });
                 return;
             }

             // --- AUTO REPLY (GLOBAL) ---
             // Cek apakah pesan user ada di database?
             const db = loadJSON(DB_PATH);
             const keywordCek = text.toLowerCase();
             
             if (db[keywordCek]) {
                 await sock.sendMessage(remoteJid, { text: db[keywordCek] });
             }
          }
        }
      });
    };

    if (!sock) await startSock();
    
    if (!sock.authState.creds.registered) {
       await new Promise(r => setTimeout(r, 5000));
       try {
         const code = await sock.requestPairingCode(phoneNumber);
         return NextResponse.json({ success: true, pairingCode: code?.match(/.{1,4}/g)?.join("-") || code });
       } catch (err) { return NextResponse.json({ error: 'Gagal' }, { status: 500 }); }
    } else {
       return NextResponse.json({ success: true, message: "Connected" });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}