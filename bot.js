require('dotenv').config();
const { Client,LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fetch = require('node-fetch');
const AbortController = global.AbortController || require("abort-controller");

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});
client.initialize();

const logFilePath = path.join(__dirname, 'messages.txt');

function logMessage(data) {
    const text =
        typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2);

    fs.appendFile(logFilePath, text + '\n', (err) => {
        if (err) console.error('Error writing to file:', err);
    });
}


async function sendRequest(bodyObj = {}, method = "POST") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900000); // 15 minutes

    try {
        const response = await fetch(process.env.WEBHOOK_URL, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const raw = await response.text();

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP Error: ${response.status} ${response.statusText}`,
                status: response.status,
                raw
            };
        }

        let data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            return {
                success: false,
                error: "Invalid JSON returned",
                raw: raw
            };
        }

        return {
            success: true,
            data
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            stack: error.stack || null
        };
    }
}

client.on('qr', (qr) => {
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async msg => {
    let chat = await msg.getChat();

    if (chat.isGroup && (msg.type === 'chat'? msg.body?.startsWith('!autobot ') : msg._data?.caption?.startsWith('!autobot '))){
        if (msg.type === 'e2e_notification' || msg.type === 'unknown')
            return;

        if (!['document', 'image', 'chat', 'video'].includes(msg.type)) {
            msg.reply("I don't support this format.");
            return;
        }

        let media = null;
        if (msg.hasMedia) media = await msg.downloadMedia();

        if (!media)
            msg.hasMedia = false;

        const result = await sendRequest({
            msg: msg,
            chat: chat,
            media: media? media : null
        });

        if (!result.success){
            console.error("⛔ Webhook failed:", result.error);
            if (result.stack) console.error(result.stack);
            if (result.raw) console.error("Raw output:", result.raw);

            msg.reply('An error occurred.');
            return;
        }

        const data = result.data;

        chat.sendStateTyping();
        msg.reply(data.message);

        if (data.isIssue)
            msg.react('👍');
    }
    else if (!chat.isGroup){
        if (msg.type === 'e2e_notification'  || msg.type === 'unknown')
            return;

        if (!['document', 'image', 'chat', 'video'].includes(msg.type)) {
            msg.reply("I don't support this format.");
            return;
        }

        let media = null;
        if (msg.hasMedia) media = await msg.downloadMedia();

        if (!media)
            msg.hasMedia = false;

        if (((msg.type === 'image' || msg.type === 'document' || msg.type === 'video') &&  !msg._data?.caption) || (msg.type === 'document' && media && msg._data?.caption === media.filename))
            return;

        const result =await sendRequest({
            msg: msg,
            chat: chat,
            media: media? media : null
        });

        if (!result.success){
            console.error("⛔ Webhook failed:", result.error);
            if (result.stack) console.error(result.stack);
            if (result.raw) console.error("Raw output:", result.raw);

            msg.reply('An error occurred.');
            return;
        }

        const data = result.data;

        chat.sendStateTyping();
        msg.reply(data.message);

        if (data.isIssue)
            msg.react('👍');
    }
});
