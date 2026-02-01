const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const fs = require('fs'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- KONFIGURASI DATABASE ---
const DB_FILE = './database.json';
let globalCommands = {};

// Fungsi Membaca Database saat Server Nyala
const loadDatabase = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE);
            globalCommands = JSON.parse(data);
            console.log('✅ Database Command Berhasil Dimuat:', Object.keys(globalCommands).length, 'perintah.');
        } else {
            fs.writeFileSync(DB_FILE, '{}'); // Buat file jika belum ada
        }
    } catch (err) {
        console.error('Gagal memuat database:', err);
    }
};

// Fungsi Menyimpan Database
const saveDatabase = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(globalCommands, null, 2));
    } catch (err) {
        console.error('Gagal menyimpan database:', err);
    }
};

// Muat database pertama kali
loadDatabase();

let sock; 

async function startSock(phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                io.emit('log', `⚠️ Reconnecting...`);
                startSock(phoneNumber);
            } else {
                io.emit('log', `🔴 Terputus (Logout).`);
                io.emit('status', 'DISCONNECTED');
            }
        } else if (connection === 'open') {
            io.emit('status', 'CONNECTED');
            io.emit('log', '✅ Bot Online & Siap!');
        }
    });

    if (!sock.authState.creds.registered && phoneNumber) {
        setTimeout(async () => {
            try {
                const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanNumber);
                io.emit('pairing_code', code);
            } catch (err) {}
        }, 3000);
    }

    // --- LOGIKA PESAN (Updated) ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe || type !== 'notify') return;

            const messageType = Object.keys(m.message)[0];
            const textMessage = messageType === 'conversation' ? m.message.conversation : 
                                messageType === 'extendedTextMessage' ? m.message.extendedTextMessage.text : 
                                m.message.imageMessage?.caption || "";

            if (!textMessage) return;

            const sender = m.key.remoteJid;
            const senderClean = sender.split('@')[0];
            const chatFrom = m.key.remoteJid.endsWith('@g.us') ? 'Grup' : 'Pribadi';

            console.log(`[${chatFrom}] ${senderClean}: ${textMessage}`);
            io.emit('log', `📩 [${chatFrom}] ${senderClean}: "${textMessage}"`);

            // --- ADMIN COMMANDS (ADD/DEL/UPDATE) ---
            
            // 1. ADD GLOBAL (.addglobal trigger | respon)
            if (textMessage.toLowerCase().startsWith('.addglobal ')) {
                const args = textMessage.slice(11).split('|'); // Potong setelah ".addglobal "
                if (args.length < 2) {
                    return await sock.sendMessage(sender, { text: '❌ Format Salah!\nContoh: *.addglobal 10 | hallo*' }, { quoted: m });
                }
                
                const trigger = args[0].trim().toLowerCase(); // Kunci (misal: "10")
                const response = args.slice(1).join('|').trim(); // Jawaban (misal: "hallo")

                globalCommands[trigger] = response; // Simpan ke memori
                saveDatabase(); // Simpan ke file

                return await sock.sendMessage(sender, { text: `✅ Berhasil menambahkan perintah global:\n\nKunci: *${trigger}*\nRespon: ${response}` }, { quoted: m });
            }

            // 2. DEL GLOBAL (.delglobal trigger)
            if (textMessage.toLowerCase().startsWith('.delglobal ')) {
                const trigger = textMessage.slice(11).trim().toLowerCase();
                
                if (globalCommands[trigger]) {
                    delete globalCommands[trigger]; // Hapus dari memori
                    saveDatabase(); // Simpan ke file
                    return await sock.sendMessage(sender, { text: `🗑️ Perintah *${trigger}* telah dihapus dari global.` }, { quoted: m });
                } else {
                    return await sock.sendMessage(sender, { text: `❌ Perintah *${trigger}* tidak ditemukan.` }, { quoted: m });
                }
            }

            // 3. UPDATE GLOBAL (.updateglobal trigger | respon baru)
            if (textMessage.toLowerCase().startsWith('.updateglobal ')) {
                const args = textMessage.slice(14).split('|');
                if (args.length < 2) return await sock.sendMessage(sender, { text: '❌ Format Salah!\nContoh: *.updateglobal 10 | hallo bos*' }, { quoted: m });

                const trigger = args[0].trim().toLowerCase();
                const newResponse = args.slice(1).join('|').trim();

                if (globalCommands[trigger]) {
                    globalCommands[trigger] = newResponse;
                    saveDatabase();
                    return await sock.sendMessage(sender, { text: `✏️ Perintah *${trigger}* berhasil diupdate!` }, { quoted: m });
                } else {
                    return await sock.sendMessage(sender, { text: `❌ Perintah *${trigger}* belum ada. Gunakan .addglobal dulu.` }, { quoted: m });
                }
            }

            // 4. CEK LIST COMMAND (.listcmd)
            if (textMessage.toLowerCase() === '.listcmd') {
                const keys = Object.keys(globalCommands);
                let txt = `📜 *LIST PERINTAH GLOBAL*\nTotal: ${keys.length}\n\n`;
                keys.forEach((k, i) => { txt += `${i+1}. ${k}\n`; });
                return await sock.sendMessage(sender, { text: txt }, { quoted: m });
            }

            // --- USER COMMANDS (AUTO RESPONSE) ---
            // Cek apakah pesan user ada di database?
            const cmd = textMessage.toLowerCase();
            if (globalCommands[cmd]) {
                await sock.sendMessage(sender, { text: globalCommands[cmd] }, { quoted: m });
            }

        } catch (error) {
            console.log("Error:", error);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

io.on('connection', (socket) => {
    socket.on('start_bot', (data) => startSock(data.phoneNumber));
    socket.on('stop_bot', async () => {
        if (sock) { await sock.logout(); sock = undefined; }
        if (fs.existsSync('./auth_info_baileys')) fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
        io.emit('status', 'DISCONNECTED');
    });
});

server.listen(3001, () => console.log('🤖 Server Bot v9.1 Running...'));