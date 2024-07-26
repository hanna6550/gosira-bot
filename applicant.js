require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_KEY;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!API_KEY) {
    throw new Error("No API key provided. Please set the API_KEY environment variable in the .env file.");
}
if (!ADMIN_CHAT_ID) {
    throw new Error("No Admin chat ID provided. Please set the ADMIN_CHAT_ID environment variable in the .env file.");
}

const bot = new Telegraf(API_KEY);

let users = {};
let userSteps = {};
let userFiles = {};

bot.start((ctx) => {
    const welcomeMessage = "Welcome! Please follow the instructions below to submit your documents:\n\n" +
        "/start - Begin the application process.\n" +
        "/coverletter - Upload your cover letter (PDF format).\n" +
        "/cv - Upload your CV (PDF format).\n" +
        "When uploading, please ensure the document has the appropriate filename ('firstname_lastname_cv.pdf' or 'firstname_lastname_coverletter.pdf').";
    ctx.reply(welcomeMessage);
    requestFullName(ctx);
});

function requestFullName(ctx) {
    ctx.reply("Hello! Please enter your full name (first name and last name) to start the application process.");
    userSteps[ctx.chat.id] = 'awaiting_full_name';
}

bot.on('text', (ctx) => {
    const chatId = ctx.chat.id;
    const messageText = ctx.message.text.trim();

    if (userSteps[chatId] === 'awaiting_full_name') {
        if (/^[a-zA-Z]+ [a-zA-Z]+$/.test(messageText)) {
            users[chatId] = { full_name: messageText };
            userSteps[chatId] = 'awaiting_job_title';
            ctx.reply("Thank you. Please enter your job title.");
        } else {
            ctx.reply("Please enter a valid full name (first name and last name).");
        }
    } else if (userSteps[chatId] === 'awaiting_job_title') {
        users[chatId].job_title = messageText;
        userSteps[chatId] = 'awaiting_dob';
        ctx.reply("Please enter your date of birth (YYYY-MM-DD).");
    } else if (userSteps[chatId] === 'awaiting_dob') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(messageText)) {
            users[chatId].dob = messageText;
            userSteps[chatId] = 'awaiting_gender';
            ctx.reply("Please enter your gender (e.g., Male, Female, Other).");
        } else {
            ctx.reply("Please enter a valid date of birth in the format YYYY-MM-DD.");
        }
    } else if (userSteps[chatId] === 'awaiting_gender') {
        if (['male', 'female', 'other'].includes(messageText.toLowerCase())) {
            users[chatId].gender = messageText;
            userSteps[chatId] = 'awaiting_residence';
            ctx.reply("Please enter your residence location.");
        } else {
            ctx.reply("Please enter a valid gender (Male, Female, Other).");
        }
    } else if (userSteps[chatId] === 'awaiting_residence') {
        if (messageText) {
            users[chatId].residence = messageText;
            userSteps[chatId] = 'awaiting_phone';
            ctx.reply("Please enter your phone number.");
        } else {
            ctx.reply("Please enter a valid residence location.");
        }
    } else if (userSteps[chatId] === 'awaiting_phone') {
        if (/^\+?\d{10,15}$/.test(messageText)) {
            users[chatId].phone = messageText;
            userSteps[chatId] = 'awaiting_coverletter';
            ctx.reply(`Thank you. Now, please upload your cover letter (PDF format) with the filename format '${users[chatId].full_name.toLowerCase().replace(' ', '_')}_coverletter.pdf'.`);
        } else {
            ctx.reply("Please enter a valid phone number (10-15 digits).");
        }
    }
});

bot.command('coverletter', (ctx) => {
    const chatId = ctx.chat.id;
    if (users[chatId]) {
        ctx.reply(`Please upload your cover letter PDF file and add the filename format '${users[chatId].full_name.toLowerCase().replace(' ', '_')}_coverletter.pdf'.`);
        userSteps[chatId] = 'awaiting_coverletter';
    } else {
        ctx.reply("Please provide your full name first by sending it as a message.");
    }
});

bot.command('cv', (ctx) => {
    const chatId = ctx.chat.id;
    if (users[chatId]) {
        if (userSteps[chatId] === 'coverletter_uploaded') {
            ctx.reply(`Please upload your CV PDF file and add the filename format '${users[chatId].full_name.toLowerCase().replace(' ', '_')}_cv.pdf'.`);
            userSteps[chatId] = 'awaiting_cv';
        } else {
            ctx.reply("Please upload your cover letter first.");
        }
    } else {
        ctx.reply("Please provide your full name first by sending it as a message.");
    }
});

bot.on('document', (ctx) => {
    const chatId = ctx.chat.id;
    const document = ctx.message.document;

    if (document.mime_type !== 'application/pdf') {
        ctx.reply("Please upload a PDF file.");
        return;
    }

    if (!users[chatId]) {
        ctx.reply("Please provide your full name first by sending it as a message.");
        return;
    }

    const fullName = users[chatId].full_name;
    const [firstName, lastName] = fullName.split(' ');

    const fileId = document.file_id;
    const fileName = document.file_name.toLowerCase();

    if (fileName.includes('cv')) {
        const expectedFilename = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_cv.pdf`;
        if (fileName === expectedFilename) {
            if (userSteps[chatId] === 'coverletter_uploaded') {
                userFiles[chatId].cv = fileId;
                ctx.reply("Your CV has been received successfully! Thank you for completing your application.");
                userSteps[chatId] = 'cv_uploaded';

                // Notify the admin with both documents and additional information
                ctx.telegram.sendMessage(ADMIN_CHAT_ID,
                    `New application received:\n\n` +
                    `Full Name: ${fullName}\n` +
                    `Job Title: ${users[chatId].job_title}\n` +
                    `Date of Birth: ${users[chatId].dob}\n` +
                    `Gender: ${users[chatId].gender}\n` +
                    `Residence Location: ${users[chatId].residence}\n` +
                    `Phone Number: ${users[chatId].phone}`);
                ctx.telegram.sendDocument(ADMIN_CHAT_ID, userFiles[chatId].coverletter);
                ctx.telegram.sendDocument(ADMIN_CHAT_ID, userFiles[chatId].cv);
            } else {
                ctx.reply(`Please upload your cover letter first with the filename format '${firstName.toLowerCase()}_${lastName.toLowerCase()}_coverletter.pdf'.`);
            }
        } else {
            ctx.reply(`Please upload your CV with the filename format '${expectedFilename}'.`);
        }
    } else if (fileName.includes('coverletter')) {
        const expectedFilename = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_coverletter.pdf`;
        if (fileName === expectedFilename) {
            if (userSteps[chatId] === 'awaiting_coverletter') {
                userFiles[chatId] = { coverletter: fileId };
                ctx.reply(`Your cover letter has been received successfully! Now, please upload your CV (PDF format) with the filename format '${firstName.toLowerCase()}_${lastName.toLowerCase()}_cv.pdf'.`);
                userSteps[chatId] = 'coverletter_uploaded';
            } else {
                ctx.reply(`You have already uploaded your cover letter. Please upload your CV with the filename format '${firstName.toLowerCase()}_${lastName.toLowerCase()}_cv.pdf'.`);
            }
        } else {
            ctx.reply(`Please upload your cover letter with the filename format '${expectedFilename}'.`);
        }
    } else {
        ctx.reply(`Please specify whether this is a '${firstName.toLowerCase()}_${lastName.toLowerCase()}_coverletter.pdf' or '${firstName.toLowerCase()}_${lastName.toLowerCase()}_cv.pdf' in the filename.`);
    }
});

bot.launch();
